# Titan — Autonomous Loan Underwriting Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a loan-underwriting backend that takes an application, runs it through six AI agents in sequence, and produces an explainable approve/reject decision with a full audit trail.

**Architecture:** A modular monolith in Node + TypeScript + Express. PostgreSQL (via Prisma) holds users, applications, documents, per-agent results, decisions, and an `events` table that *simulates* Kafka topics. A single in-process orchestrator runs the agents sequentially (simulating Temporal), retrying each once. All LLM calls go through a swappable `LLM` interface (`GeminiLLM` in prod, `MockLLM` in tests). Docker Compose runs only Postgres.

**Tech Stack:** Node.js 20+, TypeScript (strict), Express, Prisma + PostgreSQL, `jsonwebtoken` + `bcrypt`, Zod, `@google/generative-ai` (Gemini), Vitest + Supertest, Docker Compose.

## Global Constraints

Every task's requirements implicitly include this section.

- **Node.js 20+ LTS**; TypeScript with `"strict": true`. Module system: **CommonJS** (simplest for the toolchain; avoids ESM import-extension friction).
- **Modular monolith only.** Do NOT add real Kafka, Temporal, Kubernetes, Redis, a vector DB, or Prometheus. Each is simulated in-process per the spec's "Simulate, Then Upgrade" table.
- **All API input is validated with Zod. All agent LLM output is validated with Zod.** Invalid input → clean `400` JSON. Invalid agent output → treated as an agent failure (see retry rule).
- **LLM access only through the `LLM` interface.** Tests use `MockLLM` and never call real Gemini. Provider is chosen by the `LLM_PROVIDER` env var (`gemini` | `mock`).
- **Agent retry rule:** each agent call is retried **once** on failure. If it still fails, record the error, set the application `status = failed`, and stop the pipeline.
- **Auth:** JWT (`jsonwebtoken`) guards protected routes; passwords hashed with `bcrypt`. Never store or log plaintext passwords.
- **Application status** is exactly one of: `draft | processing | decided | failed`.
- **Agent order** is fixed: `document → fraud → credit → risk → compliance → decision`.
- **Event topics** (one per agent, written to the `events` table): `document.extracted`, `fraud.analyzed`, `credit.analyzed`, `risk.analyzed`, `compliance.checked`, `decision.made`.
- **Workflow:** TDD (write the failing test first), DRY, YAGNI, and commit after every task.
- **Plan/spec location:** source of truth is `docs/superpowers/specs/2026-08-08-titan-underwriting-design.md`.

---

## File Structure

Files that change together live together; each file has one responsibility.

```
titan/
  docker-compose.yml            # Postgres only
  .env / .env.example           # DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, PORT, LLM_PROVIDER
  package.json  tsconfig.json  vitest.config.ts
  prisma/
    schema.prisma               # all 6 models
  src/
    config/
      env.ts                    # Zod-validated process.env
      db.ts                     # PrismaClient singleton
    lib/
      logger.ts                 # tiny console logger
      password.ts               # bcrypt hash/verify
      jwt.ts                    # sign/verify JWT
      llm.ts                    # LLM interface + GeminiLLM + MockLLM + factory
    modules/
      auth/
        auth.service.ts         # register/login logic
        auth.controller.ts      # request handlers
        auth.routes.ts          # router
        auth.middleware.ts      # requireAuth
        auth.schemas.ts         # Zod: register/login bodies
      applications/
        applications.service.ts # create/get/patch
        applications.controller.ts
        applications.routes.ts
        applications.schemas.ts
      documents/
        documents.service.ts    # attach doc text to an application
    agents/
      types.ts                  # AgentContext + Agent output types
      base.agent.ts             # BaseAgent<TOutput> (prompt → llm → Zod)
      document.agent.ts
      fraud.agent.ts
      credit.agent.ts
      risk.agent.ts
      compliance.agent.ts
      decision.agent.ts
      registry.ts               # ordered agent list factory
    orchestrator/
      orchestrator.ts           # runPipeline(): retry, persist, emit events, decide
    middleware/
      error-handler.ts          # central Express error handler
    app.ts                      # express app wiring (no listen)
    server.ts                   # listen()
  tests/
    helpers/
      reset-db.ts               # truncate tables between tests
      make-app.ts               # build the Express app with MockLLM
    auth.test.ts
    applications.test.ts
    agents/document.agent.test.ts
    agents/fraud.agent.test.ts
    agents/credit.agent.test.ts
    agents/risk.agent.test.ts
    agents/compliance.agent.test.ts
    agents/decision.agent.test.ts
    orchestrator.test.ts
  README.md
```

**Key shared interfaces (defined once, referenced everywhere):**

```ts
// src/lib/llm.ts
export interface LLM {
  generate(prompt: string): Promise<unknown>; // returns parsed JSON; caller validates with Zod
}

// src/agents/types.ts
import type { Application, Document } from '@prisma/client';
export interface AgentContext {
  application: Application;
  documents: Document[];
  priorResults: Record<string, unknown>; // agentName -> validated output of earlier agents
}
export interface Agent {
  readonly name: string;       // e.g. "document"
  readonly topic: string;      // e.g. "document.extracted"
  run(ctx: AgentContext): Promise<unknown>; // validated output
}
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`, `src/app.ts`, `src/server.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildApp(): express.Express` in `src/app.ts` (no `listen`), so tests and `server.ts` share one app builder. For now it returns an app with a single `GET /health` → `{ status: 'ok' }`.

- [ ] **Step 1: Initialize the project and install dependencies**

```bash
npm init -y
npm install express zod jsonwebtoken bcrypt dotenv @prisma/client @google/generative-ai
npm install -D typescript tsx vitest supertest prisma \
  @types/express @types/node @types/jsonwebtoken @types/bcrypt @types/supertest
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add scripts to `package.json`**

Merge these into the `"scripts"` block:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
.env
```

- [ ] **Step 5: Write `vitest.config.ts`**

DB-touching tests share one Postgres database, so disable file parallelism to avoid races.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    environment: 'node',
  },
});
```

- [ ] **Step 6: Write `src/app.ts` and `src/server.ts`**

```ts
// src/app.ts
import express, { type Express } from 'express';

export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
```

```ts
// src/server.ts
import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3000);
buildApp().listen(port, () => {
  console.log(`Titan API listening on http://localhost:${port}`);
});
```

- [ ] **Step 7: Write the health test**

```ts
// tests/health.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold TS + Express project with health check"
```

---

## Task 2: Docker Compose Postgres + Prisma schema + first migration

**Files:**
- Create: `docker-compose.yml`, `.env`, `.env.example`, `prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing.
- Produces: a running Postgres on `localhost:5432`, and the Prisma-generated client with models `User`, `Application`, `Document`, `AgentResult`, `Decision`, `Event`, plus enums `Role` and `ApplicationStatus`. Later tasks import these types from `@prisma/client`.

- [ ] **Step 1: Write `docker-compose.yml` (Postgres only)**

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: titan
      POSTGRES_PASSWORD: titan
      POSTGRES_DB: titan
    ports:
      - "5433:5432"   # host 5433 -> container 5432, so we don't collide with any other local Postgres
    volumes:
      - titan_pgdata:/var/lib/postgresql/data

volumes:
  titan_pgdata:
```

**Teaching note:** `"5433:5432"` is `HOST:CONTAINER`. Postgres inside the container always listens on 5432; we publish it to `localhost:5433` on your machine to avoid clashing with another project's Postgres on the default 5432. That's why `DATABASE_URL` below uses `:5433`. Container name, network, and the `titan_pgdata` volume are all namespaced to this project, so they never collide with other Compose projects.

- [ ] **Step 2: Write `.env` and `.env.example`**

`.env` (real values; git-ignored):

```
DATABASE_URL="postgresql://titan:titan@localhost:5433/titan?schema=public"
JWT_SECRET="dev-secret-change-me-please-32chars"
GEMINI_API_KEY="paste-your-key-here"
PORT=3000
LLM_PROVIDER=gemini
```

`.env.example` (committed; same keys, placeholder values):

```
DATABASE_URL="postgresql://titan:titan@localhost:5433/titan?schema=public"
JWT_SECRET="change-me-to-a-long-random-string"
GEMINI_API_KEY=""
PORT=3000
LLM_PROVIDER=gemini
```

- [ ] **Step 3: Start Postgres**

Run: `docker compose up -d`
Expected: `db` container running. Verify with `docker compose ps`.

**Teaching note:** `-d` = detached (runs in the background). The named volume `titan_pgdata` persists data across restarts. `docker compose down` stops it; `docker compose down -v` also deletes the data volume.

- [ ] **Step 4: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  applicant
  officer
}

enum ApplicationStatus {
  draft
  processing
  decided
  failed
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(applicant)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  applications Application[]
}

model Application {
  id               String            @id @default(uuid())
  userId           String
  user             User              @relation(fields: [userId], references: [id])
  applicantName    String
  amountRequested  Float
  purpose          String
  income           Float
  employmentStatus String
  status           ApplicationStatus @default(draft)
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  documents        Document[]
  agentResults     AgentResult[]
  decision         Decision?
  events           Event[]
}

model Document {
  id            String      @id @default(uuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  type          String
  rawText       String
  extractedJson Json?
  createdAt     DateTime    @default(now())
}

model AgentResult {
  id            String      @id @default(uuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  agentName     String
  inputJson     Json
  outputJson    Json
  createdAt     DateTime    @default(now())
}

model Decision {
  id            String      @id @default(uuid())
  applicationId String      @unique
  application   Application @relation(fields: [applicationId], references: [id])
  status        String
  loanAmount    Float
  interestRate  Float
  rationale     String
  createdAt     DateTime    @default(now())
}

model Event {
  id            String      @id @default(uuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  topic         String
  payload       Json
  createdAt     DateTime    @default(now())
}
```

- [ ] **Step 5: Create the first migration and generate the client**

Run: `npx prisma migrate dev --name init`
Expected: a migration under `prisma/migrations/`, tables created in Postgres, and the Prisma client generated. Verify with `npx prisma studio` (optional) or `docker compose exec db psql -U titan -d titan -c "\dt"`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Postgres compose + Prisma schema and initial migration"
```

---

## Task 3: Config (env) + Prisma client singleton + logger + error handler

**Files:**
- Create: `src/config/env.ts`, `src/config/db.ts`, `src/lib/logger.ts`, `src/middleware/error-handler.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Produces:
  - `env` — a validated, typed object: `{ DATABASE_URL: string; JWT_SECRET: string; GEMINI_API_KEY?: string; PORT: number; LLM_PROVIDER: 'gemini' | 'mock' }`.
  - `prisma` — a shared `PrismaClient` instance.
  - `logger` — `{ info(msg, meta?); error(msg, meta?) }`.
  - `AppError` — `class AppError extends Error { constructor(public status: number, message: string) }`.
  - `errorHandler` — Express error middleware turning `AppError`/`ZodError` into clean JSON.

- [ ] **Step 1: Write `src/config/env.ts`**

```ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  GEMINI_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  LLM_PROVIDER: z.enum(['gemini', 'mock']).default('gemini'),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 2: Write `src/config/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 3: Write `src/lib/logger.ts`**

```ts
export const logger = {
  info(msg: string, meta?: unknown) {
    console.log(`[info] ${msg}`, meta ?? '');
  },
  error(msg: string, meta?: unknown) {
    console.error(`[error] ${msg}`, meta ?? '');
  },
};
```

- [ ] **Step 4: Write `src/middleware/error-handler.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Express identifies error middleware by its 4-arg signature; `_next` must stay.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'ValidationError', details: err.flatten() });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  logger.error('Unhandled error', err);
  return res.status(500).json({ error: 'InternalServerError' });
}
```

- [ ] **Step 5: Wire the error handler into `src/app.ts`**

Add the import and register it **last** (after all routes). It stays last as routes are added in later tasks.

```ts
// src/app.ts
import express, { type Express } from 'express';
import { errorHandler } from './middleware/error-handler';

export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  // (routes get mounted here in later tasks)
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 6: Run the existing tests to confirm nothing broke**

Run: `npm test`
Expected: PASS (health test still green).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add env validation, prisma client, logger, and error handler"
```

---

## Task 4: Password + JWT utilities

**Files:**
- Create: `src/lib/password.ts`, `src/lib/jwt.ts`, `tests/lib/jwt.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `signToken(payload: { userId: string; role: string }): string`
  - `verifyToken(token: string): { userId: string; role: string }` — throws on invalid/expired.

- [ ] **Step 1: Write the failing JWT round-trip test**

```ts
// tests/lib/jwt.test.ts
import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../../src/lib/jwt';

describe('jwt utils', () => {
  it('signs and verifies a token round-trip', () => {
    const token = signToken({ userId: 'u1', role: 'applicant' });
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe('u1');
    expect(decoded.role).toBe('applicant');
  });

  it('throws on a tampered token', () => {
    expect(() => verifyToken('not-a-real-token')).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/jwt.test.ts`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Write `src/lib/jwt.ts`**

```ts
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  userId: string;
  role: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string') throw new Error('Invalid token payload');
  return { userId: String(decoded.userId), role: String(decoded.role) };
}
```

- [ ] **Step 4: Write `src/lib/password.ts`**

```ts
import bcrypt from 'bcrypt';

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lib/jwt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add bcrypt password + JWT sign/verify utilities"
```

---

## Task 5: DB reset test helper

**Files:**
- Create: `tests/helpers/reset-db.ts`

**Interfaces:**
- Produces: `resetDb(): Promise<void>` — deletes all rows in FK-safe order. Used in `beforeEach` of every DB-touching test.

**Teaching note:** deletion order matters because of foreign keys — children before parents. `events`, `agent_results`, `decisions`, `documents` all reference `applications`; `applications` references `users`.

- [ ] **Step 1: Write `tests/helpers/reset-db.ts`**

```ts
import { prisma } from '../../src/config/db';

export async function resetDb(): Promise<void> {
  await prisma.event.deleteMany();
  await prisma.agentResult.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.document.deleteMany();
  await prisma.application.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 2: Sanity-check it runs against the dev DB**

Add a throwaway test, run it, then delete the file.

```ts
// tests/helpers/reset-db.smoke.test.ts  (temporary)
import { it, expect } from 'vitest';
import { resetDb } from './reset-db';

it('resetDb runs without error', async () => {
  await expect(resetDb()).resolves.toBeUndefined();
});
```

Run: `npx vitest run tests/helpers/reset-db.smoke.test.ts`
Expected: PASS. Then delete `tests/helpers/reset-db.smoke.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add DB reset helper for integration tests"
```

---

## Task 6: Auth — register & login endpoints

**Files:**
- Create: `src/modules/auth/auth.schemas.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.routes.ts`, `tests/auth.test.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: `prisma`, `hashPassword`/`verifyPassword`, `signToken`, `AppError`.
- Produces:
  - `POST /auth/register` `{ email, password, role? }` → `201 { token, user: { id, email, role } }`
  - `POST /auth/login` `{ email, password }` → `200 { token, user: { id, email, role } }`
  - `registerUser(input)` / `loginUser(input)` service functions returning `{ token, user }`.

- [ ] **Step 1: Write the failing auth test**

```ts
// tests/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { resetDb } from './helpers/reset-db';

const app = buildApp();

describe('auth', () => {
  beforeEach(async () => { await resetDb(); });

  it('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.email).toBe('a@b.com');
    expect(res.body.user.role).toBe('applicant');
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' });
    const res = await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials', async () => {
    await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' });
    const res = await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
  });

  it('rejects wrong password with 401', async () => {
    await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' });
    const res = await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'wrongpass1' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid body with 400', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL (routes 404).

- [ ] **Step 3: Write `src/modules/auth/auth.schemas.ts`**

```ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['applicant', 'officer']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 4: Write `src/modules/auth/auth.service.ts`**

```ts
import { prisma } from '../../config/db';
import { hashPassword, verifyPassword } from '../../lib/password';
import { signToken } from '../../lib/jwt';
import { AppError } from '../../middleware/error-handler';
import type { RegisterInput, LoginInput } from './auth.schemas';

function toPublicUser(u: { id: string; email: string; role: string }) {
  return { id: u.id, email: u.email, role: u.role };
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, 'Email already registered');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role ?? 'applicant',
    },
  });

  const token = signToken({ userId: user.id, role: user.role });
  return { token, user: toPublicUser(user) };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new AppError(401, 'Invalid credentials');

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw new AppError(401, 'Invalid credentials');

  const token = signToken({ userId: user.id, role: user.role });
  return { token, user: toPublicUser(user) };
}
```

- [ ] **Step 5: Write `src/modules/auth/auth.controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema } from './auth.schemas';
import { registerUser, loginUser } from './auth.service';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 6: Write `src/modules/auth/auth.routes.ts`**

```ts
import { Router } from 'express';
import { register, login } from './auth.controller';

export const authRoutes = Router();
authRoutes.post('/register', register);
authRoutes.post('/login', login);
```

- [ ] **Step 7: Mount the router in `src/app.ts`**

Add above the `errorHandler` registration:

```ts
import { authRoutes } from './modules/auth/auth.routes';
// ...
app.use('/auth', authRoutes);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add auth register/login with JWT and validation"
```

---

## Task 7: Auth middleware + `GET /auth/profile`

**Files:**
- Create: `src/modules/auth/auth.middleware.ts`
- Modify: `src/modules/auth/auth.controller.ts`, `auth.routes.ts`, `tests/auth.test.ts`

**Interfaces:**
- Consumes: `verifyToken`, `AppError`, `prisma`.
- Produces:
  - `requireAuth` — Express middleware that reads `Authorization: Bearer <token>`, verifies it, and sets `req.userId` / `req.userRole`; throws `401` otherwise.
  - Augments Express `Request` with `userId?: string` and `userRole?: string`.
  - `GET /auth/profile` (protected) → `200 { id, email, role }`.

- [ ] **Step 1: Add failing profile tests to `tests/auth.test.ts`**

```ts
  it('returns the profile with a valid token', async () => {
    const reg = await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' });
    const res = await request(app).get('/auth/profile').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('a@b.com');
  });

  it('rejects profile without a token', async () => {
    const res = await request(app).get('/auth/profile');
    expect(res.status).toBe(401);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL (profile route 404).

- [ ] **Step 3: Write `src/modules/auth/auth.middleware.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../lib/jwt';
import { AppError } from '../../middleware/error-handler';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or malformed Authorization header'));
  }
  try {
    const payload = verifyToken(header.slice('Bearer '.length));
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}
```

- [ ] **Step 4: Add the `profile` handler to `auth.controller.ts`**

```ts
import { prisma } from '../../config/db';
import { AppError } from '../../middleware/error-handler';
// ...
export async function profile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new AppError(404, 'User not found');
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 5: Add the protected route in `auth.routes.ts`**

```ts
import { requireAuth } from './auth.middleware';
import { register, login, profile } from './auth.controller';
// ...
authRoutes.get('/profile', requireAuth, profile);
```

- [ ] **Step 6: Run to verify passing**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add requireAuth middleware and GET /auth/profile"
```

---

## Task 8: Applications — create, get, patch

**Files:**
- Create: `src/modules/applications/applications.schemas.ts`, `applications.service.ts`, `applications.controller.ts`, `applications.routes.ts`, `tests/applications.test.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: `prisma`, `requireAuth`, `AppError`.
- Produces (all protected by `requireAuth`, scoped to the caller's `userId`):
  - `POST /applications` `{ applicantName, amountRequested, purpose, income, employmentStatus, documentText? }` → `201` application. If `documentText` present, also creates one `Document` row (`type: "application"`).
  - `GET /applications/:id` → `200` application **including** `documents`, `agentResults`, `decision`, `events`.
  - `PATCH /applications/:id` → `200`; allowed **only while `status === 'draft'`**, else `409`.
  - Service fns: `createApplication(userId, input)`, `getApplication(userId, id)`, `patchApplication(userId, id, input)`.

- [ ] **Step 1: Write the failing applications test**

```ts
// tests/applications.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { resetDb } from './helpers/reset-db';

const app = buildApp();

async function authHeader() {
  const reg = await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' });
  return { Authorization: `Bearer ${reg.body.token}` };
}

const validBody = {
  applicantName: 'Jane Doe',
  amountRequested: 20000,
  purpose: 'car',
  income: 60000,
  employmentStatus: 'employed',
  documentText: 'Pay stub: employed 3 years, annual income 60000.',
};

describe('applications', () => {
  beforeEach(async () => { await resetDb(); });

  it('requires auth', async () => {
    const res = await request(app).post('/applications').send(validBody);
    expect(res.status).toBe(401);
  });

  it('creates an application in draft with a document', async () => {
    const headers = await authHeader();
    const res = await request(app).post('/applications').set(headers).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.applicantName).toBe('Jane Doe');
  });

  it('fetches an application with its relations', async () => {
    const headers = await authHeader();
    const created = await request(app).post('/applications').set(headers).send(validBody);
    const res = await request(app).get(`/applications/${created.body.id}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.agentResults).toEqual([]);
    expect(res.body.decision).toBeNull();
  });

  it('patches a draft application', async () => {
    const headers = await authHeader();
    const created = await request(app).post('/applications').set(headers).send(validBody);
    const res = await request(app).patch(`/applications/${created.body.id}`).set(headers).send({ amountRequested: 15000 });
    expect(res.status).toBe(200);
    expect(res.body.amountRequested).toBe(15000);
  });

  it('rejects invalid create body with 400', async () => {
    const headers = await authHeader();
    const res = await request(app).post('/applications').set(headers).send({ applicantName: '' });
    expect(res.status).toBe(400);
  });

  it('404s a foreign application', async () => {
    const headers = await authHeader();
    const res = await request(app).get('/applications/00000000-0000-0000-0000-000000000000').set(headers);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/applications.test.ts`
Expected: FAIL (routes 404).

- [ ] **Step 3: Write `src/modules/applications/applications.schemas.ts`**

```ts
import { z } from 'zod';

export const createApplicationSchema = z.object({
  applicantName: z.string().min(1),
  amountRequested: z.number().positive(),
  purpose: z.string().min(1),
  income: z.number().nonnegative(),
  employmentStatus: z.string().min(1),
  documentText: z.string().min(1).optional(),
});

export const patchApplicationSchema = createApplicationSchema.partial();

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type PatchApplicationInput = z.infer<typeof patchApplicationSchema>;
```

- [ ] **Step 4: Write `src/modules/applications/applications.service.ts`**

```ts
import { prisma } from '../../config/db';
import { AppError } from '../../middleware/error-handler';
import type { CreateApplicationInput, PatchApplicationInput } from './applications.schemas';

export async function createApplication(userId: string, input: CreateApplicationInput) {
  const { documentText, ...appData } = input;
  return prisma.application.create({
    data: {
      ...appData,
      userId,
      documents: documentText
        ? { create: [{ type: 'application', rawText: documentText }] }
        : undefined,
    },
    include: { documents: true },
  });
}

export async function getApplication(userId: string, id: string) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      documents: true,
      agentResults: { orderBy: { createdAt: 'asc' } },
      decision: true,
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!application || application.userId !== userId) throw new AppError(404, 'Application not found');
  return application;
}

export async function patchApplication(userId: string, id: string, input: PatchApplicationInput) {
  const existing = await prisma.application.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new AppError(404, 'Application not found');
  if (existing.status !== 'draft') throw new AppError(409, 'Only draft applications can be edited');

  const { documentText, ...appData } = input;
  return prisma.application.update({
    where: { id },
    data: appData,
    include: { documents: true },
  });
}
```

- [ ] **Step 5: Write `src/modules/applications/applications.controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { createApplicationSchema, patchApplicationSchema } from './applications.schemas';
import { createApplication, getApplication, patchApplication } from './applications.service';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createApplicationSchema.parse(req.body);
    const app = await createApplication(req.userId!, input);
    res.status(201).json(app);
  } catch (err) { next(err); }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const app = await getApplication(req.userId!, req.params.id);
    res.json(app);
  } catch (err) { next(err); }
}

export async function patch(req: Request, res: Response, next: NextFunction) {
  try {
    const input = patchApplicationSchema.parse(req.body);
    const app = await patchApplication(req.userId!, req.params.id, input);
    res.json(app);
  } catch (err) { next(err); }
}
```

- [ ] **Step 6: Write `src/modules/applications/applications.routes.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { create, getOne, patch } from './applications.controller';

export const applicationRoutes = Router();
applicationRoutes.use(requireAuth);
applicationRoutes.post('/', create);
applicationRoutes.get('/:id', getOne);
applicationRoutes.patch('/:id', patch);
```

- [ ] **Step 7: Mount in `src/app.ts`**

```ts
import { applicationRoutes } from './modules/applications/applications.routes';
// ...
app.use('/applications', applicationRoutes);
```

- [ ] **Step 8: Run to verify passing**

Run: `npx vitest run tests/applications.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add applications create/get/patch with ownership + draft guard"
```

---

## Task 9: LLM interface + MockLLM + GeminiLLM + factory

**Files:**
- Create: `src/lib/llm.ts`, `tests/lib/llm.test.ts`

**Interfaces:**
- Consumes: `env`.
- Produces:
  - `interface LLM { generate(prompt: string): Promise<unknown> }`.
  - `class MockLLM implements LLM` — constructed with a response map or a single response; returns canned parsed JSON. For tests.
  - `class GeminiLLM implements LLM` — calls Gemini, strips markdown fences, `JSON.parse`s the text.
  - `createLLM(): LLM` — returns `GeminiLLM` or `MockLLM` based on `env.LLM_PROVIDER`.

**Teaching note:** the `LLM` boundary is the seam that lets us test the whole pipeline with zero API cost and swap providers by writing one class — exactly the "clean boundary" the spec calls for.

- [ ] **Step 1: Write the failing MockLLM test**

```ts
// tests/lib/llm.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/lib/llm';

describe('MockLLM', () => {
  it('returns a fixed response regardless of prompt', async () => {
    const llm = new MockLLM({ hello: 'world' });
    expect(await llm.generate('anything')).toEqual({ hello: 'world' });
  });

  it('routes by keyword when given a map', async () => {
    const llm = new MockLLM({
      byKeyword: {
        fraud: { fraudProbability: 0.1 },
        credit: { creditScore: 700 },
      },
    });
    expect(await llm.generate('please assess fraud risk')).toEqual({ fraudProbability: 0.1 });
    expect(await llm.generate('compute the credit score')).toEqual({ creditScore: 700 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/llm.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/llm.ts`**

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

export interface LLM {
  generate(prompt: string): Promise<unknown>;
}

type MockConfig =
  | Record<string, unknown> // a single fixed response
  | { byKeyword: Record<string, unknown> }; // route by first matching keyword in the prompt

export class MockLLM implements LLM {
  constructor(private readonly config: MockConfig) {}

  async generate(prompt: string): Promise<unknown> {
    if (this.config && typeof this.config === 'object' && 'byKeyword' in this.config) {
      const map = (this.config as { byKeyword: Record<string, unknown> }).byKeyword;
      const lower = prompt.toLowerCase();
      for (const [keyword, response] of Object.entries(map)) {
        if (lower.includes(keyword.toLowerCase())) return response;
      }
      throw new Error(`MockLLM: no keyword matched prompt`);
    }
    return this.config;
  }
}

export class GeminiLLM implements LLM {
  private model;

  constructor(apiKey: string, modelName = 'gemini-1.5-flash') {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: modelName });
  }

  async generate(prompt: string): Promise<unknown> {
    const result = await this.model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

export function createLLM(): LLM {
  if (env.LLM_PROVIDER === 'mock') return new MockLLM({});
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required when LLM_PROVIDER=gemini');
  return new GeminiLLM(env.GEMINI_API_KEY);
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/lib/llm.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add swappable LLM interface with MockLLM and GeminiLLM"
```

---

## Task 10: Agent types + BaseAgent

**Files:**
- Create: `src/agents/types.ts`, `src/agents/base.agent.ts`, `tests/agents/base.agent.test.ts`

**Interfaces:**
- Consumes: `LLM`, Prisma `Application`/`Document` types.
- Produces:
  - `AgentContext` and `Agent` (as shown in File Structure).
  - `abstract class BaseAgent<TOutput> implements Agent`:
    - fields `name`, `topic`, `schema: z.ZodType<TOutput>`.
    - `constructor(protected readonly llm: LLM)`.
    - `protected abstract buildPrompt(ctx: AgentContext): string`.
    - `async run(ctx): Promise<TOutput>` — builds the prompt, calls `llm.generate`, validates with `schema.parse`, returns typed output. A validation/parse failure throws (the orchestrator's retry handles it).

- [ ] **Step 1: Write the failing BaseAgent test**

```ts
// tests/agents/base.agent.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { MockLLM } from '../../src/lib/llm';
import { BaseAgent } from '../../src/agents/base.agent';
import type { AgentContext } from '../../src/agents/types';

const ctx = { application: {} as any, documents: [], priorResults: {} } satisfies AgentContext;

class EchoAgent extends BaseAgent<{ value: number }> {
  readonly name = 'echo';
  readonly topic = 'echo.done';
  protected schema = z.object({ value: z.number() });
  protected buildPrompt() { return 'give me a value'; }
}

describe('BaseAgent', () => {
  it('validates and returns typed output', async () => {
    const agent = new EchoAgent(new MockLLM({ value: 42 }));
    expect(await agent.run(ctx)).toEqual({ value: 42 });
  });

  it('throws when output fails the schema', async () => {
    const agent = new EchoAgent(new MockLLM({ value: 'not-a-number' }));
    await expect(agent.run(ctx)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/agents/base.agent.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `src/agents/types.ts`**

```ts
import type { Application, Document } from '@prisma/client';

export interface AgentContext {
  application: Application;
  documents: Document[];
  priorResults: Record<string, unknown>;
}

export interface Agent {
  readonly name: string;
  readonly topic: string;
  run(ctx: AgentContext): Promise<unknown>;
}
```

- [ ] **Step 4: Write `src/agents/base.agent.ts`**

```ts
import type { z } from 'zod';
import type { LLM } from '../lib/llm';
import type { Agent, AgentContext } from './types';

export abstract class BaseAgent<TOutput> implements Agent {
  abstract readonly name: string;
  abstract readonly topic: string;
  protected abstract readonly schema: z.ZodType<TOutput>;

  constructor(protected readonly llm: LLM) {}

  protected abstract buildPrompt(ctx: AgentContext): string;

  async run(ctx: AgentContext): Promise<TOutput> {
    const prompt = this.buildPrompt(ctx);
    const raw = await this.llm.generate(prompt);
    return this.schema.parse(raw);
  }
}
```

- [ ] **Step 5: Run to verify passing**

Run: `npx vitest run tests/agents/base.agent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add AgentContext + BaseAgent (prompt -> llm -> Zod)"
```

---

## Task 11: Document Agent

**Files:**
- Create: `src/agents/document.agent.ts`, `tests/agents/document.agent.test.ts`

**Interfaces:**
- Consumes: `BaseAgent`, `AgentContext`, `MockLLM`.
- Produces: `class DocumentAgent extends BaseAgent<DocumentOutput>` with `name = 'document'`, `topic = 'document.extracted'`.
  - `DocumentOutput = { income: number; employmentStatus: string; yearsExperience: number; summary: string }`.

**Teaching note:** the Document Agent stands in for OCR/PDF parsing (spec §2). It reads the pasted `rawText` of the application's documents and extracts structured fields the later agents rely on.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agents/document.agent.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/lib/llm';
import { DocumentAgent } from '../../src/agents/document.agent';
import type { AgentContext } from '../../src/agents/types';

const ctx: AgentContext = {
  application: { applicantName: 'Jane', income: 60000, employmentStatus: 'employed' } as any,
  documents: [{ rawText: 'Employed 3 years, income 60000' } as any],
  priorResults: {},
};

describe('DocumentAgent', () => {
  it('extracts structured fields', async () => {
    const llm = new MockLLM({ income: 60000, employmentStatus: 'employed', yearsExperience: 3, summary: 'ok' });
    const out = await new DocumentAgent(llm).run(ctx);
    expect(out).toEqual({ income: 60000, employmentStatus: 'employed', yearsExperience: 3, summary: 'ok' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/agents/document.agent.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/agents/document.agent.ts`**

```ts
import { z } from 'zod';
import { BaseAgent } from './base.agent';
import type { AgentContext } from './types';

const documentSchema = z.object({
  income: z.number(),
  employmentStatus: z.string(),
  yearsExperience: z.number(),
  summary: z.string(),
});
export type DocumentOutput = z.infer<typeof documentSchema>;

export class DocumentAgent extends BaseAgent<DocumentOutput> {
  readonly name = 'document';
  readonly topic = 'document.extracted';
  protected readonly schema = documentSchema;

  protected buildPrompt(ctx: AgentContext): string {
    const docText = ctx.documents.map((d) => d.rawText).join('\n---\n') || '(no documents provided)';
    return [
      'You are a loan document extraction agent.',
      'Read the applicant documents and extract structured fields.',
      'Respond ONLY with JSON of the shape:',
      '{ "income": number, "employmentStatus": string, "yearsExperience": number, "summary": string }',
      '',
      `Applicant-stated income: ${ctx.application.income}`,
      `Applicant-stated employment: ${ctx.application.employmentStatus}`,
      '',
      'DOCUMENTS:',
      docText,
    ].join('\n');
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/agents/document.agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add DocumentAgent (structured field extraction)"
```

---

## Task 12: Fraud Agent

**Files:**
- Create: `src/agents/fraud.agent.ts`, `tests/agents/fraud.agent.test.ts`

**Interfaces:**
- Produces: `class FraudAgent extends BaseAgent<FraudOutput>`, `name = 'fraud'`, `topic = 'fraud.analyzed'`.
  - `FraudOutput = { fraudProbability: number; status: 'clear' | 'review' | 'flagged'; reasons: string[] }`.
  - Reads `ctx.priorResults.document` and the application.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agents/fraud.agent.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/lib/llm';
import { FraudAgent } from '../../src/agents/fraud.agent';
import type { AgentContext } from '../../src/agents/types';

const ctx: AgentContext = {
  application: { applicantName: 'Jane', income: 60000 } as any,
  documents: [],
  priorResults: { document: { income: 60000, employmentStatus: 'employed', yearsExperience: 3, summary: 'ok' } },
};

describe('FraudAgent', () => {
  it('returns a fraud assessment', async () => {
    const llm = new MockLLM({ fraudProbability: 0.05, status: 'clear', reasons: ['income matches documents'] });
    const out = await new FraudAgent(llm).run(ctx);
    expect(out).toEqual({ fraudProbability: 0.05, status: 'clear', reasons: ['income matches documents'] });
  });

  it('rejects an invalid status', async () => {
    const llm = new MockLLM({ fraudProbability: 0.05, status: 'maybe', reasons: [] });
    await expect(new FraudAgent(llm).run(ctx)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/agents/fraud.agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/agents/fraud.agent.ts`**

```ts
import { z } from 'zod';
import { BaseAgent } from './base.agent';
import type { AgentContext } from './types';

const fraudSchema = z.object({
  fraudProbability: z.number().min(0).max(1),
  status: z.enum(['clear', 'review', 'flagged']),
  reasons: z.array(z.string()),
});
export type FraudOutput = z.infer<typeof fraudSchema>;

export class FraudAgent extends BaseAgent<FraudOutput> {
  readonly name = 'fraud';
  readonly topic = 'fraud.analyzed';
  protected readonly schema = fraudSchema;

  protected buildPrompt(ctx: AgentContext): string {
    return [
      'You are a fraud detection agent for loan applications.',
      'Compare applicant-stated values with the extracted document fields and flag inconsistencies.',
      'Respond ONLY with JSON:',
      '{ "fraudProbability": number (0-1), "status": "clear"|"review"|"flagged", "reasons": string[] }',
      '',
      `Applicant: ${JSON.stringify({ name: ctx.application.applicantName, income: ctx.application.income, employmentStatus: ctx.application.employmentStatus })}`,
      `Document extraction: ${JSON.stringify(ctx.priorResults.document ?? {})}`,
    ].join('\n');
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/agents/fraud.agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add FraudAgent (fraud probability + status)"
```

---

## Task 13: Credit Agent

**Files:**
- Create: `src/agents/credit.agent.ts`, `tests/agents/credit.agent.test.ts`

**Interfaces:**
- Produces: `class CreditAgent extends BaseAgent<CreditOutput>`, `name = 'credit'`, `topic = 'credit.analyzed'`.
  - `CreditOutput = { creditScore: number; debtToIncomeRatio: number; notes: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agents/credit.agent.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/lib/llm';
import { CreditAgent } from '../../src/agents/credit.agent';
import type { AgentContext } from '../../src/agents/types';

const ctx: AgentContext = {
  application: { amountRequested: 20000, income: 60000 } as any,
  documents: [],
  priorResults: { document: { income: 60000 } },
};

describe('CreditAgent', () => {
  it('returns a credit assessment', async () => {
    const llm = new MockLLM({ creditScore: 710, debtToIncomeRatio: 0.33, notes: 'healthy' });
    const out = await new CreditAgent(llm).run(ctx);
    expect(out.creditScore).toBe(710);
    expect(out.debtToIncomeRatio).toBe(0.33);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/agents/credit.agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/agents/credit.agent.ts`**

```ts
import { z } from 'zod';
import { BaseAgent } from './base.agent';
import type { AgentContext } from './types';

const creditSchema = z.object({
  creditScore: z.number(),
  debtToIncomeRatio: z.number(),
  notes: z.string(),
});
export type CreditOutput = z.infer<typeof creditSchema>;

export class CreditAgent extends BaseAgent<CreditOutput> {
  readonly name = 'credit';
  readonly topic = 'credit.analyzed';
  protected readonly schema = creditSchema;

  protected buildPrompt(ctx: AgentContext): string {
    return [
      'You are a credit analysis agent.',
      'Estimate a credit score (300-850) and a debt-to-income ratio from the applicant profile.',
      'Respond ONLY with JSON:',
      '{ "creditScore": number, "debtToIncomeRatio": number, "notes": string }',
      '',
      `Amount requested: ${ctx.application.amountRequested}`,
      `Income: ${ctx.application.income}`,
      `Document extraction: ${JSON.stringify(ctx.priorResults.document ?? {})}`,
    ].join('\n');
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/agents/credit.agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add CreditAgent (credit score + DTI)"
```

---

## Task 14: Risk Agent

**Files:**
- Create: `src/agents/risk.agent.ts`, `tests/agents/risk.agent.test.ts`

**Interfaces:**
- Produces: `class RiskAgent extends BaseAgent<RiskOutput>`, `name = 'risk'`, `topic = 'risk.analyzed'`.
  - `RiskOutput = { riskScore: number; riskLevel: 'low' | 'medium' | 'high'; factors: string[] }`.
  - Reads prior `fraud` and `credit` results.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agents/risk.agent.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/lib/llm';
import { RiskAgent } from '../../src/agents/risk.agent';
import type { AgentContext } from '../../src/agents/types';

const ctx: AgentContext = {
  application: { amountRequested: 20000 } as any,
  documents: [],
  priorResults: {
    fraud: { fraudProbability: 0.05, status: 'clear', reasons: [] },
    credit: { creditScore: 710, debtToIncomeRatio: 0.33, notes: 'ok' },
  },
};

describe('RiskAgent', () => {
  it('returns a risk assessment', async () => {
    const llm = new MockLLM({ riskScore: 25, riskLevel: 'low', factors: ['good credit'] });
    const out = await new RiskAgent(llm).run(ctx);
    expect(out.riskLevel).toBe('low');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/agents/risk.agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/agents/risk.agent.ts`**

```ts
import { z } from 'zod';
import { BaseAgent } from './base.agent';
import type { AgentContext } from './types';

const riskSchema = z.object({
  riskScore: z.number(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  factors: z.array(z.string()),
});
export type RiskOutput = z.infer<typeof riskSchema>;

export class RiskAgent extends BaseAgent<RiskOutput> {
  readonly name = 'risk';
  readonly topic = 'risk.analyzed';
  protected readonly schema = riskSchema;

  protected buildPrompt(ctx: AgentContext): string {
    return [
      'You are a risk scoring agent.',
      'Combine fraud and credit signals into an overall risk score (0-100) and level.',
      'Respond ONLY with JSON:',
      '{ "riskScore": number, "riskLevel": "low"|"medium"|"high", "factors": string[] }',
      '',
      `Fraud: ${JSON.stringify(ctx.priorResults.fraud ?? {})}`,
      `Credit: ${JSON.stringify(ctx.priorResults.credit ?? {})}`,
      `Amount requested: ${ctx.application.amountRequested}`,
    ].join('\n');
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/agents/risk.agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add RiskAgent (risk score + level)"
```

---

## Task 15: Compliance Agent

**Files:**
- Create: `src/agents/compliance.agent.ts`, `tests/agents/compliance.agent.test.ts`

**Interfaces:**
- Produces: `class ComplianceAgent extends BaseAgent<ComplianceOutput>`, `name = 'compliance'`, `topic = 'compliance.checked'`.
  - `ComplianceOutput = { kyc: 'pass' | 'fail'; aml: 'pass' | 'fail'; sanctions: 'clear' | 'hit'; notes: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agents/compliance.agent.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/lib/llm';
import { ComplianceAgent } from '../../src/agents/compliance.agent';
import type { AgentContext } from '../../src/agents/types';

const ctx: AgentContext = {
  application: { applicantName: 'Jane Doe' } as any,
  documents: [],
  priorResults: { fraud: { status: 'clear' } },
};

describe('ComplianceAgent', () => {
  it('returns a compliance verdict', async () => {
    const llm = new MockLLM({ kyc: 'pass', aml: 'pass', sanctions: 'clear', notes: 'no hits' });
    const out = await new ComplianceAgent(llm).run(ctx);
    expect(out.sanctions).toBe('clear');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/agents/compliance.agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/agents/compliance.agent.ts`**

```ts
import { z } from 'zod';
import { BaseAgent } from './base.agent';
import type { AgentContext } from './types';

const complianceSchema = z.object({
  kyc: z.enum(['pass', 'fail']),
  aml: z.enum(['pass', 'fail']),
  sanctions: z.enum(['clear', 'hit']),
  notes: z.string(),
});
export type ComplianceOutput = z.infer<typeof complianceSchema>;

export class ComplianceAgent extends BaseAgent<ComplianceOutput> {
  readonly name = 'compliance';
  readonly topic = 'compliance.checked';
  protected readonly schema = complianceSchema;

  protected buildPrompt(ctx: AgentContext): string {
    return [
      'You are a compliance agent performing simulated KYC / AML / sanctions checks.',
      'Use the applicant name and fraud signal to reason about compliance.',
      'Respond ONLY with JSON:',
      '{ "kyc": "pass"|"fail", "aml": "pass"|"fail", "sanctions": "clear"|"hit", "notes": string }',
      '',
      `Applicant name: ${ctx.application.applicantName}`,
      `Fraud: ${JSON.stringify(ctx.priorResults.fraud ?? {})}`,
    ].join('\n');
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/agents/compliance.agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ComplianceAgent (simulated KYC/AML/sanctions)"
```

---

## Task 16: Decision Agent

**Files:**
- Create: `src/agents/decision.agent.ts`, `tests/agents/decision.agent.test.ts`

**Interfaces:**
- Produces: `class DecisionAgent extends BaseAgent<DecisionOutput>`, `name = 'decision'`, `topic = 'decision.made'`.
  - `DecisionOutput = { status: 'approved' | 'rejected'; loanAmount: number; interestRate: number; rationale: string }`.
  - Reads **all** prior results.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agents/decision.agent.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/lib/llm';
import { DecisionAgent } from '../../src/agents/decision.agent';
import type { AgentContext } from '../../src/agents/types';

const ctx: AgentContext = {
  application: { amountRequested: 20000 } as any,
  documents: [],
  priorResults: {
    fraud: { status: 'clear' },
    credit: { creditScore: 710, debtToIncomeRatio: 0.33 },
    risk: { riskLevel: 'low' },
    compliance: { kyc: 'pass', aml: 'pass', sanctions: 'clear' },
  },
};

describe('DecisionAgent', () => {
  it('returns a final decision', async () => {
    const llm = new MockLLM({ status: 'approved', loanAmount: 20000, interestRate: 7.5, rationale: 'Low risk, clean compliance.' });
    const out = await new DecisionAgent(llm).run(ctx);
    expect(out.status).toBe('approved');
    expect(out.loanAmount).toBe(20000);
  });

  it('rejects an invalid status value', async () => {
    const llm = new MockLLM({ status: 'pending', loanAmount: 0, interestRate: 0, rationale: 'x' });
    await expect(new DecisionAgent(llm).run(ctx)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/agents/decision.agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/agents/decision.agent.ts`**

```ts
import { z } from 'zod';
import { BaseAgent } from './base.agent';
import type { AgentContext } from './types';

const decisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  loanAmount: z.number(),
  interestRate: z.number(),
  rationale: z.string(),
});
export type DecisionOutput = z.infer<typeof decisionSchema>;

export class DecisionAgent extends BaseAgent<DecisionOutput> {
  readonly name = 'decision';
  readonly topic = 'decision.made';
  protected readonly schema = decisionSchema;

  protected buildPrompt(ctx: AgentContext): string {
    return [
      'You are the final loan decision agent.',
      'Weigh fraud, credit, risk, and compliance results to approve or reject.',
      'If approved, set a loanAmount (<= requested) and an interestRate (%). Explain your rationale.',
      'Respond ONLY with JSON:',
      '{ "status": "approved"|"rejected", "loanAmount": number, "interestRate": number, "rationale": string }',
      '',
      `Amount requested: ${ctx.application.amountRequested}`,
      `All agent results: ${JSON.stringify(ctx.priorResults)}`,
    ].join('\n');
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/agents/decision.agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add DecisionAgent (final approve/reject + terms)"
```

---

## Task 17: Agent registry

**Files:**
- Create: `src/agents/registry.ts`, `tests/agents/registry.test.ts`

**Interfaces:**
- Consumes: all six agent classes, `LLM`.
- Produces: `buildAgents(llm: LLM): Agent[]` — returns the six agents **in pipeline order**: document, fraud, credit, risk, compliance, decision.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agents/registry.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/lib/llm';
import { buildAgents } from '../../src/agents/registry';

describe('buildAgents', () => {
  it('returns the six agents in pipeline order', () => {
    const agents = buildAgents(new MockLLM({}));
    expect(agents.map((a) => a.name)).toEqual([
      'document', 'fraud', 'credit', 'risk', 'compliance', 'decision',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/agents/registry.test.ts`
Expected: FAIL.


- [ ] **Step 3: Write `src/agents/registry.ts`**

```ts
import type { LLM } from '../lib/llm';
import type { Agent } from './types';
import { DocumentAgent } from './document.agent';
import { FraudAgent } from './fraud.agent';
import { CreditAgent } from './credit.agent';
import { RiskAgent } from './risk.agent';
import { ComplianceAgent } from './compliance.agent';
import { DecisionAgent } from './decision.agent';

export function buildAgents(llm: LLM): Agent[] {
  return [
    new DocumentAgent(llm),
    new FraudAgent(llm),
    new CreditAgent(llm),
    new RiskAgent(llm),
    new ComplianceAgent(llm),
    new DecisionAgent(llm),
  ];
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/agents/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ordered agent registry"
```

---

## Task 18: Orchestrator

**Files:**
- Create: `src/orchestrator/orchestrator.ts`, `tests/orchestrator.test.ts`

**Interfaces:**
- Consumes: `prisma`, `buildAgents`, `Agent`, `LLM`, `logger`.
- Produces:
  - `runWithRetry(fn, attempts = 2): Promise<T>` — runs `fn`, retries once on throw (2 attempts total).
  - `runPipeline(applicationId: string, llm: LLM): Promise<void>`:
    1. Load application + documents. Set `status = 'processing'`.
    2. For each agent in order: build `AgentContext` (with accumulated `priorResults`), run with retry, persist an `AgentResult` row (`inputJson` = the prior results snapshot, `outputJson` = validated output), emit an `Event` row (`topic`, `payload` = output), and add the output to `priorResults` under the agent's `name`.
    3. On the `decision` agent, also create the `Decision` row.
    4. Set `status = 'decided'` at the end.
    5. On any hard failure (after retry): record an `Event` with topic `pipeline.failed`, set `status = 'failed'`, and stop.

**Teaching note:** this single function *is* the simulated Temporal workflow. Each agent call is an "activity" with a retry policy; the `events` rows are the simulated Kafka topic log. The upgrade path (spec §2) maps each step 1:1 onto a real workflow engine later.

- [ ] **Step 1: Write the failing orchestrator test**

```ts
// tests/orchestrator.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/config/db';
import { resetDb } from './helpers/reset-db';
import { MockLLM } from '../src/lib/llm';
import { runPipeline } from '../src/orchestrator/orchestrator';

// A MockLLM whose responses are keyed by agent-specific words present in each prompt.
function pipelineLLM() {
  return new MockLLM({
    byKeyword: {
      'document extraction agent': { income: 60000, employmentStatus: 'employed', yearsExperience: 3, summary: 'ok' },
      'fraud detection agent': { fraudProbability: 0.05, status: 'clear', reasons: [] },
      'credit analysis agent': { creditScore: 710, debtToIncomeRatio: 0.33, notes: 'ok' },
      'risk scoring agent': { riskScore: 20, riskLevel: 'low', factors: [] },
      'compliance agent': { kyc: 'pass', aml: 'pass', sanctions: 'clear', notes: 'ok' },
      'final loan decision agent': { status: 'approved', loanAmount: 20000, interestRate: 7.5, rationale: 'Low risk.' },
    },
  });
}

async function seedApplication() {
  const user = await prisma.user.create({ data: { email: 'x@y.com', passwordHash: 'h' } });
  return prisma.application.create({
    data: {
      userId: user.id,
      applicantName: 'Jane',
      amountRequested: 20000,
      purpose: 'car',
      income: 60000,
      employmentStatus: 'employed',
      documents: { create: [{ type: 'application', rawText: 'employed 3 years, income 60000' }] },
    },
  });
}

describe('runPipeline', () => {
  beforeEach(async () => { await resetDb(); });

  it('runs all six agents, writes results, events, and a decision', async () => {
    const app = await seedApplication();
    await runPipeline(app.id, pipelineLLM());

    const updated = await prisma.application.findUnique({ where: { id: app.id } });
    expect(updated?.status).toBe('decided');

    const results = await prisma.agentResult.findMany({ where: { applicationId: app.id }, orderBy: { createdAt: 'asc' } });
    expect(results.map((r) => r.agentName)).toEqual(['document', 'fraud', 'credit', 'risk', 'compliance', 'decision']);

    const events = await prisma.event.findMany({ where: { applicationId: app.id } });
    expect(events.map((e) => e.topic)).toContain('decision.made');

    const decision = await prisma.decision.findUnique({ where: { applicationId: app.id } });
    expect(decision?.status).toBe('approved');
    expect(decision?.loanAmount).toBe(20000);
  });

  it('sets status=failed when an agent keeps failing', async () => {
    const app = await seedApplication();
    // An empty keyword map => document agent prompt matches nothing => MockLLM throws on both attempts.
    const brokenLLM = new MockLLM({ byKeyword: {} });
    await runPipeline(app.id, brokenLLM);

    const updated = await prisma.application.findUnique({ where: { id: app.id } });
    expect(updated?.status).toBe('failed');
    const events = await prisma.event.findMany({ where: { applicationId: app.id } });
    expect(events.map((e) => e.topic)).toContain('pipeline.failed');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/orchestrator.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/orchestrator/orchestrator.ts`**

```ts
import { prisma } from '../config/db';
import { logger } from '../lib/logger';
import type { LLM } from '../lib/llm';
import { buildAgents } from '../agents/registry';
import type { AgentContext } from '../agents/types';

export async function runWithRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      logger.error(`attempt ${i + 1} of ${attempts} failed`, err);
    }
  }
  throw lastError;
}

export async function runPipeline(applicationId: string, llm: LLM): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { documents: true },
  });
  if (!application) throw new Error(`Application ${applicationId} not found`);

  await prisma.application.update({ where: { id: applicationId }, data: { status: 'processing' } });

  const agents = buildAgents(llm);
  const priorResults: Record<string, unknown> = {};

  try {
    for (const agent of agents) {
      const ctx: AgentContext = {
        application,
        documents: application.documents,
        priorResults: { ...priorResults },
      };

      const output = await runWithRetry(() => agent.run(ctx));

      await prisma.agentResult.create({
        data: {
          applicationId,
          agentName: agent.name,
          inputJson: ctx.priorResults as object,
          outputJson: output as object,
        },
      });
      await prisma.event.create({
        data: { applicationId, topic: agent.topic, payload: output as object },
      });

      if (agent.name === 'decision') {
        const d = output as { status: string; loanAmount: number; interestRate: number; rationale: string };
        await prisma.decision.create({
          data: {
            applicationId,
            status: d.status,
            loanAmount: d.loanAmount,
            interestRate: d.interestRate,
            rationale: d.rationale,
          },
        });
      }

      priorResults[agent.name] = output;
    }

    await prisma.application.update({ where: { id: applicationId }, data: { status: 'decided' } });
    logger.info(`pipeline complete for ${applicationId}`);
  } catch (err) {
    logger.error(`pipeline failed for ${applicationId}`, err);
    await prisma.event.create({
      data: {
        applicationId,
        topic: 'pipeline.failed',
        payload: { message: err instanceof Error ? err.message : String(err) },
      },
    });
    await prisma.application.update({ where: { id: applicationId }, data: { status: 'failed' } });
  }
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run tests/orchestrator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add orchestrator (retry, persist results/events, decision, failure)"
```

---

## Task 19: Submit endpoint + status polling

**Files:**
- Modify: `src/modules/applications/applications.controller.ts`, `applications.routes.ts`
- Create: `tests/submit.test.ts`

**Interfaces:**
- Consumes: `runPipeline`, `createLLM`, `prisma`, `AppError`.
- Produces:
  - `POST /applications/:id/submit` (protected, owner-only): if `status === 'draft'`, set it to `processing`, return `202 { id, status: 'processing' }`, and **start the pipeline in the background** (`runPipeline` not awaited by the response). If not `draft`, return `409`.
  - `GET /applications/:id` (already exists) is the polling endpoint — the client watches `status` advance `processing → decided | failed` and reads the `agentResults` / `decision` trail.

**Teaching note:** returning `202 Accepted` and running the pipeline in the background is the "kick off async work, then poll" pattern. In v1 the background work is just an unawaited async call; the upgrade path pushes it onto a real queue/worker.

- [ ] **Step 1: Write the failing submit test**

```ts
// tests/submit.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { resetDb } from './helpers/reset-db';
import { prisma } from '../src/config/db';

const app = buildApp();

async function setup() {
  const reg = await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' });
  const headers = { Authorization: `Bearer ${reg.body.token}` };
  const created = await request(app).post('/applications').set(headers).send({
    applicantName: 'Jane', amountRequested: 20000, purpose: 'car', income: 60000,
    employmentStatus: 'employed', documentText: 'employed 3 years, income 60000',
  });
  return { headers, id: created.body.id as string };
}

describe('submit', () => {
  beforeEach(async () => { await resetDb(); });

  it('accepts a draft submission with 202 and processing status', async () => {
    const { headers, id } = await setup();
    const res = await request(app).post(`/applications/${id}/submit`).set(headers);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('processing');
  });

  it('rejects submitting a non-draft application with 409', async () => {
    const { headers, id } = await setup();
    await prisma.application.update({ where: { id }, data: { status: 'decided' } });
    const res = await request(app).post(`/applications/${id}/submit`).set(headers);
    expect(res.status).toBe(409);
  });
});
```

**Note:** run these tests with `LLM_PROVIDER=mock` so the background `createLLM()` call in the controller returns a `MockLLM` (see Step 4). The empty MockLLM will fail the pipeline in the background, but the response is already sent — the test only asserts the `202`/`409` response, not the eventual pipeline outcome (that is covered by `orchestrator.test.ts`).

- [ ] **Step 2: Run to verify failure**

Run: `LLM_PROVIDER=mock npx vitest run tests/submit.test.ts`
Expected: FAIL (submit route 404).

- [ ] **Step 3: Add the `submit` handler to `applications.controller.ts`**

```ts
import { prisma } from '../../config/db';
import { AppError } from '../../middleware/error-handler';
import { createLLM } from '../../lib/llm';
import { runPipeline } from '../../orchestrator/orchestrator';
import { logger } from '../../lib/logger';
// ...
export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await prisma.application.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.userId) throw new AppError(404, 'Application not found');
    if (existing.status !== 'draft') throw new AppError(409, 'Only draft applications can be submitted');

    await prisma.application.update({ where: { id }, data: { status: 'processing' } });

    // Fire-and-forget: run the pipeline in the background, then poll GET /applications/:id.
    void runPipeline(id, createLLM()).catch((err) => logger.error('background pipeline error', err));

    res.status(202).json({ id, status: 'processing' });
  } catch (err) { next(err); }
}
```

- [ ] **Step 4: Add the route in `applications.routes.ts`**

```ts
import { create, getOne, patch, submit } from './applications.controller';
// ...
applicationRoutes.post('/:id/submit', submit);
```

- [ ] **Step 5: Run to verify passing**

Run: `LLM_PROVIDER=mock npx vitest run tests/submit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite**

Run: `LLM_PROVIDER=mock npm test`
Expected: PASS (all tests green).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add submit endpoint kicking off the pipeline, poll via GET"
```

---

## Task 20: README + end-to-end manual verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the whole system.
- Produces: a README covering setup, run, testing, the architecture-simulation table, and copy-paste `curl` examples for the full journey.

- [ ] **Step 1: Write `README.md`**

````markdown
# Titan — Autonomous Loan Underwriting Platform

Titan accepts a loan application and runs it through six AI agents
(document → fraud → credit → risk → compliance → decision), producing an
explainable approve/reject decision with a full audit trail.

It is a **modular monolith**: heavyweight infra (Kafka, Temporal, K8s) is
simulated in-process behind clean boundaries so it can be upgraded later.

| Concept | v1 implementation | Upgrade path |
|---|---|---|
| Kafka | `events` table rows per step | publish to a real topic |
| Temporal | in-process orchestrator + retry | map steps to activities |
| Kubernetes | Docker Compose (Postgres) | Helm / K8s manifests |
| OCR/PDF | pasted document text | pdf-parse / Tesseract |
| Microservices | modular folders | split into services |

## Requirements
- Node.js 20+
- Docker (for Postgres)
- A Google Gemini API key

## Setup
```bash
cp .env.example .env         # then fill in JWT_SECRET and GEMINI_API_KEY
docker compose up -d         # start Postgres
npx prisma migrate dev       # create schema
npm run dev                  # start API on http://localhost:3000
```

## Testing
Tests use a MockLLM (no API calls, deterministic) and the Postgres from Docker.
```bash
LLM_PROVIDER=mock npm test
```

## End-to-end journey (curl)
```bash
# 1. Register (returns a token)
TOKEN=$(curl -s -X POST localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"password123"}' | jq -r .token)

# 2. Create an application (draft)
APP_ID=$(curl -s -X POST localhost:3000/applications \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"applicantName":"Jane Doe","amountRequested":20000,"purpose":"car","income":60000,"employmentStatus":"employed","documentText":"Pay stub: employed 3 years, annual income 60000."}' | jq -r .id)

# 3. Submit (starts the pipeline, returns 202)
curl -s -X POST localhost:3000/applications/$APP_ID/submit \
  -H "Authorization: Bearer $TOKEN"

# 4. Poll until status is "decided" (or "failed")
curl -s localhost:3000/applications/$APP_ID \
  -H "Authorization: Bearer $TOKEN" | jq '{status, decision, agentResults: [.agentResults[].agentName]}'
```

## API
- `POST /auth/register`, `POST /auth/login`, `GET /auth/profile`
- `POST /applications`, `GET /applications/:id`, `PATCH /applications/:id`
- `POST /applications/:id/submit`
````

- [ ] **Step 2: Manual end-to-end check against real Gemini**

With a valid `GEMINI_API_KEY` and `LLM_PROVIDER=gemini` in `.env`:

Run: `docker compose up -d && npx prisma migrate dev && npm run dev`
Then in a second terminal run the four `curl` steps from the README (needs `jq`).
Expected: step 3 returns `202`; polling in step 4 shows `status` advance to `decided` with a populated `decision` and all six agent names in `agentResults`.

**If the pipeline lands in `failed`:** inspect the `events` row with topic `pipeline.failed` (via `GET /applications/:id`) — it carries the error message. Most failures are Gemini returning non-JSON; the `GeminiLLM` fence-stripping handles the common cases.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add README with setup, testing, and end-to-end curl journey"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Covered by |
|---|---|
| §3 Tech stack | Tasks 1–2, 9 (Express, Prisma, JWT, bcrypt, Zod, Gemini, Vitest, Docker) |
| §4 Folder layout | File Structure + all tasks (modules/agents/orchestrator split) |
| §5 Data flow (register→create→submit→pipeline→poll) | Tasks 6, 8, 18, 19 |
| §6 Data model (6 tables) | Task 2 |
| §7 Agents & LLM layer (LLM iface, Mock/Gemini, 6 agents, per-agent Zod) | Tasks 9–17 |
| §8 Error handling (retry once, fail status, Zod, error handler, auth guard) | Tasks 3, 7, 8, 18 |
| §9 API surface (all 7 endpoints) | Tasks 6, 7, 8, 19 |
| §10 Testing (auth, applications, orchestrator e2e w/ MockLLM) | Tasks 6, 8, 18 + per-agent tests |
| §11 How to run | Task 20 README |
| §12 Build order (Day1 auth → Day2 apps+LLM+agents → Day3 orchestrator → Day4 README) | Task ordering mirrors this |
| §2 Simulate-then-upgrade (events=Kafka, orchestrator=Temporal, Compose=K8s) | Tasks 2, 18, 20 + teaching notes |

No gaps. §13 Roadmap is explicitly post-v1 and intentionally not built.

**2. Placeholder scan:** No `TODO`/`TBD`/"add error handling"/"similar to Task N" — every code and test step contains concrete content.

**3. Type consistency (verified across tasks):**
- `LLM.generate(prompt: string): Promise<unknown>` — defined Task 9, consumed by `BaseAgent` Task 10, `runPipeline` Task 18. ✓
- `AgentContext { application, documents, priorResults }` — defined Task 10, used identically in every agent test and the orchestrator. ✓
- `Agent { name, topic, run }` — `name`/`topic` strings match the fixed lists in Global Constraints and the registry order (Task 17) and orchestrator assertions (Task 18). ✓
- Agent output shapes (document/fraud/credit/risk/compliance/decision) — each defined once via Zod (Tasks 11–16) and consumed by the orchestrator/decision-row mapping (Task 18) with matching field names (`loanAmount`, `interestRate`, `rationale`, `status`). ✓
- `buildAgents(llm)` name/order — Task 17 defines, Task 18 consumes, Task 18 test asserts the exact order. ✓
- `runPipeline(applicationId, llm)` signature — Task 18 defines, Task 19 controller consumes with `createLLM()`. ✓
- `createLLM()` — Task 9 defines, Task 19 consumes. ✓
- `AppError(status, message)` — Task 3 defines, consumed in Tasks 6, 7, 8, 19. ✓

All consistent.

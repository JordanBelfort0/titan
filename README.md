# Titan — Autonomous Loan Underwriting Platform

A loan-underwriting backend that runs each application through a pipeline of six
AI agents (**document → fraud → credit → risk → compliance → decision**) and
produces an explainable approval decision with a full audit trail.

See the full design in [`docs/superpowers/specs/2026-08-08-titan-underwriting-design.md`](docs/superpowers/specs/2026-08-08-titan-underwriting-design.md).

**Live:** https://titan-livid-pi.vercel.app

## Stack

- Node.js + TypeScript + Express
- PostgreSQL via Prisma (Neon in production)
- JWT auth (`jsonwebtoken` + `bcrypt`), Zod validation
- **Real AI inference** via Google **Gemini** (`gemini-3.6-flash`), behind a
  pluggable `LLM` interface. Set `LLM_PROVIDER=mock` for the deterministic,
  zero-cost `MockLLM` used by the tests.
- **Async pipeline**: `submit` returns `202` immediately and the six agents run
  in the background (Vercel `waitUntil`); the client polls for progress.
- **Web UI** at `/` — submit an application and watch the agents decide live.
- Deployed on Vercel as a single serverless function

## Architecture

```
src/
  config/        env + Prisma client (serverless-safe pooling)
  lib/           LLM interface (Mock/Gemini), jwt, errors, logger
  middleware/    auth guard, central error handler
  modules/
    auth/        register / login / profile
    applications/ create / get / patch / submit
  agents/        base + 6 agents, each with a Zod schema and a deterministic mock
  orchestrator/  runs agents in order, retries once, persists results + events
  app.ts         Express wiring
api/index.ts     Vercel entry (exports the Express app)
```

Each agent step writes an `agent_results` row (the audit trail) and an `events`
row (simulated Kafka topics, e.g. `credit.analyzed`). The `decision` agent's
output becomes the `decisions` row.

## API

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | `{ email, password, role? }` → `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/auth/profile` | auth required |
| POST | `/applications` | auth; create a draft |
| GET | `/applications/:id` | auth; app + agent trail + decision + events |
| PATCH | `/applications/:id` | auth; edit while `draft` |
| POST | `/applications/:id/submit` | auth; runs the pipeline, `202` |
| GET | `/health` | liveness |

## Run locally

```bash
# 1. Start Postgres (host port 5433 to avoid clashes)
docker compose up -d

# 2. Point at it and create the schema
cp .env.example .env      # then set DATABASE_URL/DIRECT_URL to the local DB
npx prisma migrate dev

# 3. Start the API
npm run dev               # http://localhost:3000
```

## Test

```bash
npm test    # 11 tests against a local Postgres (see .env.test), all with MockLLM
```

## The full journey (curl)

```bash
BASE=https://titan-livid-pi.vercel.app

# Register → capture the token
TOKEN=$(curl -s -X POST $BASE/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password123"}' | jq -r .token)

# Create an application → capture its id
ID=$(curl -s -X POST $BASE/applications \
  -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
  -d '{"applicantName":"Jane Doe","amountRequested":10000,"purpose":"home improvement",
       "income":150000,"employmentStatus":"employed full-time",
       "documentText":"Jane Doe, employed full-time, 6 years, income 150000."}' | jq -r .id)

# Submit → run the six-agent pipeline
curl -s -X POST $BASE/applications/$ID/submit -H "authorization: Bearer $TOKEN"

# Poll → status, agent trail, and decision
curl -s $BASE/applications/$ID -H "authorization: Bearer $TOKEN" | jq
```

## Inference & config

Production runs on real Gemini. Environment variables:

```
LLM_PROVIDER=gemini        # or "mock" for deterministic, zero-cost runs
GEMINI_API_KEY=...         # required when LLM_PROVIDER=gemini
```

The model is `gemini-3.6-flash` (see `src/lib/llm.ts`). Each agent ships a real
analyst prompt plus a deterministic mock, so switching providers needs no agent
code changes. Tests always use `MockLLM` (`.env.test`), so they stay fast and
free.

The full six-agent pipeline takes ~30-45s on real inference. It runs in the
background via `waitUntil`, so `submit` returns `202` instantly and the UI polls
`GET /applications/:id` to animate progress. `maxDuration` is raised to 120s in
`vercel.json` to give the background work headroom.

See the roadmap in the design spec for further upgrades (real OCR, Kafka,
Temporal, K8s).

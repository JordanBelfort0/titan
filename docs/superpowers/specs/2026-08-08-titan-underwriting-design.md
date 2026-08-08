# Titan — Autonomous Loan Underwriting Platform (Design Spec)

**Date:** 2026-08-08
**Status:** Approved — ready for implementation planning
**Author:** Nishant (with Claude Code)

---

## 1. Purpose & Scope

Titan is a loan underwriting backend that accepts a loan application, runs it through
a pipeline of six AI agents (document → fraud → credit → risk → compliance → decision),
and produces an **explainable approval decision** with a full audit trail.

This spec deliberately scopes the project to something buildable in a few days by a
developer with some backend experience, while still telling the complete underwriting
story and teaching the core distributed-systems concepts.

### Goals
- Learn: API structure, databases/migrations, auth, containers, event-driven thinking,
  workflow orchestration, and multi-agent AI — by building each properly.
- Resume-worthy: a system that **runs end-to-end** and can be explained clearly.

### Explicit non-goals (for v1 — see Roadmap)
- Not a real microservices deployment. It is a **modular monolith**.
- No real Kafka, Temporal, Kubernetes, Redis, RAG/vector DB, Prometheus/Grafana,
  or real OCR in v1. Each is either simulated by a simple in-process equivalent or
  deferred to the roadmap.

---

## 2. Core Design Decision: Simulate, Then Upgrade

The original vision lists heavyweight infrastructure. For a few-days build we replace
each with a lean in-process equivalent, **designed with clean boundaries so it can be
swapped for the real thing later**. This is how real companies actually start.

| Original | v1 replacement | Upgrade path |
|---|---|---|
| Apache Kafka | `events` table written on each step (topics like `credit.analyzed`) | Publish the same events to a real Kafka topic |
| Temporal | Sequential orchestrator; each step written like an "activity" with retry | Map steps 1:1 onto Temporal activities/workflow |
| Kubernetes | Docker Compose | Helm/K8s manifests |
| Real OCR/PDF | Paste-in document text extracted by the Document Agent | Add `pdf-parse` / Tesseract before the agent |
| Microservices (×8) | One service, modular folders | Split modules into services |
| Redis / RAG / Prometheus / real notifications | Omitted; notifications = console + `events` row | Add later as needed |

---

## 3. Tech Stack

- **Language/Runtime:** Node.js + TypeScript
- **Web framework:** Express
- **Database:** PostgreSQL, accessed via **Prisma** (type-safe, easy migrations)
- **Auth:** JWT (`jsonwebtoken`) + `bcrypt` for password hashing
- **Validation:** Zod (API input + agent output schemas)
- **LLM:** Google **Gemini** (`@google/generative-ai`), behind a swappable `LLM` interface
- **Containers:** Docker Compose (Postgres; optionally the app)
- **Testing:** Vitest (or Jest) with a `MockLLM` so tests need no API calls

---

## 4. Architecture & Folder Layout

Modular monolith. Each module and agent is a small, single-purpose, independently
testable unit with a clear interface.

```
titan/
  docker-compose.yml         # Postgres (+ optional app container)
  prisma/schema.prisma       # DB schema & migrations
  src/
    config/                  # env vars, db client, gemini client
    lib/
      llm.ts                 # LLM interface + GeminiLLM + MockLLM
      logger.ts
    modules/
      auth/                  # register, login, JWT, auth middleware
      applications/          # loan application CRUD + status
      documents/             # accept document text, store
    agents/
      base.ts                # Agent interface: run(context) -> structured JSON
      document.agent.ts
      fraud.agent.ts
      credit.agent.ts
      risk.agent.ts
      compliance.agent.ts
      decision.agent.ts
    orchestrator/            # runs agents in order, retries, persists, emits events
    app.ts / server.ts       # express wiring
  tests/
```

---

## 5. Data Flow (the full journey)

1. **Register / login** → receive a JWT.
2. **Create application** — `POST /applications` with applicant info, amount requested,
   income, employment status, and document text.
3. **Submit** — `POST /applications/:id/submit` → responds `202`, `status: processing`,
   and starts the pipeline.
4. **Orchestrator** runs the six agents in sequence. Each agent:
   - reads the application + all prior agents' outputs,
   - calls Gemini with a focused prompt,
   - receives **structured JSON validated by Zod**,
   - persists an `agent_results` row and emits an `events` row.
5. **Decision Agent** outputs `approved`/`rejected` + `loan_amount` + `interest_rate`
   + a written `rationale`.
6. Client **polls** `GET /applications/:id` and sees status advance
   (`processing → decided` / `failed`) plus the full agent-by-agent trail.

---

## 6. Data Model (PostgreSQL via Prisma)

- `users` — id, email, password_hash, role (`applicant` | `officer`), timestamps
- `applications` — id, user_id, applicant_name, amount_requested, purpose, income,
  employment_status, **status** (`draft` | `processing` | `decided` | `failed`), timestamps
- `documents` — id, application_id, type, raw_text, extracted_json
- `agent_results` — id, application_id, agent_name, input_json, output_json, timestamps
  *(audit trail + explainability)*
- `decisions` — id, application_id, status, loan_amount, interest_rate, rationale
- `events` — id, application_id, topic, payload *(the simulated Kafka topics)*

---

## 7. Agents & LLM Layer

- **`LLM` interface**: `generate(prompt: string): Promise<object>`.
  - `GeminiLLM` — real implementation.
  - `MockLLM` — returns canned structured data; used in tests (zero cost, deterministic).
  - Swapping providers = one new class.
- **Each agent** is a class implementing `run(context)`:
  - `document.agent` — extract structured fields (income, employment, experience) from doc text.
  - `fraud.agent` — fraud probability + status from applicant/document signals.
  - `credit.agent` — credit score + debt-to-income ratio.
  - `risk.agent` — risk score + level.
  - `compliance.agent` — KYC/AML/sanctions status (simulated checks + LLM reasoning).
  - `decision.agent` — final status, loan amount, interest rate, rationale.
- Each has its own prompt template and Zod output schema. Small and isolated.

---

## 8. Error Handling

- Each agent call is wrapped; **retry once** on failure (mimics Temporal retry policy).
- On hard failure: record the error, set application `status: failed`, stop the pipeline.
- Zod validates all API input; central Express error handler returns clean JSON errors.
- JWT auth middleware guards protected routes; role checks where relevant.

---

## 9. API Surface (v1)

- `POST /auth/register`, `POST /auth/login`
- `GET /auth/profile`
- `POST /applications` — create
- `GET /applications/:id` — application + agent trail + decision
- `PATCH /applications/:id` — edit while `draft`
- `POST /applications/:id/submit` — start pipeline (`202`)

---

## 10. Testing

A focused set using `MockLLM`:
- Auth: register → login → access protected route.
- Applications: create + fetch.
- Orchestrator: runs all agents end-to-end and produces a decision.

Enough to prove it works and to teach the testing workflow — not exhaustive.

---

## 11. How to Run

- `docker compose up -d` — start Postgres.
- `npx prisma migrate dev` — create schema.
- `npm run dev` — start the API.
- README includes copy-paste `curl` examples covering the whole journey.

---

## 12. Build Order (few-days plan)

- **Day 1:** Project setup (TS/Express/Docker/Postgres/Prisma) + auth.
- **Day 2:** Applications + documents + validation + LLM client + first 1–2 agents.
- **Day 3:** Remaining agents + orchestrator + decision + audit trail + status polling + tests.
- **Day 4 (buffer/stretch):** README polish; tiny HTML page to visualize an application's
  journey; optionally one real upgrade (e.g. real PDF text extraction).

---

## 13. Roadmap (post-v1, optional)

Each is an isolated upgrade enabled by the clean boundaries above:
1. Real PDF/OCR extraction feeding the Document Agent.
2. Publish `events` to a real Kafka topic; add a consumer.
3. Re-implement the orchestrator on Temporal.
4. Split modules into separate services; add an API gateway.
5. Redis for rate limiting/caching; Prometheus/Grafana for metrics; K8s manifests.

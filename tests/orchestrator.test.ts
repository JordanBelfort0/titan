import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/config/db";
import { resetDb } from "./helpers";

const app = createApp();

async function createAndSubmit(overrides: Record<string, unknown> = {}) {
  const reg = await request(app)
    .post("/auth/register")
    .send({ email: `u${Math.round(Date.now() % 1e6)}@example.com`, password: "password123" });
  const token = reg.body.token as string;

  const create = await request(app)
    .post("/applications")
    .set("authorization", `Bearer ${token}`)
    .send({
      applicantName: "Jane Doe",
      amountRequested: 20000,
      purpose: "home improvement",
      income: 90000,
      employmentStatus: "employed full-time",
      documentText: "Jane Doe, employed full-time, 6 years, income 90000.",
      ...overrides,
    });

  const submit = await request(app)
    .post(`/applications/${create.body.id}/submit`)
    .set("authorization", `Bearer ${token}`);

  return { token, id: create.body.id as string, submit };
}

describe("orchestrator (mock LLM)", () => {
  beforeEach(resetDb);

  it("runs all six agents end-to-end and produces a decision", async () => {
    const { token, id, submit } = await createAndSubmit();
    expect(submit.status).toBe(202);

    const res = await request(app)
      .get(`/applications/${id}`)
      .set("authorization", `Bearer ${token}`);

    expect(res.body.status).toBe("decided");

    // All six agents recorded a result.
    const agentNames = res.body.agentResults.map((r: { agentName: string }) => r.agentName);
    expect(agentNames).toEqual([
      "document",
      "fraud",
      "credit",
      "risk",
      "compliance",
      "decision",
    ]);

    // A decision row exists with a rationale.
    expect(res.body.decision).toBeTruthy();
    expect(["approved", "rejected"]).toContain(res.body.decision.status);
    expect(res.body.decision.rationale).toBeTypeOf("string");

    // Events were emitted (simulated Kafka topics).
    const topics = res.body.events.map((e: { topic: string }) => e.topic);
    expect(topics).toContain("credit.analyzed");
    expect(topics).toContain("application.decided");
  });

  it("approves a strong applicant", async () => {
    const { token, id } = await createAndSubmit({
      amountRequested: 10000,
      income: 150000,
      employmentStatus: "employed full-time",
    });
    const res = await request(app)
      .get(`/applications/${id}`)
      .set("authorization", `Bearer ${token}`);
    expect(res.body.decision.status).toBe("approved");
    expect(res.body.decision.loanAmount).toBeGreaterThan(0);
  });

  it("emits one agent_result per agent and no more", async () => {
    const { id } = await createAndSubmit();
    const count = await prisma.agentResult.count({ where: { applicationId: id } });
    expect(count).toBe(6);
  });
});

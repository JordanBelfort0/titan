import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/db";
import { MockLLM } from "../src/lib/llm";
import { runPipeline } from "../src/orchestrator/orchestrator";
import { resetDb } from "./helpers";

// The orchestrator is tested directly (not through the async HTTP submit) so the
// pipeline completes deterministically before we assert. MockLLM => zero cost.
const llm = new MockLLM();

async function seedApplication(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { email: `u${Math.random().toString(36).slice(2)}@ex.com`, passwordHash: "x" },
  });
  return prisma.application.create({
    data: {
      userId: user.id,
      applicantName: "Jane Doe",
      amountRequested: 20000,
      purpose: "home improvement",
      income: 90000,
      employmentStatus: "employed full-time",
      status: "processing",
      documents: { create: { type: "application", rawText: "Jane Doe, 6 years, income 90000." } },
      ...overrides,
    },
  });
}

describe("orchestrator (mock LLM)", () => {
  beforeEach(resetDb);

  it("runs all six agents end-to-end and produces a decision", async () => {
    const app = await seedApplication();
    await runPipeline(app.id, llm);

    const result = await prisma.application.findUnique({
      where: { id: app.id },
      include: { agentResults: { orderBy: { createdAt: "asc" } }, decision: true, events: true },
    });

    expect(result!.status).toBe("decided");
    expect(result!.agentResults.map((r) => r.agentName)).toEqual([
      "document",
      "fraud",
      "credit",
      "risk",
      "compliance",
      "decision",
    ]);
    expect(result!.decision).toBeTruthy();
    expect(["approved", "rejected"]).toContain(result!.decision!.status);
    expect(result!.decision!.rationale).toBeTypeOf("string");

    const topics = result!.events.map((e) => e.topic);
    expect(topics).toContain("credit.analyzed");
    expect(topics).toContain("application.decided");
  });

  it("approves a strong applicant", async () => {
    const app = await seedApplication({ amountRequested: 10000, income: 150000 });
    await runPipeline(app.id, llm);
    const decision = await prisma.decision.findUnique({ where: { applicationId: app.id } });
    expect(decision!.status).toBe("approved");
    expect(decision!.loanAmount).toBeGreaterThan(0);
  });

  it("rejects a weak applicant", async () => {
    const app = await seedApplication({
      amountRequested: 200000,
      income: 18000,
      employmentStatus: "unemployed",
    });
    await runPipeline(app.id, llm);
    const decision = await prisma.decision.findUnique({ where: { applicationId: app.id } });
    expect(decision!.status).toBe("rejected");
  });

  it("writes exactly one agent_result per agent", async () => {
    const app = await seedApplication();
    await runPipeline(app.id, llm);
    const count = await prisma.agentResult.count({ where: { applicationId: app.id } });
    expect(count).toBe(6);
  });
});

import { prisma } from "../config/db";
import { logger } from "../lib/logger";
import type { LLM } from "../lib/llm";
import type { Agent, AgentContext } from "../agents/base";
import { documentAgent } from "../agents/document.agent";
import { fraudAgent } from "../agents/fraud.agent";
import { creditAgent } from "../agents/credit.agent";
import { riskAgent } from "../agents/risk.agent";
import { complianceAgent } from "../agents/compliance.agent";
import { decisionAgent, type DecisionOutput } from "../agents/decision.agent";

// Fixed pipeline order (spec §5).
const PIPELINE: Agent[] = [
  documentAgent,
  fraudAgent,
  creditAgent,
  riskAgent,
  complianceAgent,
  decisionAgent,
];

/** Run one agent with a single retry (mimics a Temporal retry policy). */
async function runWithRetry(agent: Agent, ctx: AgentContext, llm: LLM): Promise<unknown> {
  try {
    return await agent.run(ctx, llm);
  } catch (err) {
    logger.warn("Agent failed, retrying once", { agent: agent.name });
    return agent.run(ctx, llm);
  }
}

/**
 * Executes the full underwriting pipeline for one application:
 * each agent reads prior outputs, we persist an agent_results row and emit
 * an events row, and the decision agent's output becomes the decisions row.
 * On hard failure the application is marked `failed` and the pipeline stops.
 */
export async function runPipeline(applicationId: string, llm: LLM): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { documents: true },
  });
  if (!application) throw new Error(`Application ${applicationId} not found`);

  const ctx: AgentContext = {
    application,
    documents: application.documents,
    prior: {},
  };

  try {
    for (const agent of PIPELINE) {
      const output = await runWithRetry(agent, ctx, llm);
      ctx.prior[agent.name] = output;

      await prisma.agentResult.create({
        data: {
          applicationId,
          agentName: agent.name,
          inputJson: safeJson(ctx.prior),
          outputJson: safeJson(output),
        },
      });
      await prisma.event.create({
        data: {
          applicationId,
          topic: `${agent.name}.analyzed`,
          payload: safeJson(output),
        },
      });
    }

    const decision = ctx.prior.decision as DecisionOutput;
    await prisma.decision.create({
      data: {
        applicationId,
        status: decision.status,
        loanAmount: decision.loanAmount,
        interestRate: decision.interestRate,
        rationale: decision.rationale,
      },
    });
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "decided" },
    });
    await prisma.event.create({
      data: { applicationId, topic: "application.decided", payload: safeJson(decision) },
    });

    logger.info("Pipeline complete", { applicationId, decision: decision.status });
  } catch (err) {
    logger.error("Pipeline failed", {
      applicationId,
      error: err instanceof Error ? err.message : String(err),
    });
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "failed" },
    });
    await prisma.event.create({
      data: {
        applicationId,
        topic: "application.failed",
        payload: { error: err instanceof Error ? err.message : String(err) },
      },
    });
  }
}

// Ensure values are plain JSON for Prisma's Json columns.
function safeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

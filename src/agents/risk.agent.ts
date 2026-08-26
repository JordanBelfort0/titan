import { z } from "zod";
import type { Agent, AgentContext } from "./base";
import type { LLM } from "../lib/llm";
import type { CreditOutput } from "./credit.agent";
import type { FraudOutput } from "./fraud.agent";

export const riskSchema = z.object({
  riskScore: z.number().min(0).max(100),
  level: z.enum(["low", "medium", "high"]),
  factors: z.array(z.string()),
});
export type RiskOutput = z.infer<typeof riskSchema>;

/** Combines credit + fraud signals into an overall risk score. */
export const riskAgent: Agent<RiskOutput> = {
  name: "risk",
  async run(ctx: AgentContext, llm: LLM): Promise<RiskOutput> {
    const credit = ctx.prior.credit as CreditOutput | undefined;
    const fraud = ctx.prior.fraud as FraudOutput | undefined;
    const factors: string[] = [];

    const creditScore = credit?.creditScore ?? 650;
    const dti = credit?.debtToIncome ?? 0.4;
    const fraudProb = fraud?.fraudProbability ?? 0.1;

    // 0 (best) .. 100 (worst).
    let riskScore = 0;
    riskScore += (850 - creditScore) / 5.5; // up to ~100 from credit
    riskScore += dti * 40;
    riskScore += fraudProb * 40;
    riskScore = Math.round(Math.max(0, Math.min(100, riskScore)));

    if (creditScore < 620) factors.push("Low credit score");
    if (dti > 0.4) factors.push("High debt-to-income");
    if (fraudProb > 0.3) factors.push("Elevated fraud probability");
    if (factors.length === 0) factors.push("No major risk factors");

    const level = riskScore > 66 ? "high" : riskScore > 33 ? "medium" : "low";

    return llm.generate({
      schema: riskSchema,
      prompt: `Given credit ${JSON.stringify(credit)} and fraud ${JSON.stringify(fraud)},
produce an overall risk score (0-100), level, and contributing factors.`,
      mock: { riskScore, level, factors },
    });
  },
};

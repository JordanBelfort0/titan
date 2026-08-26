import { z } from "zod";
import type { Agent, AgentContext } from "./base";
import type { LLM } from "../lib/llm";
import type { CreditOutput } from "./credit.agent";
import type { RiskOutput } from "./risk.agent";
import type { ComplianceOutput } from "./compliance.agent";

export const decisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  loanAmount: z.number().nonnegative(),
  interestRate: z.number().min(0),
  rationale: z.string(),
});
export type DecisionOutput = z.infer<typeof decisionSchema>;

/** Synthesises all prior analyses into the final underwriting decision. */
export const decisionAgent: Agent<DecisionOutput> = {
  name: "decision",
  async run(ctx: AgentContext, llm: LLM): Promise<DecisionOutput> {
    const credit = ctx.prior.credit as CreditOutput | undefined;
    const risk = ctx.prior.risk as RiskOutput | undefined;
    const compliance = ctx.prior.compliance as ComplianceOutput | undefined;

    const creditScore = credit?.creditScore ?? 650;
    const riskScore = risk?.riskScore ?? 50;
    const compliant = compliance?.status === "pass";
    const requested = ctx.application.amountRequested;

    // Rules: must be compliant, risk not high, credit not too low.
    const approved = compliant && riskScore <= 66 && creditScore >= 600;

    // Base rate rises with risk; approve at a fraction of requested when risk is elevated.
    const interestRate = approved ? Number((5 + riskScore / 10).toFixed(2)) : 0;
    const loanAmount = approved
      ? Math.round(requested * (riskScore > 33 ? 0.75 : 1))
      : 0;

    const reasons: string[] = [];
    if (!compliant) reasons.push("failed compliance checks");
    if (riskScore > 66) reasons.push(`high risk score (${riskScore})`);
    if (creditScore < 600) reasons.push(`low credit score (${creditScore})`);

    const rationale = approved
      ? `Approved: credit ${creditScore}, risk ${riskScore}/100, compliance passed. ` +
        `Offered ${loanAmount} at ${interestRate}% APR.`
      : `Rejected due to ${reasons.join(", ")}.`;

    return llm.generate({
      schema: decisionSchema,
      prompt: `Make the final loan decision (approved/rejected), loan amount, interest rate,
and a written rationale. Credit: ${JSON.stringify(credit)}; Risk: ${JSON.stringify(risk)};
Compliance: ${JSON.stringify(compliance)}; Requested: ${requested}.`,
      mock: { status: approved ? "approved" : "rejected", loanAmount, interestRate, rationale },
    });
  },
};

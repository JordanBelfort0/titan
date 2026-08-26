import { z } from "zod";
import type { Agent, AgentContext } from "./base";
import type { LLM } from "../lib/llm";

export const creditSchema = z.object({
  creditScore: z.number().min(300).max(850),
  debtToIncome: z.number().min(0).max(1),
  notes: z.string(),
});
export type CreditOutput = z.infer<typeof creditSchema>;

/** Produces a credit score and debt-to-income ratio. */
export const creditAgent: Agent<CreditOutput> = {
  name: "credit",
  async run(ctx: AgentContext, llm: LLM): Promise<CreditOutput> {
    const income = Math.max(ctx.application.income, 1);
    // Annualised repayment estimate as a stand-in for total debt service.
    const annualRepayment = ctx.application.amountRequested * 0.15;
    const debtToIncome = Math.min(annualRepayment / income, 1);

    // Higher DTI and unemployment pull the score down; employment lifts it.
    const employed = /employ|full|part/i.test(ctx.application.employmentStatus);
    const creditScore = Math.round(
      Math.max(300, Math.min(850, 720 - debtToIncome * 250 + (employed ? 40 : -60))),
    );

    return llm.generate({
      schema: creditSchema,
      prompt: `Estimate a credit score (300-850) and debt-to-income ratio for:
${JSON.stringify(ctx.application)}`,
      mock: {
        creditScore,
        debtToIncome: Number(debtToIncome.toFixed(2)),
        notes: employed
          ? "Stable employment supports creditworthiness."
          : "Employment status weakens the credit profile.",
      },
    });
  },
};

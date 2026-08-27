import { z } from "zod";
import type { Agent, AgentContext } from "./base";
import type { LLM } from "../lib/llm";
import type { DocumentOutput } from "./document.agent";

export const fraudSchema = z.object({
  fraudProbability: z.number().min(0).max(1),
  status: z.enum(["clear", "review", "flagged"]),
  signals: z.array(z.string()),
});
export type FraudOutput = z.infer<typeof fraudSchema>;

/** Estimates fraud risk from applicant/document signals. */
export const fraudAgent: Agent<FraudOutput> = {
  name: "fraud",
  async run(ctx: AgentContext, llm: LLM): Promise<FraudOutput> {
    const doc = ctx.prior.document as DocumentOutput | undefined;
    const signals: string[] = [];

    // Deterministic heuristics for the mock: mismatched income is suspicious.
    const stated = ctx.application.income;
    const extracted = doc?.extractedIncome ?? stated;
    const mismatch = stated > 0 ? Math.abs(stated - extracted) / stated : 0;
    if (mismatch > 0.2) signals.push("Stated income differs from documents");
    if (ctx.application.amountRequested > stated * 5) {
      signals.push("Loan amount very high relative to income");
    }

    const fraudProbability = Math.min(0.05 + mismatch + signals.length * 0.1, 0.95);
    const status = fraudProbability > 0.6 ? "flagged" : fraudProbability > 0.3 ? "review" : "clear";

    return llm.generate({
      schema: fraudSchema,
      prompt: `You are a fraud-detection agent for loan applications. Compare the applicant's
stated figures against the document analysis and flag inconsistencies (e.g. income
mismatch, loan far exceeding income, vague/unverifiable employment).

Applicant: ${JSON.stringify(ctx.application)}
Document analysis: ${JSON.stringify(doc)}

Return a JSON object with:
- "fraudProbability": number between 0 and 1
- "status": one of "clear", "review", "flagged"
- "signals": array of short strings describing any red flags (empty if none)`,
      mock: { fraudProbability: Number(fraudProbability.toFixed(2)), status, signals },
    });
  },
};

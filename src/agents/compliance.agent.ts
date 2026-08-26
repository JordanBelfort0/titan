import { z } from "zod";
import type { Agent, AgentContext } from "./base";
import type { LLM } from "../lib/llm";
import type { FraudOutput } from "./fraud.agent";

export const complianceSchema = z.object({
  kyc: z.enum(["pass", "fail"]),
  aml: z.enum(["pass", "fail"]),
  sanctions: z.enum(["clear", "hit"]),
  status: z.enum(["pass", "fail"]),
  notes: z.string(),
});
export type ComplianceOutput = z.infer<typeof complianceSchema>;

/** Simulated KYC / AML / sanctions checks with LLM reasoning. */
export const complianceAgent: Agent<ComplianceOutput> = {
  name: "compliance",
  async run(ctx: AgentContext, llm: LLM): Promise<ComplianceOutput> {
    const fraud = ctx.prior.fraud as FraudOutput | undefined;

    // Simulated checks: KYC passes with a name; sanctions "hit" if flagged for fraud.
    const kyc = ctx.application.applicantName.trim().length > 1 ? "pass" : "fail";
    const sanctions = fraud?.status === "flagged" ? "hit" : "clear";
    const aml = (fraud?.fraudProbability ?? 0) > 0.7 ? "fail" : "pass";
    const status = kyc === "pass" && aml === "pass" && sanctions === "clear" ? "pass" : "fail";

    return llm.generate({
      schema: complianceSchema,
      prompt: `Run KYC/AML/sanctions checks and reason about compliance for:
${JSON.stringify(ctx.application)} with fraud signals ${JSON.stringify(fraud)}`,
      mock: {
        kyc,
        aml,
        sanctions,
        status,
        notes:
          status === "pass"
            ? "All compliance checks passed."
            : "One or more compliance checks failed.",
      },
    });
  },
};

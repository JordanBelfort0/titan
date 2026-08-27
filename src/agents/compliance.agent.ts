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
      prompt: `You are a compliance agent running simulated KYC (know-your-customer),
AML (anti-money-laundering), and sanctions screening. A flagged fraud status or very
high fraud probability should fail AML / trigger a sanctions hit. A present, plausible
applicant name passes KYC.

Applicant: ${JSON.stringify(ctx.application)}
Fraud analysis: ${JSON.stringify(fraud)}

Return a JSON object with:
- "kyc": one of "pass", "fail"
- "aml": one of "pass", "fail"
- "sanctions": one of "clear", "hit"
- "status": one of "pass", "fail" (fail if any individual check fails)
- "notes": string — one sentence summary`,
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

import { z } from "zod";
import type { Agent, AgentContext } from "./base";
import type { LLM } from "../lib/llm";

export const documentSchema = z.object({
  extractedIncome: z.number().nonnegative(),
  employmentStatus: z.string(),
  yearsExperience: z.number().nonnegative(),
  summary: z.string(),
});
export type DocumentOutput = z.infer<typeof documentSchema>;

/** Extracts structured applicant fields from the raw document text. */
export const documentAgent: Agent<DocumentOutput> = {
  name: "document",
  async run(ctx: AgentContext, llm: LLM): Promise<DocumentOutput> {
    const text = ctx.documents.map((d) => d.rawText).join("\n");
    const yearsMatch = text.match(/(\d+)\s*(?:\+)?\s*years?/i);

    return llm.generate({
      schema: documentSchema,
      prompt: `You are a loan document-analysis agent. Read the applicant document below
and extract structured fields. The applicant's stated income is ${ctx.application.income}
and stated employment is "${ctx.application.employmentStatus}" — use the document to
confirm or correct these.

Return a JSON object with:
- "extractedIncome": number — annual income you find in the document (>= 0)
- "employmentStatus": string — employment status from the document
- "yearsExperience": number — years of work experience (>= 0)
- "summary": string — one sentence summarising the applicant

Document:
${text}`,
      mock: {
        extractedIncome: ctx.application.income,
        employmentStatus: ctx.application.employmentStatus,
        yearsExperience: yearsMatch ? Number(yearsMatch[1]) : 3,
        summary: `Applicant ${ctx.application.applicantName} seeking ${ctx.application.purpose}.`,
      },
    });
  },
};

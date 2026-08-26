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
      prompt: `Extract the applicant's income, employment status, years of experience,
and a one-line summary from this document:\n\n${text}`,
      mock: {
        extractedIncome: ctx.application.income,
        employmentStatus: ctx.application.employmentStatus,
        yearsExperience: yearsMatch ? Number(yearsMatch[1]) : 3,
        summary: `Applicant ${ctx.application.applicantName} seeking ${ctx.application.purpose}.`,
      },
    });
  },
};

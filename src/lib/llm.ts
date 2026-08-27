import { GoogleGenerativeAI } from "@google/generative-ai";
import type { z } from "zod";
import { env } from "../config/env";
import { logger } from "./logger";

/**
 * A single LLM call. The caller (an agent) supplies:
 *  - `prompt`: the instruction sent to a real model,
 *  - `schema`: a Zod schema the output MUST satisfy,
 *  - `mock`: a deterministic value used by MockLLM (tests / no-key runs).
 *
 * This keeps every agent provider-agnostic: swapping Gemini for another
 * model, or for the deterministic mock, never touches agent code.
 */
export interface LlmRequest<T> {
  prompt: string;
  schema: z.ZodType<T>;
  mock: T;
}

export interface LLM {
  generate<T>(req: LlmRequest<T>): Promise<T>;
}

/** Deterministic, zero-cost implementation used in tests and mock mode. */
export class MockLLM implements LLM {
  async generate<T>(req: LlmRequest<T>): Promise<T> {
    return req.schema.parse(req.mock);
  }
}

/** Real implementation backed by Google Gemini. */
export class GeminiLLM implements LLM {
  private model;

  constructor(apiKey: string, modelName = "gemini-3.6-flash") {
    const client = new GoogleGenerativeAI(apiKey);
    // Force JSON output so we don't have to scrape prose/markdown fences.
    this.model = client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    });
  }

  async generate<T>(req: LlmRequest<T>): Promise<T> {
    const result = await this.model.generateContent(
      `${req.prompt}\n\nRespond with ONLY a single JSON object matching the requested fields.`,
    );
    const text = result.response.text();
    const parsed = extractJson(text);
    return req.schema.parse(parsed);
  }
}

/** Pull a JSON object out of a model response that may be fenced or noisy. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("LLM response contained no JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Build the configured LLM from the environment. */
export function createLLM(): LLM {
  if (env.LLM_PROVIDER === "gemini") {
    if (!env.GEMINI_API_KEY) {
      logger.warn("LLM_PROVIDER=gemini but GEMINI_API_KEY missing; using MockLLM");
      return new MockLLM();
    }
    return new GeminiLLM(env.GEMINI_API_KEY);
  }
  return new MockLLM();
}

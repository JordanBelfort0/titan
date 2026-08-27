import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockLLM, createLLM } from "../src/lib/llm";

describe("LLM layer", () => {
  it("MockLLM returns the schema-validated mock", async () => {
    const llm = new MockLLM();
    const schema = z.object({ score: z.number().min(0).max(100) });
    const out = await llm.generate({ schema, prompt: "ignored", mock: { score: 42 } });
    expect(out.score).toBe(42);
  });

  it("MockLLM rejects a mock that violates the schema", async () => {
    const llm = new MockLLM();
    const schema = z.object({ score: z.number().max(100) });
    await expect(
      llm.generate({ schema, prompt: "x", mock: { score: 999 } as never }),
    ).rejects.toThrow();
  });

  it("createLLM uses MockLLM in the test env (LLM_PROVIDER=mock)", () => {
    expect(createLLM()).toBeInstanceOf(MockLLM);
  });
});

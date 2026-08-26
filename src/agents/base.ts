import type { Application, Document } from "@prisma/client";
import type { LLM } from "../lib/llm";

/**
 * Everything an agent can see: the application, its documents, and the
 * structured outputs of every agent that ran before it. Agents are pure
 * with respect to the DB — the orchestrator persists their results.
 */
export interface AgentContext {
  application: Application;
  documents: Document[];
  /** Prior agents' outputs, keyed by agent name (e.g. "credit"). */
  prior: Record<string, unknown>;
}

export interface Agent<TOutput = unknown> {
  /** Stable identifier, also used as the events topic prefix. */
  name: string;
  run(ctx: AgentContext, llm: LLM): Promise<TOutput>;
}

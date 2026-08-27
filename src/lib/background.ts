import { waitUntil } from "@vercel/functions";
import { logger } from "./logger";

/**
 * Run work in the background without making the client wait.
 *
 * On Vercel we hand the promise to `waitUntil`, which keeps the serverless
 * function alive until the work finishes even though we've already sent the
 * HTTP response (this is the async submit → 202 → poll model). Locally there is
 * no such context, so we fire-and-forget and just log any failure.
 *
 * The task itself is responsible for persisting its own success/failure
 * (the orchestrator marks the application `decided` or `failed`), so nothing is
 * silently lost if the process ends early.
 */
export function scheduleBackground(task: () => Promise<void>): void {
  const promise = task().catch((err) => {
    logger.error("Background task failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  if (process.env.VERCEL) {
    waitUntil(promise);
  }
}

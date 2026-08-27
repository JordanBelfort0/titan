import express from "express";
import authRoutes from "./modules/auth/auth.routes";
import applicationRoutes from "./modules/applications/applications.routes";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { env } from "./config/env";
import { page } from "./ui/page";

export function createApp() {
  const app = express();
  app.use(express.json());

  // The web UI.
  app.get("/", (_req, res) => res.type("html").send(page));

  // Health + which inference engine is actually live (gemini only if keyed).
  app.get("/health", (_req, res) => {
    const llm = env.LLM_PROVIDER === "gemini" && env.GEMINI_API_KEY ? "gemini" : "mock";
    res.json({ status: "ok", service: "titan", llm });
  });

  app.use("/auth", authRoutes);
  app.use("/applications", applicationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

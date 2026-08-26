import express from "express";
import authRoutes from "./modules/auth/auth.routes";
import applicationRoutes from "./modules/applications/applications.routes";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/", (_req, res) =>
    res.json({
      service: "titan",
      description: "Autonomous loan underwriting platform",
      health: "/health",
      endpoints: ["/auth/register", "/auth/login", "/auth/profile", "/applications"],
    }),
  );

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "titan" }));

  app.use("/auth", authRoutes);
  app.use("/applications", applicationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

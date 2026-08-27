import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { createLLM } from "../../lib/llm";
import { scheduleBackground } from "../../lib/background";
import * as apps from "./applications.service";

const router = Router();
const llm = createLLM();

const createSchema = z.object({
  applicantName: z.string().min(1),
  amountRequested: z.number().positive(),
  purpose: z.string().min(1),
  income: z.number().nonnegative(),
  employmentStatus: z.string().min(1),
  documentText: z.string().min(1),
});

const patchSchema = createSchema.omit({ documentText: true }).partial();

router.use(requireAuth);

router.post("/", async (req, res) => {
  const input = createSchema.parse(req.body);
  const application = await apps.createApplication(req.user!.sub, input);
  res.status(201).json(application);
});

router.get("/:id", async (req, res) => {
  const application = await apps.getApplication(req.user!.sub, req.user!.role, req.params.id);
  res.json(application);
});

router.patch("/:id", async (req, res) => {
  const patch = patchSchema.parse(req.body);
  const application = await apps.updateApplication(req.user!.sub, req.params.id, patch);
  res.json(application);
});

router.post("/:id/submit", async (req, res) => {
  const result = await apps.submitApplication(req.user!.sub, req.params.id);
  // Run the six-agent pipeline in the background; client polls GET /:id.
  scheduleBackground(() => apps.runApplicationPipeline(result.id, llm));
  res.status(202).json(result);
});

export default router;

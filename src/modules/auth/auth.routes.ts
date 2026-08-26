import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import * as authService from "./auth.service";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["applicant", "officer"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  res.status(201).json(result);
});

router.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json(result);
});

router.get("/profile", requireAuth, async (req, res) => {
  const result = await authService.profile(req.user!.sub);
  res.json(result);
});

export default router;

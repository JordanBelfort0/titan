import bcrypt from "bcrypt";
import { prisma } from "../../config/db";
import { signToken } from "../../lib/jwt";
import { ConflictError, UnauthorizedError } from "../../lib/errors";

const SALT_ROUNDS = 10;

export async function register(input: {
  email: string;
  password: string;
  role?: "applicant" | "officer";
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("Email already registered");

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash, role: input.role ?? "applicant" },
  });

  return issue(user);
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new UnauthorizedError("Invalid credentials");

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new UnauthorizedError("Invalid credentials");

  return issue(user);
}

export async function profile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, createdAt: true },
  });
  if (!user) throw new UnauthorizedError("User no longer exists");
  return user;
}

function issue(user: { id: string; email: string; role: string }) {
  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return {
    token,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

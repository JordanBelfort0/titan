import { prisma } from "../../config/db";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { runPipeline } from "../../orchestrator/orchestrator";
import type { LLM } from "../../lib/llm";

export interface CreateApplicationInput {
  applicantName: string;
  amountRequested: number;
  purpose: string;
  income: number;
  employmentStatus: string;
  documentText: string;
}

export async function createApplication(userId: string, input: CreateApplicationInput) {
  return prisma.application.create({
    data: {
      userId,
      applicantName: input.applicantName,
      amountRequested: input.amountRequested,
      purpose: input.purpose,
      income: input.income,
      employmentStatus: input.employmentStatus,
      status: "draft",
      documents: {
        create: { type: "application", rawText: input.documentText },
      },
    },
    include: { documents: true },
  });
}

export async function getApplication(userId: string, role: string, id: string) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      documents: true,
      agentResults: { orderBy: { createdAt: "asc" } },
      decision: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!application) throw new NotFoundError("Application not found");
  // Applicants can only see their own; officers can see any.
  if (role !== "officer" && application.userId !== userId) {
    throw new ForbiddenError("Not your application");
  }
  return application;
}

export async function updateApplication(
  userId: string,
  id: string,
  patch: Partial<Omit<CreateApplicationInput, "documentText">>,
) {
  const application = await requireOwnedApplication(userId, id);
  if (application.status !== "draft") {
    throw new BadRequestError("Only draft applications can be edited");
  }
  return prisma.application.update({ where: { id }, data: patch });
}

export async function submitApplication(userId: string, id: string, llm: LLM) {
  const application = await requireOwnedApplication(userId, id);
  if (application.status !== "draft") {
    throw new BadRequestError(`Application is already ${application.status}`);
  }

  await prisma.application.update({ where: { id }, data: { status: "processing" } });

  // Mock pipeline is instant, so we run it inline. When wiring real Gemini,
  // move this to a background job so submit can return 202 immediately.
  await runPipeline(id, llm);

  return prisma.application.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

async function requireOwnedApplication(userId: string, id: string) {
  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) throw new NotFoundError("Application not found");
  if (application.userId !== userId) throw new ForbiddenError("Not your application");
  return application;
}

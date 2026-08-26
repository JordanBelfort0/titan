import { prisma } from "../src/config/db";

// Wipe all tables between tests in a single round-trip. TRUNCATE ... CASCADE is
// far faster over a remote (Neon) connection than six sequential deleteMany calls.
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "events", "decisions", "agent_results", "documents", "applications", "users" RESTART IDENTITY CASCADE`,
  );
}

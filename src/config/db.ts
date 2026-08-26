import { PrismaClient } from "@prisma/client";

/**
 * Pick the connection URL for the Prisma client.
 *
 * In production on Vercel we talk to Neon through its transaction-mode
 * connection pooler. Prisma must be told to disable prepared statements there
 * (via the `pgbouncer=true` flag, which Prisma consumes locally — it is not
 * sent to Postgres), otherwise concurrent invocations hit
 * "prepared statement already exists" errors.
 *
 * Locally (dev/test) there is no pooler, so we use DATABASE_URL as-is.
 */
function resolveDatabaseUrl(): string | undefined {
  const url = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL;
  if (!url) return undefined;
  const isPooled = url.includes("-pooler.");
  if (!isPooled || url.includes("pgbouncer=true")) return url;
  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true";
}

// Reuse a single PrismaClient across serverless invocations / hot reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const datasourceUrl = resolveDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

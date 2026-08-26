import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load the test env (local Postgres) BEFORE anything imports the Prisma client.
const testEnv = config({ path: ".env.test", override: true }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    fileParallelism: false, // tests share one database; run serially
    hookTimeout: 30000,
    testTimeout: 30000,
    env: testEnv,
  },
});

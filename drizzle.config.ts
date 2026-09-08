import "./scripts/load-env";
import { defineConfig } from "drizzle-kit";
import { getDatabaseUrl } from "./src/lib/env/database";

const hasDatabaseUrl = Boolean(
  process.env.DATABASE_URL?.trim(),
);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: false,
  ...(hasDatabaseUrl
    ? {
        dbCredentials: {
          url: getDatabaseUrl(),
        },
      }
    : {}),
});
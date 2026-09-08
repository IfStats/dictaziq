import "./load-env";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

async function main() {
  // Configuration errors are safe to display.
  const databaseUrl = getDatabaseUrl();

  try {
    const client = neon(databaseUrl);
    const rows = await client`SELECT 1 AS connected`;

    if (rows[0]?.connected !== 1) {
      throw new Error("Unexpected database response.");
    }
  } catch {
    throw new Error(
      "Database connection failed. Check your Neon connection string, database availability, and network connection.",
    );
  }

  console.log("Database connection successful.");
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Database check failed.",
  );
  process.exitCode = 1;
});
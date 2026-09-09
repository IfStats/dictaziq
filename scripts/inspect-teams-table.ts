import "./load-env";

import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

async function main() {
  const sql = neon(getDatabaseUrl());

  const columns = await sql`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teams'
    ORDER BY ordinal_position
  `;

  console.table(columns);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Team schema inspection failed.",
  );

  process.exitCode = 1;
});
import "./load-env";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

function normalizeSql(value: unknown): string {
  return String(value)
    .replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function main() {
  const client = neon(getDatabaseUrl());

  const tableRows = await client`
    SELECT to_regclass('public.prediction_outcomes')::text AS relation
  `;

  assert.equal(
    tableRows[0]?.relation,
    "prediction_outcomes",
    "prediction_outcomes table is missing.",
  );

  const columns = await client`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prediction_outcomes'
    ORDER BY ordinal_position
  `;

  assert.deepEqual(
    columns.map((row) => row.column_name),
    [
      "id",
      "prediction_id",
      "result_snapshot_id",
      "market",
      "selection",
      "outcome",
      "rules_version",
      "settled_at",
    ],
    "prediction_outcomes columns do not match the expected schema.",
  );

  const indexRows = await client`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'prediction_outcomes'
      AND indexname = 'prediction_outcomes_settlement_identity'
  `;

  assert.equal(
    indexRows.length,
    1,
    "Canonical settlement unique index is missing.",
  );

  const indexDefinition = normalizeSql(indexRows[0].indexdef);

  assert.ok(
    indexDefinition.startsWith("create unique index"),
    "Settlement identity index is not unique.",
  );

  assert.ok(
    indexDefinition.includes(
      "(prediction_id, market, selection)",
    ),
    `Unexpected settlement identity index: ${indexRows[0].indexdef}`,
  );

  const triggerRows = await client`
    SELECT trigger.tgname AS name
    FROM pg_trigger AS trigger
    JOIN pg_class AS relation
      ON relation.oid = trigger.tgrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'prediction_outcomes'
      AND NOT trigger.tgisinternal
    ORDER BY trigger.tgname
  `;

  assert.deepEqual(
    triggerRows.map((row) => row.name),
    [
      "prediction_outcomes_guard",
      "prediction_outcomes_immutable",
      "prediction_outcomes_no_truncate",
    ],
    "prediction_outcomes triggers do not match the expected guards.",
  );

  const functionRows = await client`
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'dictaziq_guard_prediction_outcome'
  `;

  assert.equal(
    functionRows.length,
    1,
    "Settlement guard function is missing.",
  );

  const migrationRows = await client`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY id
  `;

  assert.ok(
    migrationRows.length >= 5,
    `Expected at least 5 applied migrations, found ${migrationRows.length}.`,
  );

  console.log("PASS: prediction_outcomes table exists.");
  console.log("PASS: prediction_outcomes columns verified.");
  console.log(
    "PASS: canonical settlement uniqueness is prediction + market + selection.",
  );
  console.log("PASS: settlement guard function exists.");
  console.log("PASS: settlement immutability triggers exist.");
  console.log(
    `PASS: ${migrationRows.length} Drizzle migrations recorded by the database.`,
  );

  console.log("");
  console.log("Latest migration records:");

  for (const row of migrationRows.slice(-5)) {
    console.log(
      `  id=${row.id} created_at=${row.created_at} hash=${String(row.hash).slice(0, 12)}...`,
    );
  }
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(`Verification failed: ${error.message}`);
  } else {
    console.error(
      error instanceof Error
        ? `Verification failed: ${error.message}`
        : "Settlement schema verification failed.",
    );
  }

  process.exitCode = 1;
});
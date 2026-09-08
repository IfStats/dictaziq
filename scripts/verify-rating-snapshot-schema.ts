import "./load-env";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

async function main() {
  const client = neon(getDatabaseUrl());

  const table = await client`
    SELECT to_regclass('public.team_rating_snapshots')::text AS relation
  `;

  assert.equal(
    table[0]?.relation,
    "team_rating_snapshots",
    "team_rating_snapshots table is missing.",
  );

  const columns = await client`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_rating_snapshots'
    ORDER BY ordinal_position
  `;

  assert.deepEqual(
    columns.map((row) => row.column_name),
    [
      "id",
      "team_id",
      "source",
      "source_team_id",
      "snapshot_date",
      "rating",
      "ranking_position",
      "is_demo",
      "observed_at",
      "evidence",
    ],
  );

  const indexes = await client`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'team_rating_snapshots'
    ORDER BY indexname
  `;

  const identity = indexes.find(
    (row) => row.indexname === "team_rating_snapshots_identity",
  );

  assert.ok(identity, "Rating snapshot identity index is missing.");

  assert.match(
    String(identity.indexdef),
    /UNIQUE INDEX/i,
    "Rating snapshot identity index must be unique.",
  );

  const triggers = await client`
    SELECT trigger.tgname AS name
    FROM pg_trigger AS trigger
    JOIN pg_class AS relation
      ON relation.oid = trigger.tgrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'team_rating_snapshots'
      AND NOT trigger.tgisinternal
    ORDER BY trigger.tgname
  `;

  assert.deepEqual(
    triggers.map((row) => row.name),
    [
      "team_rating_snapshots_guard",
      "team_rating_snapshots_immutable",
      "team_rating_snapshots_no_truncate",
    ],
  );

  const functions = await client`
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'dictaziq_guard_team_rating_snapshot'
  `;

  assert.equal(
    functions.length,
    1,
    "Rating snapshot guard function is missing.",
  );

  console.log("PASS: team_rating_snapshots table exists.");
  console.log("PASS: weekly rating columns verified.");
  console.log("PASS: canonical team/source/date identity verified.");
  console.log("PASS: rating snapshot guard function exists.");
  console.log("PASS: rating snapshot immutability triggers exist.");
  console.log("PASS: rating snapshot schema verification complete.");
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(`Verification failed: ${error.message}`);
  } else {
    console.error(
      error instanceof Error
        ? `Verification failed: ${error.message}`
        : "Rating snapshot verification failed.",
    );
  }

  process.exitCode = 1;
});
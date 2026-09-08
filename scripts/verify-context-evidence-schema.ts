import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";

async function main() {
  const client = neon(getDatabaseUrl());

  /*
   * 1. Table exists.
   */
  const tables = await client`
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name
    FROM pg_class AS c
    JOIN pg_namespace AS n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname =
        'context_evidence_snapshots'
      AND c.relkind = 'r'
  `;

  assert.equal(
    tables.length,
    1,
    "context_evidence_snapshots table is missing.",
  );

  console.log(
    "PASS: context_evidence_snapshots table exists.",
  );

  /*
   * 2. Required columns exist.
   */
  const columns = await client`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name =
        'context_evidence_snapshots'
  `;

  const columnNames = new Set(
    columns.map(
      (row) => String(row.column_name),
    ),
  );

  const requiredColumns = [
    "id",
    "fixture_id",
    "kind",
    "side",
    "description",
    "source",
    "source_evidence_id",
    "evidence_sha256",
    "is_demo",
    "observed_at",
    "captured_at",
    "evidence",
  ];

  for (const column of requiredColumns) {
    assert.ok(
      columnNames.has(column),
      `Missing context evidence column: ${column}`,
    );
  }

  console.log(
    "PASS: context evidence columns verified.",
  );

  /*
   * 3. Drizzle-generated integrity constraints.
   */
  const constraints = await client`
    SELECT
      con.conname AS constraint_name,
      pg_get_constraintdef(
        con.oid,
        true
      ) AS definition
    FROM pg_constraint AS con
    JOIN pg_class AS rel
      ON rel.oid = con.conrelid
    JOIN pg_namespace AS n
      ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname =
        'context_evidence_snapshots'
  `;

  const constraintNames = new Set(
    constraints.map(
      (row) =>
        String(row.constraint_name),
    ),
  );

  const requiredConstraints = [
    "context_evidence_kind_check",
    "context_evidence_side_check",
    "context_evidence_description_check",
    "context_evidence_source_check",
    "context_evidence_sha_check",
    "context_evidence_object_check",
    "context_evidence_snapshots_fixture_id_fixtures_id_fk",
  ];

  for (
    const constraint
    of requiredConstraints
  ) {
    assert.ok(
      constraintNames.has(constraint),
      `Missing context evidence constraint: ${constraint}`,
    );
  }

  console.log(
    "PASS: context evidence integrity constraints verified.",
  );

  /*
   * 4. Canonical evidence identity.
   */
  const indexes = await client`
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename =
        'context_evidence_snapshots'
  `;

  const uniqueIndex =
    indexes.find(
      (row) =>
        row.indexname ===
        "context_evidence_fixture_hash_unique",
    );

  assert.ok(
    uniqueIndex,
    "Canonical context evidence unique index is missing.",
  );

  const uniqueDefinition =
    String(uniqueIndex.indexdef);

  assert.match(
    uniqueDefinition,
    /UNIQUE/i,
  );

  assert.match(
    uniqueDefinition,
    /fixture_id/i,
  );

  assert.match(
    uniqueDefinition,
    /evidence_sha256/i,
  );

  console.log(
    "PASS: canonical fixture/evidence identity verified.",
  );

  /*
   * 5. Guard function exists.
   */
  const functions = await client`
    SELECT
      p.proname AS function_name,
      pg_get_functiondef(
        p.oid
      ) AS definition
    FROM pg_proc AS p
    JOIN pg_namespace AS n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname =
        'dictaziq_guard_context_evidence_snapshot'
  `;

  assert.equal(
    functions.length,
    1,
    "Context evidence guard function is missing.",
  );

  const guardDefinition =
    String(functions[0].definition);

  /*
   * Verify the critical chronology checks are
   * present in the database function itself.
   */
  assert.match(
    guardDefinition,
    /checked_at\s*>=\s*fixture_kickoff/i,
  );

  assert.match(
    guardDefinition,
    /new\.observed_at\s*>=\s*fixture_kickoff/i,
  );

  assert.match(
    guardDefinition,
    /new\.observed_at\s*>\s*checked_at/i,
  );

  assert.match(
    guardDefinition,
    /new\.captured_at\s*:=\s*checked_at/i,
  );

  console.log(
    "PASS: pre-kickoff chronology guard verified.",
  );

  console.log(
    "PASS: database-controlled captured_at verified.",
  );

  /*
   * 6. Triggers exist.
   */
  const triggers = await client`
    SELECT
      trg.tgname AS trigger_name,
      pg_get_triggerdef(
        trg.oid,
        true
      ) AS definition
    FROM pg_trigger AS trg
    JOIN pg_class AS rel
      ON rel.oid = trg.tgrelid
    JOIN pg_namespace AS n
      ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname =
        'context_evidence_snapshots'
      AND NOT trg.tgisinternal
  `;

  const triggerMap = new Map(
    triggers.map(
      (row) => [
        String(row.trigger_name),
        String(row.definition),
      ],
    ),
  );

  assert.ok(
    triggerMap.has(
      "context_evidence_snapshots_guard",
    ),
    "Context evidence INSERT guard trigger is missing.",
  );

  assert.ok(
    triggerMap.has(
      "context_evidence_snapshots_immutable",
    ),
    "Context evidence immutability trigger is missing.",
  );

  assert.ok(
    triggerMap.has(
      "context_evidence_snapshots_no_truncate",
    ),
    "Context evidence TRUNCATE guard is missing.",
  );

  assert.match(
    triggerMap.get(
      "context_evidence_snapshots_guard",
    ) ?? "",
    /BEFORE INSERT/i,
  );

  assert.match(
    triggerMap.get(
      "context_evidence_snapshots_immutable",
    ) ?? "",
    /BEFORE UPDATE OR DELETE|BEFORE DELETE OR UPDATE/i,
  );

  assert.match(
    triggerMap.get(
      "context_evidence_snapshots_immutable",
    ) ?? "",
    /dictaziq_reject_history_change/i,
  );

  assert.match(
    triggerMap.get(
      "context_evidence_snapshots_no_truncate",
    ) ?? "",
    /BEFORE TRUNCATE/i,
  );

  console.log(
    "PASS: context evidence INSERT guard trigger verified.",
  );

  console.log(
    "PASS: context evidence UPDATE/DELETE immutability verified.",
  );

  console.log(
    "PASS: context evidence TRUNCATE protection verified.",
  );

  console.log("");

  console.log(
    "PASS: context evidence schema verification complete.",
  );

  console.log(
    "DictazIQ can now preserve immutable, pre-kickoff context for future model evaluation and training.",
  );
}

main().catch((error: unknown) => {
  if (
    error instanceof
    assert.AssertionError
  ) {
    console.error(
      `Verification failed: ${error.message}`,
    );
  } else {
    console.error(
      error instanceof Error
        ? `Context schema verification failed: ${error.message}`
        : "Context schema verification failed.",
    );
  }

  process.exitCode = 1;
});
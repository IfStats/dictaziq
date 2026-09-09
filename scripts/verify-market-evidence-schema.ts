import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

async function main() {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * 1. Table existence.
   */
  const tables =
    await sql`
      SELECT
        c.relname
      FROM pg_class AS c

      JOIN pg_namespace AS n
        ON n.oid =
          c.relnamespace

      WHERE n.nspname =
        'public'

        AND c.relname =
          'market_evidence_snapshots'

        AND c.relkind =
          'r'
    `;

  assert.equal(
    tables.length,
    1,
    "market_evidence_snapshots table is missing.",
  );

  console.log(
    "PASS: market_evidence_snapshots table exists.",
  );

  /*
   * 2. Required columns.
   */
  const columns =
    await sql`
      SELECT
        column_name

      FROM information_schema.columns

      WHERE table_schema =
        'public'

        AND table_name =
          'market_evidence_snapshots'
    `;

  const names =
    new Set(
      columns.map(
        (row) =>
          String(
            row.column_name,
          ),
      ),
    );

  const required = [
    "id",
    "fixture_id",
    "evidence_version",
    "evidence_sha256",
    "source",
    "is_demo",
    "cutoff_at",
    "captured_at",
    "evidence",
  ];

  for (
    const column
    of required
  ) {
    assert.ok(
      names.has(
        column,
      ),
      `Missing column: ${column}`,
    );
  }

  console.log(
    "PASS: market evidence columns verified.",
  );

  /*
   * 3. Constraints.
   */
  const constraints =
    await sql`
      SELECT
        con.conname
          AS constraint_name

      FROM pg_constraint
        AS con

      JOIN pg_class
        AS rel
        ON rel.oid =
          con.conrelid

      JOIN pg_namespace
        AS n
        ON n.oid =
          rel.relnamespace

      WHERE n.nspname =
        'public'

        AND rel.relname =
          'market_evidence_snapshots'
    `;

  const constraintNames =
    new Set(
      constraints.map(
        (row) =>
          String(
            row.constraint_name,
          ),
      ),
    );

  const requiredConstraints = [
    "market_evidence_version_check",
    "market_evidence_source_check",
    "market_evidence_sha_check",
    "market_evidence_object_check",
    "market_evidence_snapshots_fixture_id_fixtures_id_fk",
  ];

  for (
    const name
    of requiredConstraints
  ) {
    assert.ok(
      constraintNames.has(
        name,
      ),
      `Missing constraint: ${name}`,
    );
  }

  console.log(
    "PASS: market evidence constraints verified.",
  );

  /*
   * 4. Canonical hash identity.
   */
  const indexes =
    await sql`
      SELECT
        indexname,
        indexdef

      FROM pg_indexes

      WHERE schemaname =
        'public'

        AND tablename =
          'market_evidence_snapshots'
    `;

  const uniqueIndex =
    indexes.find(
      (row) =>
        row.indexname ===
        "market_evidence_fixture_hash_unique",
    );

  assert.ok(
    uniqueIndex,
    "Market evidence unique hash index is missing.",
  );

  assert.match(
    String(
      uniqueIndex.indexdef,
    ),
    /UNIQUE/i,
  );

  console.log(
    "PASS: fixture/evidence hash identity verified.",
  );

  /*
   * 5. Guard function.
   */
  const functions =
    await sql`
      SELECT
        pg_get_functiondef(
          p.oid
        ) AS definition

      FROM pg_proc AS p

      JOIN pg_namespace AS n
        ON n.oid =
          p.pronamespace

      WHERE n.nspname =
        'public'

        AND p.proname =
          'dictaziq_guard_market_evidence_snapshot'
    `;

  assert.equal(
    functions.length,
    1,
    "Market evidence guard function is missing.",
  );

  const guard =
    String(
      functions[0]
        .definition,
    );

  assert.match(
    guard,
    /checked_at\s*>=\s*fixture_kickoff/i,
  );

  assert.match(
    guard,
    /new\.cutoff_at\s*>=\s*fixture_kickoff/i,
  );

  assert.match(
    guard,
    /new\.cutoff_at\s*>\s*checked_at/i,
  );

  assert.match(
    guard,
    /new\.captured_at\s*:=\s*checked_at/i,
  );

  assert.match(
    guard,
    /json_fixture_id/i,
  );

  assert.match(
    guard,
    /json_version/i,
  );

  assert.match(
    guard,
    /json_cutoff/i,
  );

  assert.match(
    guard,
    /json_kickoff/i,
  );

  console.log(
    "PASS: pre-kickoff chronology guard verified.",
  );

  console.log(
    "PASS: JSON/relational consistency guard verified.",
  );

  console.log(
    "PASS: database-controlled captured_at verified.",
  );

  /*
   * 6. Immutability triggers.
   */
  const triggers =
    await sql`
      SELECT
        trg.tgname
          AS trigger_name,

        pg_get_triggerdef(
          trg.oid,
          true
        ) AS definition

      FROM pg_trigger
        AS trg

      JOIN pg_class
        AS rel
        ON rel.oid =
          trg.tgrelid

      JOIN pg_namespace
        AS n
        ON n.oid =
          rel.relnamespace

      WHERE n.nspname =
        'public'

        AND rel.relname =
          'market_evidence_snapshots'

        AND NOT
          trg.tgisinternal
    `;

  const triggerMap =
    new Map(
      triggers.map(
        (row) => [
          String(
            row.trigger_name,
          ),

          String(
            row.definition,
          ),
        ],
      ),
    );

  assert.ok(
    triggerMap.has(
      "market_evidence_snapshots_guard",
    ),
    "INSERT guard is missing.",
  );

  assert.ok(
    triggerMap.has(
      "market_evidence_snapshots_immutable",
    ),
    "UPDATE/DELETE guard is missing.",
  );

  assert.ok(
    triggerMap.has(
      "market_evidence_snapshots_no_truncate",
    ),
    "TRUNCATE guard is missing.",
  );

  assert.match(
    triggerMap.get(
      "market_evidence_snapshots_guard",
    ) ?? "",
    /BEFORE INSERT/i,
  );

  assert.match(
    triggerMap.get(
      "market_evidence_snapshots_immutable",
    ) ?? "",
    /BEFORE UPDATE OR DELETE|BEFORE DELETE OR UPDATE/i,
  );

  assert.match(
    triggerMap.get(
      "market_evidence_snapshots_no_truncate",
    ) ?? "",
    /BEFORE TRUNCATE/i,
  );

  console.log(
    "PASS: INSERT guard trigger verified.",
  );

  console.log(
    "PASS: UPDATE/DELETE immutability verified.",
  );

  console.log(
    "PASS: TRUNCATE protection verified.",
  );

  console.log("");

  console.log(
    "PASS: immutable market evidence persistence schema verified.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? `Verification failed: ${error.message}`
        : "Market evidence verification failed.",
    );

    process.exitCode =
      1;
  },
);
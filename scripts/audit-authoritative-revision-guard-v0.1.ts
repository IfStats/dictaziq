import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const VERSION =
  "dictaziq-authoritative-revision-guard-audit-v0.1";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

async function main() {
  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Authoritative Revision Guard Audit",
  );

  console.log(
    `Version: ${VERSION}`,
  );

  /*
   * Confirm the trigger is actually installed
   * and enabled.
   */
  const triggerRows =
    await sql`
      SELECT
        trigger.tgname
          AS trigger_name,

        trigger.tgenabled
          AS enabled,

        procedure.proname
          AS function_name

      FROM pg_trigger
        AS trigger

      JOIN pg_proc
        AS procedure
        ON procedure.oid =
          trigger.tgfoid

      JOIN pg_class
        AS relation
        ON relation.oid =
          trigger.tgrelid

      JOIN pg_namespace
        AS namespace
        ON namespace.oid =
          relation.relnamespace

      WHERE namespace.nspname =
        'public'

        AND relation.relname =
          'forecast_revisions'

        AND trigger.tgname =
          'aaa_forecast_revisions_authoritative_guard'

        AND trigger.tgisinternal =
          false
    `;

  assert.equal(
    triggerRows.length,
    1,
    "Authoritative revision trigger is not installed.",
  );

  assert.equal(
    triggerRows[0].enabled,
    "O",
    "Authoritative revision trigger is not enabled.",
  );

  assert.equal(
    triggerRows[0].function_name,
    "dictaziq_guard_authoritative_forecast_revision_v01",
    "Unexpected authoritative revision guard function.",
  );

  console.log(
    "PASS: authoritative revision trigger installed and enabled.",
  );

  /*
   * Every existing real revision should already
   * belong to the currently authoritative route.
   */
  const invalidExisting =
    await sql`
      SELECT
        revision.id,
        revision.fixture_id,
        revision.baseline_prediction_id,

        route.baseline_prediction_id
          AS authoritative_prediction_id,

        route.route

      FROM public.forecast_revisions
        AS revision

      LEFT JOIN public.production_forecast_baselines_v01
        AS route
        ON route.fixture_id =
          revision.fixture_id

      WHERE revision.is_demo =
        false

        AND (
          route.baseline_prediction_id
            IS NULL

          OR

          route.baseline_prediction_id <>
            revision.baseline_prediction_id
        )
    `;

  assert.equal(
    invalidExisting.length,
    0,
    [
      "Existing real revisions are attached to",
      "non-authoritative baselines.",
    ].join(
      " ",
    ),
  );

  console.log(
    "PASS: all existing real revisions belong to authoritative baselines.",
  );

  /*
   * Count the quarantined prior-only Unified
   * publications that the trigger protects from
   * receiving future revisions.
   */
  const quarantineRows =
    await sql`
      SELECT
        COUNT(*)
          AS quarantined

      FROM public.predictions
        AS prediction

      JOIN public.model_versions
        AS model
        ON model.id =
          prediction.model_version_id

      WHERE prediction.is_demo =
        false

        AND prediction.published_at
          IS NOT NULL

        AND model.version =
          'dictaziq-unified-match-analysis-v0.1'

        AND (
          prediction.input_snapshot
            -> 'ratingEvidence'
            ->> 'commonSnapshotDate'
        ) IS NULL

        AND NOT EXISTS (
          SELECT 1

          FROM public.production_forecast_baselines_v01
            AS route

          WHERE route.baseline_prediction_id =
            prediction.id
        )
    `;

  assert.equal(
    quarantineRows.length,
    1,
  );

  const quarantined =
    Number(
      quarantineRows[0].quarantined,
    );

  console.log(
    `Protected quarantined baselines: ${quarantined}`,
  );

  /*
   * Verify exactly one route per fixture remains
   * true after installing the guard.
   */
  const duplicateRoutes =
    await sql`
      SELECT
        fixture_id,
        COUNT(*)
          AS route_count

      FROM public.production_forecast_baselines_v01

      GROUP BY
        fixture_id

      HAVING COUNT(*) >
        1
    `;

  assert.equal(
    duplicateRoutes.length,
    0,
    "Authoritative production route view contains duplicates.",
  );

  console.log(
    "PASS: exactly one authoritative baseline per routed fixture.",
  );

  const routeRows =
    await sql`
      SELECT
        route,
        COUNT(*)
          AS total

      FROM public.production_forecast_baselines_v01

      GROUP BY
        route

      ORDER BY
        route
    `;

  console.log("");
  console.log(
    "Current production routes:",
  );

  for (
    const row
    of routeRows
  ) {
    console.log(
      `- ${row.route}: ${row.total}`,
    );
  }

  console.log("");
  console.log(
    `PASS: ${VERSION}`,
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Authoritative revision guard audit failed: ${error.message}`
        : "Authoritative revision guard audit failed.",
    );

    process.exitCode =
      1;
  },
);
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
  "dictaziq-production-forecast-route-audit-v0.1";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (
          argument,
        ) =>
          !argument.startsWith(
            "--",
          ),
      ) ??
    new Date()
      .toISOString()
      .slice(0, 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  return value;
}

async function main() {
  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const date =
    requestedDate();

  console.log(
    "DictazIQ Production Forecast Route Audit",
  );

  console.log(
    `Version: ${VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  const summaryRows =
    await sql`
      SELECT
        (
          SELECT
            COUNT(*)

          FROM public.predictions
            AS prediction

          JOIN public.fixtures
            AS fixture
            ON fixture.id =
              prediction.fixture_id

          WHERE prediction.is_demo =
            false

            AND prediction.published_at
              IS NOT NULL

            AND (
              fixture.kickoff_at
              AT TIME ZONE 'UTC'
            )::date =
              ${date}::date
        )
          AS published_prediction_records,

        (
          SELECT
            COUNT(*)

          FROM public.production_forecast_baselines_v01
            AS route

          JOIN public.fixtures
            AS fixture
            ON fixture.id =
              route.fixture_id

          WHERE (
            fixture.kickoff_at
            AT TIME ZONE 'UTC'
          )::date =
            ${date}::date
        )
          AS routed_fixtures,

        (
          SELECT
            COUNT(*)

          FROM public.production_forecast_baselines_v01
            AS route

          JOIN public.fixtures
            AS fixture
            ON fixture.id =
              route.fixture_id

          WHERE (
            fixture.kickoff_at
            AT TIME ZONE 'UTC'
          )::date =
            ${date}::date

            AND route.route =
              'mathematical'
        )
          AS mathematical_routes,

        (
          SELECT
            COUNT(*)

          FROM public.production_forecast_baselines_v01
            AS route

          JOIN public.fixtures
            AS fixture
            ON fixture.id =
              route.fixture_id

          WHERE (
            fixture.kickoff_at
            AT TIME ZONE 'UTC'
          )::date =
            ${date}::date

            AND route.route =
              'gpt_research'
        )
          AS gpt_routes,

        (
          SELECT
            COUNT(*)

          FROM public.predictions
            AS prediction

          JOIN public.model_versions
            AS model
            ON model.id =
              prediction.model_version_id

          JOIN public.fixtures
            AS fixture
            ON fixture.id =
              prediction.fixture_id

          WHERE prediction.is_demo =
            false

            AND prediction.published_at
              IS NOT NULL

            AND model.version =
              'dictaziq-unified-match-analysis-v0.1'

            AND (
              fixture.kickoff_at
              AT TIME ZONE 'UTC'
            )::date =
              ${date}::date

            AND (
              prediction.input_snapshot
                -> 'ratingEvidence'
                ->> 'commonSnapshotDate'
            ) IS NULL
        )
          AS historical_prior_only_unified
    `;

  assert.equal(
    summaryRows.length,
    1,
  );

  const summary =
    summaryRows[0];

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "ROUTING SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Published prediction records: ${summary.published_prediction_records}`,
  );

  console.log(
    `Authoritative routed fixtures: ${summary.routed_fixtures}`,
  );

  console.log(
    `Mathematical routes: ${summary.mathematical_routes}`,
  );

  console.log(
    `GPT research routes: ${summary.gpt_routes}`,
  );

  console.log(
    `Historical prior-only Unified records: ${summary.historical_prior_only_unified}`,
  );

  /*
   * The view contract is exactly one active
   * production baseline per fixture.
   */
  const duplicateRows =
    await sql`
      SELECT
        fixture_id,
        COUNT(*) AS route_count

      FROM public.production_forecast_baselines_v01

      GROUP BY
        fixture_id

      HAVING COUNT(*) >
        1
    `;

  assert.equal(
    duplicateRows.length,
    0,
    "Production route view contains duplicate active baselines.",
  );

  console.log("");
  console.log(
    "PASS: exactly one authoritative route per routed fixture.",
  );

  const routes =
    await sql`
      SELECT
        route.fixture_id,
        route.baseline_prediction_id,
        route.route,
        route.route_reason,
        route.model_version,
        route.published_at,

        home.name
          AS home_team,

        away.name
          AS away_team,

        fixture.kickoff_at

      FROM public.production_forecast_baselines_v01
        AS route

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          route.fixture_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away
        ON away.id =
          fixture.away_team_id

      WHERE (
        fixture.kickoff_at
        AT TIME ZONE 'UTC'
      )::date =
        ${date}::date

      ORDER BY
        fixture.kickoff_at,
        home.name,
        away.name
    `;

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "AUTHORITATIVE ROUTES",
  );

  console.log(
    "========================================",
  );

  for (
    const row
    of routes
  ) {
    console.log(
      [
        `${row.home_team} vs ${row.away_team}`,
        `route=${row.route}`,
        `model=${row.model_version}`,
      ].join(
        " | ",
      ),
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
        ? `Production route audit failed: ${error.message}`
        : "Production route audit failed.",
    );

    process.exitCode =
      1;
  },
);
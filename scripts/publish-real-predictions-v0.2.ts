import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const MODEL_VERSION =
  "dictaziq-prematch-markets-v0.2";

const FIXTURE_SOURCE =
  "api-football";

function requestedDate():
  string {
  const value =
    process.argv[2]?.trim() ??
    "2026-09-09";

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

function timestampDate(
  value: unknown,
): Date {
  const result =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(
            value,
          ),
        );

  assert.ok(
    Number.isFinite(
      result.getTime(),
    ),
    "Invalid timestamp.",
  );

  return result;
}

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * One canonical latest v0.2 prediction per fixture.
   *
   * If later we generate a newer pre-kickoff prediction,
   * it becomes a separate immutable prediction.
   */
  const predictions =
    await sql`
      SELECT DISTINCT ON (
        prediction.fixture_id
      )
        prediction.id,
        prediction.fixture_id,
        prediction.generated_at,
        prediction.published_at,
        prediction.output,

        model.version
          AS model_version,

        fixture.slug,
        fixture.provider,
        fixture.provider_id,
        fixture.kickoff_at,
        fixture.status,

        home.name
          AS home_team_name,

        away_team.name
          AS away_team_name,

        clock_timestamp()
          AS checked_at

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

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      WHERE model.version =
        ${MODEL_VERSION}

        AND prediction.is_demo =
          false

        AND fixture.is_demo =
          false

        AND fixture.provider =
          ${FIXTURE_SOURCE}

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        prediction.fixture_id,
        prediction.generated_at DESC
    `;

  assert.ok(
    predictions.length > 0,
    `No ${MODEL_VERSION} predictions found for ${date}.`,
  );

  console.log(
    `Latest v0.2 predictions: ${predictions.length}`,
  );

  let published =
    0;

  let existing =
    0;

  for (
    const prediction
    of predictions
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${prediction.home_team_name} vs ${prediction.away_team_name}`,
    );

    console.log(
      `Prediction: ${prediction.id}`,
    );

    assert.equal(
      prediction.model_version,
      MODEL_VERSION,
      "Unexpected model version.",
    );

    assert.equal(
      prediction.status,
      "scheduled",
      "Only scheduled fixtures may publish pre-match predictions.",
    );

    const kickoff =
      timestampDate(
        prediction.kickoff_at,
      );

    const checkedAt =
      timestampDate(
        prediction.checked_at,
      );

    const generatedAt =
      timestampDate(
        prediction.generated_at,
      );

    assert.ok(
      generatedAt.getTime() <
        kickoff.getTime(),
      "Prediction was not generated before kickoff.",
    );

    assert.ok(
      checkedAt.getTime() <
        kickoff.getTime(),
      `Kickoff has passed for ${prediction.slug}.`,
    );

    if (
      prediction.published_at !==
      null
    ) {
      const publishedAt =
        timestampDate(
          prediction.published_at,
        );

      assert.ok(
        publishedAt.getTime() >=
          generatedAt.getTime(),
        "Stored publication precedes generation.",
      );

      assert.ok(
        publishedAt.getTime() <
          kickoff.getTime(),
        "Stored publication is not pre-kickoff.",
      );

      console.log(
        `ALREADY PUBLISHED | ${publishedAt.toISOString()}`,
      );

      existing +=
        1;

      continue;
    }

    /*
     * Database predictions_guard independently:
     *
     * - checks fixture is still scheduled
     * - checks kickoff has not occurred
     * - allows only the first publication
     * - rejects changes to every other field
     * - replaces caller timestamp with DB clock
     */
    const rows =
      await sql`
        UPDATE public.predictions

        SET published_at =
          clock_timestamp()

        WHERE id =
          ${String(
            prediction.id,
          )}::uuid

          AND published_at
            IS NULL

        RETURNING
          id,
          generated_at,
          published_at
      `;

    assert.equal(
      rows.length,
      1,
      "Prediction publication failed or prediction was concurrently published.",
    );

    const saved =
      rows[0];

    const publishedAt =
      timestampDate(
        saved.published_at,
      );

    assert.ok(
      publishedAt.getTime() >=
        generatedAt.getTime(),
      "Publication precedes generation.",
    );

    assert.ok(
      publishedAt.getTime() <
        kickoff.getTime(),
      "Publication reached or passed kickoff.",
    );

    console.log(
      `PUBLISHED | ${publishedAt.toISOString()}`,
    );

    published +=
      1;
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Published now: ${published}`,
  );

  console.log(
    `Already published: ${existing}`,
  );

  console.log(
    `Total performance-baseline predictions: ${predictions.length}`,
  );

  console.log("");
  console.log(
    "DictazIQ Prediction Core v1 baseline is now locked for post-match evaluation.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Publication verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Publication failed: ${error.message}`
          : "Publication failed.",
      );
    }

    process.exitCode =
      1;
  },
);
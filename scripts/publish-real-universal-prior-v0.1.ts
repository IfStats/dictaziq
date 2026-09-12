import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

const VERSION =
  "dictaziq-universal-prior-publisher-v0.1";

const MODEL_VERSION =
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01;

const FIXTURE_SOURCE =
  "api-football";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type JsonObject =
  Record<string, unknown>;

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (argument) =>
          !argument.startsWith(
            "--",
          ),
      ) ??
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  const parsed =
    new Date(
      `${value}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(
        0,
        10,
      ) !==
      value
  ) {
    throw new Error(
      "Invalid date.",
    );
  }

  return value;
}

function publishRequested():
  boolean {
  return process.argv.includes(
    "--publish",
  );
}

function requestedLimit():
  number |
  null {
  const argument =
    process.argv.find(
      (value) =>
        value.startsWith(
          "--limit=",
        ),
    );

  if (
    !argument
  ) {
    return null;
  }

  const value =
    Number(
      argument.slice(
        "--limit=".length,
      ),
    );

  if (
    !Number.isInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      "--limit must be a positive integer.",
    );
  }

  return value;
}

function timestamp(
  value: unknown,
  label: string,
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
    `${label} is invalid.`,
  );

  return result;
}

function objectValue(
  value: unknown,
  label: string,
): JsonObject {
  assert.ok(
    typeof value ===
      "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      ),
    `${label} must be an object.`,
  );

  return value as
    JsonObject;
}

function text(
  value: unknown,
  label: string,
): string {
  assert.ok(
    typeof value ===
      "string" &&
      value.trim().length >
        0,
    `${label} must be a non-empty string.`,
  );

  return value.trim();
}

async function databaseNow(
  sql: SqlClient,
): Promise<Date> {
  const rows =
    await sql`
      SELECT
        clock_timestamp()
          AS now
    `;

  assert.equal(
    rows.length,
    1,
    "Unable to read database clock.",
  );

  return timestamp(
    rows[0].now,
    "Database clock",
  );
}

async function main() {
  const date =
    requestedDate();

  const publish =
    publishRequested();

  const limit =
    requestedLimit();

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  
    await databaseNow(
      sql,
    );

  console.log(
    "DictazIQ Universal Prior Publication",
  );

  console.log(
    `Version: ${VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Model: ${MODEL_VERSION}`,
  );

  console.log(
    `Mode: ${publish ? "PUBLISH" : "DRY RUN"}`,
  );

  console.log(
    `Limit: ${limit ?? "NONE"}`,
  );

  console.log(
    "API-Football calls: 0",
  );

  console.log(
    "OpenAI API calls: 0",
  );

  const rows =
    await sql`
      SELECT DISTINCT ON (
        prediction.fixture_id
      )
        prediction.id,
        prediction.fixture_id,

        prediction.kickoff_at_generation,
        prediction.input_cutoff_at,
        prediction.generated_at,
        prediction.published_at,

        prediction.input_snapshot,
        prediction.output,

        fixture.kickoff_at,
        fixture.status,

        home.name
          AS home_team_name,

        away.name
          AS away_team_name

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
        AS away
        ON away.id =
          fixture.away_team_id

      WHERE
        prediction.is_demo =
          false

        AND fixture.is_demo =
          false

        AND fixture.provider =
          ${FIXTURE_SOURCE}

        AND model.version =
          ${MODEL_VERSION}

        AND (
          prediction.kickoff_at_generation
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        prediction.fixture_id,
        prediction.generated_at DESC
    `;

  console.log(
    `Unified forecasts inspected: ${rows.length}`,
  );

  let priorCandidates =
    0;

  let ready =
    0;

  let publishedNow =
    0;

  let alreadyPublished =
    0;

  let timingSkipped =
    0;

  let nonPriorSkipped =
    0;

  let qualitySkipped =
    0;  

  for (
    const row
    of rows
  ) {
    const inputSnapshot =
      objectValue(
        row.input_snapshot,
        "Input snapshot",
      );

    const output =
      objectValue(
        row.output,
        "Prediction output",
      );

    if (
      output.coverage !==
      "prior_result_only"
    ) {
      nonPriorSkipped +=
        1;

      continue;
    }

    const ratingEvidence =
      objectValue(
        inputSnapshot.ratingEvidence,
        "Rating evidence",
      );

    const commonSnapshotDate =
      ratingEvidence
        .commonSnapshotDate;

    if (
      typeof commonSnapshotDate ===
        "string" &&
      commonSnapshotDate
        .trim()
        .length >
        0
    ) {
      nonPriorSkipped +=
        1;

      continue;
    }

    priorCandidates +=
      1;

    assert.equal(
      output.modelVersion,
      MODEL_VERSION,
      "Unexpected Unified model version.",
    );

    assert.equal(
      output.coverage,
      "prior_result_only",
      "Universal Prior route requires prior_result_only coverage.",
    );

    assert.equal(
      output.ratingGap,
      null,
      "Universal Prior route cannot contain a rating gap.",
    );

    assert.equal(
      output.absoluteRatingGap,
      null,
      "Universal Prior route cannot contain an absolute rating gap.",
    );

    assert.equal(
      output.calibratedProbability,
      null,
      "Universal Prior route cannot contain a fabricated calibrated probability.",
    );

    assert.equal(
      output.recommendationStatus,
      "not_evaluated",
      "Universal Prior forecast must not masquerade as a recommendation.",
    );

    const forecast =
      text(
        output.forecast,
        "Forecast",
      );

    assert.ok(
      forecast ===
        "home" ||
        forecast ===
          "draw" ||
        forecast ===
          "away",
      "Universal Prior forecast must be home, draw or away.",
    );

        const confidence =
      text(
        output.confidence,
        "Confidence",
      );

    const evidenceGrade =
      text(
        output.evidenceGrade,
        "Evidence grade",
      );

    /*
     * A universal prior is a last-resort route.
     *
     * Very-low / grade-E prior-only forecasts do
     * not contain enough evidence to become an
     * authoritative production baseline.
     */
    if (
      confidence ===
        "very_low" ||
      evidenceGrade ===
        "E"
    ) {
      qualitySkipped +=
        1;

      continue;
    }

    const frozenKickoff =
      timestamp(
        row.kickoff_at_generation,
        "Frozen kickoff",
      );

    const currentKickoff =
      timestamp(
        row.kickoff_at,
        "Current kickoff",
      );

    const inputCutoff =
      timestamp(
        row.input_cutoff_at,
        "Input cutoff",
      );

    const generatedAt =
      timestamp(
        row.generated_at,
        "Generated time",
      );

    const checkedAt =
      await databaseNow(
        sql,
      );

    if (
      inputCutoff.getTime() >
      generatedAt.getTime()
    ) {
      throw new Error(
        "Input cutoff occurs after generation.",
      );
    }

    if (
      generatedAt.getTime() >=
      frozenKickoff.getTime()
    ) {
      throw new Error(
        "Prior forecast was not generated before kickoff.",
      );
    }

    if (
      frozenKickoff.getTime() !==
      currentKickoff.getTime()
    ) {
      timingSkipped +=
        1;

      continue;
    }

    if (
      String(
        row.status,
      ) !==
      "scheduled"
    ) {
      timingSkipped +=
        1;

      continue;
    }

    if (
      checkedAt.getTime() >=
      currentKickoff.getTime()
    ) {
      timingSkipped +=
        1;

      continue;
    }

    if (
      row.published_at !==
      null
    ) {
      alreadyPublished +=
        1;

      continue;
    }

    if (
      limit !==
        null &&
      ready >=
        limit
    ) {
      continue;
    }

    ready +=
      1;

    console.log("");
    console.log(
      `${row.home_team_name} vs ${row.away_team_name}`,
    );

    console.log(
      `Forecast: ${forecast.toUpperCase()}`,
    );

    console.log(
      `Confidence: ${String(
        output.confidence,
      )}`,
    );

    console.log(
      `Evidence grade: ${String(
        output.evidenceGrade,
      )}`,
    );

    console.log(
      "Coverage: PRIOR RESULT ONLY",
    );

    if (
      !publish
    ) {
      console.log(
        "DRY RUN: not published.",
      );

      continue;
    }

    const publication =
      await sql`
        UPDATE public.predictions

        SET published_at =
          clock_timestamp()

        WHERE id =
          ${String(
            row.id,
          )}::uuid

          AND published_at
            IS NULL

        RETURNING
          published_at
      `;

    assert.equal(
      publication.length,
      1,
      "Universal Prior publication failed.",
    );

    publishedNow +=
      1;

    console.log(
      `Published: ${timestamp(
        publication[0]
          .published_at,
        "Publication",
      ).toISOString()}`,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "UNIVERSAL PRIOR SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Unified forecasts inspected: ${rows.length}`,
  );

  console.log(
    `Prior-only candidates: ${priorCandidates}`,
  );

  console.log(
    `Ready: ${ready}`,
  );

  console.log(
    `Published now: ${publishedNow}`,
  );

  console.log(
    `Already published: ${alreadyPublished}`,
  );

  console.log(
    `Timing/status skipped: ${timingSkipped}`,
  );

  console.log(
    `Non-prior skipped: ${nonPriorSkipped}`,
  );

    console.log(
    `Quality-gate skipped: ${qualitySkipped}`,
  );

  console.log(
    "API-Football calls consumed: 0",
  );

  console.log(
    "OpenAI API calls consumed: 0",
  );

  if (
    !publish
  ) {
    console.log(
      "DRY RUN COMPLETE: database publication state was not changed.",
    );
  }
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Universal Prior publication failed: ${error.message}`
        : "Universal Prior publication failed.",
    );

    process.exitCode =
      1;
  },
);
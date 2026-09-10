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
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

import {
  explainUnifiedForecastV01,
} from "../src/lib/predictions/unified-forecast-explainer-adapter-v0.1";

const PUBLISHER_VERSION =
  "dictaziq-unified-math-only-publisher-v0.2";

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

type RatingEvidence = {
  commonSnapshotDate:
    string;

  home:
    JsonObject[];

  away:
    JsonObject[];
};

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
      "Invalid publication date.",
    );
  }

  return value;
}

function publicationRequested():
  boolean {
  return process.argv.includes(
    "--publish",
  );
}

function timestampDate(
  value:
    unknown,

  label =
    "Timestamp",
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
  value:
    unknown,

  label:
    string,
): JsonObject {
  assert.ok(
    typeof value ===
      "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      ),
    `${label} must be a JSON object.`,
  );

  return value as
    JsonObject;
}

function nonEmptyString(
  value:
    unknown,

  label:
    string,
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

function prettyToken(
  value:
    string,
): string {
  return value
    .replace(
      /_/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (
        character,
      ) =>
        character.toUpperCase(),
    );
}

function extractRatingEvidence(
  inputSnapshot:
    JsonObject,
):
  RatingEvidence |
  null {
  const raw =
    inputSnapshot.ratingEvidence;

  if (
    typeof raw !==
      "object" ||
    raw ===
      null ||
    Array.isArray(
      raw,
    )
  ) {
    return null;
  }

  const evidence =
    raw as JsonObject;

  if (
    typeof evidence.commonSnapshotDate !==
      "string" ||
    evidence.commonSnapshotDate.trim().length ===
      0
  ) {
    return null;
  }

  if (
    !Array.isArray(
      evidence.home,
    ) ||
    evidence.home.length ===
      0 ||
    !Array.isArray(
      evidence.away,
    ) ||
    evidence.away.length ===
      0
  ) {
    return null;
  }

  const home =
    evidence.home.map(
      (
        item,
        index,
      ) =>
        objectValue(
          item,
          `Home rating snapshot ${index + 1}`,
        ),
    );

  const away =
    evidence.away.map(
      (
        item,
        index,
      ) =>
        objectValue(
          item,
          `Away rating snapshot ${index + 1}`,
        ),
    );

  const commonSnapshotDate =
    evidence.commonSnapshotDate.trim();

  const currentHome =
    home[
      home.length - 1
    ];

  const currentAway =
    away[
      away.length - 1
    ];

  assert.equal(
    String(
      currentHome.snapshotDate,
    ),
    commonSnapshotDate,
    "Home rating history does not end at the common rating snapshot date.",
  );

  assert.equal(
    String(
      currentAway.snapshotDate,
    ),
    commonSnapshotDate,
    "Away rating history does not end at the common rating snapshot date.",
  );

  assert.ok(
    Number.isFinite(
      Number(
        currentHome.rating,
      ),
    ),
    "Current home rating is invalid.",
  );

  assert.ok(
    Number.isFinite(
      Number(
        currentAway.rating,
      ),
    ),
    "Current away rating is invalid.",
  );

  return {
    commonSnapshotDate,
    home,
    away,
  };
}

async function main() {
  const date =
    requestedDate();

  const publish =
    publicationRequested();

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Unified Mathematical Publication",
  );

  console.log(
    `Publisher: ${PUBLISHER_VERSION}`,
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

  /*
   * Inspect the latest immutable Unified
   * generation for each real API-Football
   * fixture on the requested date.
   *
   * We deliberately inspect prior-only drafts
   * as well so the publisher can report that
   * they were excluded by routing policy.
   */
  const predictions =
    await sql`
      SELECT DISTINCT ON (
        prediction.fixture_id
      )
        prediction.id,
        prediction.fixture_id,
        prediction.model_version_id,

        prediction.kickoff_at_generation,
        prediction.input_cutoff_at,
        prediction.generated_at,
        prediction.published_at,

        prediction.input_sha256,
        prediction.input_snapshot,
        prediction.output,

        model.version
          AS model_version,

        model.code_sha256
          AS model_code_sha256,

        fixture.slug,
        fixture.provider,
        fixture.provider_id,
        fixture.kickoff_at,
        fixture.status,

        home.name
          AS home_team_name,

        away.name
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
        AS away
        ON away.id =
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
          prediction.kickoff_at_generation
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        prediction.fixture_id,
        prediction.generated_at DESC
    `;

  if (
    predictions.length ===
      0
  ) {
    console.log(
      "No Unified forecasts found for the requested date.",
    );

    return;
  }

  console.log(
    `Unified forecasts inspected: ${predictions.length}`,
  );

  let mathematicalCandidates =
    0;

  let priorOnlyExcluded =
    0;

  let ready =
    0;

  let publishedNow =
    0;

  let alreadyPublished =
    0;

  let routeLocked =
    0;

  let existingModelBaseline =
    0;

  let timingSkipped =
    0;

  for (
    const prediction
    of predictions
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    const homeTeamName =
      nonEmptyString(
        prediction.home_team_name,
        "Home team name",
      );

    const awayTeamName =
      nonEmptyString(
        prediction.away_team_name,
        "Away team name",
      );

    console.log(
      `${homeTeamName} vs ${awayTeamName}`,
    );

    /*
     * MODEL IDENTITY
     */
    assert.equal(
      String(
        prediction.model_version,
      ),
      MODEL_VERSION,
      "Unexpected model version.",
    );

    const inputSnapshot =
      objectValue(
        prediction.input_snapshot,
        "Prediction input snapshot",
      );

    const output =
      objectValue(
        prediction.output,
        "Prediction output",
      );

    const modelSnapshot =
      objectValue(
        inputSnapshot.model,
        "Input model identity",
      );

    assert.equal(
      String(
        modelSnapshot.version,
      ),
      MODEL_VERSION,
      "Input snapshot model version does not match registered model.",
    );

    assert.equal(
      String(
        modelSnapshot.codeSha256,
      ),
      String(
        prediction.model_code_sha256,
      ),
      "Input model fingerprint does not match registered model.",
    );

    /*
     * IMMUTABLE INPUT HASH
     */
    assert.equal(
      canonicalSha256(
        inputSnapshot,
      ),
      String(
        prediction.input_sha256,
      ),
      "Stored Unified prediction input hash failed verification.",
    );

    /*
     * GENERATION-TIME OUTPUT CONTRACT
     */
    assert.equal(
      String(
        output.modelVersion,
      ),
      MODEL_VERSION,
      "Prediction output belongs to a different model version.",
    );

    assert.equal(
      output.calibratedProbability,
      null,
      "Unified v0.1 cannot contain a fabricated calibrated probability.",
    );

    assert.equal(
      output.recommendationStatus,
      "not_evaluated",
      "Unified forecast must remain independent of recommendation logic.",
    );

    assert.equal(
      output.publicationStatus,
      "draft",
      "Immutable model output must retain generation-time publication state.",
    );

    /*
     * MATHEMATICAL ROUTING GATE
     *
     * This is the critical v0.2 change.
     *
     * Unified output is a production mathematical
     * baseline only when BOTH teams have a current
     * rating from the same FootballDatabase
     * snapshot date.
     */
    const ratingEvidence =
      extractRatingEvidence(
        inputSnapshot,
      );

    if (
      ratingEvidence ===
        null
    ) {
      priorOnlyExcluded +=
        1;

      console.log(
        "Route: EXCLUDED",
      );

      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        "Reason: no valid common FootballDatabase rating pair.",
      );

      if (
        prediction.published_at !==
          null
      ) {
        console.log(
          "Audit note: this prior-only Unified record was published historically and remains immutable, but is excluded from authoritative production routing.",
        );
      }

      continue;
    }

    mathematicalCandidates +=
      1;

    console.log(
      "Route: MATHEMATICAL",
    );

    console.log(
      `Rating snapshot: ${ratingEvidence.commonSnapshotDate}`,
    );

    /*
     * TIMING INTEGRITY
     */
    const frozenKickoff =
      timestampDate(
        prediction.kickoff_at_generation,
        "Frozen kickoff",
      );

    const currentKickoff =
      timestampDate(
        prediction.kickoff_at,
        "Current kickoff",
      );

    const inputCutoff =
      timestampDate(
        prediction.input_cutoff_at,
        "Input cutoff",
      );

    const generatedAt =
      timestampDate(
        prediction.generated_at,
        "Generated time",
      );

    const checkedAt =
      timestampDate(
        prediction.checked_at,
        "Database check time",
      );

    assert.ok(
      inputCutoff.getTime() <=
        generatedAt.getTime(),
      "Input cutoff occurs after generation.",
    );

    assert.ok(
      generatedAt.getTime() <
        frozenKickoff.getTime(),
      "Prediction was not generated before kickoff.",
    );

    if (
      currentKickoff.getTime() !==
        frozenKickoff.getTime()
    ) {
      timingSkipped +=
        1;

      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        "Reason: fixture kickoff changed after forecast generation.",
      );

      continue;
    }

    if (
      String(
        prediction.status,
      ) !==
      "scheduled"
    ) {
      timingSkipped +=
        1;

      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        `Reason: fixture status is ${prediction.status}.`,
      );

      continue;
    }

    if (
      checkedAt.getTime() >=
        currentKickoff.getTime()
    ) {
      timingSkipped +=
        1;

      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        "Reason: kickoff has been reached or passed.",
      );

      continue;
    }

    /*
     * PUBLIC-SAFE EXPLANATION
     *
     * No raw rating or rating difference is
     * printed by the publisher.
     */
    const explained =
      explainUnifiedForecastV01({
        homeTeamName,
        awayTeamName,
        unifiedOutput:
          output,
      });

    const explanation =
      explained.explanation;

    console.log("");
    console.log(
      `Forecast: ${explanation.forecastLabel}`,
    );

    console.log(
      `Confidence: ${prettyToken(
        explanation.confidence,
      )}`,
    );

    console.log(
      `Profile: ${prettyToken(
        explanation.profile,
      )}`,
    );

    console.log("");
    console.log(
      "Explanation:",
    );

    console.log(
      explanation.summary,
    );

    for (
      const reason
      of explanation.reasons
    ) {
      console.log(
        `- ${reason}`,
      );
    }

    console.log(
      explanation.evidenceNote,
    );

    /*
     * THIS EXACT MATHEMATICAL FORECAST IS
     * ALREADY PUBLISHED
     */
    if (
      prediction.published_at !==
        null
    ) {
      const publishedAt =
        timestampDate(
          prediction.published_at,
          "Published time",
        );

      assert.ok(
        publishedAt.getTime() >=
          generatedAt.getTime(),
        "Stored publication precedes generation.",
      );

      assert.ok(
        publishedAt.getTime() <
          frozenKickoff.getTime(),
        "Stored publication was not pre-kickoff.",
      );

      alreadyPublished +=
        1;

      console.log(
        "Status: ALREADY PUBLISHED",
      );

      console.log(
        `Published: ${publishedAt.toISOString()}`,
      );

      continue;
    }

    /*
     * ROUTE LOCK
     *
     * Once another authoritative baseline has
     * been published for the fixture, do not
     * create a second production baseline.
     *
     * This matters if GPT fallback was published
     * before a later rating import became
     * available.
     */
    const routeRows =
      await sql`
        SELECT
          baseline_prediction_id,
          route,
          model_version,
          published_at

        FROM public.production_forecast_baselines_v01

        WHERE fixture_id =
          ${String(
            prediction.fixture_id,
          )}::uuid

          AND baseline_prediction_id <>
            ${String(
              prediction.id,
            )}::uuid

        LIMIT 1
      `;

    if (
      routeRows.length >
        0
    ) {
      routeLocked +=
        1;

      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        [
          "Reason: fixture already has an authoritative production baseline.",
          `route=${routeRows[0].route}`,
          `model=${routeRows[0].model_version}`,
        ].join(
          " ",
        ),
      );

      continue;
    }

    /*
     * ONE PUBLISHED UNIFIED BASELINE PER
     * FIXTURE/MODEL VERSION.
     */
    const existingBaselines =
      await sql`
        SELECT
          id,
          published_at

        FROM public.predictions

        WHERE fixture_id =
          ${String(
            prediction.fixture_id,
          )}::uuid

          AND model_version_id =
            ${String(
              prediction.model_version_id,
            )}::uuid

          AND is_demo =
            false

          AND published_at
            IS NOT NULL

          AND id <>
            ${String(
              prediction.id,
            )}::uuid

        ORDER BY
          published_at

        LIMIT 1
      `;

    if (
      existingBaselines.length >
        0
    ) {
      existingModelBaseline +=
        1;

      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        "Reason: a Unified baseline for this fixture/model is already published.",
      );

      continue;
    }

    ready +=
      1;

    if (
      !publish
    ) {
      console.log(
        "Status: READY FOR MATHEMATICAL PUBLICATION",
      );

      continue;
    }

    /*
     * FINAL DATABASE-CLOCK CHECK
     */
    const timingRows =
      await sql`
        SELECT
          clock_timestamp()
            AS now,

          kickoff_at,
          status

        FROM public.fixtures

        WHERE id =
          ${String(
            prediction.fixture_id,
          )}::uuid

        LIMIT 1
      `;

    assert.equal(
      timingRows.length,
      1,
      "Fixture disappeared before publication.",
    );

    const databaseNow =
      timestampDate(
        timingRows[0].now,
        "Database publication time",
      );

    const latestKickoff =
      timestampDate(
        timingRows[0].kickoff_at,
        "Latest kickoff",
      );

    if (
      String(
        timingRows[0].status,
      ) !==
      "scheduled"
    ) {
      timingSkipped +=
        1;

      console.log(
        "Status: NOT PUBLISHED",
      );

      console.log(
        "Reason: fixture status changed before publication.",
      );

      continue;
    }

    if (
      latestKickoff.getTime() !==
        frozenKickoff.getTime()
    ) {
      timingSkipped +=
        1;

      console.log(
        "Status: NOT PUBLISHED",
      );

      console.log(
        "Reason: kickoff changed before publication.",
      );

      continue;
    }

    if (
      databaseNow.getTime() >=
        latestKickoff.getTime()
    ) {
      timingSkipped +=
        1;

      console.log(
        "Status: NOT PUBLISHED",
      );

      console.log(
        "Reason: kickoff reached before publication.",
      );

      continue;
    }

    /*
     * Recheck route immediately before UPDATE.
     */
    const latestRouteRows =
      await sql`
        SELECT
          baseline_prediction_id,
          route,
          model_version

        FROM public.production_forecast_baselines_v01

        WHERE fixture_id =
          ${String(
            prediction.fixture_id,
          )}::uuid

          AND baseline_prediction_id <>
            ${String(
              prediction.id,
            )}::uuid

        LIMIT 1
      `;

    if (
      latestRouteRows.length >
        0
    ) {
      routeLocked +=
        1;

      console.log(
        "Status: NOT PUBLISHED",
      );

      console.log(
        "Reason: another authoritative baseline appeared before publication.",
      );

      continue;
    }

    /*
     * ATOMIC PUBLICATION
     *
     * Only published_at changes.
     *
     * The immutable model input/output remains
     * untouched.
     */
    const rows =
      await sql`
        UPDATE public.predictions
          AS target

        SET published_at =
          clock_timestamp()

        WHERE target.id =
          ${String(
            prediction.id,
          )}::uuid

          AND target.published_at
            IS NULL

          /*
           * Defensive math-route gate repeated
           * inside the write statement.
           */
          AND (
            target.input_snapshot
              -> 'ratingEvidence'
              ->> 'commonSnapshotDate'
          ) IS NOT NULL

          AND jsonb_typeof(
            target.input_snapshot
              -> 'ratingEvidence'
              -> 'home'
          ) = 'array'

          AND jsonb_array_length(
            target.input_snapshot
              -> 'ratingEvidence'
              -> 'home'
          ) > 0

          AND jsonb_typeof(
            target.input_snapshot
              -> 'ratingEvidence'
              -> 'away'
          ) = 'array'

          AND jsonb_array_length(
            target.input_snapshot
              -> 'ratingEvidence'
              -> 'away'
          ) > 0

          AND NOT EXISTS (
            SELECT 1

            FROM public.predictions
              AS existing

            WHERE existing.fixture_id =
              target.fixture_id

              AND existing.model_version_id =
                target.model_version_id

              AND existing.is_demo =
                false

              AND existing.published_at
                IS NOT NULL

              AND existing.id <>
                target.id
          )

          AND NOT EXISTS (
            SELECT 1

            FROM public.production_forecast_baselines_v01
              AS route

            WHERE route.fixture_id =
              target.fixture_id

              AND route.baseline_prediction_id <>
                target.id
          )

        RETURNING
          id,
          generated_at,
          published_at
      `;

    if (
      rows.length ===
        0
    ) {
      const baselineRows =
        await sql`
          SELECT
            baseline_prediction_id,
            route,
            model_version,
            published_at

          FROM public.production_forecast_baselines_v01

          WHERE fixture_id =
            ${String(
              prediction.fixture_id,
            )}::uuid

          LIMIT 1
        `;

      if (
        baselineRows.length >
          0
      ) {
        routeLocked +=
          1;

        console.log(
          "Status: NOT PUBLISHED",
        );

        console.log(
          [
            "Reason: authoritative route was already locked.",
            `route=${baselineRows[0].route}`,
            `model=${baselineRows[0].model_version}`,
          ].join(
            " ",
          ),
        );

        continue;
      }

      throw new Error(
        `Publication produced no update for ${homeTeamName} vs ${awayTeamName}, and no authoritative baseline exists.`,
      );
    }

    assert.equal(
      rows.length,
      1,
      "Unexpected publication update count.",
    );

    const publishedAt =
      timestampDate(
        rows[0].published_at,
        "Published time",
      );

    assert.ok(
      publishedAt.getTime() >=
        generatedAt.getTime(),
      "Publication precedes generation.",
    );

    assert.ok(
      publishedAt.getTime() <
        frozenKickoff.getTime(),
      "Publication reached or passed kickoff.",
    );

    /*
     * Verify that this newly published record
     * became the authoritative route.
     */
    const authoritativeRows =
      await sql`
        SELECT
          baseline_prediction_id,
          route,
          model_version

        FROM public.production_forecast_baselines_v01

        WHERE fixture_id =
          ${String(
            prediction.fixture_id,
          )}::uuid

        LIMIT 1
      `;

    assert.equal(
      authoritativeRows.length,
      1,
      "Published mathematical baseline did not resolve to an authoritative route.",
    );

    assert.equal(
      String(
        authoritativeRows[0]
          .baseline_prediction_id,
      ),
      String(
        prediction.id,
      ),
      "Newly published mathematical baseline is not authoritative.",
    );

    assert.equal(
      String(
        authoritativeRows[0].route,
      ),
      "mathematical",
      "Newly published Unified baseline did not resolve as mathematical.",
    );

    console.log(
      "Status: PUBLISHED",
    );

    console.log(
      `Published: ${publishedAt.toISOString()}`,
    );

    publishedNow +=
      1;
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "UNIFIED MATHEMATICAL PUBLICATION SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Unified forecasts inspected: ${predictions.length}`,
  );

  console.log(
    `Mathematical candidates: ${mathematicalCandidates}`,
  );

  console.log(
    `Prior-only excluded: ${priorOnlyExcluded}`,
  );

  console.log(
    `Ready: ${ready}`,
  );

  console.log(
    `Published now: ${publishedNow}`,
  );

  console.log(
    `Already published mathematical: ${alreadyPublished}`,
  );

  console.log(
    `Authoritative route locked: ${routeLocked}`,
  );

  console.log(
    `Existing Unified model baseline: ${existingModelBaseline}`,
  );

  console.log(
    `Timing/status skipped: ${timingSkipped}`,
  );

  if (
    !publish
  ) {
    console.log(
      "DRY RUN COMPLETE: publication state was not modified.",
    );
  } else {
    console.log(
      "Mathematical-only Unified publication complete.",
    );
  }
}

main().catch(
  (
    error:
      unknown,
  ) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Unified mathematical publication verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Unified mathematical publication failed: ${error.message}`
          : "Unified mathematical publication failed.",
      );
    }

    process.exitCode =
      1;
  },
);

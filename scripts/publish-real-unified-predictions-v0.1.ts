import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
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

const MODEL_VERSION =
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01;

const FIXTURE_SOURCE =
  "api-football";

type JsonObject =
  Record<string, unknown>;

function requestedDate():
  string {
  const args =
    process.argv
      .slice(2)
      .filter(
        (value) =>
          !value.startsWith(
            "--",
          ),
      );

  const value =
    args[0] ??
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

  return value;
}

function publicationRequested():
  boolean {
  return process.argv
    .slice(2)
    .includes(
      "--publish",
    );
}

function timestampDate(
  value:
    unknown,
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

async function main() {
  const date =
    requestedDate();

  const publish =
    publicationRequested();

  const sql =
    neon(
      getDatabaseUrl(),
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
   * Select the latest immutable Unified v0.1
   * generation for every real fixture.
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

  assert.ok(
    predictions.length >
      0,
    `No ${MODEL_VERSION} predictions found for ${date}.`,
  );

  console.log(
    `Unified forecasts found: ${predictions.length}`,
  );

  let ready =
    0;

  let publishedNow =
    0;

  let alreadyPublished =
    0;

  let existingBaseline =
    0;

  let skipped =
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
     * IMMUTABLE INPUT VERIFICATION
     */
    const calculatedInputSha =
      canonicalSha256(
        inputSnapshot,
      );

    assert.equal(
      calculatedInputSha,
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
      "Unified forecast must remain independent of downstream recommendation logic.",
    );

    assert.equal(
      output.publicationStatus,
      "draft",
      "Immutable model output must retain its generation-time state.",
    );

    /*
     * Generate the public-safe explanation.
     *
     * The adapter is the boundary preventing
     * proprietary rating mechanics from entering
     * presentation output.
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

    /*
     * TIMING INTEGRITY
     */
    const frozenKickoff =
      timestampDate(
        prediction.kickoff_at_generation,
      );

    const currentKickoff =
      timestampDate(
        prediction.kickoff_at,
      );

    const inputCutoff =
      timestampDate(
        prediction.input_cutoff_at,
      );

    const generatedAt =
      timestampDate(
        prediction.generated_at,
      );

    const checkedAt =
      timestampDate(
        prediction.checked_at,
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
      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        "Reason: fixture kickoff changed after forecast generation.",
      );

      skipped +=
        1;

      continue;
    }

    if (
      String(
        prediction.status,
      ) !==
      "scheduled"
    ) {
      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        `Reason: fixture status is ${prediction.status}.`,
      );

      skipped +=
        1;

      continue;
    }

    if (
      checkedAt.getTime() >=
      currentKickoff.getTime()
    ) {
      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        "Reason: kickoff has been reached or passed.",
      );

      skipped +=
        1;

      continue;
    }

    /*
     * PUBLIC FORECAST PRESENTATION
     *
     * No raw rating.
     * No rating difference.
     * No provider evidence hashes.
     * No proprietary mathematical mechanics.
     */
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

    console.log("");

    for (
      const reason
      of explanation.reasons
    ) {
      console.log(
        `- ${reason}`,
      );
    }

    console.log("");

    console.log(
      explanation.evidenceNote,
    );

    if (
      explanation.marketContext.length >
      0
    ) {
      console.log("");
      console.log(
        "Additional match context:",
      );

      for (
        const item
        of explanation.marketContext
      ) {
        console.log(
          `- ${item}`,
        );
      }
    }

    /*
     * EXACT PREDICTION ALREADY PUBLISHED
     */
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
          frozenKickoff.getTime(),
        "Stored publication was not pre-kickoff.",
      );

      console.log("");
      console.log(
        "Status: ALREADY PUBLISHED",
      );

      console.log(
        `Published: ${publishedAt.toISOString()}`,
      );

      alreadyPublished +=
        1;

      continue;
    }

    /*
     * ONE OFFICIAL BASELINE PER FIXTURE/MODEL
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
      console.log("");
      console.log(
        "Status: NOT PUBLISHABLE",
      );

      console.log(
        "Reason: an official forecast baseline already exists for this fixture and model version.",
      );

      existingBaseline +=
        1;

      continue;
    }

    ready +=
      1;

    if (
      !publish
    ) {
      console.log("");
      console.log(
        "Status: READY FOR PUBLICATION",
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
      );

    const latestKickoff =
      timestampDate(
        timingRows[0].kickoff_at,
      );

    if (
      String(
        timingRows[0].status,
      ) !==
      "scheduled"
    ) {
      console.log("");
      console.log(
        "Status: NOT PUBLISHED",
      );

      console.log(
        "Reason: fixture status changed before publication.",
      );

      skipped +=
        1;

      continue;
    }

    if (
      latestKickoff.getTime() !==
      frozenKickoff.getTime()
    ) {
      console.log("");
      console.log(
        "Status: NOT PUBLISHED",
      );

      console.log(
        "Reason: kickoff changed before publication.",
      );

      skipped +=
        1;

      continue;
    }

    if (
      databaseNow.getTime() >=
      latestKickoff.getTime()
    ) {
      console.log("");
      console.log(
        "Status: NOT PUBLISHED",
      );

      console.log(
        "Reason: kickoff reached before publication.",
      );

      skipped +=
        1;

      continue;
    }

    /*
     * ATOMIC PUBLICATION
     *
     * Only published_at changes.
     *
     * The frozen model output remains exactly
     * as generated.
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

        RETURNING
          id,
          generated_at,
          published_at
      `;

    if (
      rows.length ===
      0
    ) {
      const baseline =
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

          ORDER BY
            published_at

          LIMIT 1
        `;

      assert.equal(
        baseline.length,
        1,
        "Publication produced no update and no official baseline was found.",
      );

      console.log("");
      console.log(
        "Status: ALREADY PUBLISHED",
      );

      alreadyPublished +=
        1;

      continue;
    }

    assert.equal(
      rows.length,
      1,
      "Unexpected publication update count.",
    );

    const publishedAt =
      timestampDate(
        rows[0].published_at,
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

    console.log("");
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
    `Ready: ${ready}`,
  );

  console.log(
    `Published now: ${publishedNow}`,
  );

  console.log(
    `Already published: ${alreadyPublished}`,
  );

  console.log(
    `Existing official baseline: ${existingBaseline}`,
  );

  console.log(
    `Skipped: ${skipped}`,
  );

  if (
    !publish
  ) {
    console.log(
      "DRY RUN COMPLETE: publication state was not modified.",
    );
  } else {
    console.log(
      "Unified forecast publication complete.",
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
        `Unified publication verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Unified publication failed: ${error.message}`
          : "Unified publication failed.",
      );
    }

    process.exitCode =
      1;
  },
);
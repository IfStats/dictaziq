import "./load-env";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";
import {
  evaluateRatingGap,
  RATING_GAP_MODEL_VERSION,
} from "../src/lib/predictions/rating-gap";

const SOURCE = "footballdatabase";

const configuration = {
  validation_status: "experimental",
  calibrated_probabilities: false,

  formula: "D = home_rating - away_rating",

  snapshot_requirements: {
    same_source: true,
    same_snapshot_date: true,
  },

  bands: {
    "-4_to_-1": {
      signal: "strong_draw",
    },
    "0_to_4": {
      signal: "draw",
    },
    "absolute_5_to_49": {
      signal: "context_required",
    },
    "absolute_50_to_149": {
      signal: "cautious_win",
      selection: "higher_rated_team",
    },
    "absolute_150_plus": {
      signal: "strong_win_over_2_5",
      selection: "higher_rated_team",
      over_2_5_signal: true,
    },
  },
} as const;

function iso(value: unknown): string {
  const date = new Date(String(value));

  assert.ok(
    Number.isFinite(date.getTime()),
    "Database returned an invalid timestamp.",
  );

  return date.toISOString();
}

function dateOnly(value: unknown): string {
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);

    if (match) {
      return match[1];
    }
  }

  if (value instanceof Date) {
    assert.ok(
      Number.isFinite(value.getTime()),
      "Database returned an invalid rating snapshot date.",
    );

    return value.toISOString().slice(0, 10);
  }

  const parsed = new Date(String(value));

  assert.ok(
    Number.isFinite(parsed.getTime()),
    "Database returned an invalid rating snapshot date.",
  );

  return parsed.toISOString().slice(0, 10);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date)
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [
          key,
          canonicalize(item),
        ]),
    );
  }

  return value;
}

function sha256(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

async function main() {
  const client = neon(getDatabaseUrl());

  const fixtures = await client`
    SELECT
      fixture.id,
      fixture.slug,
      fixture.home_team_id,
      fixture.away_team_id,
      fixture.kickoff_at,
      fixture.status,
      fixture.is_demo,

      competition.sport_id,

      home_team.name AS home_team_name,
      away_team.name AS away_team_name

    FROM public.fixtures AS fixture

    JOIN public.seasons AS season
      ON season.id = fixture.season_id

    JOIN public.competitions AS competition
      ON competition.id = season.competition_id

    JOIN public.teams AS home_team
      ON home_team.id = fixture.home_team_id

    JOIN public.teams AS away_team
      ON away_team.id = fixture.away_team_id

    WHERE fixture.provider = 'demo'
      AND fixture.provider_id = 'fixture-001'
      AND fixture.is_demo = true
  `;

  assert.equal(
    fixtures.length,
    1,
    "Demo fixture fixture-001 is missing.",
  );

  const fixture = fixtures[0];

  assert.equal(
    fixture.status,
    "scheduled",
    "Rating-gap prediction requires a scheduled fixture.",
  );

  const kickoff = iso(fixture.kickoff_at);

  const cutoffRows = await client`
    SELECT clock_timestamp() AS cutoff
  `;

  const cutoff = iso(cutoffRows[0].cutoff);

  assert.ok(
    Date.parse(cutoff) < Date.parse(kickoff),
    "Demo fixture kickoff has already passed.",
  );

  /*
   * Pick the newest comparable pair available before the cutoff.
   *
   * Both ratings must:
   * - belong to the fixture teams,
   * - come from the same source,
   * - use the same snapshot date,
   * - have been observed before the prediction cutoff.
   */
  const ratingPairs = await client`
    SELECT
      home_snapshot.id AS home_snapshot_id,
      home_snapshot.team_id AS home_team_id,
      home_snapshot.source AS source,
      home_snapshot.source_team_id AS home_source_team_id,
      home_snapshot.snapshot_date AS snapshot_date,
      home_snapshot.rating AS home_rating,
      home_snapshot.ranking_position AS home_ranking_position,
      home_snapshot.observed_at AS home_observed_at,
      home_snapshot.evidence AS home_evidence,

      away_snapshot.id AS away_snapshot_id,
      away_snapshot.team_id AS away_team_id,
      away_snapshot.source_team_id AS away_source_team_id,
      away_snapshot.rating AS away_rating,
      away_snapshot.ranking_position AS away_ranking_position,
      away_snapshot.observed_at AS away_observed_at,
      away_snapshot.evidence AS away_evidence

    FROM public.team_rating_snapshots AS home_snapshot

    JOIN public.team_rating_snapshots AS away_snapshot
      ON away_snapshot.source = home_snapshot.source
      AND away_snapshot.snapshot_date =
        home_snapshot.snapshot_date

    WHERE home_snapshot.team_id =
      ${fixture.home_team_id}::uuid

      AND away_snapshot.team_id =
        ${fixture.away_team_id}::uuid

      AND home_snapshot.source = ${SOURCE}

      AND home_snapshot.observed_at <=
        ${cutoff}::timestamptz

      AND away_snapshot.observed_at <=
        ${cutoff}::timestamptz

      AND home_snapshot.is_demo = true
      AND away_snapshot.is_demo = true

    ORDER BY
      home_snapshot.snapshot_date DESC,
      home_snapshot.observed_at DESC,
      away_snapshot.observed_at DESC

    LIMIT 1
  `;

  assert.equal(
    ratingPairs.length,
    1,
    "No comparable home/away rating snapshot pair exists.",
  );

  const ratings = ratingPairs[0];

  const snapshotDate = dateOnly(
    ratings.snapshot_date,
  );

  const ratingResult = evaluateRatingGap({
    home: {
      rating: Number(ratings.home_rating),
      source: String(ratings.source),
      snapshotDate,
    },

    away: {
      rating: Number(ratings.away_rating),
      source: String(ratings.source),
      snapshotDate,
    },
  });

  /*
   * Preserve the complete evidence used by the model.
   *
   * This is the immutable prediction-time snapshot.
   */
  const inputSnapshot = {
    fixture: {
      id: fixture.id,
      slug: fixture.slug,

      home_team_id: fixture.home_team_id,
      away_team_id: fixture.away_team_id,

      home_team_name: fixture.home_team_name,
      away_team_name: fixture.away_team_name,

      kickoff_at: kickoff,
      is_demo: true,
    },

    cutoff,

    rating_source: String(ratings.source),

    home_rating_snapshot: {
      id: ratings.home_snapshot_id,
      team_id: ratings.home_team_id,

      source_team_id:
        ratings.home_source_team_id,

      snapshot_date: snapshotDate,

      rating: Number(ratings.home_rating),

      ranking_position:
        ratings.home_ranking_position,

      observed_at: iso(
        ratings.home_observed_at,
      ),

      evidence: ratings.home_evidence,
    },

    away_rating_snapshot: {
      id: ratings.away_snapshot_id,
      team_id: ratings.away_team_id,

      source_team_id:
        ratings.away_source_team_id,

      snapshot_date: snapshotDate,

      rating: Number(ratings.away_rating),

      ranking_position:
        ratings.away_ranking_position,

      observed_at: iso(
        ratings.away_observed_at,
      ),

      evidence: ratings.away_evidence,
    },
  };

  const canonicalInput = JSON.stringify(
    canonicalize(inputSnapshot),
  );

  const inputSha256 = sha256(canonicalInput);

  /*
   * Fingerprint the exact mathematical-model source.
   *
   * Normalize Windows CRLF so source hashes remain portable.
   */
  const modelSource = readFileSync(
    resolve(
      "src",
      "lib",
      "predictions",
      "rating-gap.ts",
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const codeSha256 = sha256(modelSource);

  /*
   * Markets contain only actual selections emitted by this
   * deterministic rule engine.
   *
   * Values are deliberately NOT probabilities.
   */
  const markets: Record<
    string,
    Record<string, Record<string, unknown>>
  > = {};

  if (ratingResult.standaloneSelection) {
    markets["1x2"] = {
      [ratingResult.standaloneSelection]: {
        signal: ratingResult.signal,
        probability: null,
        calibrated: false,
      },
    };
  }

  if (ratingResult.over25Signal) {
    markets["goals_2.5"] = {
      over: {
        signal: "over_2_5",
        probability: null,
        calibrated: false,
      },
    };
  }

  const output = {
    fixture_id: fixture.id,

    model_version:
      ratingResult.modelVersion,

    model_family: "rating_gap",

    is_demo: true,

    validation_status:
      ratingResult.validationStatus,

    calibrated_probabilities: false,

    rating_gap: {
      home_rating:
        ratingResult.homeRating,

      away_rating:
        ratingResult.awayRating,

      difference:
        ratingResult.ratingGap,

      absolute_difference:
        ratingResult.absoluteGap,

      higher_rated_team:
        ratingResult.higherRatedTeam,

      signal:
        ratingResult.signal,

      standalone_selection:
        ratingResult.standaloneSelection,

      over_2_5_signal:
        ratingResult.over25Signal,

      requires_context:
        ratingResult.requiresContext,

      source:
        ratingResult.source,

      snapshot_date:
        ratingResult.snapshotDate,
    },

    markets,
  };

  /*
   * Register this model version immutably.
   */
  await client`
    INSERT INTO public.model_versions (
      sport_id,
      version,
      description,
      code_sha256,
      configuration
    )
    VALUES (
      ${fixture.sport_id}::uuid,

      ${RATING_GAP_MODEL_VERSION},

      'Experimental DictazIQ rating-gap model based on weekly team rating differences; not probability calibrated',

      ${codeSha256},

      ${JSON.stringify(configuration)}::jsonb
    )
    ON CONFLICT (version) DO NOTHING
  `;

  const models = await client`
    SELECT
      id,
      sport_id,
      version,
      code_sha256,
      configuration

    FROM public.model_versions

    WHERE version =
      ${RATING_GAP_MODEL_VERSION}
  `;

  assert.equal(
    models.length,
    1,
    "Rating-gap model registration failed.",
  );

  const model = models[0];

  assert.equal(
    model.code_sha256,
    codeSha256,
    "Rating-gap source changed under the existing model version. Increment the model version.",
  );

  assert.deepEqual(
    model.configuration,
    configuration,
    "Rating-gap configuration changed under the existing model version. Increment the model version.",
  );

  /*
   * Store the prediction.
   *
   * The existing predictions_guard trigger ensures this can only
   * happen pre-kickoff and freezes the historical record.
   */
  await client`
    INSERT INTO public.predictions (
      fixture_id,
      model_version_id,
      is_demo,
      kickoff_at_generation,
      input_cutoff_at,
      generated_at,
      input_sha256,
      input_snapshot,
      output
    )
    VALUES (
      ${fixture.id}::uuid,
      ${model.id}::uuid,
      true,
      ${kickoff}::timestamptz,
      ${cutoff}::timestamptz,
      clock_timestamp(),
      ${inputSha256},
      ${JSON.stringify(inputSnapshot)}::jsonb,
      ${JSON.stringify(output)}::jsonb
    )
    ON CONFLICT (
      fixture_id,
      model_version_id,
      input_sha256,
      input_cutoff_at
    )
    DO NOTHING
  `;

  const saved = await client`
    SELECT
      id,
      fixture_id,
      model_version_id,
      is_demo,
      published_at,
      input_sha256,
      input_snapshot,
      output

    FROM public.predictions

    WHERE fixture_id =
      ${fixture.id}::uuid

      AND model_version_id =
        ${model.id}::uuid

      AND input_sha256 =
        ${inputSha256}

      AND input_cutoff_at =
        ${cutoff}::timestamptz
  `;

  assert.equal(
    saved.length,
    1,
    "Rating-gap prediction storage failed.",
  );

  assert.equal(
    saved[0].published_at,
    null,
    "New rating-gap prediction should initially be unpublished.",
  );

  assert.equal(
    saved[0].input_sha256,
    inputSha256,
  );

  assert.deepEqual(
    saved[0].input_snapshot,
    JSON.parse(JSON.stringify(inputSnapshot)),
  );

  assert.deepEqual(
    saved[0].output,
    output,
  );

  console.log(
    "PASS: comparable weekly rating snapshots selected before cutoff.",
  );

  console.log(
    "PASS: exact rating snapshot IDs preserved in prediction input.",
  );

  console.log(
    "PASS: canonical rating input SHA-256 generated.",
  );

  console.log(
    "PASS: rating-gap source fingerprint verified.",
  );

  console.log(
    "PASS: rating-gap model version registered independently.",
  );

  console.log(
    "PASS: rating-gap prediction persisted independently from Poisson.",
  );

  console.log("");

  console.log(
    `Rating-gap Prediction ID: ${saved[0].id}`,
  );

  console.log(
    `Model: ${RATING_GAP_MODEL_VERSION}`,
  );

  console.log(
    `Fixture: ${fixture.slug}`,
  );

  console.log(
    `Ratings: ${ratingResult.homeRating} vs ${ratingResult.awayRating}`,
  );

  console.log(
    `D = ${ratingResult.ratingGap}`,
  );

  console.log(
    `Signal: ${ratingResult.signal}`,
  );

  console.log(
    `Selection: ${ratingResult.standaloneSelection}`,
  );

  console.log(
    `Over 2.5 signal: ${ratingResult.over25Signal}`,
  );

  console.log(
    `Input SHA-256: ${inputSha256}`,
  );

  console.log(
    `Code SHA-256: ${codeSha256}`,
  );

  console.log("");

  console.log(
    "WARNING: experimental synthetic prediction; no calibrated probability or real performance claim.",
  );
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(
      `Verification failed: ${error.message}`,
    );
  } else {
    console.error(
      error instanceof Error
        ? `Rating-gap prediction generation failed: ${error.message}`
        : "Rating-gap prediction generation failed.",
    );
  }

  process.exitCode = 1;
});
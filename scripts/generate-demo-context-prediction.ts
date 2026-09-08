import "./load-env";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";

import {
  PREMATCH_ENGINE_VERSION,
  evaluatePreMatchDecision,
} from "../src/lib/predictions/prematch-decision";

import type {
  ContextFactor,
} from "../src/lib/predictions/context-analysis";

const RATING_SOURCE =
  "synthetic-context-demo";

const RATING_SNAPSHOT_DATE =
  "2026-09-07";

function iso(
  value: unknown,
): string {
  const parsed =
    new Date(String(value));

  assert.ok(
    Number.isFinite(parsed.getTime()),
    "Invalid timestamp.",
  );

  return parsed.toISOString();
}

function dateOnly(
  value: unknown,
): string {
  if (typeof value === "string") {
    const match =
      /^(\d{4}-\d{2}-\d{2})/.exec(value);

    if (match) {
      return match[1];
    }
  }

  return iso(value).slice(0, 10);
}

function canonicalize(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      )
        .sort(
          ([left], [right]) =>
            left.localeCompare(right),
        )
        .map(
          ([key, item]) => [
            key,
            canonicalize(item),
          ],
        ),
    );
  }

  return value;
}

function sha256(
  value: string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function combinedSourceHash(): string {
  const files = [
    "src/lib/predictions/rating-gap.ts",
    "src/lib/predictions/context-analysis.ts",
    "src/lib/predictions/prematch-decision.ts",
  ];

  const source = files
    .map((file) => {
      const content =
        readFileSync(
          resolve(file),
          "utf8",
        ).replace(/\r\n/g, "\n");

      return [
        `FILE:${file}`,
        content,
      ].join("\n");
    })
    .join("\n---\n");

  return sha256(source);
}

async function main() {
  const client =
    neon(getDatabaseUrl());

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

      home_team.name
        AS home_team_name,

      away_team.name
        AS away_team_name,

      clock_timestamp()
        AS checked_at

    FROM public.fixtures
      AS fixture

    JOIN public.seasons
      AS season
      ON season.id =
        fixture.season_id

    JOIN public.competitions
      AS competition
      ON competition.id =
        season.competition_id

    JOIN public.teams
      AS home_team
      ON home_team.id =
        fixture.home_team_id

    JOIN public.teams
      AS away_team
      ON away_team.id =
        fixture.away_team_id

    WHERE fixture.provider =
      'demo'

      AND fixture.provider_id =
        'fixture-001'

      AND fixture.is_demo = true
  `;

  assert.equal(
    fixtures.length,
    1,
    "Demo fixture fixture-001 is missing.",
  );

  const fixture =
    fixtures[0];

  assert.equal(
    fixture.status,
    "scheduled",
    "Pre-match prediction requires a scheduled fixture.",
  );

  const kickoff =
    new Date(
      String(fixture.kickoff_at),
    );

  const checkedAt =
    new Date(
      String(fixture.checked_at),
    );

  assert.ok(
    checkedAt.getTime() <
      kickoff.getTime(),
    "Fixture has already kicked off.",
  );

  /*
   * Load the exact immutable 5-49 rating pair.
   */
  const ratings = await client`
    SELECT
      home.id
        AS home_snapshot_id,

      home.team_id
        AS home_team_id,

      home.source
        AS source,

      home.source_team_id
        AS home_source_team_id,

      home.snapshot_date
        AS snapshot_date,

      home.rating
        AS home_rating,

      home.observed_at
        AS home_observed_at,

      home.evidence
        AS home_evidence,

      away.id
        AS away_snapshot_id,

      away.team_id
        AS away_team_id,

      away.source_team_id
        AS away_source_team_id,

      away.rating
        AS away_rating,

      away.observed_at
        AS away_observed_at,

      away.evidence
        AS away_evidence

    FROM public.team_rating_snapshots
      AS home

    JOIN public.team_rating_snapshots
      AS away
      ON away.source =
        home.source

      AND away.snapshot_date =
        home.snapshot_date

    WHERE home.team_id =
      ${fixture.home_team_id}::uuid

      AND away.team_id =
        ${fixture.away_team_id}::uuid

      AND home.source =
        ${RATING_SOURCE}

      AND home.snapshot_date =
        ${RATING_SNAPSHOT_DATE}::date

      AND home.is_demo = true
      AND away.is_demo = true
  `;

  assert.equal(
    ratings.length,
    1,
    "5-49 rating snapshot pair is missing.",
  );

  const rating =
    ratings[0];

  /*
   * Load the four immutable context records.
   */
  const contextRows = await client`
    SELECT
      id,
      kind,
      side,
      description,
      source,
      source_evidence_id,
      evidence_sha256,
      observed_at,
      captured_at,
      evidence

    FROM public.context_evidence_snapshots

    WHERE fixture_id =
      ${fixture.id}::uuid

      AND is_demo = true

    ORDER BY
      observed_at,
      id
  `;

  assert.equal(
    contextRows.length,
    4,
    "Expected exactly four demo context records.",
  );

  /*
   * Derive a deterministic evidence cutoff.
   *
   * It is the latest timestamp among all immutable
   * evidence actually used by this prediction.
   *
   * Re-running with identical evidence therefore
   * produces the same input cutoff and SHA-256.
   */
  const evidenceTimes = [
    new Date(
      String(
        rating.home_observed_at,
      ),
    ).getTime(),

    new Date(
      String(
        rating.away_observed_at,
      ),
    ).getTime(),

    ...contextRows.map(
      (row) =>
        new Date(
          String(row.captured_at),
        ).getTime(),
    ),
  ];

  assert.ok(
    evidenceTimes.every(
      Number.isFinite,
    ),
    "Evidence contains an invalid timestamp.",
  );

  const inputCutoff =
    new Date(
      Math.max(...evidenceTimes),
    );

  assert.ok(
    inputCutoff.getTime() <
      kickoff.getTime(),
    "Prediction evidence cutoff is not pre-kickoff.",
  );

  assert.ok(
    inputCutoff.getTime() <=
      checkedAt.getTime(),
    "Prediction evidence cutoff cannot be in the future.",
  );

  const factors:
    ContextFactor[] =
      contextRows.map(
        (row) => ({
          kind:
            String(
              row.kind,
            ) as ContextFactor["kind"],

          side:
            String(
              row.side,
            ) as ContextFactor["side"],

          description:
            String(
              row.description,
            ),

          source:
            String(
              row.source,
            ),

          observedAt:
            iso(
              row.observed_at,
            ),
        }),
      );

  const snapshotDate =
    dateOnly(
      rating.snapshot_date,
    );

  const decision =
    evaluatePreMatchDecision({
      ratings: {
        home: {
          rating:
            Number(
              rating.home_rating,
            ),

          source:
            String(
              rating.source,
            ),

          snapshotDate,
        },

        away: {
          rating:
            Number(
              rating.away_rating,
            ),

          source:
            String(
              rating.source,
            ),

          snapshotDate,
        },
      },

      context: {
        cutoffAt:
          inputCutoff.toISOString(),

        kickoffAt:
          kickoff.toISOString(),

        factors,
      },
    });

  assert.equal(
    decision.ratingGap.ratingGap,
    25,
  );

  assert.equal(
    decision.route,
    "rating_gap_plus_context",
  );

  assert.equal(
    decision.finalSelection,
    "home",
  );

  assert.equal(
    decision.contextResolved,
    true,
  );

  assert.equal(
    decision.calibratedProbability,
    null,
  );

  /*
   * Preserve every immutable evidence identity used.
   */
  const inputSnapshot = {
    fixture: {
      id:
        fixture.id,

      slug:
        fixture.slug,

      home_team_id:
        fixture.home_team_id,

      away_team_id:
        fixture.away_team_id,

      home_team_name:
        fixture.home_team_name,

      away_team_name:
        fixture.away_team_name,

      kickoff_at:
        kickoff.toISOString(),

      is_demo: true,
    },

    cutoff:
      inputCutoff.toISOString(),

    rating_snapshots: {
      home: {
        id:
          rating.home_snapshot_id,

        team_id:
          rating.home_team_id,

        source:
          rating.source,

        source_team_id:
          rating.home_source_team_id,

        snapshot_date:
          snapshotDate,

        rating:
          Number(
            rating.home_rating,
          ),

        observed_at:
          iso(
            rating.home_observed_at,
          ),

        evidence:
          rating.home_evidence,
      },

      away: {
        id:
          rating.away_snapshot_id,

        team_id:
          rating.away_team_id,

        source:
          rating.source,

        source_team_id:
          rating.away_source_team_id,

        snapshot_date:
          snapshotDate,

        rating:
          Number(
            rating.away_rating,
          ),

        observed_at:
          iso(
            rating.away_observed_at,
          ),

        evidence:
          rating.away_evidence,
      },
    },

    context_evidence:
      contextRows.map(
        (row) => ({
          id:
            row.id,

          kind:
            row.kind,

          side:
            row.side,

          description:
            row.description,

          source:
            row.source,

          source_evidence_id:
            row.source_evidence_id,

          evidence_sha256:
            row.evidence_sha256,

          observed_at:
            iso(
              row.observed_at,
            ),

          captured_at:
            iso(
              row.captured_at,
            ),

          evidence:
            row.evidence,
        }),
      ),
  };

  const canonicalInput =
    JSON.stringify(
      canonicalize(
        inputSnapshot,
      ),
    );

  const inputSha256 =
    sha256(canonicalInput);

  const codeSha256 =
    combinedSourceHash();

  const configuration = {
    validation_status:
      "experimental",

    calibrated_probabilities:
      false,

    architecture: {
      rating_gap:
        "dictaziq-rating-gap-v0.1",

      context:
        "dictaziq-context-v0.1",

      router:
        PREMATCH_ENGINE_VERSION,
    },

    context_band: {
      absolute_min: 5,
      absolute_max: 49,

      minimum_factor_count: 3,

      minimum_directional_margin: 2,
    },

    rule:
      "Rating gap routes first. Context may resolve only absolute gaps 5 through 49.",
  };

  /*
   * The market representation contains a selection,
   * but explicitly no probability.
   */
  const output = {
    fixture_id:
      fixture.id,

    model_version:
      PREMATCH_ENGINE_VERSION,

    model_family:
      "rating_gap_context",

    validation_status:
      "experimental",

    calibrated_probabilities:
      false,

    route:
      decision.route,

    rating_gap: {
      home_rating:
        decision.ratingGap.homeRating,

      away_rating:
        decision.ratingGap.awayRating,

      difference:
        decision.ratingGap.ratingGap,

      absolute_difference:
        decision.ratingGap.absoluteGap,

      signal:
        decision.ratingGap.signal,

      requires_context:
        decision.ratingGap.requiresContext,
    },

    context: {
      model_version:
        decision.context?.modelVersion,

      factor_count:
        decision.context?.factorCount,

      home_support:
        decision.context?.homeSupport,

      away_support:
        decision.context?.awaySupport,

      neutral_factors:
        decision.context?.neutralFactors,

      directional_margin:
        decision.context?.directionalMargin,

      decision:
        decision.context?.decision,
    },

    final_selection:
      decision.finalSelection,

    over_2_5_signal:
      decision.over25Signal,

    markets: {
      "1x2": {
        home: {
          signal:
            "home_lean",

          probability: null,

          calibrated: false,
        },
      },
    },
  };

  /*
   * Register the composite engine separately.
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

      ${PREMATCH_ENGINE_VERSION},

      'Experimental DictazIQ pre-match rating-gap plus verified-context router',

      ${codeSha256},

      ${JSON.stringify(
        configuration,
      )}::jsonb
    )

    ON CONFLICT (version)
    DO NOTHING
  `;

  const models =
    await client`
      SELECT
        id,
        version,
        code_sha256,
        configuration

      FROM public.model_versions

      WHERE version =
        ${PREMATCH_ENGINE_VERSION}
    `;

  assert.equal(
    models.length,
    1,
    "Pre-match model registration failed.",
  );

  const model =
    models[0];

  assert.equal(
    model.code_sha256,
    codeSha256,
    "Composite model source changed without a version increment.",
  );

  assert.deepEqual(
    model.configuration,
    configuration,
    "Composite model configuration changed without a version increment.",
  );

  /*
   * Persist the prediction.
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

      ${kickoff.toISOString()}::timestamptz,

      ${inputCutoff.toISOString()}::timestamptz,

      clock_timestamp(),

      ${inputSha256},

      ${JSON.stringify(
        inputSnapshot,
      )}::jsonb,

      ${JSON.stringify(
        output,
      )}::jsonb
    )

    ON CONFLICT (
      fixture_id,
      model_version_id,
      input_sha256,
      input_cutoff_at
    )
    DO NOTHING
  `;

  const saved =
    await client`
      SELECT
        id,
        fixture_id,
        model_version_id,
        published_at,
        input_cutoff_at,
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
          ${inputCutoff.toISOString()}::timestamptz
    `;

  assert.equal(
    saved.length,
    1,
    "Composite pre-match prediction was not persisted.",
  );

  assert.equal(
    saved[0].published_at,
    null,
    "New composite prediction should initially be unpublished.",
  );

  assert.equal(
    saved[0].input_sha256,
    inputSha256,
  );

  assert.deepEqual(
    saved[0].input_snapshot,
    JSON.parse(
      JSON.stringify(
        inputSnapshot,
      ),
    ),
  );

  assert.deepEqual(
    saved[0].output,
    output,
  );

  console.log(
    "PASS: exact 5-49 rating snapshot IDs preserved.",
  );

  console.log(
    "PASS: exact context evidence IDs and SHA-256 hashes preserved.",
  );

  console.log(
    "PASS: deterministic evidence cutoff generated.",
  );

  console.log(
    "PASS: composite source fingerprint generated.",
  );

  console.log(
    "PASS: pre-match composite model registered independently.",
  );

  console.log(
    "PASS: 5-49 contextual prediction persisted immutably.",
  );

  console.log(
    "PASS: no calibrated probability fabricated.",
  );

  console.log("");

  console.log(
    `Prediction ID: ${saved[0].id}`,
  );

  console.log(
    `Model: ${PREMATCH_ENGINE_VERSION}`,
  );

  console.log(
    `Fixture: ${fixture.slug}`,
  );

  console.log(
    `D = ${decision.ratingGap.ratingGap}`,
  );

  console.log(
    `Route: ${decision.route}`,
  );

  console.log(
    `Context: ${decision.context?.decision}`,
  );

  console.log(
    `Final selection: ${decision.finalSelection}`,
  );

  console.log(
    `Input cutoff: ${inputCutoff.toISOString()}`,
  );

  console.log(
    `Input SHA-256: ${inputSha256}`,
  );

  console.log(
    `Code SHA-256: ${codeSha256}`,
  );

  console.log("");

  console.log(
    "WARNING: synthetic experimental prediction; this is not predictive-performance evidence.",
  );
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Composite prediction verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Composite prediction generation failed: ${error.message}`
          : "Composite prediction generation failed.",
      );
    }

    process.exitCode = 1;
  },
);
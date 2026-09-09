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

const FIXTURE_SOURCE =
  "api-football";

const RATING_SOURCE =
  "footballdatabase.com";

const configuration = {
  validation_status: "experimental",
  calibrated_probabilities: false,

  formula:
    "D = home_rating - away_rating",

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

function requestedDate(): string {
  return (
    process.argv[2]?.trim() ||
    "2026-09-09"
  );
}

function iso(
  value: unknown,
): string {
  const date =
    new Date(
      String(value),
    );

  assert.ok(
    Number.isFinite(
      date.getTime(),
    ),
    "Database returned an invalid timestamp.",
  );

  return date.toISOString();
}

function dateOnly(
  value: unknown,
): string {
  if (
    typeof value === "string"
  ) {
    const match =
      /^(\d{4}-\d{2}-\d{2})/.exec(
        value,
      );

    if (match) {
      return match[1];
    }
  }

  if (
    value instanceof Date
  ) {
    assert.ok(
      Number.isFinite(
        value.getTime(),
      ),
      "Database returned an invalid rating snapshot date.",
    );

    return value
      .toISOString()
      .slice(0, 10);
  }

  const parsed =
    new Date(
      String(value),
    );

  assert.ok(
    Number.isFinite(
      parsed.getTime(),
    ),
    "Database returned an invalid rating snapshot date.",
  );

  return parsed
    .toISOString()
    .slice(0, 10);
}

function canonicalize(
  value: unknown,
): unknown {
  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    value !== null &&
    typeof value ===
      "object" &&
    !(value instanceof Date)
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      )
        .sort(
          ([left], [right]) =>
            left.localeCompare(
              right,
            ),
        )
        .map(
          ([key, item]) => [
            key,
            canonicalize(
              item,
            ),
          ],
        ),
    );
  }

  return value;
}

function sha256(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function modelCodeHash(): string {
  const source =
    readFileSync(
      resolve(
        "src",
        "lib",
        "predictions",
        "rating-gap.ts",
      ),
      "utf8",
    ).replace(
      /\r\n/g,
      "\n",
    );

  return sha256(
    source,
  );
}

async function main() {
  const date =
    requestedDate();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  const client =
    neon(
      getDatabaseUrl(),
    );

  /*
   * Load only real scheduled API-Football
   * fixtures for the requested UTC date.
   */
  const fixtures =
    await client`
      SELECT
        fixture.id,
        fixture.slug,

        fixture.provider,
        fixture.provider_id,

        fixture.home_team_id,
        fixture.away_team_id,

        fixture.kickoff_at,
        fixture.status,
        fixture.provider_status,

        fixture.fetched_at,
        fixture.is_demo,

        season.id
          AS season_id,

        season.label
          AS season_label,

        competition.id
          AS competition_id,

        competition.name
          AS competition_name,

        competition.country
          AS competition_country,

        competition.provider_id
          AS competition_provider_id,

        competition.sport_id,

        home_team.name
          AS home_team_name,

        home_team.country
          AS home_team_country,

        away_team.name
          AS away_team_name,

        away_team.country
          AS away_team_country,

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
        ${FIXTURE_SOURCE}

        AND fixture.is_demo =
          false

        AND fixture.status =
          'scheduled'

        AND fixture.kickoff_at
          IS NOT NULL

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  assert.ok(
    fixtures.length > 0,
    `No persisted scheduled API-Football fixtures exist for ${date}.`,
  );

  const codeSha256 =
    modelCodeHash();

  /*
   * Register/reuse the exact same rating-gap model
   * version already used by the demo.
   *
   * The model source and configuration must remain
   * identical under this version identifier.
   */
  const sportIds =
    new Set(
      fixtures.map(
        (fixture) =>
          String(
            fixture.sport_id,
          ),
      ),
    );

  assert.equal(
    sportIds.size,
    1,
    "Real fixture set contains multiple sports.",
  );

  const sportId =
    [...sportIds][0];

  await client`
    INSERT INTO public.model_versions (
      sport_id,
      version,
      description,
      code_sha256,
      configuration
    )
    VALUES (
      ${sportId}::uuid,

      ${RATING_GAP_MODEL_VERSION},

      'Experimental DictazIQ rating-gap model based on weekly team rating differences; not probability calibrated',

      ${codeSha256},

      ${JSON.stringify(
        configuration,
      )}::jsonb
    )

    ON CONFLICT (
      version
    )
    DO NOTHING
  `;

  const models =
    await client`
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

  const model =
    models[0];

  assert.equal(
    String(
      model.sport_id,
    ),
    sportId,
    "Rating-gap model is registered against the wrong sport.",
  );

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

  let insertedCount = 0;
  let existingCount = 0;
  let contextRequiredCount =
    0;

  let standaloneCount = 0;

  const results:
    Array<{
      predictionId: string;

      databaseStatus:
        | "inserted"
        | "existing";

      fixtureName: string;

      providerFixtureId:
        string;

      kickoff: string;

      snapshotDate: string;

      homeRating: number;
      awayRating: number;

      ratingGap: number;
      absoluteGap: number;

      signal: string;

      selection:
        string | null;

      over25:
        boolean;

      requiresContext:
        boolean;

      inputCutoff: string;

      inputSha256: string;
    }> = [];

  for (
    const fixture
    of fixtures
  ) {
    assert.equal(
      fixture.is_demo,
      false,
    );

    assert.equal(
      fixture.status,
      "scheduled",
    );

    const kickoff =
      iso(
        fixture.kickoff_at,
      );

    const checkedAt =
      iso(
        fixture.checked_at,
      );

    const fetchedAt =
      iso(
        fixture.fetched_at,
      );

    assert.ok(
      Date.parse(
        checkedAt,
      ) <
        Date.parse(
          kickoff,
        ),
      `Fixture ${fixture.provider_id} has already kicked off.`,
    );

    assert.ok(
      Date.parse(
        fetchedAt,
      ) <
        Date.parse(
          kickoff,
        ),
      `Fixture ${fixture.provider_id} was not captured pre-kickoff.`,
    );

    /*
     * Select the newest comparable real rating pair
     * that was ACTUALLY observed before kickoff.
     *
     * snapshot_date alone is insufficient for a
     * historical/backfill guarantee: observed_at must
     * also be pre-kickoff.
     */
    const ratingPairs =
      await client`
        SELECT
          home_snapshot.id
            AS home_snapshot_id,

          home_snapshot.team_id
            AS home_team_id,

          home_snapshot.source,

          home_snapshot.source_team_id
            AS home_source_team_id,

          home_snapshot.snapshot_date,

          home_snapshot.rating
            AS home_rating,

          home_snapshot.ranking_position
            AS home_ranking_position,

          home_snapshot.observed_at
            AS home_observed_at,

          home_snapshot.evidence
            AS home_evidence,

          away_snapshot.id
            AS away_snapshot_id,

          away_snapshot.team_id
            AS away_team_id,

          away_snapshot.source_team_id
            AS away_source_team_id,

          away_snapshot.rating
            AS away_rating,

          away_snapshot.ranking_position
            AS away_ranking_position,

          away_snapshot.observed_at
            AS away_observed_at,

          away_snapshot.evidence
            AS away_evidence

        FROM public.team_rating_snapshots
          AS home_snapshot

        JOIN public.team_rating_snapshots
          AS away_snapshot

          ON away_snapshot.source =
            home_snapshot.source

          AND away_snapshot.snapshot_date =
            home_snapshot.snapshot_date

        WHERE home_snapshot.team_id =
          ${fixture.home_team_id}::uuid

          AND away_snapshot.team_id =
            ${fixture.away_team_id}::uuid

          AND home_snapshot.source =
            ${RATING_SOURCE}

          AND home_snapshot.is_demo =
            false

          AND away_snapshot.is_demo =
            false

          AND home_snapshot.snapshot_date <=
            (
              ${kickoff}::timestamptz
              AT TIME ZONE 'UTC'
            )::date

          AND home_snapshot.observed_at <
            ${kickoff}::timestamptz

          AND away_snapshot.observed_at <
            ${kickoff}::timestamptz

        ORDER BY
          home_snapshot.snapshot_date
            DESC,

          home_snapshot.observed_at
            DESC,

          away_snapshot.observed_at
            DESC

        LIMIT 1
      `;

    assert.equal(
      ratingPairs.length,
      1,
      `No comparable real rating pair exists for ${fixture.home_team_name} vs ${fixture.away_team_name}.`,
    );

    const ratings =
      ratingPairs[0];

    const snapshotDate =
      dateOnly(
        ratings.snapshot_date,
      );

    const homeObservedAt =
      iso(
        ratings.home_observed_at,
      );

    const awayObservedAt =
      iso(
        ratings.away_observed_at,
      );

    /*
     * Deterministic evidence cutoff.
     *
     * This is deliberately NOT "now".
     *
     * It is the latest timestamp among the immutable
     * pieces of evidence actually used:
     *
     * - API-Football fixture observation
     * - home rating observation
     * - away rating observation
     *
     * Therefore an identical rerun receives the same
     * input_cutoff_at and prediction identity.
     */
    const evidenceTimes = [
      Date.parse(
        fetchedAt,
      ),

      Date.parse(
        homeObservedAt,
      ),

      Date.parse(
        awayObservedAt,
      ),
    ];

    assert.ok(
      evidenceTimes.every(
        Number.isFinite,
      ),
      "Prediction evidence contains an invalid timestamp.",
    );

    const inputCutoff =
      new Date(
        Math.max(
          ...evidenceTimes,
        ),
      ).toISOString();

    assert.ok(
      Date.parse(
        inputCutoff,
      ) <
        Date.parse(
          kickoff,
        ),
      `Input cutoff is not pre-kickoff for fixture ${fixture.provider_id}.`,
    );

    assert.ok(
      Date.parse(
        inputCutoff,
      ) <=
        Date.parse(
          checkedAt,
        ),
      `Input cutoff is in the future for fixture ${fixture.provider_id}.`,
    );

    const ratingResult =
      evaluateRatingGap({
        home: {
          rating:
            Number(
              ratings.home_rating,
            ),

          source:
            String(
              ratings.source,
            ),

          snapshotDate,
        },

        away: {
          rating:
            Number(
              ratings.away_rating,
            ),

          source:
            String(
              ratings.source,
            ),

          snapshotDate,
        },
      });

    /*
     * Immutable prediction-time evidence.
     */
    const inputSnapshot = {
      fixture: {
        id:
          fixture.id,

        slug:
          fixture.slug,

        provider:
          fixture.provider,

        provider_id:
          fixture.provider_id,

        provider_status:
          fixture.provider_status,

        season_id:
          fixture.season_id,

        season_label:
          fixture.season_label,

        competition_id:
          fixture.competition_id,

        competition_provider_id:
          fixture.competition_provider_id,

        competition_name:
          fixture.competition_name,

        competition_country:
          fixture.competition_country,

        home_team_id:
          fixture.home_team_id,

        away_team_id:
          fixture.away_team_id,

        home_team_name:
          fixture.home_team_name,

        home_team_country:
          fixture.home_team_country,

        away_team_name:
          fixture.away_team_name,

        away_team_country:
          fixture.away_team_country,

        kickoff_at:
          kickoff,

        fetched_at:
          fetchedAt,

        is_demo:
          false,
      },

      cutoff:
        inputCutoff,

      rating_source:
        String(
          ratings.source,
        ),

      home_rating_snapshot: {
        id:
          ratings.home_snapshot_id,

        team_id:
          ratings.home_team_id,

        source_team_id:
          ratings.home_source_team_id,

        snapshot_date:
          snapshotDate,

        rating:
          Number(
            ratings.home_rating,
          ),

        ranking_position:
          ratings.home_ranking_position,

        observed_at:
          homeObservedAt,

        evidence:
          ratings.home_evidence,
      },

      away_rating_snapshot: {
        id:
          ratings.away_snapshot_id,

        team_id:
          ratings.away_team_id,

        source_team_id:
          ratings.away_source_team_id,

        snapshot_date:
          snapshotDate,

        rating:
          Number(
            ratings.away_rating,
          ),

        ranking_position:
          ratings.away_ranking_position,

        observed_at:
          awayObservedAt,

        evidence:
          ratings.away_evidence,
      },
    };

    const canonicalInput =
      JSON.stringify(
        canonicalize(
          inputSnapshot,
        ),
      );

    const inputSha256 =
      sha256(
        canonicalInput,
      );

    /*
     * Only actual deterministic selections become
     * markets.
     *
     * D=5..49 therefore produces markets={}
     * until verified context is captured and a
     * separate composite prediction is generated.
     */
    const markets: Record<
      string,
      Record<
        string,
        Record<
          string,
          unknown
        >
      >
    > = {};

    if (
      ratingResult
        .standaloneSelection
    ) {
      markets["1x2"] = {
        [ratingResult
          .standaloneSelection]:
          {
            signal:
              ratingResult.signal,

            probability:
              null,

            calibrated:
              false,
          },
      };
    }

    if (
      ratingResult
        .over25Signal
    ) {
      markets[
        "goals_2.5"
      ] = {
        over: {
          signal:
            "over_2_5",

          probability:
            null,

          calibrated:
            false,
        },
      };
    }

    const output = {
      fixture_id:
        fixture.id,

      fixture_provider:
        FIXTURE_SOURCE,

      fixture_provider_id:
        String(
          fixture.provider_id,
        ),

      model_version:
        ratingResult.modelVersion,

      model_family:
        "rating_gap",

      is_demo: false,

      validation_status:
        ratingResult.validationStatus,

      calibrated_probabilities:
        false,

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
          ratingResult
            .standaloneSelection,

        over_2_5_signal:
          ratingResult
            .over25Signal,

        requires_context:
          ratingResult
            .requiresContext,

        source:
          ratingResult.source,

        snapshot_date:
          ratingResult.snapshotDate,
      },

      markets,
    };

    const inserted =
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

          false,

          ${kickoff}::timestamptz,

          ${inputCutoff}::timestamptz,

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

        RETURNING id
      `;

    const saved =
      await client`
        SELECT
          id,
          fixture_id,
          model_version_id,
          is_demo,
          kickoff_at_generation,
          input_cutoff_at,
          generated_at,
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
            ${inputCutoff}::timestamptz
      `;

    assert.equal(
      saved.length,
      1,
      `Prediction storage failed for ${fixture.home_team_name} vs ${fixture.away_team_name}.`,
    );

    assert.equal(
      saved[0].is_demo,
      false,
    );

    assert.equal(
      saved[0].published_at,
      null,
      "New real prediction should initially be unpublished.",
    );

    assert.equal(
      iso(
        saved[0]
          .kickoff_at_generation,
      ),
      kickoff,
      "Stored kickoff differs from frozen fixture kickoff.",
    );

    assert.equal(
      iso(
        saved[0]
          .input_cutoff_at,
      ),
      inputCutoff,
    );

    assert.equal(
      saved[0]
        .input_sha256,
      inputSha256,
    );

    assert.deepEqual(
      saved[0]
        .input_snapshot,

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

    const databaseStatus =
      inserted.length === 1
        ? "inserted"
        : "existing";

    if (
      databaseStatus ===
      "inserted"
    ) {
      insertedCount += 1;
    } else {
      existingCount += 1;
    }

    if (
      ratingResult
        .requiresContext
    ) {
      contextRequiredCount +=
        1;
    }

    if (
      ratingResult
        .standaloneSelection
    ) {
      standaloneCount +=
        1;
    }

    results.push({
      predictionId:
        String(
          saved[0].id,
        ),

      databaseStatus,

      fixtureName:
        `${fixture.home_team_name} vs ${fixture.away_team_name}`,

      providerFixtureId:
        String(
          fixture.provider_id,
        ),

      kickoff,

      snapshotDate,

      homeRating:
        ratingResult
          .homeRating,

      awayRating:
        ratingResult
          .awayRating,

      ratingGap:
        ratingResult
          .ratingGap,

      absoluteGap:
        ratingResult
          .absoluteGap,

      signal:
        ratingResult
          .signal,

      selection:
        ratingResult
          .standaloneSelection,

      over25:
        ratingResult
          .over25Signal,

      requiresContext:
        ratingResult
          .requiresContext,

      inputCutoff,

      inputSha256,
    });
  }

  console.log("");
  console.log(
    "PASS: real scheduled fixtures loaded.",
  );

  console.log(
    "PASS: comparable FootballDatabase snapshots selected pre-kickoff.",
  );

  console.log(
    "PASS: exact rating snapshot IDs and evidence preserved.",
  );

  console.log(
    "PASS: deterministic evidence cutoffs generated.",
  );

  console.log(
    "PASS: canonical input SHA-256 hashes generated.",
  );

  console.log(
    "PASS: existing rating-gap model fingerprint verified.",
  );

  console.log(
    "PASS: real predictions persisted independently from demo predictions.",
  );

  console.log(
    "PASS: context-band fixtures received no fabricated market selection.",
  );

  console.log(
    "PASS: no calibrated probability fabricated.",
  );

  console.log("");

  console.log(
    `Model: ${RATING_GAP_MODEL_VERSION}`,
  );

  console.log(
    `Code SHA-256: ${codeSha256}`,
  );

  console.log(
    `Fixture date: ${date}`,
  );

  console.log(
    `Fixtures processed: ${results.length}`,
  );

  console.log(
    `Predictions inserted: ${insertedCount}`,
  );

  console.log(
    `Predictions existing: ${existingCount}`,
  );

  console.log(
    `Standalone selections: ${standaloneCount}`,
  );

  console.log(
    `Context required: ${contextRequiredCount}`,
  );

  console.log("");

  console.log(
    "REAL RATING-GAP PREDICTIONS",
  );

  console.log(
    "===========================",
  );

  console.log("");

  for (
    const result
    of results
  ) {
    console.log(
      `${result.kickoff.slice(
        11,
        16,
      )} UTC | ${result.fixtureName}`,
    );

    console.log(
      `API fixture: ${result.providerFixtureId}`,
    );

    console.log(
      `Prediction ID: ${result.predictionId}`,
    );

    console.log(
      `Database: ${result.databaseStatus}`,
    );

    console.log(
      `Rating snapshot: ${result.snapshotDate}`,
    );

    console.log(
      `Ratings: ${result.homeRating} - ${result.awayRating}`,
    );

    console.log(
      `D = ${result.ratingGap}`,
    );

    console.log(
      `Absolute gap = ${result.absoluteGap}`,
    );

    console.log(
      `Signal = ${result.signal}`,
    );

    console.log(
      `Selection = ${result.selection}`,
    );

    console.log(
      `Over 2.5 = ${result.over25}`,
    );

    console.log(
      `Requires context = ${result.requiresContext}`,
    );

    console.log(
      `Input cutoff = ${result.inputCutoff}`,
    );

    console.log(
      `Input SHA-256 = ${result.inputSha256}`,
    );

    console.log("");
  }

  assert.equal(
    results.length,
    fixtures.length,
    "Not every persisted scheduled real fixture received a rating-gap prediction.",
  );

  console.log(
    `PASS: ${results.length} real immutable DictazIQ rating-gap predictions are available.`,
  );

  console.log("");

  console.log(
    "WARNING: these are experimental rule-engine signals, not calibrated probabilities or validated performance claims.",
  );
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Real prediction verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Real rating-gap prediction generation failed: ${error.message}`
          : "Real rating-gap prediction generation failed.",
      );
    }

    process.exitCode = 1;
  },
);
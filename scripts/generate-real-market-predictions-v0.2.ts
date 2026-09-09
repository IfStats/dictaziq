import "./load-env";

import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  canonicalJson,
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

import {
  validateMarketEvidenceSnapshotV02,
  type MarketEvidenceSnapshotV02,
} from "../src/lib/predictions/market-evidence-v0.2";

import {
  evaluatePrematchMarketsV02,
  PREMATCH_MARKETS_CONFIGURATION_V02,
  PREMATCH_MARKETS_MODEL_VERSION_V02,
  type PrematchResultContextV02,
} from "../src/lib/predictions/prematch-markets-v0.2";

const FIXTURE_SOURCE =
  "api-football";

const RATING_SOURCE =
  "footballdatabase.com";

const MODEL_DESCRIPTION =
  "DictazIQ frozen v1 experimental prematch model combining rating-gap v0.2, Goals/BTTS v0.2 and result-context v0.2; probabilities are not calibrated";

const RESULT_CONTEXT_SOURCE =
  "football-data.org";

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
  /*
   * Neon may return PostgreSQL timestamptz
   * values as native JavaScript Date objects.
   *
   * String(Date) loses millisecond precision,
   * so preserve Date values directly.
   */
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

function iso(
  value: unknown,
): string {
  return timestampDate(
    value,
  ).toISOString();
}

function timestampMs(
  value: unknown,
): number {
  return timestampDate(
    value,
  ).getTime();
}

function dateOnly(
  value: unknown,
): string {
  if (
    typeof value ===
    "string"
  ) {
    const match =
      /^(\d{4}-\d{2}-\d{2})/.exec(
        value,
      );

    if (match) {
      return match[1];
    }
  }

  return iso(
    value,
  ).slice(
    0,
    10,
  );
}

function sourceFile(
  path: string,
): string {
  return readFileSync(
    resolve(
      path,
    ),
    "utf8",
  ).replace(
    /\r\n/g,
    "\n",
  );
}

function modelCodeSha256():
  string {
  /*
   * Hash every source file that materially
   * determines the composite market output.
   */
  return canonicalSha256({
    composite:
      sourceFile(
        "src/lib/predictions/prematch-markets-v0.2.ts",
      ),

    ratingGap:
      sourceFile(
        "src/lib/predictions/rating-gap-v0.2.ts",
      ),

    goalsBttsBase:
      sourceFile(
        "src/lib/predictions/goals-btts-engine.ts",
      ),

    goalsBttsConsensus:
      sourceFile(
        "src/lib/predictions/goals-btts-engine-v0.2.ts",
      ),

      resultContext:
  sourceFile(
    "src/lib/predictions/result-context-v0.2.ts",
  ),
  });
}

async function main() {
  const requested =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * No provider calls.
   *
   * Load the newest immutable market-evidence
   * snapshot already captured for each persisted
   * fixture.
   */
  const fixtures =
    await sql`
      SELECT
        fixture.id,
        fixture.slug,
        fixture.provider,
        fixture.provider_id,
        fixture.kickoff_at,
        fixture.status,
        fixture.fetched_at,
        fixture.is_demo,

        competition.id
          AS competition_id,

        competition.name
          AS competition_name,

        competition.country
          AS competition_country,

        competition.sport_id,

        season.id
          AS season_id,

        season.label
          AS season_label,

        home.id
          AS home_team_id,

        home.name
          AS home_team_name,

        away.id
          AS away_team_id,

        away.name
          AS away_team_name,

        market.id
          AS market_evidence_id,

        market.evidence_version,

        market.evidence_sha256,

        market.source
          AS market_evidence_source,

        market.cutoff_at,

        market.captured_at,

        market.evidence

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
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away
        ON away.id =
          fixture.away_team_id

      LEFT JOIN LATERAL (
        SELECT
          snapshot.*

        FROM public.market_evidence_snapshots
          AS snapshot

        WHERE snapshot.fixture_id =
          fixture.id

          AND snapshot.is_demo =
            false

        ORDER BY
          snapshot.cutoff_at DESC,
          snapshot.captured_at DESC

        LIMIT 1
      ) AS market
        ON true

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
          ${requested}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  assert.ok(
    fixtures.length > 0,
    `No scheduled fixtures found for ${requested}.`,
  );

  console.log(
    `Scheduled fixtures: ${fixtures.length}`,
  );

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
    "Fixture set contains multiple sports.",
  );

  const sportId =
    [...sportIds][0];

  const codeSha256 =
    modelCodeSha256();

  /*
   * Register the COMPOSITE model.
   *
   * Never register these predictions under
   * rating-gap-v0.2 or goals-btts-v0.2 alone.
   */
  await sql`
  INSERT INTO public.model_versions (
    sport_id,
    version,
    description,
    code_sha256,
    configuration
  )
  VALUES (
    ${sportId}::uuid,
    ${PREMATCH_MARKETS_MODEL_VERSION_V02},
    ${MODEL_DESCRIPTION},
    ${codeSha256},
    ${JSON.stringify(
      PREMATCH_MARKETS_CONFIGURATION_V02,
    )}::jsonb
  )

  ON CONFLICT (
    version
  )
  DO NOTHING
`;

  const models =
    await sql`
      SELECT
        id,
        sport_id,
        version,
        code_sha256,
        configuration

      FROM public.model_versions

      WHERE version =
        ${PREMATCH_MARKETS_MODEL_VERSION_V02}
    `;

  assert.equal(
    models.length,
    1,
    "Composite model registration failed.",
  );

  const model =
    models[0];

  assert.equal(
    String(
      model.sport_id,
    ),
    sportId,
    "Composite model belongs to the wrong sport.",
  );

  assert.equal(
    String(
      model.code_sha256,
    ),
    codeSha256,
    "Composite model source changed under the same version. Increment the model version.",
  );

  assert.equal(
    canonicalJson(
      model.configuration,
    ),
    canonicalJson(
      PREMATCH_MARKETS_CONFIGURATION_V02,
    ),
    "Composite model configuration changed under the same version.",
  );

  let inserted = 0;
  let existing = 0;
  let skipped = 0;

  for (
    const fixture
    of fixtures
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home_team_name} vs ${fixture.away_team_name}`,
    );

    const kickoffAt =
      iso(
        fixture.kickoff_at,
      );

    console.log(
      `Kickoff: ${kickoffAt}`,
    );

    if (
      Date.now() >=
      Date.parse(
        kickoffAt,
      )
    ) {
      console.log(
        "NO DRAFT: fixture has already kicked off.",
      );

      skipped += 1;

      continue;
    }

    if (
      !fixture
        .market_evidence_id
    ) {
      console.log(
        "NO DRAFT: no immutable market evidence snapshot.",
      );

      skipped += 1;

      continue;
    }

    const evidence =
      fixture.evidence as
        MarketEvidenceSnapshotV02;

    validateMarketEvidenceSnapshotV02(
      evidence,
    );

    const calculatedEvidenceSha =
      canonicalSha256(
        evidence,
      );

    assert.equal(
      calculatedEvidenceSha,
      String(
        fixture.evidence_sha256,
      ),
      "Stored market evidence hash verification failed.",
    );

    assert.equal(
      evidence.fixtureId,
      String(
        fixture.id,
      ),
      "Evidence belongs to a different fixture.",
    );

  const relationalCutoffMs =
  timestampMs(
    fixture.cutoff_at,
  );

const evidenceCutoffMs =
  timestampMs(
    evidence.cutoffAt,
  );

assert.ok(
  Number.isFinite(
    relationalCutoffMs,
  ),
  "Stored relational evidence cutoff is invalid.",
);

assert.ok(
  Number.isFinite(
    evidenceCutoffMs,
  ),
  "Market evidence JSON cutoff is invalid.",
);

/*
 * PostgreSQL may serialize timestamptz with
 * microseconds while JavaScript ISO strings
 * use milliseconds.
 *
 * Compare the actual instant rather than the
 * textual representation.
 */
assert.equal(
  relationalCutoffMs,
  evidenceCutoffMs,
  "Evidence cutoff instant does not match relational cutoff.",
);

/*
 * Use one deterministic ISO representation
 * downstream.
 */
const evidenceCutoff =
  new Date(
    evidenceCutoffMs,
  ).toISOString();

    assert.ok(
      Date.parse(
        evidenceCutoff,
      ) <
        Date.parse(
          kickoffAt,
        ),
      "Evidence cutoff is not pre-kickoff.",
    );

    /*
     * Ratings must have actually been observed
     * by the immutable market evidence cutoff.
     */
    const ratings =
      await sql`
        SELECT
          home.id
            AS home_rating_snapshot_id,

          home.snapshot_date,

          home.rating
            AS home_rating,

          home.observed_at
            AS home_observed_at,

          home.evidence
            AS home_rating_evidence,

          away.id
            AS away_rating_snapshot_id,

          away.rating
            AS away_rating,

          away.observed_at
            AS away_observed_at,

          away.evidence
            AS away_rating_evidence

        FROM public.team_rating_snapshots
          AS home

        JOIN public.team_rating_snapshots
          AS away
          ON away.source =
            home.source

          AND away.snapshot_date =
            home.snapshot_date

        WHERE home.team_id =
          ${String(
            fixture.home_team_id,
          )}::uuid

          AND away.team_id =
            ${String(
              fixture.away_team_id,
            )}::uuid

          AND home.source =
            ${RATING_SOURCE}

          AND home.is_demo =
            false

          AND away.is_demo =
            false

          AND home.snapshot_date <=
            (
              ${evidenceCutoff}::timestamptz
              AT TIME ZONE 'UTC'
            )::date

          AND home.observed_at <=
            ${evidenceCutoff}::timestamptz

          AND away.observed_at <=
            ${evidenceCutoff}::timestamptz

        ORDER BY
          home.snapshot_date DESC,
          home.observed_at DESC,
          away.observed_at DESC

        LIMIT 1
      `;

    assert.equal(
      ratings.length,
      1,
      `No rating pair valid at evidence cutoff for ${fixture.home_team_name} vs ${fixture.away_team_name}.`,
    );

    const rating =
      ratings[0];

    const snapshotDate =
      dateOnly(
        rating.snapshot_date,
      );

      const homeRating =
  Number(
    rating.home_rating,
  );

const awayRating =
  Number(
    rating.away_rating,
  );

const ratingGap =
  homeRating -
  awayRating;

const requiresResultContext =
  Math.abs(
    ratingGap,
  ) >= 5 &&
  Math.abs(
    ratingGap,
  ) <= 49;

let resultContext:
  PrematchResultContextV02 |
  null =
    null;

let resultContextSnapshots:
  Array<Record<string, unknown>> =
    [];

let inputCutoffMs =
  evidenceCutoffMs;

if (
  requiresResultContext
) {
  const contextRows =
    await sql`
      SELECT *

      FROM (
        SELECT DISTINCT ON (
          context.kind
        )
          context.id,
          context.kind,
          context.side,
          context.description,
          context.source,
          context.source_evidence_id,
          context.evidence_sha256,
          context.observed_at,
          context.captured_at,
          context.evidence

        FROM public.context_evidence_snapshots
          AS context

        WHERE context.fixture_id =
          ${String(
            fixture.id,
          )}::uuid

          AND context.is_demo =
            false

          AND context.source =
            ${RESULT_CONTEXT_SOURCE}

          AND context.kind IN (
            'recent_form',
            'home_away_form',
            'rest_schedule'
          )

        ORDER BY
          context.kind,
          context.observed_at DESC,
          context.captured_at DESC
      ) AS latest

      ORDER BY
        latest.kind
    `;

  /*
   * Verify every immutable context row before
   * allowing it into the prediction input.
   */
  for (
    const row
    of contextRows
  ) {
    const identityPayload = {
      fixtureId:
        String(
          fixture.id,
        ),

      kind:
        String(
          row.kind,
        ),

      side:
        String(
          row.side,
        ),

      description:
        String(
          row.description,
        ),

      source:
        String(
          row.source,
        ),

      sourceEvidenceId:
        row.source_evidence_id ===
          null
          ? null
          : String(
              row.source_evidence_id,
            ),

      evidence:
        row.evidence,
    };

    assert.equal(
      canonicalSha256(
        identityPayload,
      ),
      String(
        row.evidence_sha256,
      ),
      `Context evidence hash failed for ${row.kind}.`,
    );

    assert.equal(
      String(
        row.side,
      ),
      "neutral",
      "Raw result-context evidence must remain neutral.",
    );

    const observedMs =
      timestampMs(
        row.observed_at,
      );

    assert.ok(
      observedMs <
        Date.parse(
          kickoffAt,
        ),
      "Post-kickoff context evidence cannot be used.",
    );

    inputCutoffMs =
      Math.max(
        inputCutoffMs,
        observedMs,
      );

    resultContextSnapshots.push({
      id:
        String(
          row.id,
        ),

      kind:
        String(
          row.kind,
        ),

      source:
        String(
          row.source,
        ),

      sourceEvidenceId:
        row.source_evidence_id ===
          null
          ? null
          : String(
              row.source_evidence_id,
            ),

      evidenceSha256:
        String(
          row.evidence_sha256,
        ),

      observedAt:
        iso(
          row.observed_at,
        ),

      capturedAt:
        iso(
          row.captured_at,
        ),

      evidence:
        row.evidence,
    });
  }

  const byKind =
    new Map(
      contextRows.map(
        (row) => [
          String(
            row.kind,
          ),

          row,
        ],
      ),
    );

  const recent =
    byKind.get(
      "recent_form",
    );

  const venue =
    byKind.get(
      "home_away_form",
    );

  const rest =
    byKind.get(
      "rest_schedule",
    );

  /*
   * Recent form is the minimum context contract.
   * Without it, result context remains missing.
   */
  if (recent) {
    const recentEvidence =
      recent.evidence as any;

    const venueEvidence =
      venue
        ? venue.evidence as any
        : null;

    const restEvidence =
      rest
        ? rest.evidence as any
        : null;

    resultContext = {
      home: {
        recent:
          recentEvidence
            .home
            .record,

        venue:
          venueEvidence
            ?.home
            ?.record ??
          null,

        restDays:
          restEvidence
            ?.home
            ?.restDays ??
          null,
      },

      away: {
        recent:
          recentEvidence
            .away
            .record,

        venue:
          venueEvidence
            ?.away
            ?.record ??
          null,

        restDays:
          restEvidence
            ?.away
            ?.restDays ??
          null,
      },
    };
  }
}

const inputCutoff =
  new Date(
    inputCutoffMs,
  ).toISOString();

const analysis =
    evaluatePrematchMarketsV02({
       rating: {
  home: {
    rating:
      homeRating,

    source:
      RATING_SOURCE,

    snapshotDate,
  },

  away: {
    rating:
      awayRating,

    source:
      RATING_SOURCE,

    snapshotDate,
  },
},

evidence,

resultContext,
      });

    /*
     * Full reproducible input.
     *
     * We intentionally store both the immutable
     * snapshot identity AND the actual snapshot.
     */
    const inputSnapshot = {
      fixture: {
        id:
          String(
            fixture.id,
          ),

        slug:
          String(
            fixture.slug,
          ),

        provider:
          String(
            fixture.provider,
          ),

        providerId:
          String(
            fixture.provider_id,
          ),

        kickoffAt,

        fetchedAt:
          iso(
            fixture.fetched_at,
          ),

        competition: {
          id:
            String(
              fixture.competition_id,
            ),

          name:
            String(
              fixture.competition_name,
            ),

          country:
            fixture.competition_country ===
              null
              ? null
              : String(
                  fixture.competition_country,
                ),
        },

        season: {
          id:
            String(
              fixture.season_id,
            ),

          label:
            String(
              fixture.season_label,
            ),
        },

        home: {
          id:
            String(
              fixture.home_team_id,
            ),

          name:
            String(
              fixture.home_team_name,
            ),
        },

        away: {
          id:
            String(
              fixture.away_team_id,
            ),

          name:
            String(
              fixture.away_team_name,
            ),
        },
      },

      marketEvidenceSnapshot: {
        id:
          String(
            fixture.market_evidence_id,
          ),

        evidenceVersion:
          String(
            fixture.evidence_version,
          ),

        evidenceSha256:
          String(
            fixture.evidence_sha256,
          ),

        source:
          String(
            fixture.market_evidence_source,
          ),

        cutoffAt:
          evidenceCutoff,

        capturedAt:
          iso(
            fixture.captured_at,
          ),

        evidence,
      },

      resultContextSnapshots,

      ratings: {
        source:
          RATING_SOURCE,

        snapshotDate,

        home: {
          id:
            String(
              rating.home_rating_snapshot_id,
            ),

          rating:
            Number(
              rating.home_rating,
            ),

          observedAt:
            iso(
              rating.home_observed_at,
            ),

          evidence:
            rating.home_rating_evidence,
        },

        away: {
          id:
            String(
              rating.away_rating_snapshot_id,
            ),

          rating:
            Number(
              rating.away_rating,
            ),

          observedAt:
            iso(
              rating.away_observed_at,
            ),

          evidence:
            rating.away_rating_evidence,
        },
      },

      model: {
        version:
          PREMATCH_MARKETS_MODEL_VERSION_V02,

        codeSha256,
      },
    };

    const inputSha256 =
      canonicalSha256(
        inputSnapshot,
      );

    /*
     * The immutable market evidence cutoff is
     * the prediction input cutoff.
     */
    const generatedAt =
      new Date()
        .toISOString();

    assert.ok(
      Date.parse(
        evidenceCutoff,
      ) <=
        Date.parse(
          generatedAt,
        ),
      "Generated time precedes input cutoff.",
    );

    assert.ok(
      Date.parse(
        generatedAt,
      ) <
        Date.parse(
          kickoffAt,
        ),
      "Prediction generation reached kickoff.",
    );

    const output = {
      ...analysis,

      publicationStatus:
        "draft",

      generatedFrom: {
  marketEvidenceSnapshotId:
    String(
      fixture.market_evidence_id,
    ),

  marketEvidenceSha256:
    String(
      fixture.evidence_sha256,
    ),

  resultContextSnapshotIds:
    resultContextSnapshots.map(
      (snapshot) =>
        String(
          snapshot.id,
        ),
    ),
},
    };

    const rows =
      await sql`
        INSERT INTO public.predictions (
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
        )
        VALUES (
          ${String(
            fixture.id,
          )}::uuid,

          ${String(
            model.id,
          )}::uuid,

          false,

          ${kickoffAt}::timestamptz,

          ${evidenceCutoff}::timestamptz,

          ${generatedAt}::timestamptz,

          NULL,

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

        RETURNING
          id
      `;

    let predictionId:
      string;

    let databaseStatus:
      "inserted" |
      "existing";

    if (
      rows.length ===
      1
    ) {
      predictionId =
        String(
          rows[0].id,
        );

      databaseStatus =
        "inserted";

      inserted += 1;
    } else {
      const existingRows =
        await sql`
          SELECT
            id,
            published_at,
            input_sha256,
            input_snapshot,
            output

          FROM public.predictions

          WHERE fixture_id =
            ${String(
              fixture.id,
            )}::uuid

            AND model_version_id =
              ${String(
                model.id,
              )}::uuid

            AND input_sha256 =
              ${inputSha256}

            AND input_cutoff_at =
              ${evidenceCutoff}::timestamptz

          LIMIT 1
        `;

      assert.equal(
        existingRows.length,
        1,
        "Prediction conflict occurred but existing prediction could not be reloaded.",
      );

      assert.equal(
        existingRows[0]
          .published_at,
        null,
        "Existing prediction is already published.",
      );

      assert.equal(
        canonicalSha256(
          existingRows[0]
            .input_snapshot,
        ),
        inputSha256,
        "Existing prediction input snapshot hash failed verification.",
      );

      predictionId =
        String(
          existingRows[0].id,
        );

      databaseStatus =
        "existing";

      existing += 1;
    }

    console.log(
      `DRAFT ${databaseStatus.toUpperCase()} | prediction=${predictionId}`,
    );

    console.log(
      `Evidence=${fixture.market_evidence_id}`,
    );

    console.log(
      `Input SHA=${inputSha256}`,
    );

    console.log(
      `Rating gap=${analysis.result.ratingGap} | rating=${analysis.result.ratingSignal} | context=${analysis.result.contextStatus} | result=${analysis.result.selection}`,
    );

    for (
      const recommendation
      of analysis
        .qualifiedRecommendations
    ) {
      console.log(
        `QUALIFIED | ${recommendation.market} | ${recommendation.selection}`,
      );
    }

    if (
      analysis
        .qualifiedRecommendations
        .length ===
      0
    ) {
      console.log(
        "QUALIFIED MARKETS: NONE",
      );
    }

    console.log(
      "Published: NO",
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Drafts inserted: ${inserted}`,
  );

  console.log(
    `Drafts existing: ${existing}`,
  );

  console.log(
    `Fixtures skipped: ${skipped}`,
  );

  console.log(
    "Published: 0",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
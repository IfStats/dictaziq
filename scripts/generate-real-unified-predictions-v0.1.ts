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
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  canonicalJson,
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

import {
  MARKET_EVIDENCE_VERSION_V02,
  validateMarketEvidenceSnapshotV02,
  type MarketEvidenceSnapshotV02,
} from "../src/lib/predictions/market-evidence-v0.2";

import {
  evaluateUnifiedMatchAnalysisV01,
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

const FIXTURE_SOURCE =
  "api-football";

const RATING_SOURCE =
  "footballdatabase.com";

const RATING_HISTORY_LIMIT =
  8;

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

const MODEL_DESCRIPTION =
  "DictazIQ experimental unified mathematical prematch analysis v0.1 combining current FootballDatabase rating difference, rating dynamics, rating interaction, league behaviour and measured scoring archetype; probabilities remain uncalibrated";

const MODEL_CONFIGURATION = {
  ratingSource:
    RATING_SOURCE,

  ratingRelationship:
    "home-rating-minus-away-rating",

  currentRatingPair:
    "latest-common-pre-kickoff-snapshot",

  ratingHistoryMaximumSnapshots:
    RATING_HISTORY_LIMIT,

  ratingDynamics:
    "descriptive-only-no-adjusted-rating",

  structuralStrengthModel:
    "excluded",

  leagueBehaviour:
    "experimental-v0.1",

  scoringEvidenceVersion:
    MARKET_EVIDENCE_VERSION_V02,

  scoringFallback:
    "unavailable-zero-sample",

  predictionType:
    "prematch-unified-analysis",

  publication:
    "draft-only",

  calibratedProbabilities:
    false,
} as const;

type SqlRow =
  Record<
    string,
    unknown
  >;

type RatingHistoryRow = {
  id: string;

  teamId: string;

  snapshotDate: string;

  rating: number;

  rankingPosition:
    number | null;

  sourceTeamId:
    string | null;

  observedAt: string;

  evidence:
    unknown;
};

type LoadedMarketEvidence = {
  id: string;

  evidenceSha256: string;

  source: string;

  cutoffAt: string;

  capturedAt: string;

  evidence:
    MarketEvidenceSnapshotV02;
};

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

function persistRequested():
  boolean {
  return process.argv
    .slice(2)
    .includes(
      "--persist",
    );
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

    if (
      match
    ) {
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
   * Hash every active source file that
   * materially determines Unified v0.1.
   *
   * structural-strength-v0.1 is deliberately
   * excluded because it is NOT part of the
   * active prediction architecture.
   */
  return canonicalSha256({

    unified:
      sourceFile(
        "src/lib/predictions/unified-match-analysis-v0.1.ts",
      ),

    matchProfile:
      sourceFile(
        "src/lib/predictions/match-profile-v0.1.ts",
      ),

    scoringProfile:
      sourceFile(
        "src/lib/predictions/scoring-profile-v0.1.ts",
      ),

    ratingInteraction:
      sourceFile(
        "src/lib/predictions/rating-interaction-v0.1.ts",
      ),

    ratingDynamics:
      sourceFile(
        "src/lib/predictions/rating-dynamics-v0.1.ts",
      ),

    universalOutcomeLeague:
      sourceFile(
        "src/lib/predictions/universal-outcome-league-v0.1.ts",
      ),

    leagueBehaviour:
      sourceFile(
        "src/lib/predictions/league-behaviour-v0.1.ts",
      ),

    universalOutcome:
      sourceFile(
        "src/lib/predictions/universal-outcome-v0.1.ts",
      ),
  });
}

function maxTimestamp(
  values: string[],
): string {
  assert.ok(
    values.length >
      0,
    "At least one evidence timestamp is required.",
  );

  const maximum =
    Math.max(
      ...values.map(
        timestampMs,
      ),
    );

  return new Date(
    maximum,
  ).toISOString();
}

function zeroScoringSample() {
  return {
    matches: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    scoredMatches: 0,
    concededMatches: 0,
    bttsMatches: 0,
    over15Matches: 0,
    over25Matches: 0,
    over35Matches: 0,
  };
}

function ratingAnalysisSnapshots(
  rows:
    RatingHistoryRow[],
) {
  return rows.map(
    (row) => ({
      rating:
        row.rating,

      snapshotDate:
        row.snapshotDate,

      source:
        RATING_SOURCE,
    }),
  );
}

function ratingSnapshotInput(
  rows:
    RatingHistoryRow[],
) {
  return rows.map(
    (row) => ({
      id:
        row.id,

      teamId:
        row.teamId,

      source:
        RATING_SOURCE,

      sourceTeamId:
        row.sourceTeamId,

      snapshotDate:
        row.snapshotDate,

      rating:
        row.rating,

      rankingPosition:
        row.rankingPosition,

      observedAt:
        row.observedAt,

      evidence:
        row.evidence,
    }),
  );
}

async function databaseNow(
  sql:
     SqlClient,
   
    
): Promise<string> {
  const rows =
    await sql`
      SELECT
        clock_timestamp()
          AS now
    `;

  assert.equal(
    rows.length,
    1,
    "Could not read database clock.",
  );

  return iso(
    rows[0].now,
  );
}

async function loadRatingHistory(
  sql:
    SqlClient,
    

  fixture:
    SqlRow,

  availableAt:
    string,

  kickoffAt:
    string,
): Promise<{
  commonSnapshotDate:
    string | null;

  home:
    RatingHistoryRow[];

  away:
    RatingHistoryRow[];
}> {
  /*
   * The original DictazIQ mathematics compares
   * ratings from the same FootballDatabase
   * publication date.
   *
   * We therefore first locate the latest common
   * snapshot date. We never compare unrelated
   * weekly releases merely because each team has
   * some rating.
   */
  const pairRows =
    await sql`
      SELECT
        home.snapshot_date,

        home.rating
          AS home_rating,

        away.rating
          AS away_rating

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

        AND home.observed_at <=
          ${availableAt}::timestamptz

        AND away.observed_at <=
          ${availableAt}::timestamptz

        AND home.observed_at <
          ${kickoffAt}::timestamptz

        AND away.observed_at <
          ${kickoffAt}::timestamptz

        AND home.snapshot_date <=
          (
            ${availableAt}::timestamptz
            AT TIME ZONE 'UTC'
          )::date

      ORDER BY
        home.snapshot_date DESC

      LIMIT 1
    `;

  if (
    pairRows.length ===
    0
  ) {
    return {
      commonSnapshotDate:
        null,

      home: [],

      away: [],
    };
  }

  const commonSnapshotDate =
    dateOnly(
      pairRows[0]
        .snapshot_date,
    );

  /*
   * Load at most eight historical observations
   * per side ending at the common current
   * snapshot.
   *
   * The CURRENT rating for each side therefore
   * remains the common weekly rating pair.
   */
  const historyRows =
    await sql`
      SELECT *

      FROM (
        SELECT
          snapshot.id,

          snapshot.team_id,

          snapshot.source_team_id,

          snapshot.snapshot_date,

          snapshot.rating,

          snapshot.ranking_position,

          snapshot.observed_at,

          snapshot.evidence,

          row_number() OVER (
            PARTITION BY
              snapshot.team_id

            ORDER BY
              snapshot.snapshot_date DESC,
              snapshot.observed_at DESC
          ) AS history_position

        FROM public.team_rating_snapshots
          AS snapshot

        WHERE (
          snapshot.team_id =
            ${String(
              fixture.home_team_id,
            )}::uuid

          OR snapshot.team_id =
            ${String(
              fixture.away_team_id,
            )}::uuid
        )

          AND snapshot.source =
            ${RATING_SOURCE}

          AND snapshot.is_demo =
            false

          AND snapshot.snapshot_date <=
            ${commonSnapshotDate}::date

          AND snapshot.observed_at <=
            ${availableAt}::timestamptz

          AND snapshot.observed_at <
            ${kickoffAt}::timestamptz
      ) AS history

      WHERE history.history_position <=
        ${RATING_HISTORY_LIMIT}

      ORDER BY
        history.team_id,
        history.snapshot_date,
        history.observed_at
    `;

  function mapRows(
    teamId:
      string,
  ): RatingHistoryRow[] {
    return historyRows
      .filter(
        (row) =>
          String(
            row.team_id,
          ) ===
          teamId,
      )
      .map(
        (row) => ({
          id:
            String(
              row.id,
            ),

          teamId:
            String(
              row.team_id,
            ),

          sourceTeamId:
            row.source_team_id ===
              null
              ? null
              : String(
                  row.source_team_id,
                ),

          snapshotDate:
            dateOnly(
              row.snapshot_date,
            ),

          rating:
            Number(
              row.rating,
            ),

          rankingPosition:
            row.ranking_position ===
              null
              ? null
              : Number(
                  row.ranking_position,
                ),

          observedAt:
            iso(
              row.observed_at,
            ),

          evidence:
            row.evidence,
        }),
      );
  }

  const home =
    mapRows(
      String(
        fixture.home_team_id,
      ),
    );

  const away =
    mapRows(
      String(
        fixture.away_team_id,
      ),
    );

  assert.ok(
    home.length >
      0 &&
      away.length >
      0,
    "Common rating pair was found but rating histories could not be loaded.",
  );

  const currentHome =
    home[
      home.length - 1
    ];

  const currentAway =
    away[
      away.length - 1
    ];

  assert.equal(
    currentHome.snapshotDate,
    commonSnapshotDate,
    "Home rating history does not end at the common rating date.",
  );

  assert.equal(
    currentAway.snapshotDate,
    commonSnapshotDate,
    "Away rating history does not end at the common rating date.",
  );

  assert.equal(
    currentHome.rating,
    Number(
      pairRows[0]
        .home_rating,
    ),
    "Home current rating changed between pair and history queries.",
  );

  assert.equal(
    currentAway.rating,
    Number(
      pairRows[0]
        .away_rating,
    ),
    "Away current rating changed between pair and history queries.",
  );

  return {
    commonSnapshotDate,

    home,

    away,
  };
}

function loadStoredMarketEvidence(
  fixture:
    SqlRow,

  kickoffAt:
    string,
):
  LoadedMarketEvidence |
  null {
  if (
    fixture.market_evidence_id ===
      null ||
    fixture.market_evidence_id ===
      undefined
  ) {
    return null;
  }

  const evidence =
    fixture.market_evidence as
      MarketEvidenceSnapshotV02;

  validateMarketEvidenceSnapshotV02(
    evidence,
  );

  const expectedSha =
    String(
      fixture.market_evidence_sha256,
    );

  assert.equal(
    canonicalSha256(
      evidence,
    ),
    expectedSha,
    "Stored market evidence SHA-256 verification failed.",
  );

  assert.equal(
    evidence.fixtureId,
    String(
      fixture.id,
    ),
    "Stored market evidence belongs to a different fixture.",
  );

  assert.equal(
    evidence.home.teamId,
    String(
      fixture.home_team_id,
    ),
    "Stored market evidence belongs to a different home team.",
  );

  assert.equal(
    evidence.away.teamId,
    String(
      fixture.away_team_id,
    ),
    "Stored market evidence belongs to a different away team.",
  );

  /*
   * If the scheduled kickoff changed after
   * evidence capture, do not silently reuse
   * evidence frozen against a different kickoff.
   */
  if (
    timestampMs(
      evidence.kickoffAt,
    ) !==
    timestampMs(
      kickoffAt,
    )
  ) {
    console.log(
      "SCORING EVIDENCE IGNORED: stored evidence was frozen against a different kickoff.",
    );

    return null;
  }

  return {
    id:
      String(
        fixture.market_evidence_id,
      ),

    evidenceSha256:
      expectedSha,

    source:
      String(
        fixture.market_evidence_source,
      ),

    cutoffAt:
      iso(
        fixture.market_evidence_cutoff_at,
      ),

    capturedAt:
      iso(
        fixture.market_evidence_captured_at,
      ),

    evidence,
  };
}

async function main() {
  const requested =
    requestedDate();

  const persist =
    persistRequested();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * Use PostgreSQL's clock as the operational
   * time authority rather than relying on the
   * workstation clock.
   */
  const runStartedAt =
    await databaseNow(
      sql,
    );

  console.log(
    `Date: ${requested}`,
  );

  console.log(
    `Database time: ${runStartedAt}`,
  );

  console.log(
    `Mode: ${persist ? "PERSIST" : "DRY RUN"}`,
  );

  const fixtures =
    await sql`
      SELECT
        fixture.id,
        fixture.slug,
        fixture.provider,
        fixture.provider_id,
        fixture.kickoff_at,
        fixture.status,
        fixture.is_demo,
        fixture.created_at,

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

        market.evidence_sha256
          AS market_evidence_sha256,

        market.source
          AS market_evidence_source,

        market.cutoff_at
          AS market_evidence_cutoff_at,

        market.captured_at
          AS market_evidence_captured_at,

        market.evidence
          AS market_evidence

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

          AND snapshot.evidence_version =
            ${MARKET_EVIDENCE_VERSION_V02}

          AND snapshot.captured_at <=
            ${runStartedAt}::timestamptz

          AND snapshot.captured_at <
            fixture.kickoff_at

          AND snapshot.cutoff_at <
            fixture.kickoff_at

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

        /*
         * Never attempt retroactive generation.
         */
        AND fixture.kickoff_at >
          ${runStartedAt}::timestamptz

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  if (
    fixtures.length ===
    0
  ) {
    console.log(
      "No eligible future persisted fixtures found.",
    );

    return;
  }

  console.log(
    `Eligible future fixtures: ${fixtures.length}`,
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

  console.log(
    `Model: ${UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01}`,
  );

  console.log(
    `Code SHA: ${codeSha256}`,
  );

  /*
   * DRY RUN performs no INSERT.
   *
   * PERSIST registers the immutable model
   * identity first.
   */
  if (
    persist
  ) {
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

        ${UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01},

        ${MODEL_DESCRIPTION},

        ${codeSha256},

        ${JSON.stringify(
          MODEL_CONFIGURATION,
        )}::jsonb
      )

      ON CONFLICT (
        version
      )
      DO NOTHING
    `;
  }

  const modelRows =
    await sql`
      SELECT
        id,
        sport_id,
        version,
        code_sha256,
        configuration

      FROM public.model_versions

      WHERE version =
        ${UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01}
    `;

  if (
    persist
  ) {
    assert.equal(
      modelRows.length,
      1,
      "Unified model registration failed.",
    );
  }

  if (
    modelRows.length ===
    1
  ) {
    assert.equal(
      String(
        modelRows[0]
          .sport_id,
      ),
      sportId,
      "Unified model belongs to the wrong sport.",
    );

    assert.equal(
      String(
        modelRows[0]
          .code_sha256,
      ),
      codeSha256,
      "Unified model source changed under the same version. Increment the model version.",
    );

    assert.equal(
      canonicalJson(
        modelRows[0]
          .configuration,
      ),
      canonicalJson(
        MODEL_CONFIGURATION,
      ),
      "Unified model configuration changed under the same version.",
    );
  }

  let ready =
    0;

  let inserted =
    0;

  let existing =
    0;

  let skipped =
    0;

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

    /*
     * Recheck database clock for each fixture.
     * A long-running batch must never cross
     * kickoff and then continue generating.
     */
    const currentDbTime =
      await databaseNow(
        sql,
      );

    if (
      timestampMs(
        currentDbTime,
      ) >=
      timestampMs(
        kickoffAt,
      )
    ) {
      console.log(
        "SKIP: fixture reached kickoff during generation.",
      );

      skipped +=
        1;

      continue;
    }

    const ratingHistory =
      await loadRatingHistory(
        sql,
        fixture as SqlRow,
        currentDbTime,
        kickoffAt,
      );

    const marketEvidence =
      loadStoredMarketEvidence(
        fixture as SqlRow,
        kickoffAt,
      );

    /*
     * Input cutoff is the latest ACTUAL database
     * observation/capture used by this prediction.
     *
     * It is not artificially set to generation time.
     */
    const evidenceTimes: string[] = [
      iso(
        fixture.created_at,
      ),
    ];

    for (
      const snapshot
      of [
        ...ratingHistory.home,
        ...ratingHistory.away,
      ]
    ) {
      evidenceTimes.push(
        snapshot.observedAt,
      );
    }

    if (
      marketEvidence
    ) {
      evidenceTimes.push(
        marketEvidence.capturedAt,
      );
    }

    const inputCutoffAt =
      maxTimestamp(
        evidenceTimes,
      );

    assert.ok(
      timestampMs(
        inputCutoffAt,
      ) <
        timestampMs(
          kickoffAt,
        ),
      "Unified input cutoff is not pre-kickoff.",
    );

    assert.ok(
      timestampMs(
        inputCutoffAt,
      ) <=
        timestampMs(
          currentDbTime,
        ),
      "Unified input cutoff is later than the database clock.",
    );

    const asOfDate =
      inputCutoffAt.slice(
        0,
        10,
      );

    const homeScoring =
      marketEvidence
        ? {
            teamId:
              String(
                fixture.home_team_id,
              ),

            teamName:
              String(
                fixture.home_team_name,
              ),

            source:
              marketEvidence
                .evidence
                .home
                .recent
                .source,

            cutoffAt:
              marketEvidence
                .evidence
                .cutoffAt,

            sample: {
              matches:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .matches,

              goalsFor:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .goalsFor,

              goalsAgainst:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .goalsAgainst,

              scoredMatches:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .scoredMatches,

              concededMatches:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .concededMatches,

              bttsMatches:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .bttsMatches,

              over15Matches:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .over15Matches,

              over25Matches:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .over25Matches,

              over35Matches:
                marketEvidence
                  .evidence
                  .home
                  .recent
                  .over35Matches,
            },
          }
        : {
            teamId:
              String(
                fixture.home_team_id,
              ),

            teamName:
              String(
                fixture.home_team_name,
              ),

            source:
              "no-immutable-scoring-evidence",

            cutoffAt:
              inputCutoffAt,

            sample:
              zeroScoringSample(),
          };

    const awayScoring =
      marketEvidence
        ? {
            teamId:
              String(
                fixture.away_team_id,
              ),

            teamName:
              String(
                fixture.away_team_name,
              ),

            source:
              marketEvidence
                .evidence
                .away
                .recent
                .source,

            cutoffAt:
              marketEvidence
                .evidence
                .cutoffAt,

            sample: {
              matches:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .matches,

              goalsFor:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .goalsFor,

              goalsAgainst:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .goalsAgainst,

              scoredMatches:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .scoredMatches,

              concededMatches:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .concededMatches,

              bttsMatches:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .bttsMatches,

              over15Matches:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .over15Matches,

              over25Matches:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .over25Matches,

              over35Matches:
                marketEvidence
                  .evidence
                  .away
                  .recent
                  .over35Matches,
            },
          }
        : {
            teamId:
              String(
                fixture.away_team_id,
              ),

            teamName:
              String(
                fixture.away_team_name,
              ),

            source:
              "no-immutable-scoring-evidence",

            cutoffAt:
              inputCutoffAt,

            sample:
              zeroScoringSample(),
          };

    const analysisInput = {
      kickoffAt,
      inputCutoffAt,

      country:
        fixture.competition_country ===
          null
          ? null
          : String(
              fixture.competition_country,
            ),

      competitionName:
        fixture.competition_name ===
          null
          ? null
          : String(
              fixture.competition_name,
            ),

      competitionPrior:
        null,

      home: {
        teamId:
          String(
            fixture.home_team_id,
          ),

        teamName:
          String(
            fixture.home_team_name,
          ),

        asOfDate,

        snapshots:
          ratingAnalysisSnapshots(
            ratingHistory.home,
          ),
      },

      away: {
        teamId:
          String(
            fixture.away_team_id,
          ),

        teamName:
          String(
            fixture.away_team_name,
          ),

        asOfDate,

        snapshots:
          ratingAnalysisSnapshots(
            ratingHistory.away,
          ),
      },

      scoring: {
        home:
          homeScoring,

        away:
          awayScoring,
      },
    };

    const analysis =
      evaluateUnifiedMatchAnalysisV01(
        analysisInput,
      );

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

      ratingEvidence: {
        source:
          RATING_SOURCE,

        commonSnapshotDate:
          ratingHistory
            .commonSnapshotDate,

        home:
          ratingSnapshotInput(
            ratingHistory.home,
          ),

        away:
          ratingSnapshotInput(
            ratingHistory.away,
          ),
      },

      marketEvidence:
        marketEvidence
          ? {
              available:
                true,

              id:
                marketEvidence.id,

              evidenceSha256:
                marketEvidence
                  .evidenceSha256,

              source:
                marketEvidence
                  .source,

              cutoffAt:
                marketEvidence
                  .cutoffAt,

              capturedAt:
                marketEvidence
                  .capturedAt,

              evidence:
                marketEvidence
                  .evidence,
            }
          : {
              available:
                false,

              id:
                null,

              evidenceSha256:
                null,

              source:
                null,

              cutoffAt:
                null,

              capturedAt:
                null,

              evidence:
                null,
            },

      analysisInput,

      model: {
        version:
          UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,

        codeSha256,

        configuration:
          MODEL_CONFIGURATION,
      },
    };

    const inputSha256 =
      canonicalSha256(
        inputSnapshot,
      );

    const output = {
      ...analysis,

      publicationStatus:
        "draft",

      generatedFrom: {
        commonRatingSnapshotDate:
          ratingHistory
            .commonSnapshotDate,

        ratingSnapshotIds: [
          ...ratingHistory.home.map(
            (row) =>
              row.id,
          ),

          ...ratingHistory.away.map(
            (row) =>
              row.id,
          ),
        ],

        marketEvidenceSnapshotId:
          marketEvidence
            ?.id ??
          null,

        marketEvidenceSha256:
          marketEvidence
            ?.evidenceSha256 ??
          null,
      },
    };

    console.log(
      `Input cutoff: ${inputCutoffAt}`,
    );

    console.log(
      `Rating snapshot: ${ratingHistory.commonSnapshotDate ?? "NONE"}`,
    );

    console.log(
      `Rating history: home=${ratingHistory.home.length} away=${ratingHistory.away.length}`,
    );

    console.log(
      `Scoring evidence: ${marketEvidence ? "AVAILABLE" : "UNAVAILABLE"}`,
    );

    console.log(
      `FORECAST: ${analysis.forecast.toUpperCase()}`,
    );

    console.log(
      `D=${analysis.ratingGap ?? "N/A"} | confidence=${analysis.confidence} | grade=${analysis.evidenceGrade}`,
    );

    console.log(
      `Match profile: ${analysis.matchProfile}`,
    );

    console.log(
      `Scoring archetype: ${analysis.scoringArchetype}`,
    );

    console.log(
      `Coverage: ${analysis.coverage}`,
    );

    console.log(
      `Goals: ${analysis.marketEvidence.goals.signal}`,
    );

    console.log(
      `BTTS: ${analysis.marketEvidence.btts.signal}`,
    );

    console.log(
      `Input SHA: ${inputSha256}`,
    );

    ready +=
      1;

    if (
      !persist
    ) {
      console.log(
        "DRY RUN: no database prediction written.",
      );

      continue;
    }

    assert.equal(
      modelRows.length,
      1,
      "Cannot persist without registered model version.",
    );

    /*
     * Check database time once more immediately
     * before the immutable INSERT.
     */
    const beforeInsert =
      await databaseNow(
        sql,
      );

    if (
      timestampMs(
        beforeInsert,
      ) >=
      timestampMs(
        kickoffAt,
      )
    ) {
      console.log(
        "SKIP: kickoff reached before prediction INSERT.",
      );

      skipped +=
        1;

      continue;
    }

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
            modelRows[0].id,
          )}::uuid,

          false,

          ${kickoffAt}::timestamptz,

          ${inputCutoffAt}::timestamptz,

          clock_timestamp(),

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
          id,
          generated_at
      `;

    if (
      rows.length ===
      1
    ) {
      inserted +=
        1;

      console.log(
        `DRAFT INSERTED | prediction=${rows[0].id}`,
      );

      console.log(
        `Generated: ${iso(
          rows[0].generated_at,
        )}`,
      );

      continue;
    }

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
              modelRows[0].id,
            )}::uuid

          AND input_sha256 =
            ${inputSha256}

          AND input_cutoff_at =
            ${inputCutoffAt}::timestamptz

        LIMIT 1
      `;

    assert.equal(
      existingRows.length,
      1,
      "Prediction conflict occurred but existing prediction could not be reloaded.",
    );

    assert.equal(
      canonicalSha256(
        existingRows[0]
          .input_snapshot,
      ),
      inputSha256,
      "Existing unified prediction input hash failed verification.",
    );

    assert.equal(
      canonicalJson(
        existingRows[0]
          .output,
      ),
      canonicalJson(
        output,
      ),
      "Existing unified prediction output differs for identical immutable input.",
    );

    existing +=
      1;

    console.log(
      `DRAFT EXISTING | prediction=${existingRows[0].id}`,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Fixtures analysed: ${ready}`,
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

  if (
    !persist
  ) {
    console.log(
      "DRY RUN COMPLETE: database predictions were not modified.",
    );
  }
}

main().catch(
  (
    error:
      unknown,
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error.";

    console.error(
      `Unified prediction generation failed: ${message}`,
    );

    process.exitCode =
      1;
  },
);
import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  evaluateRatingGapV02,
} from "../src/lib/predictions/rating-gap-v0.2";

import {
  evaluateGoalsAndBttsV02,
} from "../src/lib/predictions/goals-btts-engine-v0.2";

import {
  buildFootballDataMarketEvidence,
  MarketEvidenceUnavailableError,
} from "../src/lib/predictions/football-data-market-evidence";

const FIXTURE_SOURCE =
  "api-football";

const HISTORY_SOURCE =
  "football-data.org";

const RATING_SOURCE =
  "footballdatabase.com";

function requestedDate():
  string {
  return (
    process.argv[2]
      ?.trim() ||
    "2026-09-09"
  );
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  const result =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      result,
    ) ||
    result <= 0
  ) {
    throw new Error(
      `${label} must be a positive integer.`,
    );
  }

  return result;
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
    "Invalid database timestamp.",
  );

  return date
    .toISOString();
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

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  const fixtures =
    await sql`
      SELECT
        fixture.id,
        fixture.provider_id,
        fixture.kickoff_at,

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

        home_history.source_team_id
          AS home_history_team_id,

        away_history.source_team_id
          AS away_history_team_id

      FROM public.fixtures
        AS fixture

      JOIN public.seasons
        AS season
        ON season.id =
          fixture.season_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away
        ON away.id =
          fixture.away_team_id

      JOIN public.team_source_mappings
        AS home_history
        ON home_history.team_id =
          home.id

        AND home_history.source =
          ${HISTORY_SOURCE}

        AND home_history.is_verified =
          true

      JOIN public.team_source_mappings
        AS away_history
        ON away_history.team_id =
          away.id

        AND away_history.source =
          ${HISTORY_SOURCE}

        AND away_history.is_verified =
          true

      WHERE fixture.provider =
        ${FIXTURE_SOURCE}

        AND fixture.is_demo =
          false

        AND fixture.status =
          'scheduled'

        AND DATE(
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        ) =
          ${date}::date

      ORDER BY
        fixture.kickoff_at ASC
    `;

  console.log(
    `Real persisted fixtures: ${fixtures.length}`,
  );

  for (
    const fixture
    of fixtures
  ) {
    const kickoffAt =
      iso(
        fixture.kickoff_at,
      );

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home_team_name} vs ${fixture.away_team_name}`,
    );

    console.log(
      `API fixture: ${fixture.provider_id}`,
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
        "SKIP: fixture kickoff has passed.",
      );

      continue;
    }

    let evidence;

    try {
      evidence =
        await buildFootballDataMarketEvidence({
          fixtureId:
            String(
              fixture.id,
            ),

          kickoffAt,

          seasonYear:
            positiveInteger(
              fixture.season_label,
              "Season",
            ),

          home: {
            canonicalTeamId:
              String(
                fixture.home_team_id,
              ),

            canonicalName:
              String(
                fixture.home_team_name,
              ),

            footballDataTeamId:
              positiveInteger(
                fixture.home_history_team_id,
                "Home football-data.org team ID",
              ),
          },

          away: {
            canonicalTeamId:
              String(
                fixture.away_team_id,
              ),

            canonicalName:
              String(
                fixture.away_team_name,
              ),

            footballDataTeamId:
              positiveInteger(
                fixture.away_history_team_id,
                "Away football-data.org team ID",
              ),
          },
        });
    } catch (
      error
    ) {
      if (
        error instanceof
        MarketEvidenceUnavailableError
      ) {
        console.log(
          "MARKETS: NO PICK",
        );

        console.log(
          `Reason: ${error.message}`,
        );

        continue;
      }

      throw error;
    }

    const ratingRows =
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
            ${evidence.cutoffAt}::timestamptz

          AND away.observed_at <=
            ${evidence.cutoffAt}::timestamptz

        ORDER BY
          home.snapshot_date
          DESC

        LIMIT 1
      `;

    assert.equal(
      ratingRows.length,
      1,
      "Comparable rating pair missing.",
    );

    const rating =
      ratingRows[0];

    const ratingResult =
      evaluateRatingGapV02({
        home: {
          rating:
            Number(
              rating.home_rating,
            ),

          source:
            RATING_SOURCE,

          snapshotDate:
            dateOnly(
              rating.snapshot_date,
            ),
        },

        away: {
          rating:
            Number(
              rating.away_rating,
            ),

          source:
            RATING_SOURCE,

          snapshotDate:
            dateOnly(
              rating.snapshot_date,
            ),
        },
      });

    const markets =
      evaluateGoalsAndBttsV02({
        evidence,

        ratingMismatchCandidate:
          ratingResult
            .markets
            .goals
            .ratingMismatchCandidate,
      });

    console.log(
      `Rating gap: ${ratingResult.ratingGap}`,
    );

    console.log(
      `Result signal: ${ratingResult.resultSignal}`,
    );

    console.log(
      `Mismatch candidate: ${ratingResult.markets.goals.ratingMismatchCandidate}`,
    );

    console.log("");

    console.log(
      `HOME ${evidence.home.teamName}`,
    );

    console.log(
      `Recent: ${evidence.home.recent.matches}`,
    );

    console.log(
      `GF-GA: ${evidence.home.recent.goalsFor}-${evidence.home.recent.goalsAgainst}`,
    );

    console.log(
      `BTTS: ${evidence.home.recent.bttsMatches}/${evidence.home.recent.matches}`,
    );

    console.log(
      `O2.5: ${evidence.home.recent.over25Matches}/${evidence.home.recent.matches}`,
    );

    console.log("");

    console.log(
      `AWAY ${evidence.away.teamName}`,
    );

    console.log(
      `Recent: ${evidence.away.recent.matches}`,
    );

    console.log(
      `GF-GA: ${evidence.away.recent.goalsFor}-${evidence.away.recent.goalsAgainst}`,
    );

    console.log(
      `BTTS: ${evidence.away.recent.bttsMatches}/${evidence.away.recent.matches}`,
    );

    console.log(
      `O2.5: ${evidence.away.recent.over25Matches}/${evidence.away.recent.matches}`,
    );

    console.log("");

    console.log(
      `O1.5: ${markets.goals15.status} / ${markets.goals15.selection}`,
    );

    console.log(
      `O2.5: ${markets.goals25.status} / ${markets.goals25.selection}`,
    );

    console.log(
      `O3.5: ${markets.goals35.status} / ${markets.goals35.selection}`,
    );

    console.log(
      `BTTS: ${markets.btts.status} / ${markets.btts.selection}`,
    );

    console.log("");

    console.log(
      "O2.5 support:",
      markets
        .goals25
        .supportingSignals,
    );

    console.log(
      "O2.5 opposition:",
      markets
        .goals25
        .opposingSignals,
    );

    console.log(
      "BTTS support:",
      markets
        .btts
        .supportingSignals,
    );

    console.log(
      "BTTS opposition:",
      markets
        .btts
        .opposingSignals,
    );
  }
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
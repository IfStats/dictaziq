import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";

import {
  evaluateRatingGap,
} from "../src/lib/predictions/rating-gap";

const SOURCE =
  "footballdatabase.com";

type ResolvedTeam = {
  teamId: string;
  teamName: string;
  sourceTeamId: string;
  sourceName: string;
  country: string | null;
};

function dateOnly(
  value: unknown,
): string {
  if (typeof value === "string") {
    const match =
      /^(\d{4}-\d{2}-\d{2})/.exec(
        value,
      );

    if (match) {
      return match[1];
    }
  }

  const parsed =
    new Date(String(value));

  assert.ok(
    Number.isFinite(
      parsed.getTime(),
    ),
    "Database returned an invalid snapshot date.",
  );

  return parsed
    .toISOString()
    .slice(0, 10);
}

async function main() {
  const homeQuery =
    process.argv[2]?.trim();

  const awayQuery =
    process.argv[3]?.trim();

  if (
    !homeQuery ||
    !awayQuery
  ) {
    throw new Error(
      [
        "Two FootballDatabase team names are required.",
        "",
        "Example:",
        'npm run analyze:rating-gap -- "Arsenal" "Manchester City"',
      ].join("\n"),
    );
  }

  const client =
    neon(getDatabaseUrl());

  async function resolveTeam(
    query: string,
  ): Promise<ResolvedTeam> {
    /*
     * Resolve through the source mapping rather than
     * depending only on the canonical team name.
     *
     * This keeps the analysis compatible with future
     * aliases/manual remaps.
     */
    const rows =
      await client`
        SELECT
          team.id
            AS team_id,

          team.name
            AS team_name,

          team.country,

          mapping.source_team_id,

          mapping.source_name

        FROM public.team_source_mappings
          AS mapping

        JOIN public.teams
          AS team
          ON team.id =
            mapping.team_id

        WHERE mapping.source =
          ${SOURCE}

          AND (
            lower(
              trim(
                mapping.source_name
              )
            ) =
              lower(
                trim(
                  ${query}
                )
              )

            OR lower(
              trim(
                team.name
              )
            ) =
              lower(
                trim(
                  ${query}
                )
              )

            OR lower(
              trim(
                mapping.source_team_id
              )
            ) =
              lower(
                trim(
                  ${query}
                )
              )
          )
      `;

    if (
      rows.length === 0
    ) {
      throw new Error(
        `FootballDatabase team was not found in DictazIQ: ${query}`,
      );
    }

    if (
      rows.length > 1
    ) {
      throw new Error(
        `FootballDatabase team lookup is ambiguous: ${query}`,
      );
    }

    const row =
      rows[0];

    return {
      teamId:
        String(
          row.team_id,
        ),

      teamName:
        String(
          row.team_name,
        ),

      sourceTeamId:
        String(
          row.source_team_id,
        ),

      sourceName:
        String(
          row.source_name,
        ),

      country:
        row.country === null
          ? null
          : String(
              row.country,
            ),
    };
  }

  const home =
    await resolveTeam(
      homeQuery,
    );

  const away =
    await resolveTeam(
      awayQuery,
    );

  assert.notEqual(
    home.teamId,
    away.teamId,
    "Home and away teams must be different.",
  );

  /*
   * Select the newest snapshot date available
   * for BOTH teams from the SAME source.
   *
   * Never compare ratings from different weeks.
   */
  const ratingPairs =
    await client`
      SELECT
        home_rating.id
          AS home_snapshot_id,

        home_rating.rating
          AS home_rating,

        home_rating.ranking_position
          AS home_ranking_position,

        home_rating.snapshot_date,

        home_rating.observed_at
          AS home_observed_at,

        away_rating.id
          AS away_snapshot_id,

        away_rating.rating
          AS away_rating,

        away_rating.ranking_position
          AS away_ranking_position,

        away_rating.observed_at
          AS away_observed_at

      FROM public.team_rating_snapshots
        AS home_rating

      JOIN public.team_rating_snapshots
        AS away_rating

        ON away_rating.source =
          home_rating.source

        AND away_rating.snapshot_date =
          home_rating.snapshot_date

      WHERE home_rating.team_id =
        ${home.teamId}::uuid

        AND away_rating.team_id =
          ${away.teamId}::uuid

        AND home_rating.source =
          ${SOURCE}

        AND home_rating.is_demo =
          false

        AND away_rating.is_demo =
          false

      ORDER BY
        home_rating.snapshot_date DESC

      LIMIT 1
    `;

  assert.equal(
    ratingPairs.length,
    1,
    `No common FootballDatabase rating snapshot exists for ${home.teamName} and ${away.teamName}.`,
  );

  const pair =
    ratingPairs[0];

  const snapshotDate =
    dateOnly(
      pair.snapshot_date,
    );

  const homeRating =
    Number(
      pair.home_rating,
    );

  const awayRating =
    Number(
      pair.away_rating,
    );

  assert.ok(
    Number.isInteger(
      homeRating,
    ),
    "Home rating is invalid.",
  );

  assert.ok(
    Number.isInteger(
      awayRating,
    ),
    "Away rating is invalid.",
  );

  const result =
    evaluateRatingGap({
      home: {
        rating:
          homeRating,

        source:
          SOURCE,

        snapshotDate,
      },

      away: {
        rating:
          awayRating,

        source:
          SOURCE,

        snapshotDate,
      },
    });

  /*
   * Independent arithmetic verification.
   */
  assert.equal(
    result.ratingGap,
    homeRating -
      awayRating,
    "Rating-gap engine returned an incorrect difference.",
  );

  console.log(
    "PASS: real FootballDatabase teams resolved through canonical mappings.",
  );

  console.log(
    "PASS: latest common weekly snapshot selected.",
  );

  console.log(
    "PASS: real ratings loaded from immutable Neon snapshots.",
  );

  console.log(
    "PASS: DictazIQ rating-gap model evaluated real source data.",
  );

  console.log("");

  console.log(
    `Source: ${SOURCE}`,
  );

  console.log(
    `Snapshot date: ${snapshotDate}`,
  );

  console.log("");

  console.log(
    `HOME: ${home.teamName}${home.country ? ` (${home.country})` : ""}`,
  );

  console.log(
    `World rank: ${pair.home_ranking_position}`,
  );

  console.log(
    `Rating: ${homeRating}`,
  );

  console.log(
    `Snapshot ID: ${pair.home_snapshot_id}`,
  );

  console.log("");

  console.log(
    `AWAY: ${away.teamName}${away.country ? ` (${away.country})` : ""}`,
  );

  console.log(
    `World rank: ${pair.away_ranking_position}`,
  );

  console.log(
    `Rating: ${awayRating}`,
  );

  console.log(
    `Snapshot ID: ${pair.away_snapshot_id}`,
  );

  console.log("");

  console.log(
    `D = Home - Away`,
  );

  console.log(
    `D = ${homeRating} - ${awayRating}`,
  );

  console.log(
    `D = ${result.ratingGap}`,
  );

  console.log("");

  console.log(
    `Absolute gap: ${result.absoluteGap}`,
  );

  console.log(
    `Higher-rated team: ${result.higherRatedTeam}`,
  );

  console.log(
    `Signal: ${result.signal}`,
  );

  console.log(
    `Standalone selection: ${result.standaloneSelection}`,
  );

  console.log(
    `Over 2.5 signal: ${result.over25Signal}`,
  );

  console.log(
    `Requires context: ${result.requiresContext}`,
  );

  console.log("");

  console.log(
    `Model: ${result.modelVersion}`,
  );

  console.log(
    `Validation status: ${result.validationStatus}`,
  );

  console.log("");

  console.log(
    "NOTE: this is a real FootballDatabase rating signal, but the DictazIQ heuristic remains experimental and is not yet a calibrated probability.",
  );
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Real rating-gap verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Real rating-gap analysis failed: ${error.message}`
          : "Real rating-gap analysis failed.",
      );
    }

    process.exitCode = 1;
  },
);
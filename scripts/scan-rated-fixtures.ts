import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";

import {
  fetchFixturesByDate,
} from "../src/providers/api-football/client";

import type {
  NormalizedApiFootballFixture,
} from "../src/providers/api-football/types";

import {
  evaluateRatingGap,
} from "../src/lib/predictions/rating-gap";

const FOOTBALL_DATABASE_SOURCE =
  "footballdatabase.com";

const API_FOOTBALL_SOURCE =
  "api-football";

/*
 * We must never generate a pre-match signal for
 * a fixture that has already started.
 */
const PREMATCH_STATUSES =
  new Set([
    "NS",
    "TBD",
  ]);

type RatedTeam = {
  teamId: string;

  canonicalName: string;

  sourceName: string;
  sourceTeamId: string;

  country: string | null;

  rating: number;
  rankingPosition: number;

  snapshotDate: string;
};

type ResolutionMethod =
  | "existing"
  | "exact"
  | "conservative";

type ResolvedFixtureTeam = {
  apiTeamId: number;
  apiTeamName: string;

  ratedTeam: RatedTeam;

  method: ResolutionMethod;
};

type ResolutionResult =
  | {
      status: "resolved";
      value: ResolvedFixtureTeam;
    }
  | {
      status:
        | "unmatched"
        | "ambiguous"
        | "mapped_without_rating";

      apiTeamId: number;
      apiTeamName: string;
    };

function requestedDate(): string {
  const argument =
    process.argv[2]?.trim();

  if (argument) {
    return argument;
  }

  return "2026-09-09";
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

  const parsed =
    new Date(String(value));

  assert.ok(
    Number.isFinite(
      parsed.getTime(),
    ),
    "Database returned an invalid date.",
  );

  return parsed
    .toISOString()
    .slice(0, 10);
}

/*
 * Normalized exact identity.
 *
 * Diacritics and punctuation do not make two
 * football names fundamentally different:
 *
 * Atlético Madrid -> atletico madrid
 * Bodø / Glimt    -> bodø glimt
 */
function normalizeName(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /&/g,
      " and ",
    )
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

/*
 * Conservative second-stage matching.
 *
 * Only generic club markers are removed.
 * This is NOT fuzzy matching.
 *
 * Examples:
 *
 * Chelsea FC      -> chelsea
 * Liverpool FC    -> liverpool
 * AFC Bournemouth -> bournemouth
 * Brentford FC    -> brentford
 *
 * We still require the resulting identity to be
 * unique among FootballDatabase-rated teams.
 */
function conservativeName(
  value: string,
): string {
  const tokens =
    normalizeName(value)
      .split(" ")
      .filter(Boolean);

  const generic =
    new Set([
      "fc",
      "afc",
      "cf",
      "sc",
      "ac",
      "ssc",
      "fk",
      "sk",
    ]);

  while (
    tokens.length > 1 &&
    generic.has(tokens[0])
  ) {
    tokens.shift();
  }

  while (
    tokens.length > 1 &&
    generic.has(
      tokens[
        tokens.length - 1
      ],
    )
  ) {
    tokens.pop();
  }

  return tokens.join(" ");
}

async function main() {
  const date =
    requestedDate();

  const client =
    neon(getDatabaseUrl());

  console.log(
    `Loading API-Football fixtures for ${date}...`,
  );

  const fixturePage =
    await fetchFixturesByDate(
      date,
    );

  /*
   * Determine the newest real FootballDatabase
   * ranking snapshot currently available.
   */
  const snapshotRows =
    await client`
      SELECT
        max(snapshot_date)
          AS snapshot_date

      FROM public.team_rating_snapshots

      WHERE source =
        ${FOOTBALL_DATABASE_SOURCE}

        AND is_demo =
          false
    `;

  assert.equal(
    snapshotRows.length,
    1,
  );

  assert.ok(
    snapshotRows[0]
      .snapshot_date,
    "No real FootballDatabase rating snapshot exists.",
  );

  const snapshotDate =
    dateOnly(
      snapshotRows[0]
        .snapshot_date,
    );

  /*
   * Load the canonical DictazIQ teams that have a
   * FootballDatabase rating for this exact snapshot.
   */
  const ratingRows =
    await client`
      SELECT
        team.id
          AS team_id,

        team.name
          AS canonical_name,

        team.country,

        mapping.source_name,
        mapping.source_team_id,

        rating.rating,
        rating.ranking_position,
        rating.snapshot_date

      FROM public.team_rating_snapshots
        AS rating

      JOIN public.teams
        AS team
        ON team.id =
          rating.team_id

      JOIN public.team_source_mappings
        AS mapping
        ON mapping.team_id =
          team.id

        AND mapping.source =
          ${FOOTBALL_DATABASE_SOURCE}

        AND mapping.source_team_id =
          rating.source_team_id

      WHERE rating.source =
        ${FOOTBALL_DATABASE_SOURCE}

        AND rating.snapshot_date =
          ${snapshotDate}::date

        AND rating.is_demo =
          false
    `;

  const ratedTeams:
    RatedTeam[] =
      ratingRows.map(
        (row) => ({
          teamId:
            String(
              row.team_id,
            ),

          canonicalName:
            String(
              row.canonical_name,
            ),

          sourceName:
            String(
              row.source_name,
            ),

          sourceTeamId:
            String(
              row.source_team_id,
            ),

          country:
            row.country ===
            null
              ? null
              : String(
                  row.country,
                ),

          rating:
            Number(
              row.rating,
            ),

          rankingPosition:
            Number(
              row.ranking_position,
            ),

          snapshotDate:
            dateOnly(
              row.snapshot_date,
            ),
        }),
      );

  assert.ok(
    ratedTeams.length > 0,
    "No FootballDatabase-rated teams were loaded.",
  );

  /*
   * Existing API-Football mappings always take
   * precedence over name matching.
   */
  const apiMappingRows =
    await client`
      SELECT
        source_team_id,
        team_id

      FROM public.team_source_mappings

      WHERE source =
        ${API_FOOTBALL_SOURCE}
    `;

  const apiMappingBySourceId =
    new Map<
      string,
      string
    >();

  for (
    const mapping
    of apiMappingRows
  ) {
    apiMappingBySourceId.set(
      String(
        mapping.source_team_id,
      ),
      String(
        mapping.team_id,
      ),
    );
  }

  const ratedByTeamId =
    new Map<
      string,
      RatedTeam
    >();

  for (
    const team
    of ratedTeams
  ) {
    ratedByTeamId.set(
      team.teamId,
      team,
    );
  }

  function uniqueCandidate(
    candidates:
      RatedTeam[],
  ): RatedTeam | null {
    const identities =
      new Map<
        string,
        RatedTeam
      >();

    for (
      const candidate
      of candidates
    ) {
      identities.set(
        candidate.teamId,
        candidate,
      );
    }

    if (
      identities.size !== 1
    ) {
      return null;
    }

    return [
      ...identities.values(),
    ][0];
  }

  function resolveTeam(
    apiTeamId: number,
    apiTeamName: string,
  ): ResolutionResult {
    /*
     * 1. Existing reviewed/persisted source mapping.
     */
    const mappedTeamId =
      apiMappingBySourceId.get(
        String(apiTeamId),
      );

    if (
      mappedTeamId
    ) {
      const rated =
        ratedByTeamId.get(
          mappedTeamId,
        );

      if (!rated) {
        return {
          status:
            "mapped_without_rating",

          apiTeamId,
          apiTeamName,
        };
      }

      return {
        status: "resolved",

        value: {
          apiTeamId,
          apiTeamName,

          ratedTeam:
            rated,

          method:
            "existing",
        },
      };
    }

    /*
     * 2. Exact normalized name.
     */
    const normalized =
      normalizeName(
        apiTeamName,
      );

    const exact =
      ratedTeams.filter(
        (team) =>
          normalizeName(
            team.canonicalName,
          ) === normalized ||
          normalizeName(
            team.sourceName,
          ) === normalized,
      );

    const exactCandidate =
      uniqueCandidate(
        exact,
      );

    if (
      exactCandidate
    ) {
      return {
        status: "resolved",

        value: {
          apiTeamId,
          apiTeamName,

          ratedTeam:
            exactCandidate,

          method:
            "exact",
        },
      };
    }

    if (
      exact.length > 1
    ) {
      return {
        status:
          "ambiguous",

        apiTeamId,
        apiTeamName,
      };
    }

    /*
     * 3. Conservative club-marker normalization.
     *
     * Still no fuzzy matching.
     */
    const conservative =
      conservativeName(
        apiTeamName,
      );

    const candidates =
      ratedTeams.filter(
        (team) =>
          conservativeName(
            team.canonicalName,
          ) ===
            conservative ||
          conservativeName(
            team.sourceName,
          ) ===
            conservative,
      );

    const candidate =
      uniqueCandidate(
        candidates,
      );

    if (
      candidate
    ) {
      return {
        status: "resolved",

        value: {
          apiTeamId,
          apiTeamName,

          ratedTeam:
            candidate,

          method:
            "conservative",
        },
      };
    }

    if (
      candidates.length > 1
    ) {
      return {
        status:
          "ambiguous",

        apiTeamId,
        apiTeamName,
      };
    }

    return {
      status:
        "unmatched",

      apiTeamId,
      apiTeamName,
    };
  }

  const prematchFixtures =
    fixturePage.fixtures.filter(
      (fixture) =>
        PREMATCH_STATUSES.has(
          fixture.status.short,
        ),
    );

  const ratedFixtures:
    Array<{
      fixture: NormalizedApiFootballFixture;

      home: ResolvedFixtureTeam;
      away: ResolvedFixtureTeam;

      ratingGap:
        ReturnType<
          typeof evaluateRatingGap
        >;
    }> = [];

  const unresolvedRatedCandidates =
    new Map<
      string,
      {
        id: number;
        name: string;
        status: string;
      }
    >();

  for (
    const fixture
    of prematchFixtures
  ) {
    const home =
      resolveTeam(
        fixture.home.id,
        fixture.home.name,
      );

    const away =
      resolveTeam(
        fixture.away.id,
        fixture.away.name,
      );

    if (
      home.status ===
        "resolved" &&
      away.status ===
        "resolved"
    ) {
      /*
       * Rating comparison must use the same
       * FootballDatabase snapshot date.
       */
      assert.equal(
        home.value
          .ratedTeam
          .snapshotDate,
        away.value
          .ratedTeam
          .snapshotDate,
        "Fixture teams use different rating snapshot dates.",
      );

      const result =
        evaluateRatingGap({
          home: {
            rating:
              home.value
                .ratedTeam
                .rating,

            source:
              FOOTBALL_DATABASE_SOURCE,

            snapshotDate:
              home.value
                .ratedTeam
                .snapshotDate,
          },

          away: {
            rating:
              away.value
                .ratedTeam
                .rating,

            source:
              FOOTBALL_DATABASE_SOURCE,

            snapshotDate:
              away.value
                .ratedTeam
                .snapshotDate,
          },
        });

      ratedFixtures.push({
        fixture,

        home:
          home.value,

        away:
          away.value,

        ratingGap:
          result,
      });

      continue;
    }

    /*
     * Keep a concise review list rather than print
     * hundreds of unrelated lower-ranked clubs.
     *
     * A team gets reported when its normalized name
     * resembles one of our rated teams but did not
     * resolve safely.
     */
    for (
      const result
      of [home, away]
    ) {
      if (
        result.status ===
        "resolved"
      ) {
        continue;
      }

      const core =
        conservativeName(
          result.apiTeamName,
        );

      const possiblyRated =
        ratedTeams.some(
          (team) =>
            conservativeName(
              team.canonicalName,
            ).includes(
              core,
            ) ||
            core.includes(
              conservativeName(
                team.canonicalName,
              ),
            ),
        );

      if (
        possiblyRated
      ) {
        unresolvedRatedCandidates.set(
          String(
            result.apiTeamId,
          ),
          {
            id:
              result.apiTeamId,

            name:
              result.apiTeamName,

            status:
              result.status,
          },
        );
      }
    }
  }

  console.log("");

  console.log(
    "PASS: API-Football fixtures loaded.",
  );

  console.log(
    "PASS: only pre-match fixtures considered.",
  );

  console.log(
    "PASS: FootballDatabase-rated teams loaded from immutable Neon snapshots.",
  );

  console.log(
    "PASS: provider mapping takes precedence over name matching.",
  );

  console.log(
    "PASS: no fuzzy mappings were written.",
  );

  console.log(
    "PASS: real rating-gap model evaluated automatically matched fixtures.",
  );

  console.log("");

  console.log(
    `Fixture date: ${date}`,
  );

  console.log(
    `API-Football fixtures: ${fixturePage.fixtures.length}`,
  );

  console.log(
    `Pre-match fixtures: ${prematchFixtures.length}`,
  );

  console.log(
    `FootballDatabase snapshot: ${snapshotDate}`,
  );

  console.log(
    `Rated teams available: ${ratedTeams.length}`,
  );

  console.log(
    `Fully rated pre-match fixtures: ${ratedFixtures.length}`,
  );

  console.log("");

  if (
    ratedFixtures.length === 0
  ) {
    console.log(
      "No pre-match fixture currently has both teams safely resolved to the available FootballDatabase top-50 snapshot.",
    );
  } else {
    console.log(
      "REAL DICTAZIQ RATING-GAP SHORTLIST",
    );

    console.log(
      "=================================",
    );

    console.log("");

    for (
      const item
      of ratedFixtures
    ) {
      const {
        fixture,
        home,
        away,
        ratingGap,
      } = item;

      console.log(
        `${fixture.kickoffAt.slice(
          11,
          16,
        )} UTC | ${fixture.home.name} vs ${fixture.away.name}`,
      );

      console.log(
        `${fixture.league.name} | ${fixture.league.country}`,
      );

      console.log(
        `Fixture ID: ${fixture.fixtureId}`,
      );

      console.log(
        `Home mapping: ${home.method} | API ${home.apiTeamId} -> ${home.ratedTeam.canonicalName}`,
      );

      console.log(
        `Away mapping: ${away.method} | API ${away.apiTeamId} -> ${away.ratedTeam.canonicalName}`,
      );

      console.log(
        `Ratings: ${home.ratedTeam.rating} - ${away.ratedTeam.rating}`,
      );

      console.log(
        `World ranks: ${home.ratedTeam.rankingPosition} - ${away.ratedTeam.rankingPosition}`,
      );

      console.log(
        `D = ${ratingGap.ratingGap}`,
      );

      console.log(
        `Absolute gap = ${ratingGap.absoluteGap}`,
      );

      console.log(
        `Signal = ${ratingGap.signal}`,
      );

      console.log(
        `Selection = ${ratingGap.standaloneSelection}`,
      );

      console.log(
        `Over 2.5 = ${ratingGap.over25Signal}`,
      );

      console.log(
        `Requires context = ${ratingGap.requiresContext}`,
      );

      console.log("");
    }
  }

  if (
    unresolvedRatedCandidates.size >
    0
  ) {
    console.log(
      "POSSIBLE MAPPING REVIEW",
    );

    console.log(
      "=======================",
    );

    console.log("");

    for (
      const candidate
      of unresolvedRatedCandidates.values()
    ) {
      console.log(
        `${candidate.id} | ${candidate.name} | ${candidate.status}`,
      );
    }

    console.log("");
  }

  console.log(
    "NOTE: dry run only. No API-Football team mappings or fixtures were written to Neon.",
  );
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Rated fixture scan verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Rated fixture scan failed: ${error.message}`
          : "Rated fixture scan failed.",
      );
    }

    process.exitCode = 1;
  },
);
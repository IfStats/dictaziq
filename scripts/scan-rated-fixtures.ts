import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  evaluatePredictionScope,
  PREDICTION_SCOPE_VERSION,
} from "../src/lib/predictions/prediction-scope";

import {
  evaluateRatingGapV02,
} from "../src/lib/predictions/rating-gap-v0.2";

import {
  fetchFixturesByDate,
} from "../src/providers/api-football/client";

import type {
  NormalizedApiFootballFixture,
} from "../src/providers/api-football/types";

const FOOTBALL_DATABASE_SOURCE =
  "footballdatabase.com";

const API_FOOTBALL_SOURCE =
  "api-football";

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

  country:
    string | null;

  rating: number;

  rankingPosition:
    number;

  snapshotDate:
    string;
};

type ResolutionMethod =
  | "verified_mapping"
  | "exact_candidate"
  | "conservative_candidate";

type ResolvedFixtureTeam = {
  apiTeamId:
    number;

  apiTeamName:
    string;

  ratedTeam:
    RatedTeam;

  method:
    ResolutionMethod;

  verified:
    boolean;
};

type ResolutionFailureStatus =
  | "unmatched"
  | "ambiguous"
  | "mapped_without_rating";

type ResolutionResult =
  | {
      status:
        "resolved";

      value:
        ResolvedFixtureTeam;
    }
  | {
      status:
        ResolutionFailureStatus;

      apiTeamId:
        number;

      apiTeamName:
        string;
    };

type RatedFixture = {
  fixture:
    NormalizedApiFootballFixture;

  home:
    ResolvedFixtureTeam;

  away:
    ResolvedFixtureTeam;

  ratingGap:
    ReturnType<
      typeof evaluateRatingGapV02
    >;

  verifiedProviderChain:
    boolean;
};

type MappingReviewItem = {
  apiTeamId:
    number;

  apiTeamName:
    string;

  candidateName:
    string | null;

  method:
    ResolutionMethod | null;

  status:
    "candidate" |
    ResolutionFailureStatus;
};

function requestedDate():
  string {
  const argument =
    process.argv[2]?.trim();

  const value =
    argument ||
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

  assert.ok(
    Number.isFinite(
      parsed.getTime(),
    ) &&
      parsed
        .toISOString()
        .slice(
          0,
          10,
        ) === value,
    "Invalid fixture date.",
  );

  return value;
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

  const parsed =
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
      parsed.getTime(),
    ),
    "Database returned an invalid date.",
  );

  return parsed
    .toISOString()
    .slice(
      0,
      10,
    );
}

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
 * Conservative identity normalization.
 *
 * This is NOT fuzzy matching.
 *
 * Only generic club designators are removed.
 */
function conservativeName(
  value: string,
): string {
  const tokens =
    normalizeName(
      value,
    )
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
      "club",
    ]);

  while (
    tokens.length >
      1 &&
    generic.has(
      tokens[0],
    )
  ) {
    tokens.shift();
  }

  while (
    tokens.length >
      1 &&
    generic.has(
      tokens[
        tokens.length -
          1
      ],
    )
  ) {
    tokens.pop();
  }

  return tokens.join(
    " ",
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
    identities.size !==
    1
  ) {
    return null;
  }

  return [
    ...identities.values(),
  ][0];
}

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    `Loading API-Football fixtures for ${date}...`,
  );

  console.log(
    `Prediction scope: ${PREDICTION_SCOPE_VERSION}`,
  );

  const fixturePage =
    await fetchFixturesByDate(
      date,
    );

  /*
   * Never use a rating snapshot later than the
   * fixture date.
   *
   * This keeps retrospective evaluation safe from
   * future-rating leakage.
   */
  const snapshotRows =
    await sql`
      SELECT
        max(snapshot_date)
          AS snapshot_date

      FROM public.team_rating_snapshots

      WHERE source =
        ${FOOTBALL_DATABASE_SOURCE}

        AND is_demo =
          false

        AND snapshot_date <=
          ${date}::date
    `;

  assert.equal(
    snapshotRows.length,
    1,
  );

  assert.ok(
    snapshotRows[0]
      .snapshot_date,
    `No real FootballDatabase rating snapshot exists on or before ${date}.`,
  );

  const snapshotDate =
    dateOnly(
      snapshotRows[0]
        .snapshot_date,
    );

  /*
   * Load every canonical team carrying a rating
   * on the selected immutable weekly snapshot.
   */
  const ratingRows =
    await sql`
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

        AND team.is_demo =
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
            row
              .canonical_name,
          ),

        sourceName:
          String(
            row.source_name,
          ),

        sourceTeamId:
          String(
            row
              .source_team_id,
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
            row
              .ranking_position,
          ),

        snapshotDate:
          dateOnly(
            row
              .snapshot_date,
          ),
      }),
    );

  assert.ok(
    ratedTeams.length >
      0,
    "No FootballDatabase-rated teams were loaded.",
  );

  /*
   * Only VERIFIED API-Football mappings count as
   * persisted provider identity.
   *
   * Exact/conservative name resolution below is
   * strictly read-only candidate discovery.
   */
  const apiMappingRows =
    await sql`
      SELECT
        source_team_id,
        team_id

      FROM public.team_source_mappings

      WHERE source =
        ${API_FOOTBALL_SOURCE}

        AND is_verified =
          true
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
    const sourceId =
      String(
        mapping
          .source_team_id,
      );

    assert.ok(
      !apiMappingBySourceId.has(
        sourceId,
      ),
      `Duplicate verified API-Football identity ${sourceId}.`,
    );

    apiMappingBySourceId.set(
      sourceId,
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

  function resolveTeam(
    apiTeamId: number,
    apiTeamName: string,
  ): ResolutionResult {
    /*
     * 1. Verified persisted source mapping.
     */
    const mappedTeamId =
      apiMappingBySourceId.get(
        String(
          apiTeamId,
        ),
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
        status:
          "resolved",

        value: {
          apiTeamId,
          apiTeamName,

          ratedTeam:
            rated,

          method:
            "verified_mapping",

          verified:
            true,
        },
      };
    }

    /*
     * 2. Exact normalized identity.
     *
     * Candidate discovery only.
     * No DB write occurs here.
     */
    const normalized =
      normalizeName(
        apiTeamName,
      );

    const exactMatches =
      ratedTeams.filter(
        (team) =>
          normalizeName(
            team
              .canonicalName,
          ) ===
            normalized ||
          normalizeName(
            team.sourceName,
          ) ===
            normalized,
      );

    const exactCandidate =
      uniqueCandidate(
        exactMatches,
      );

    if (
      exactCandidate
    ) {
      return {
        status:
          "resolved",

        value: {
          apiTeamId,
          apiTeamName,

          ratedTeam:
            exactCandidate,

          method:
            "exact_candidate",

          verified:
            false,
        },
      };
    }

    if (
      exactMatches.length >
      1
    ) {
      return {
        status:
          "ambiguous",

        apiTeamId,
        apiTeamName,
      };
    }

    /*
     * 3. Conservative identity.
     *
     * Still no fuzzy matching and no writes.
     */
    const conservative =
      conservativeName(
        apiTeamName,
      );

    const conservativeMatches =
      ratedTeams.filter(
        (team) =>
          conservativeName(
            team
              .canonicalName,
          ) ===
            conservative ||
          conservativeName(
            team.sourceName,
          ) ===
            conservative,
      );

    const candidate =
      uniqueCandidate(
        conservativeMatches,
      );

    if (
      candidate
    ) {
      return {
        status:
          "resolved",

        value: {
          apiTeamId,
          apiTeamName,

          ratedTeam:
            candidate,

          method:
            "conservative_candidate",

          verified:
            false,
        },
      };
    }

    if (
      conservativeMatches
        .length >
      1
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

  const now =
    Date.now();

  let providerPrematch =
    0;

  let futurePrematch =
    0;

  let scopeEligible =
    0;

  let excludedYouth =
    0;

  let excludedWomen =
    0;

  let excludedReserve =
    0;

  let excludedAcademy =
    0;

  const ratedFixtures:
    RatedFixture[] = [];

  const mappingReview =
    new Map<
      number,
      MappingReviewItem
    >();

  for (
    const fixture
    of fixturePage.fixtures
  ) {
    if (
      !PREMATCH_STATUSES.has(
        fixture.status.short,
      )
    ) {
      continue;
    }

    providerPrematch +=
      1;

    const kickoffMs =
      Date.parse(
        fixture.kickoffAt,
      );

    if (
      !Number.isFinite(
        kickoffMs,
      ) ||
      kickoffMs <= now
    ) {
      continue;
    }

    futurePrematch +=
      1;

    /*
     * DictazIQ Core v1 population gate.
     *
     * Exclude youth, women, reserve and academy
     * football BEFORE identity resolution.
     */
    const scope =
      evaluatePredictionScope(
        fixture,
      );

    if (
      !scope.eligible
    ) {
      if (
        scope.reason ===
        "youth"
      ) {
        excludedYouth +=
          1;
      }

      if (
        scope.reason ===
        "women"
      ) {
        excludedWomen +=
          1;
      }

      if (
        scope.reason ===
        "reserve"
      ) {
        excludedReserve +=
          1;
      }

      if (
        scope.reason ===
        "academy"
      ) {
        excludedAcademy +=
          1;
      }

      continue;
    }

    scopeEligible +=
      1;

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

    /*
     * Capture safe candidates for manual review.
     */
    for (
      const result
      of [
        home,
        away,
      ]
    ) {
      if (
        result.status ===
        "resolved"
      ) {
        if (
          !result.value
            .verified
        ) {
          mappingReview.set(
            result.value
              .apiTeamId,
            {
              apiTeamId:
                result.value
                  .apiTeamId,

              apiTeamName:
                result.value
                  .apiTeamName,

              candidateName:
                result.value
                  .ratedTeam
                  .canonicalName,

              method:
                result.value
                  .method,

              status:
                "candidate",
            },
          );
        }

        continue;
      }

      /*
       * Only surface unresolved identities when
       * they plausibly relate to our rated-team
       * universe.
       *
       * This remains diagnostic only.
       */
      const core =
        conservativeName(
          result.apiTeamName,
        );

      const possiblyRated =
        core.length >
          0 &&
        ratedTeams.some(
          (team) => {
            const canonical =
              conservativeName(
                team
                  .canonicalName,
              );

            const source =
              conservativeName(
                team
                  .sourceName,
              );

            return (
              canonical ===
                core ||
              source ===
                core ||
              (
                core.length >=
                  4 &&
                (
                  canonical.includes(
                    core,
                  ) ||
                  core.includes(
                    canonical,
                  ) ||
                  source.includes(
                    core,
                  ) ||
                  core.includes(
                    source,
                  )
                )
              )
            );
          },
        );

      if (
        possiblyRated
      ) {
        mappingReview.set(
          result.apiTeamId,
          {
            apiTeamId:
              result.apiTeamId,

            apiTeamName:
              result.apiTeamName,

            candidateName:
              null,

            method:
              null,

            status:
              result.status,
          },
        );
      }
    }

    if (
      home.status !==
        "resolved" ||
      away.status !==
        "resolved"
    ) {
      continue;
    }

    /*
     * Both ratings must come from the identical
     * weekly snapshot.
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

    const ratingGap =
      evaluateRatingGapV02({
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

      ratingGap,

      /*
       * Exact/conservative candidate resolution
       * makes a fixture analytically interesting,
       * but it must NOT be persisted until both
       * API identities are manually verified.
       */
      verifiedProviderChain:
        home.value
          .verified &&
        away.value
          .verified,
    });
  }

  const verifiedRatedFixtures =
    ratedFixtures.filter(
      (item) =>
        item
          .verifiedProviderChain,
    );

  const reviewRatedFixtures =
    ratedFixtures.filter(
      (item) =>
        !item
          .verifiedProviderChain,
    );

  console.log("");

  console.log(
    "PASS: API-Football fixtures loaded.",
  );

  console.log(
    "PASS: already-started fixtures excluded.",
  );

  console.log(
    `PASS: prediction scope ${PREDICTION_SCOPE_VERSION} applied.`,
  );

  console.log(
    "PASS: FootballDatabase ratings loaded from immutable non-demo snapshots.",
  );

  console.log(
    "PASS: only verified API mappings count as persisted provider identity.",
  );

  console.log(
    "PASS: exact/conservative resolution remains read-only candidate discovery.",
  );

  console.log(
    "PASS: structural rating analysis uses dictaziq-rating-gap-v0.2.",
  );

  console.log(
    "PASS: no goals market is selected by this scanner.",
  );

  console.log(
    "PASS: no provider mappings or fixtures were written.",
  );

  console.log("");

  console.log(
    "========================================",
  );

  console.log(
    "SCAN SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Fixture date: ${date}`,
  );

  console.log(
    `API-Football fixtures: ${fixturePage.fixtures.length}`,
  );

  console.log(
    `Provider pre-match status fixtures: ${providerPrematch}`,
  );

  console.log(
    `Future pre-match fixtures: ${futurePrematch}`,
  );

  console.log(
    `Scope-eligible senior fixtures: ${scopeEligible}`,
  );

  console.log(
    `Excluded youth fixtures: ${excludedYouth}`,
  );

  console.log(
    `Excluded women's fixtures: ${excludedWomen}`,
  );

  console.log(
    `Excluded reserve/II fixtures: ${excludedReserve}`,
  );

  console.log(
    `Excluded academy fixtures: ${excludedAcademy}`,
  );

  console.log("");

  console.log(
    `FootballDatabase snapshot: ${snapshotDate}`,
  );

  console.log(
    `Rated teams available: ${ratedTeams.length}`,
  );

  console.log(
    `Rated structural candidates: ${ratedFixtures.length}`,
  );

  console.log(
    `Verified-provider rated fixtures: ${verifiedRatedFixtures.length}`,
  );

  console.log(
    `Rated fixtures requiring mapping review: ${reviewRatedFixtures.length}`,
  );

  console.log("");

  if (
    ratedFixtures.length ===
    0
  ) {
    console.log(
      "No scope-eligible future fixture currently has both teams safely resolvable to the active FootballDatabase rating snapshot.",
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
        verifiedProviderChain,
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
        `Provider chain: ${
          verifiedProviderChain
            ? "VERIFIED"
            : "REVIEW REQUIRED"
        }`,
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
        `Structural result signal = ${ratingGap.resultSignal}`,
      );

      console.log(
        `Higher-rated team = ${ratingGap.higherRatedTeam}`,
      );

      console.log(
        `Standalone result selection = ${ratingGap.standaloneSelection ?? "none"}`,
      );

      console.log(
        `Requires result context = ${ratingGap.requiresResultContext}`,
      );

      console.log(
        `Goals analysis required = ${ratingGap.markets.goals.requiresAnalysis}`,
      );

      console.log(
        `Rating mismatch candidate for goals analysis = ${ratingGap.markets.goals.ratingMismatchCandidate}`,
      );

      console.log(
        "Goals selection = none at rating-gap stage",
      );

      console.log(
        `Calibrated probability = ${String(
          ratingGap.calibratedProbability,
        )}`,
      );

      console.log("");
    }
  }

  if (
    mappingReview.size >
    0
  ) {
    console.log(
      "MAPPING REVIEW QUEUE",
    );

    console.log(
      "====================",
    );

    console.log("");

    for (
      const candidate
      of mappingReview.values()
    ) {
      if (
        candidate.status ===
        "candidate"
      ) {
        console.log(
          [
            candidate
              .apiTeamId,
            "|",
            candidate
              .apiTeamName,
            "|",
            candidate
              .method,
            "->",
            candidate
              .candidateName,
          ].join(
            " ",
          ),
        );
      } else {
        console.log(
          [
            candidate
              .apiTeamId,
            "|",
            candidate
              .apiTeamName,
            "|",
            candidate
              .status,
          ].join(
            " ",
          ),
        );
      }
    }

    console.log("");
  }

  if (
    verifiedRatedFixtures.length >
    0
  ) {
    console.log(
      `PASS: ${verifiedRatedFixtures.length} rated fixture(s) have verified API-Football identities and may proceed to persistence subject to downstream gates.`,
    );
  } else {
    console.log(
      "NOTICE: no rated fixture currently has both API-Football identities verified.",
    );
  }

  console.log("");

  console.log(
    "NOTE: this command is strictly read-only. It never creates or verifies a provider mapping.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Rated fixture scan verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof
        Error
          ? `Rated fixture scan failed: ${error.message}`
          : "Rated fixture scan failed.",
      );
    }

    process.exitCode =
      1;
  },
);
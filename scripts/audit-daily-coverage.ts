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
} from "../src/lib/predictions/prediction-scope";

import {
  fetchFixturesByDate,
} from "../src/providers/api-football/client";

const API_SOURCE =
  "api-football";

const RATING_SOURCE =
  "footballdatabase.com";

const HISTORY_SOURCE =
  "football-data.org";

const PREMATCH_STATUSES =
  new Set([
    "NS",
    "TBD",
  ]);

type TeamCoverage = {
  apiTeamId: number;

  apiName: string;

  canonicalTeamId:
    string | null;

  canonicalName:
    string | null;

  rating:
    number | null;

  ratingSnapshotDate:
    string | null;

  footballDataTeamId:
    string | null;

  footballDataName:
    string | null;

  ready: boolean;

  problems: string[];
};

function requestedDate():
  string {
  const value =
    process.argv[2]?.trim() ??
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
    "Invalid date.",
  );

  return value;
}

function dateOnly(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

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

  if (
    !Number.isFinite(
      parsed.getTime(),
    )
  ) {
    return null;
  }

  return parsed
    .toISOString()
    .slice(
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

  console.log(
    `DictazIQ coverage audit: ${date}`,
  );

  console.log(
    "Prediction scope: senior men's first-team football only.",
  );

  console.log(
    "Fetching API-Football fixtures...",
  );

  const page =
    await fetchFixturesByDate(
      date,
    );

  /*
   * Load VERIFIED API-Football identities.
   *
   * For each mapped canonical team also load:
   *
   * - newest valid FootballDatabase rating
   * - verified football-data.org identity
   *
   * We deliberately do not fuzzy-match here.
   */
  const mappingRows =
    await sql`
      SELECT
        api.source_team_id
          AS api_team_id,

        api.source_name
          AS api_name,

        api.team_id,

        team.name
          AS canonical_name,

        rating.id
          AS rating_snapshot_id,

        rating.rating,

        rating.snapshot_date,

        history.source_team_id
          AS football_data_team_id,

        history.source_name
          AS football_data_name

      FROM public.team_source_mappings
        AS api

      JOIN public.teams
        AS team
        ON team.id =
          api.team_id

      LEFT JOIN LATERAL (
        SELECT
          snapshot.id,
          snapshot.rating,
          snapshot.snapshot_date

        FROM public.team_rating_snapshots
          AS snapshot

        WHERE snapshot.team_id =
          api.team_id

          AND snapshot.source =
            ${RATING_SOURCE}

          AND snapshot.is_demo =
            false

          AND snapshot.snapshot_date <=
            ${date}::date

        ORDER BY
          snapshot.snapshot_date DESC,
          snapshot.observed_at DESC

        LIMIT 1
      ) AS rating
        ON true

      LEFT JOIN LATERAL (
        SELECT
          mapping.source_team_id,
          mapping.source_name

        FROM public.team_source_mappings
          AS mapping

        WHERE mapping.team_id =
          api.team_id

          AND mapping.source =
            ${HISTORY_SOURCE}

          AND mapping.is_verified =
            true

        ORDER BY
          mapping.id

        LIMIT 1
      ) AS history
        ON true

      WHERE api.source =
        ${API_SOURCE}

        AND api.is_verified =
          true

        AND team.is_demo =
          false
    `;

  const mapped =
    new Map<
      string,
      (typeof mappingRows)[number]
    >();

  for (
    const row
    of mappingRows
  ) {
    const key =
      String(
        row.api_team_id,
      );

    assert.ok(
      !mapped.has(
        key,
      ),
      `Duplicate verified API-Football mapping for team ${key}.`,
    );

    mapped.set(
      key,
      row,
    );
  }

  function inspectTeam(
    apiTeamId: number,
    apiName: string,
  ): TeamCoverage {
    const row =
      mapped.get(
        String(
          apiTeamId,
        ),
      );

    const problems:
      string[] = [];

    if (!row) {
      problems.push(
        "missing_api_mapping",
      );

      return {
        apiTeamId,
        apiName,

        canonicalTeamId:
          null,

        canonicalName:
          null,

        rating:
          null,

        ratingSnapshotDate:
          null,

        footballDataTeamId:
          null,

        footballDataName:
          null,

        ready:
          false,

        problems,
      };
    }

    if (
      row.rating ===
      null
    ) {
      problems.push(
        "missing_rating",
      );
    }

    if (
      row.football_data_team_id ===
      null
    ) {
      problems.push(
        "missing_football_data_mapping",
      );
    }

    return {
      apiTeamId,
      apiName,

      canonicalTeamId:
        String(
          row.team_id,
        ),

      canonicalName:
        String(
          row.canonical_name,
        ),

      rating:
        row.rating === null
          ? null
          : Number(
              row.rating,
            ),

      ratingSnapshotDate:
        dateOnly(
          row.snapshot_date,
        ),

      footballDataTeamId:
        row
          .football_data_team_id ===
        null
          ? null
          : String(
              row
                .football_data_team_id,
            ),

      footballDataName:
        row
          .football_data_name ===
        null
          ? null
          : String(
              row
                .football_data_name,
            ),

      ready:
        problems.length ===
        0,

      problems,
    };
  }

  let totalFixtures =
    0;

  let futurePrematch =
    0;

  let scopeEligible =
    0;

  let fullyReady =
    0;

  let excludedYouth =
    0;

  let excludedWomen =
    0;

  let excludedReserve =
    0;

  let excludedAcademy =
    0;

  const missingApiTeams =
    new Map<
      number,
      string
    >();

  const missingRatingTeams =
    new Map<
      number,
      string
    >();

  const missingHistoryTeams =
    new Map<
      number,
      string
    >();

  const now =
    Date.now();

  for (
    const fixture
    of page.fixtures
  ) {
    totalFixtures +=
      1;

    if (
      !PREMATCH_STATUSES.has(
        fixture.status.short,
      )
    ) {
      continue;
    }

    const kickoff =
      Date.parse(
        fixture.kickoffAt,
      );

    if (
      !Number.isFinite(
        kickoff,
      ) ||
      kickoff <= now
    ) {
      continue;
    }

    futurePrematch +=
      1;

    /*
     * Apply the frozen population boundary
     * BEFORE any mapping analysis.
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
      inspectTeam(
        fixture.home.id,
        fixture.home.name,
      );

    const away =
      inspectTeam(
        fixture.away.id,
        fixture.away.name,
      );

    const ready =
      home.ready &&
      away.ready;

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home.name} vs ${fixture.away.name}`,
    );

    console.log(
      `Fixture ID: ${fixture.fixtureId}`,
    );

    console.log(
      `Kickoff: ${fixture.kickoffAt}`,
    );

    console.log(
      `Competition: ${fixture.league.name}`,
    );

    for (
      const [
        side,
        team,
      ]
      of [
        [
          "HOME",
          home,
        ],
        [
          "AWAY",
          away,
        ],
      ] as const
    ) {
      console.log(
        `${side}: ${team.apiName} | API ${team.apiTeamId}`,
      );

      if (
        team.ready
      ) {
        console.log(
          [
            "  READY",
            `canonical=${team.canonicalName}`,
            `rating=${team.rating}`,
            `ratingDate=${team.ratingSnapshotDate}`,
            `football-data=${team.footballDataTeamId}`,
          ].join(
            " | ",
          ),
        );
      } else {
        console.log(
          `  BLOCKED: ${team.problems.join(
            ", ",
          )}`,
        );
      }

      if (
        team.problems.includes(
          "missing_api_mapping",
        )
      ) {
        missingApiTeams.set(
          team.apiTeamId,
          team.apiName,
        );
      }

      if (
        team.problems.includes(
          "missing_rating",
        )
      ) {
        missingRatingTeams.set(
          team.apiTeamId,
          team.apiName,
        );
      }

      if (
        team.problems.includes(
          "missing_football_data_mapping",
        )
      ) {
        missingHistoryTeams.set(
          team.apiTeamId,
          team.apiName,
        );
      }
    }

    if (ready) {
      fullyReady +=
        1;

      console.log(
        "FIXTURE: READY FOR DICTAZIQ PIPELINE",
      );
    } else {
      console.log(
        "FIXTURE: BLOCKED",
      );
    }
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "COVERAGE SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Provider fixtures: ${totalFixtures}`,
  );

  console.log(
    `Future prematch fixtures: ${futurePrematch}`,
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
    `Fully ready fixtures: ${fullyReady}`,
  );

  console.log(
    `Missing API mappings: ${missingApiTeams.size}`,
  );

  console.log(
    `Missing ratings: ${missingRatingTeams.size}`,
  );

  console.log(
    `Missing football-data mappings: ${missingHistoryTeams.size}`,
  );

  console.log("");

  if (
    missingApiTeams.size >
    0
  ) {
    console.log(
      "API-Football mapping queue:",
    );

    for (
      const [
        id,
        name,
      ]
      of missingApiTeams
    ) {
      console.log(
        `  ${id} | ${name}`,
      );
    }

    console.log("");
  }

  if (
    missingRatingTeams.size >
    0
  ) {
    console.log(
      "Rated-team coverage queue:",
    );

    for (
      const [
        id,
        name,
      ]
      of missingRatingTeams
    ) {
      console.log(
        `  API ${id} | ${name}`,
      );
    }

    console.log("");
  }

  if (
    missingHistoryTeams.size >
    0
  ) {
    console.log(
      "football-data.org mapping queue:",
    );

    for (
      const [
        id,
        name,
      ]
      of missingHistoryTeams
    ) {
      console.log(
        `  API ${id} | ${name}`,
      );
    }

    console.log("");
  }

  console.log(
    fullyReady > 0
      ? `PASS: ${fullyReady} fixture(s) satisfy the complete DictazIQ provider chain.`
      : "WARNING: no scope-eligible fixture currently satisfies the complete provider chain.",
  );

  console.log("");

  console.log(
    "NOTE: youth, women, reserve and academy fixtures were excluded before mapping analysis.",
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
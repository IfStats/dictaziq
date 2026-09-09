import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  fetchFixturesByDate,
} from "../src/providers/api-football/client";

import {
  fetchCompetitionTeams,
} from "../src/providers/football-data/client";

import type {
  FootballDataCompetitionTeam,
} from "../src/providers/football-data/types";

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

type RatingTeam = {
  teamId: string;
  canonicalName: string;
  ratingName: string;
  ratingSourceTeamId: string;
  country: string | null;
  rating: number;
};

type FootballDataCandidate = {
  competition: string;
  team:
    FootballDataCompetitionTeam;
};

type MatchMethod =
  | "exact"
  | "alias"
  | "ambiguous"
  | "unresolved";

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

function requestedCompetitions():
  string[] {
  const raw =
    process.argv[3]
      ?.trim() ||
    "PL,SA,PD,PPL,CL";

  const codes =
    raw
      .split(",")
      .map(
        (value) =>
          value
            .trim()
            .toUpperCase(),
      )
      .filter(Boolean);

  return [
    ...new Set(
      codes,
    ),
  ];
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
      "ac",
      "ssc",
      "sc",
      "sk",
      "fk",
      "cd",
      "club",
    ]);

  while (
    tokens.length > 1 &&
    generic.has(
      tokens[0],
    )
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

  return tokens.join(
    " ",
  );
}

function uniqueRatingTeams(
  values:
    RatingTeam[],
): RatingTeam[] {
  const map =
    new Map<
      string,
      RatingTeam
    >();

  for (
    const value
    of values
  ) {
    map.set(
      value.teamId,
      value,
    );
  }

  return [
    ...map.values(),
  ];
}

function findRatingCandidate(
  apiName: string,
  teams:
    RatingTeam[],
): {
  method:
    MatchMethod;

  candidates:
    RatingTeam[];
} {
  const exactName =
    normalizeName(
      apiName,
    );

  const exact =
    uniqueRatingTeams(
      teams.filter(
        (team) =>
          normalizeName(
            team.canonicalName,
          ) ===
            exactName ||
          normalizeName(
            team.ratingName,
          ) ===
            exactName,
      ),
    );

  if (
    exact.length === 1
  ) {
    return {
      method:
        "exact",

      candidates:
        exact,
    };
  }

  if (
    exact.length > 1
  ) {
    return {
      method:
        "ambiguous",

      candidates:
        exact,
    };
  }

  const conservative =
    conservativeName(
      apiName,
    );

  const aliases =
    uniqueRatingTeams(
      teams.filter(
        (team) =>
          conservativeName(
            team.canonicalName,
          ) ===
            conservative ||
          conservativeName(
            team.ratingName,
          ) ===
            conservative,
      ),
    );

  if (
    aliases.length === 1
  ) {
    return {
      method:
        "alias",

      candidates:
        aliases,
    };
  }

  if (
    aliases.length > 1
  ) {
    return {
      method:
        "ambiguous",

      candidates:
        aliases,
    };
  }

  return {
    method:
      "unresolved",

    candidates: [],
  };
}

function uniqueFootballDataCandidates(
  values:
    FootballDataCandidate[],
): FootballDataCandidate[] {
  const map =
    new Map<
      number,
      FootballDataCandidate
    >();

  for (
    const value
    of values
  ) {
    if (
      !map.has(
        value.team.id,
      )
    ) {
      map.set(
        value.team.id,
        value,
      );
    }
  }

  return [
    ...map.values(),
  ];
}

function findFootballDataCandidate(
  ratingTeam:
    RatingTeam,

  candidates:
    FootballDataCandidate[],
): {
  method:
    MatchMethod;

  candidates:
    FootballDataCandidate[];
} {
  const targetNames =
    [
      ratingTeam
        .canonicalName,

      ratingTeam
        .ratingName,
    ];

  const exactNames =
    new Set(
      targetNames.map(
        normalizeName,
      ),
    );

  const exact =
    uniqueFootballDataCandidates(
      candidates.filter(
        (candidate) => {
          const names =
            [
              candidate
                .team
                .name,

              candidate
                .team
                .shortName,
            ].filter(
              (
                value,
              ): value is string =>
                value !==
                null,
            );

          return names.some(
            (name) =>
              exactNames.has(
                normalizeName(
                  name,
                ),
              ),
          );
        },
      ),
    );

  if (
    exact.length === 1
  ) {
    return {
      method:
        "exact",

      candidates:
        exact,
    };
  }

  if (
    exact.length > 1
  ) {
    return {
      method:
        "ambiguous",

      candidates:
        exact,
    };
  }

  const targetAliases =
    new Set(
      targetNames.map(
        conservativeName,
      ),
    );

  const aliases =
    uniqueFootballDataCandidates(
      candidates.filter(
        (candidate) => {
          const names =
            [
              candidate
                .team
                .name,

              candidate
                .team
                .shortName,
            ].filter(
              (
                value,
              ): value is string =>
                value !==
                null,
            );

          return names.some(
            (name) =>
              targetAliases.has(
                conservativeName(
                  name,
                ),
              ),
          );
        },
      ),
    );

  if (
    aliases.length === 1
  ) {
    return {
      method:
        "alias",

      candidates:
        aliases,
    };
  }

  if (
    aliases.length > 1
  ) {
    return {
      method:
        "ambiguous",

      candidates:
        aliases,
    };
  }

  return {
    method:
      "unresolved",

    candidates: [],
  };
}

function sleep(
  milliseconds:
    number,
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

async function main() {
  const date =
    requestedDate();

  const competitionCodes =
    requestedCompetitions();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Mapping Candidate Review",
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `football-data.org competitions: ${competitionCodes.join(", ")}`,
  );

  /*
   * Today's/tomorrow's API-Football
   * fixture slate.
   */
  const page =
    await fetchFixturesByDate(
      date,
    );

  const fixtureTeams =
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

    fixtureTeams.set(
      fixture.home.id,
      fixture.home.name,
    );

    fixtureTeams.set(
      fixture.away.id,
      fixture.away.name,
    );
  }

  /*
   * Canonical teams that currently have a
   * FootballDatabase rating available by
   * the requested date.
   */
  const ratingRows =
    await sql`
      SELECT
        mapping.team_id,

        mapping.source_team_id,

        mapping.source_name,

        team.name
          AS canonical_name,

        team.country,

        rating.rating

      FROM public.team_source_mappings
        AS mapping

      JOIN public.teams
        AS team
        ON team.id =
          mapping.team_id

      JOIN LATERAL (
        SELECT
          snapshot.rating

        FROM public.team_rating_snapshots
          AS snapshot

        WHERE snapshot.team_id =
          mapping.team_id

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

      WHERE mapping.source =
        ${RATING_SOURCE}

        AND team.is_demo =
          false
    `;

  const ratingTeams:
    RatingTeam[] =
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

        ratingName:
          String(
            row.source_name,
          ),

        ratingSourceTeamId:
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
      }),
    );

  /*
   * Existing verified API-Football links.
   */
  const apiRows =
    await sql`
      SELECT
        source_team_id,
        team_id

      FROM public.team_source_mappings

      WHERE source =
        ${API_SOURCE}

        AND is_verified =
          true
    `;

  const verifiedApi =
    new Map<
      string,
      string
    >();

  for (
    const row
    of apiRows
  ) {
    verifiedApi.set(
      String(
        row.source_team_id,
      ),

      String(
        row.team_id,
      ),
    );
  }

  /*
   * Existing verified football-data.org
   * identities.
   */
  const historyRows =
    await sql`
      SELECT
        source_team_id,
        source_name,
        team_id

      FROM public.team_source_mappings

      WHERE source =
        ${HISTORY_SOURCE}

        AND is_verified =
          true
    `;

  const verifiedHistoryByTeam =
    new Map<
      string,
      {
        providerTeamId:
          string;

        providerName:
          string;
      }
    >();

  for (
    const row
    of historyRows
  ) {
    verifiedHistoryByTeam.set(
      String(
        row.team_id,
      ),

      {
        providerTeamId:
          String(
            row.source_team_id,
          ),

        providerName:
          String(
            row.source_name,
          ),
      },
    );
  }

  /*
   * Discover football-data.org teams.
   *
   * Read only.
   */
  const footballDataCandidates:
    FootballDataCandidate[] =
    [];

  console.log("");
  console.log(
    "Loading football-data.org provider identities...",
  );

  for (
    const code
    of competitionCodes
  ) {
    try {
      const teams =
        await fetchCompetitionTeams(
          code,
        );

      console.log(
        `${code}: ${teams.length} teams`,
      );

      for (
        const team
        of teams
      ) {
        footballDataCandidates.push({
          competition:
            code,

          team,
        });
      }
    } catch (
      error
    ) {
      console.log(
        `${code}: unavailable`,
      );

      console.log(
        error instanceof
        Error
          ? error.message
          : error,
      );
    }

    await sleep(
      650,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "MAPPING REVIEW QUEUE",
  );

  console.log(
    "========================================",
  );

  let alreadyApiMapped =
    0;

  let apiSuggestions =
    0;

  let apiAmbiguous =
    0;

  let apiUnresolved =
    0;

  let historySuggestions =
    0;

  let historyAmbiguous =
    0;

  let historyUnresolved =
    0;

  for (
    const [
      apiTeamId,
      apiName,
    ]
    of fixtureTeams
  ) {
    console.log("");
    console.log(
      `API ${apiTeamId} | ${apiName}`,
    );

    let ratingTeam:
      RatingTeam |
      null =
        null;

    const existingTeamId =
      verifiedApi.get(
        String(
          apiTeamId,
        ),
      );

    if (
      existingTeamId
    ) {
      alreadyApiMapped +=
        1;

      ratingTeam =
        ratingTeams.find(
          (team) =>
            team.teamId ===
            existingTeamId,
        ) ??
        null;

      console.log(
        "  API mapping: VERIFIED",
      );

      if (
        ratingTeam
      ) {
        console.log(
          `  Canonical: ${ratingTeam.canonicalName} | rating=${ratingTeam.rating}`,
        );
      } else {
        console.log(
          "  WARNING: verified API identity has no eligible rating snapshot.",
        );
      }
    } else {
      const suggestion =
        findRatingCandidate(
          apiName,
          ratingTeams,
        );

      if (
        suggestion.method ===
          "exact" ||
        suggestion.method ===
          "alias"
      ) {
        ratingTeam =
          suggestion
            .candidates[0];

        apiSuggestions +=
          1;

        console.log(
          [
            "  API candidate:",
            suggestion
              .method
              .toUpperCase(),
            `-> ${ratingTeam.canonicalName}`,
            `FootballDatabase=${ratingTeam.ratingName}`,
            `rating=${ratingTeam.rating}`,
          ].join(
            " ",
          ),
        );
      } else if (
        suggestion.method ===
        "ambiguous"
      ) {
        apiAmbiguous +=
          1;

        console.log(
          "  API candidate: AMBIGUOUS",
        );

        for (
          const candidate
          of suggestion
            .candidates
        ) {
          console.log(
            `    -> ${candidate.canonicalName} | ${candidate.ratingName} | rating=${candidate.rating}`,
          );
        }

        continue;
      } else {
        apiUnresolved +=
          1;

        console.log(
          "  API candidate: UNRESOLVED",
        );

        continue;
      }
    }

    if (
      !ratingTeam
    ) {
      continue;
    }

    const existingHistory =
      verifiedHistoryByTeam.get(
        ratingTeam.teamId,
      );

    if (
      existingHistory
    ) {
      console.log(
        [
          "  football-data:",
          "VERIFIED",
          `id=${existingHistory.providerTeamId}`,
          existingHistory.providerName,
        ].join(
          " ",
        ),
      );

      continue;
    }

    const historySuggestion =
      findFootballDataCandidate(
        ratingTeam,
        footballDataCandidates,
      );

    if (
      historySuggestion.method ===
        "exact" ||
      historySuggestion.method ===
        "alias"
    ) {
      historySuggestions +=
        1;

      const candidate =
        historySuggestion
          .candidates[0];

      console.log(
        [
          "  football-data candidate:",
          historySuggestion
            .method
            .toUpperCase(),
          `-> id=${candidate.team.id}`,
          candidate.team.name,
          `competition=${candidate.competition}`,
        ].join(
          " ",
        ),
      );
    } else if (
      historySuggestion.method ===
      "ambiguous"
    ) {
      historyAmbiguous +=
        1;

      console.log(
        "  football-data candidate: AMBIGUOUS",
      );

      for (
        const candidate
        of historySuggestion
          .candidates
      ) {
        console.log(
          `    -> ${candidate.team.id} | ${candidate.team.name} | ${candidate.competition}`,
        );
      }
    } else {
      historyUnresolved +=
        1;

      console.log(
        "  football-data candidate: UNRESOLVED",
      );
    }
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "CANDIDATE SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Future fixture teams: ${fixtureTeams.size}`,
  );

  console.log(
    `Already verified API mappings: ${alreadyApiMapped}`,
  );

  console.log(
    `API mapping suggestions: ${apiSuggestions}`,
  );

  console.log(
    `API ambiguous: ${apiAmbiguous}`,
  );

  console.log(
    `API unresolved: ${apiUnresolved}`,
  );

  console.log(
    `football-data mapping suggestions: ${historySuggestions}`,
  );

  console.log(
    `football-data ambiguous: ${historyAmbiguous}`,
  );

  console.log(
    `football-data unresolved: ${historyUnresolved}`,
  );

  console.log("");
  console.log(
    "READ ONLY: no mappings were inserted or verified.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof
      Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
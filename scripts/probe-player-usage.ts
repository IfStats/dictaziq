import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const BASE_URL =
  "https://v3.football.api-sports.io";

const SOURCE =
  "api-football";

type UnknownRecord =
  Record<string, unknown>;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function record(
  value: unknown,
  label: string,
): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(
      `${label} must be an object.`,
    );
  }

  return value;
}

function nullableNumber(
  value: unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

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

function apiKey():
  string {
  const key =
    process.env
      .API_SPORTS_KEY
      ?.trim();

  if (!key) {
    throw new Error(
      "API_SPORTS_KEY is not configured.",
    );
  }

  return key;
}

type AffectedPlayer = {
  playerId:
    number | null;

  playerName:
    string;
};

type SquadEvidence = {
  providerTeam: {
    id: number;
    name: string;
  };

  canonicalTeam: {
    id: string;
    name: string;
    fixtureSide:
      "home" | "away";
  };

  unavailablePlayers:
    AffectedPlayer[];
};

function parseSquadEvidence(
  value: unknown,
): SquadEvidence {
  const root =
    record(
      value,
      "Squad evidence",
    );

  const providerTeam =
    record(
      root.providerTeam,
      "Provider team",
    );

  const canonicalTeam =
    record(
      root.canonicalTeam,
      "Canonical team",
    );

  if (
    !Array.isArray(
      root.unavailablePlayers,
    )
  ) {
    throw new Error(
      "Unavailable players must be an array.",
    );
  }

  const unavailablePlayers =
    root.unavailablePlayers.map(
      (
        item,
      ): AffectedPlayer => {
        const player =
          record(
            item,
            "Unavailable player",
          );

        const playerName =
          nullableString(
            player.playerName,
          );

        if (!playerName) {
          throw new Error(
            "Unavailable player name is missing.",
          );
        }

        return {
          playerId:
            nullableNumber(
              player.playerId,
            ),

          playerName,
        };
      },
    );

  const providerTeamId =
    nullableNumber(
      providerTeam.id,
    );

  const providerTeamName =
    nullableString(
      providerTeam.name,
    );

  const canonicalTeamId =
    nullableString(
      canonicalTeam.id,
    );

  const canonicalTeamName =
    nullableString(
      canonicalTeam.name,
    );

  const fixtureSide =
    canonicalTeam.fixtureSide;

  if (
    providerTeamId === null ||
    !Number.isInteger(
      providerTeamId,
    ) ||
    providerTeamId <= 0 ||
    !providerTeamName ||
    !canonicalTeamId ||
    !canonicalTeamName ||
    (
      fixtureSide !== "home" &&
      fixtureSide !== "away"
    )
  ) {
    throw new Error(
      "Squad evidence team identity is invalid.",
    );
  }

  return {
    providerTeam: {
      id:
        providerTeamId,

      name:
        providerTeamName,
    },

    canonicalTeam: {
      id:
        canonicalTeamId,

      name:
        canonicalTeamName,

      fixtureSide,
    },

    unavailablePlayers,
  };
}

async function fetchPlayersPage(
  teamId: number,
  season: number,
  page: number,
): Promise<{
  rows: unknown[];
  currentPage: number;
  totalPages: number;
}> {
  const url =
    new URL(
      `${BASE_URL}/players`,
    );

  url.searchParams.set(
    "team",
    String(
      teamId,
    ),
  );

  url.searchParams.set(
    "season",
    String(
      season,
    ),
  );

  url.searchParams.set(
    "page",
    String(
      page,
    ),
  );

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          "x-apisports-key":
            apiKey(),
        },

        signal:
          AbortSignal.timeout(
            20_000,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`,
    );
  }

  const payload: unknown =
    await response.json();

  const root =
    record(
      payload,
      "API-Football response",
    );

  if (
    isRecord(
      root.errors,
    ) &&
    Object.keys(
      root.errors,
    ).length > 0
  ) {
    throw new Error(
      `API-Football errors: ${JSON.stringify(
        root.errors,
      )}`,
    );
  }

  if (
    !Array.isArray(
      root.response,
    )
  ) {
    throw new Error(
      "API-Football response array is missing.",
    );
  }

  const paging =
    isRecord(
      root.paging,
    )
      ? root.paging
      : {};

  return {
    rows:
      root.response,

    currentPage:
      nullableNumber(
        paging.current,
      ) ?? page,

    totalPages:
      nullableNumber(
        paging.total,
      ) ?? 1,
  };
}

async function fetchTeamPlayers(
  teamId: number,
  season: number,
): Promise<unknown[]> {
  const all:
    unknown[] = [];

  let page =
    1;

  while (true) {
    const result =
      await fetchPlayersPage(
        teamId,
        season,
        page,
      );

    all.push(
      ...result.rows,
    );

    if (
      result.currentPage >=
      result.totalPages
    ) {
      break;
    }

    page +=
      1;

    /*
     * Guard against malformed provider paging.
     */
    if (page > 10) {
      throw new Error(
        "Unexpected API-Football player pagination depth.",
      );
    }
  }

  return all;
}

function normalizeName(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    );
}

function playerMatches(
  item: unknown,
  affected:
    AffectedPlayer,
): boolean {
  const root =
    record(
      item,
      "Player result",
    );

  const player =
    record(
      root.player,
      "Player",
    );

  const apiId =
    nullableNumber(
      player.id,
    );

  const apiName =
    nullableString(
      player.name,
    );

  if (
    affected.playerId !==
      null &&
    apiId ===
      affected.playerId
  ) {
    return true;
  }

  return (
    apiName !== null &&
    normalizeName(
      apiName,
    ) ===
      normalizeName(
        affected.playerName,
      )
  );
}

function printPlayerUsage(
  item: unknown,
): void {
  const root =
    record(
      item,
      "Player result",
    );

  const player =
    record(
      root.player,
      "Player",
    );

  const playerName =
    nullableString(
      player.name,
    ) ??
    "unknown-player";

  const playerId =
    nullableNumber(
      player.id,
    );

  console.log("");
  console.log(
    `PLAYER | ${playerName} | id=${playerId ?? "unknown"}`,
  );

  const statistics =
    Array.isArray(
      root.statistics,
    )
      ? root.statistics
      : [];

  if (
    statistics.length ===
    0
  ) {
    console.log(
      "  STATISTICS: NONE",
    );

    return;
  }

  for (
    const value
    of statistics
  ) {
    const stat =
      record(
        value,
        "Player statistics",
      );

    const league =
      isRecord(
        stat.league,
      )
        ? stat.league
        : {};

    const games =
      isRecord(
        stat.games,
      )
        ? stat.games
        : {};

    const leagueName =
      nullableString(
        league.name,
      ) ??
      "unknown-competition";

    /*
     * API-Football historically uses
     * "appearences" in parts of its schema.
     * Accept either spelling for observation.
     */
    const appearances =
      nullableNumber(
        games.appearences,
      ) ??
      nullableNumber(
        games.appearances,
      );

    const starts =
      nullableNumber(
        games.lineups,
      );

    const minutes =
      nullableNumber(
        games.minutes,
      );

    const position =
      nullableString(
        games.position,
      );

    console.log(
      [
        `  ${leagueName}`,
        `apps=${appearances ?? "null"}`,
        `starts=${starts ?? "null"}`,
        `minutes=${minutes ?? "null"}`,
        `position=${position ?? "null"}`,
      ].join(
        " | ",
      ),
    );
  }
}

async function main() {
  const date =
    requestedDate();

  const season =
    Number(
      date.slice(
        0,
        4,
      ),
    );

  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * Use the immutable squad evidence already
   * stored. Do NOT call /injuries again.
   */
  const snapshots =
    await sql`
      SELECT DISTINCT ON (
        context.fixture_id,
        context.source_evidence_id
      )
        context.id,
        context.fixture_id,
        context.source_evidence_id,
        context.captured_at,
        context.evidence,

        fixture.provider_id
          AS fixture_provider_id,

        home.name
          AS home_name,

        away_team.name
          AS away_name

      FROM public.context_evidence_snapshots
        AS context

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          context.fixture_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      WHERE context.kind =
        'squad_availability'

        AND context.side =
          'neutral'

        AND context.source =
          ${SOURCE}

        AND context.is_demo =
          false

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        context.fixture_id,
        context.source_evidence_id,
        context.captured_at DESC
    `;

  assert.ok(
    snapshots.length > 0,
    "No real squad-availability snapshots found.",
  );

  console.log(
    `Squad snapshots: ${snapshots.length}`,
  );

  for (
    const snapshot
    of snapshots
  ) {
    const evidence =
      parseSquadEvidence(
        snapshot.evidence,
      );

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${snapshot.home_name} vs ${snapshot.away_name}`,
    );

    console.log(
      `Team: ${evidence.canonicalTeam.name}`,
    );

    console.log(
      `API team ID: ${evidence.providerTeam.id}`,
    );

    console.log(
      `Affected players: ${evidence.unavailablePlayers.length}`,
    );

    let players:
      unknown[];

    try {
      players =
        await fetchTeamPlayers(
          evidence.providerTeam.id,
          season,
        );
    } catch (
      error: unknown
    ) {
      console.log(
        `PLAYER USAGE UNAVAILABLE: ${
          error instanceof Error
            ? error.message
            : String(
                error,
              )
        }`,
      );

      continue;
    }

    console.log(
      `Season player records returned: ${players.length}`,
    );

    for (
      const affected
      of evidence.unavailablePlayers
    ) {
      const match =
        players.find(
          (item) =>
            playerMatches(
              item,
              affected,
            ),
        );

      if (!match) {
        console.log("");
        console.log(
          `PLAYER NOT FOUND | ${affected.playerName} | id=${affected.playerId ?? "unknown"}`,
        );

        continue;
      }

      printPlayerUsage(
        match,
      );
    }
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "READ-ONLY PLAYER-USAGE PROBE COMPLETE.",
  );

  console.log(
    "No player-impact score was created.",
  );

  console.log(
    "No context direction was changed.",
  );

  console.log(
    "No prediction was changed.",
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
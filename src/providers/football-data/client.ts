import {
  FOOTBALL_DATA_SOURCE,
  type FootballDataMatch,
} from "./types";

const BASE_URL =
  "https://api.football-data.org/v4";

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

function stringValue(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function numberValue(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${label} must be numeric.`,
    );
  }

  return value;
}

function nullableScore(
  value: unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function apiToken(): string {
  const token =
    process.env
      .FOOTBALL_DATA_API_KEY
      ?.trim();

  if (!token) {
    throw new Error(
      "FOOTBALL_DATA_API_KEY is not configured.",
    );
  }

  return token;
}

function normalizeMatch(
  raw: unknown,
): FootballDataMatch {
  const item =
    record(
      raw,
      "Football-data match",
    );

  const competition =
    record(
      item.competition,
      "competition",
    );

  const home =
    record(
      item.homeTeam,
      "homeTeam",
    );

  const away =
    record(
      item.awayTeam,
      "awayTeam",
    );

  const score =
    record(
      item.score,
      "score",
    );

  const fullTime =
    record(
      score.fullTime,
      "score.fullTime",
    );

  const kickoff =
    new Date(
      stringValue(
        item.utcDate,
        "utcDate",
      ),
    );

  if (
    !Number.isFinite(
      kickoff.getTime(),
    )
  ) {
    throw new Error(
      "Football-data returned an invalid kickoff.",
    );
  }

  return {
    source:
      FOOTBALL_DATA_SOURCE,

    matchId:
      numberValue(
        item.id,
        "match.id",
      ),

    kickoffAt:
      kickoff.toISOString(),

    status:
      stringValue(
        item.status,
        "match.status",
      ),

    competition: {
      id:
        numberValue(
          competition.id,
          "competition.id",
        ),

      code:
        stringValue(
          competition.code,
          "competition.code",
        ),

      name:
        stringValue(
          competition.name,
          "competition.name",
        ),
    },

    home: {
      id:
        numberValue(
          home.id,
          "homeTeam.id",
        ),

      name:
        stringValue(
          home.name,
          "homeTeam.name",
        ),
    },

    away: {
      id:
        numberValue(
          away.id,
          "awayTeam.id",
        ),

      name:
        stringValue(
          away.name,
          "awayTeam.name",
        ),
    },

    score: {
      home:
        nullableScore(
          fullTime.home,
        ),

      away:
        nullableScore(
          fullTime.away,
        ),
    },
  };
}

export type FetchFinishedTeamMatchesOptions = {
  limit?: number;
  season?: number;
};

export async function fetchFinishedTeamMatches(
  teamId: number,
  options:
    FetchFinishedTeamMatchesOptions = {},
): Promise<
  FootballDataMatch[]
> {
  const limit =
    options.limit ?? 20;
  if (
    !Number.isInteger(teamId) ||
    teamId <= 0
  ) {
    throw new Error(
      "Football-data team ID must be positive.",
    );
  }

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error(
      "Football-data match limit must be 1 through 100.",
    );
  }

  const url =
    new URL(
      `${BASE_URL}/teams/${teamId}/matches`,
    );

  url.searchParams.set(
    "status",
    "FINISHED",
  );

  if (
  options.season !==
  undefined
) {
  if (
    !Number.isInteger(
      options.season,
    ) ||
    options.season < 1900
  ) {
    throw new Error(
      "football-data.org season must be a valid starting year.",
    );
  }

  url.searchParams.set(
    "season",
    String(
      options.season,
    ),
  );
}

  url.searchParams.set(
    "limit",
    String(limit),
  );

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          "X-Auth-Token":
            apiToken(),
        },

        signal:
          AbortSignal.timeout(
            20_000,
          ),
      },
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `football-data.org request failed HTTP ${response.status}: ${body}`,
    );
  }

  const payload: unknown =
    await response.json();

  const root =
    record(
      payload,
      "football-data.org response",
    );

  if (
    !Array.isArray(
      root.matches,
    )
  ) {
    throw new Error(
      "football-data.org matches array is missing.",
    );
  }

  return root.matches.map(
    normalizeMatch,
  );
}

function nullableString(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed || null;
}

export async function fetchCompetitionTeams(
  competitionCode: string,
): Promise<
  import("./types").FootballDataCompetitionTeam[]
> {
  const code =
    competitionCode
      .trim()
      .toUpperCase();

  if (!code) {
    throw new Error(
      "Competition code must not be empty.",
    );
  }

  const url =
    new URL(
      `${BASE_URL}/competitions/${encodeURIComponent(
        code,
      )}/teams`,
    );

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          "X-Auth-Token":
            apiToken(),
        },

        signal:
          AbortSignal.timeout(
            20_000,
          ),
      },
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `football-data.org competition teams request failed HTTP ${response.status}: ${body}`,
    );
  }

  const payload: unknown =
    await response.json();

  const root =
    record(
      payload,
      "football-data.org competition teams response",
    );

  if (
    !Array.isArray(
      root.teams,
    )
  ) {
    throw new Error(
      "football-data.org teams array is missing.",
    );
  }

  return root.teams.map(
    (raw) => {
      const team =
        record(
          raw,
          "football-data.org team",
        );

      return {
        id:
          numberValue(
            team.id,
            "team.id",
          ),

        name:
          stringValue(
            team.name,
            "team.name",
          ),

        shortName:
          nullableString(
            team.shortName,
          ),

        tla:
          nullableString(
            team.tla,
          ),
      };
    },
  );
}
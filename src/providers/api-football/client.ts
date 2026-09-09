import {
  API_FOOTBALL_SOURCE,
  type ApiFootballFixturePage,
  type NormalizedApiFootballFixture,
  type ApiFootballFixtureLineup,
  type ApiFootballInjury,
  type ApiFootballLineupPlayer,
} from "./types";

const BASE_URL =
  "https://v3.football.api-sports.io";

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
      `${label} must be a number.`,
    );
  }

  return value;
}

function nullableNumber(
  value: unknown,
): number | null {
  if (value === null) {
    return null;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  return null;
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

function nullableBoolean(
  value: unknown,
): boolean | null {
  return typeof value === "boolean"
    ? value
    : null;
}

function apiKey(): string {
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

function validateDate(
  date: string,
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new Error(
      "Fixture date must use YYYY-MM-DD format.",
    );
  }

  const parsed =
    new Date(
      `${date}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(0, 10) !==
      date
  ) {
    throw new Error(
      "Fixture date is invalid.",
    );
  }
}

function normalizeFixture(
  raw: unknown,
): NormalizedApiFootballFixture {
  const item =
    record(
      raw,
      "Fixture item",
    );

  const fixture =
    record(
      item.fixture,
      "fixture",
    );

  const league =
    record(
      item.league,
      "league",
    );

  const teams =
    record(
      item.teams,
      "teams",
    );

  const home =
    record(
      teams.home,
      "home team",
    );

  const away =
    record(
      teams.away,
      "away team",
    );

  const goals =
    record(
      item.goals,
      "goals",
    );

  const status =
    record(
      fixture.status,
      "fixture status",
    );

  const venue =
    fixture.venue === null
      ? {}
      : record(
          fixture.venue,
          "venue",
        );

  const kickoffAt =
    stringValue(
      fixture.date,
      "fixture.date",
    );

  const kickoff =
    new Date(kickoffAt);

  if (
    !Number.isFinite(
      kickoff.getTime(),
    )
  ) {
    throw new Error(
      "API-Football returned an invalid fixture kickoff.",
    );
  }

  return {
    source:
      API_FOOTBALL_SOURCE,

    fixtureId:
      numberValue(
        fixture.id,
        "fixture.id",
      ),

    kickoffAt:
      kickoff.toISOString(),

    timezone:
      stringValue(
        fixture.timezone,
        "fixture.timezone",
      ),

    status: {
      long:
        stringValue(
          status.long,
          "fixture.status.long",
        ),

      short:
        stringValue(
          status.short,
          "fixture.status.short",
        ),

      elapsed:
        nullableNumber(
          status.elapsed,
        ),
    },

    league: {
      id:
        numberValue(
          league.id,
          "league.id",
        ),

      name:
        stringValue(
          league.name,
          "league.name",
        ),

      country:
        stringValue(
          league.country,
          "league.country",
        ),

      season:
        numberValue(
          league.season,
          "league.season",
        ),

      round:
        nullableString(
          league.round,
        ),
    },

    home: {
      id:
        numberValue(
          home.id,
          "home.id",
        ),

      name:
        stringValue(
          home.name,
          "home.name",
        ),

      winner:
        nullableBoolean(
          home.winner,
        ),
    },

    away: {
      id:
        numberValue(
          away.id,
          "away.id",
        ),

      name:
        stringValue(
          away.name,
          "away.name",
        ),

      winner:
        nullableBoolean(
          away.winner,
        ),
    },

    goals: {
      home:
        nullableNumber(
          goals.home,
        ),

      away:
        nullableNumber(
          goals.away,
        ),
    },

    venue: {
      id:
        nullableNumber(
          venue.id,
        ),

      name:
        nullableString(
          venue.name,
        ),

      city:
        nullableString(
          venue.city,
        ),
    },
  };
}

export async function fetchFixturesByDate(
  date: string,
): Promise<ApiFootballFixturePage> {
  validateDate(date);

  const url =
    new URL(
      `${BASE_URL}/fixtures`,
    );

  url.searchParams.set(
    "date",
    date,
  );

  /*
   * Explicit UTC makes fixture timestamps
   * deterministic for DictazIQ storage.
   */
  url.searchParams.set(
    "timezone",
    "UTC",
  );

  const response =
    await fetch(
      url,
      {
        method: "GET",

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
      `API-Football request failed: HTTP ${response.status}.`,
    );
  }

  const payload: unknown =
    await response.json();

  const root =
    record(
      payload,
      "API-Football response",
    );

  /*
   * API-Football may return HTTP 200 with
   * an errors object when request parameters,
   * account permissions or quota have problems.
   */
  if (
    isRecord(root.errors) &&
    Object.keys(
      root.errors,
    ).length > 0
  ) {
    throw new Error(
      `API-Football returned errors: ${JSON.stringify(
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

  const fixtures =
    root.response.map(
      normalizeFixture,
    );

  return {
    source:
      API_FOOTBALL_SOURCE,

    date,

    results:
      fixtures.length,

    fixtures,
  };
}

async function fetchApiFootballArray(
  pathname: string,
  parameters:
    Record<string, string>,
): Promise<unknown[]> {
  const url =
    new URL(
      `${BASE_URL}${pathname}`,
    );

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      parameters,
    )
  ) {
    url.searchParams.set(
      key,
      value,
    );
  }

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

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
      `API-Football request failed: HTTP ${response.status}.`,
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
      `API-Football returned errors: ${JSON.stringify(
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

  return root.response;
}

function normalizeLineupPlayer(
  value: unknown,
): ApiFootballLineupPlayer {
  const item =
    record(
      value,
      "lineup player item",
    );

  const player =
    record(
      item.player,
      "lineup player",
    );

  return {
    id:
      nullableNumber(
        player.id,
      ),

    name:
      stringValue(
        player.name,
        "lineup player.name",
      ),

    number:
      nullableNumber(
        player.number,
      ),

    position:
      nullableString(
        player.pos,
      ),

    grid:
      nullableString(
        player.grid,
      ),
  };
}

function normalizeLineup(
  raw: unknown,
  fixtureId: number,
): ApiFootballFixtureLineup {
  const item =
    record(
      raw,
      "lineup item",
    );

  const team =
    record(
      item.team,
      "lineup team",
    );

  const startXI =
    Array.isArray(
      item.startXI,
    )
      ? item.startXI.map(
          normalizeLineupPlayer,
        )
      : [];

  const substitutes =
    Array.isArray(
      item.substitutes,
    )
      ? item.substitutes.map(
          normalizeLineupPlayer,
        )
      : [];

  return {
    source:
      API_FOOTBALL_SOURCE,

    fixtureId,

    team: {
      id:
        numberValue(
          team.id,
          "lineup team.id",
        ),

      name:
        stringValue(
          team.name,
          "lineup team.name",
        ),
    },

    formation:
      nullableString(
        item.formation,
      ),

    startXI,

    substitutes,
  };
}

export async function fetchFixtureLineups(
  fixtureId: number,
): Promise<
  ApiFootballFixtureLineup[]
> {
  if (
    !Number.isInteger(
      fixtureId,
    ) ||
    fixtureId <= 0
  ) {
    throw new Error(
      "Fixture ID must be a positive integer.",
    );
  }

  const response =
    await fetchApiFootballArray(
      "/fixtures/lineups",
      {
        fixture:
          String(
            fixtureId,
          ),
      },
    );

  return response.map(
    (item) =>
      normalizeLineup(
        item,
        fixtureId,
      ),
  );
}

function normalizeInjury(
  raw: unknown,
  expectedFixtureId: number,
): ApiFootballInjury {
  const item =
    record(
      raw,
      "injury item",
    );

  const fixture =
    record(
      item.fixture,
      "injury fixture",
    );

  const fixtureId =
    numberValue(
      fixture.id,
      "injury fixture.id",
    );

  if (
    fixtureId !==
    expectedFixtureId
  ) {
    throw new Error(
      "API-Football injury belongs to a different fixture.",
    );
  }

  const team =
    record(
      item.team,
      "injury team",
    );

  const player =
    record(
      item.player,
      "injury player",
    );

  return {
    source:
      API_FOOTBALL_SOURCE,

    fixtureId,

    team: {
      id:
        numberValue(
          team.id,
          "injury team.id",
        ),

      name:
        stringValue(
          team.name,
          "injury team.name",
        ),
    },

    player: {
      id:
        nullableNumber(
          player.id,
        ),

      name:
        stringValue(
          player.name,
          "injury player.name",
        ),
    },

    type:
      nullableString(
        player.type,
      ),

    reason:
      nullableString(
        player.reason,
      ),
  };
}

export async function fetchFixtureInjuries(
  fixtureId: number,
): Promise<
  ApiFootballInjury[]
> {
  if (
    !Number.isInteger(
      fixtureId,
    ) ||
    fixtureId <= 0
  ) {
    throw new Error(
      "Fixture ID must be a positive integer.",
    );
  }

  const response =
    await fetchApiFootballArray(
      "/injuries",
      {
        fixture:
          String(
            fixtureId,
          ),
      },
    );

  const normalized =
  response.map(
    (item) =>
      normalizeInjury(
        item,
        fixtureId,
      ),
  );

return deduplicateFixtureInjuries(
  normalized,
);
}

function injuryIdentity(
  injury:
    ApiFootballInjury,
): string {
  return [
    injury.fixtureId,

    injury.team.id,

    injury.player.id ??
      injury.player.name
        .trim()
        .toLowerCase(),

    injury.type
      ?.trim()
      .toLowerCase() ??
      "",

    injury.reason
      ?.trim()
      .toLowerCase() ??
      "",
  ].join(
    "|",
  );
}

export function deduplicateFixtureInjuries(
  injuries:
    ApiFootballInjury[],
): ApiFootballInjury[] {
  const unique =
    new Map<
      string,
      ApiFootballInjury
    >();

  for (
    const injury
    of injuries
  ) {
    const identity =
      injuryIdentity(
        injury,
      );

    if (
      !unique.has(
        identity,
      )
    ) {
      unique.set(
        identity,
        injury,
      );
    }
  }

  return [
    ...unique.values(),
  ];
}
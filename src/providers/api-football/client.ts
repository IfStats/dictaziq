import {
  API_FOOTBALL_SOURCE,
  type ApiFootballFixturePage,
  type NormalizedApiFootballFixture,
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
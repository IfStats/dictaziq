import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../../lib/env/database";

import {
  fetchFixturesByDate,
} from "./client";

import {
  API_FOOTBALL_SOURCE,
  type ApiFootballFixturePage,
} from "./types";

const CACHE_RESOURCE =
  "fixtures-by-date";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

export type FixtureCacheOrigin =
  | "cache"
  | "api";

export type FixtureCacheResult = {
  page:
    ApiFootballFixturePage;

  origin:
    FixtureCacheOrigin;

  fetchedAt:
    Date;
};

function validateDate(
  date: string,
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new Error(
      "Fixture date must use YYYY-MM-DD.",
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

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

function cachedPage(
  payload: unknown,
  expectedDate: string,
): ApiFootballFixturePage {
  if (
    !isRecord(
      payload,
    )
  ) {
    throw new Error(
      "Cached fixture payload must be an object.",
    );
  }

  if (
    payload.source !==
    API_FOOTBALL_SOURCE
  ) {
    throw new Error(
      "Cached fixture payload has an unexpected provider.",
    );
  }

  if (
    payload.date !==
    expectedDate
  ) {
    throw new Error(
      "Cached fixture payload date does not match its cache key.",
    );
  }

  if (
    !Array.isArray(
      payload.fixtures,
    )
  ) {
    throw new Error(
      "Cached fixture payload is missing fixtures.",
    );
  }

  if (
    typeof payload.results !==
      "number" ||
    !Number.isInteger(
      payload.results,
    ) ||
    payload.results < 0
  ) {
    throw new Error(
      "Cached fixture payload has an invalid result count.",
    );
  }

  if (
    payload.results !==
    payload.fixtures.length
  ) {
    throw new Error(
      "Cached fixture result count does not match its fixture array.",
    );
  }

  return payload as
    ApiFootballFixturePage;
}

function sqlClient():
  SqlClient {
  return neon(
    getDatabaseUrl(),
  );
}

export async function readFixturesByDateCache(
  date: string,
): Promise<
  FixtureCacheResult | null
> {
  validateDate(
    date,
  );

  const sql =
    sqlClient();

  const rows =
    await sql`
      SELECT
        payload,
        result_count,
        fetched_at

      FROM public.provider_response_cache

      WHERE provider =
        ${API_FOOTBALL_SOURCE}

        AND resource =
          ${CACHE_RESOURCE}

        AND cache_key =
          ${date}

      LIMIT 1
    `;

  if (
    rows.length ===
    0
  ) {
    return null;
  }

  const page =
    cachedPage(
      rows[0].payload,
      date,
    );

  const storedCount =
    Number(
      rows[0]
        .result_count,
    );

  if (
    !Number.isInteger(
      storedCount,
    ) ||
    storedCount !==
      page.fixtures.length
  ) {
    throw new Error(
      "Provider cache metadata does not match the cached fixture page.",
    );
  }

  const fetchedAt =
    new Date(
      String(
        rows[0]
          .fetched_at,
      ),
    );

  if (
    !Number.isFinite(
      fetchedAt.getTime(),
    )
  ) {
    throw new Error(
      "Provider cache fetched timestamp is invalid.",
    );
  }

  return {
    page,

    origin:
      "cache",

    fetchedAt,
  };
}

async function persistFixturesByDateCache(
  date: string,
  page: ApiFootballFixturePage,
): Promise<Date> {
  validateDate(
    date,
  );

  if (
    page.date !==
    date
  ) {
    throw new Error(
      "Cannot cache a fixture page under a different date.",
    );
  }

  if (
    page.source !==
    API_FOOTBALL_SOURCE
  ) {
    throw new Error(
      "Cannot cache a fixture page from another provider.",
    );
  }

  if (
    page.results !==
    page.fixtures.length
  ) {
    throw new Error(
      "API-Football result count does not match fixture array.",
    );
  }

  const sql =
    sqlClient();

  const rows =
    await sql`
      INSERT INTO public.provider_response_cache (
        provider,
        resource,
        cache_key,
        payload,
        result_count,
        fetched_at,
        created_at,
        updated_at
      )

      VALUES (
        ${API_FOOTBALL_SOURCE},
        ${CACHE_RESOURCE},
        ${date},
        ${JSON.stringify(
          page,
        )}::jsonb,
        ${page.fixtures.length},
        clock_timestamp(),
        clock_timestamp(),
        clock_timestamp()
      )

      ON CONFLICT (
        provider,
        resource,
        cache_key
      )

      DO UPDATE SET
        payload =
          EXCLUDED.payload,

        result_count =
          EXCLUDED.result_count,

        fetched_at =
          EXCLUDED.fetched_at,

        updated_at =
          clock_timestamp()

      RETURNING
        fetched_at
    `;

  if (
    rows.length !==
    1
  ) {
    throw new Error(
      "Provider fixture cache could not be persisted.",
    );
  }

  const fetchedAt =
    new Date(
      String(
        rows[0]
          .fetched_at,
      ),
    );

  if (
    !Number.isFinite(
      fetchedAt.getTime(),
    )
  ) {
    throw new Error(
      "Persisted provider cache timestamp is invalid.",
    );
  }

  return fetchedAt;
}

export async function getFixturesByDateCached(
  date: string,
  options?: {
    refresh?: boolean;
    cacheOnly?: boolean;
  },
): Promise<
  FixtureCacheResult
> {
  validateDate(
    date,
  );

  const refresh =
    options?.refresh ===
    true;

  const cacheOnly =
    options?.cacheOnly ===
    true;

  /*
   * Normal path:
   *
   * cache -> return
   *
   * No provider request is made when a valid
   * cache exists.
   */
  if (
    !refresh
  ) {
    const cached =
      await readFixturesByDateCache(
        date,
      );

    if (
      cached
    ) {
      return cached;
    }
  }

  /*
   * cacheOnly is the hard safety mode used for
   * testing/development when absolutely no
   * API-Football request may be consumed.
   */
  if (
    cacheOnly
  ) {
    throw new Error(
      `No usable API-Football fixture cache exists for ${date}; network access is disabled by cacheOnly mode.`,
    );
  }

  /*
   * Network is reached only when:
   *
   * 1. no cache exists, or
   * 2. refresh=true was explicitly requested.
   */
  console.log(
    `API-Football network fetch authorized for ${date}.`,
  );

  const page =
    await fetchFixturesByDate(
      date,
    );

  const fetchedAt =
    await persistFixturesByDateCache(
      date,
      page,
    );

  return {
    page,

    origin:
      "api",

    fetchedAt,
  };
}
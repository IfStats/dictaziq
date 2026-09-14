import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../../lib/env/database";

const PROVIDER =
  "api-football";

const TOTAL_CATEGORY =
  "__total__";

const NON_LIVE_CATEGORY =
  "__non_live__";  

const DEFAULT_DAILY_LIMIT =
  100;

const DEFAULT_NON_LIVE_DAILY_LIMIT =
  50;  

export type ApiFootballUsageCategory =
  | "fixtures"
  | "prematch"
  | "live"
  | "results";

export class ApiFootballQuotaExceededError
  extends Error {
  readonly limit:
    number;

  constructor(
    limit: number,
    scope = "daily",
  ) {
    super(
      `API-Football daily request limit reached (${limit} calls per UTC day)`,
    );

    this.name =
      "ApiFootballQuotaExceededError";

    this.limit =
      limit;
  }
}

function dailyLimit():
number {
  const raw =
    process.env
      .API_FOOTBALL_DAILY_LIMIT
      ?.trim();

  if (!raw) {
    return DEFAULT_DAILY_LIMIT;
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      "API_FOOTBALL_DAILY_LIMIT must be a positive integer.",
    );
  }

  return value;
}

function nonLiveDailyLimit():
number {
  const raw =
    process.env
      .API_FOOTBALL_NON_LIVE_DAILY_LIMIT
      ?.trim();

  if (!raw) {
    return DEFAULT_NON_LIVE_DAILY_LIMIT;
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      "API_FOOTBALL_NON_LIVE_DAILY_LIMIT must be a positive integer.",
    );
  }

  return value;
}

export async function reserveApiFootballRequest(
  category:
    ApiFootballUsageCategory,
) {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const limit =
    dailyLimit();

  /*
   * Reserve against one shared total row first.
   *
   * ON CONFLICT ... WHERE makes this atomic:
   * concurrent Railway services cannot push
   * the provider above the configured limit.
   */

  if (
  category !==
    "live"
) {
  const nonLiveLimit =
    nonLiveDailyLimit();

  const nonLiveRows =
    await sql`
      INSERT INTO public.provider_api_usage_daily (
        provider,
        usage_date,
        category,
        request_count,
        updated_at
      )
      VALUES (
        ${PROVIDER},
        (
          clock_timestamp()
          AT TIME ZONE 'UTC'
        )::date,
        ${NON_LIVE_CATEGORY},
        1,
        clock_timestamp()
      )

      ON CONFLICT (
        provider,
        usage_date,
        category
      )

      DO UPDATE SET
        request_count =
          public.provider_api_usage_daily.request_count
          + 1,

        updated_at =
          clock_timestamp()

      WHERE
        public.provider_api_usage_daily.request_count
        < ${nonLiveLimit}

      RETURNING
        request_count
    `;

  if (
    nonLiveRows.length ===
      0
  ) {
    throw new ApiFootballQuotaExceededError(
      nonLiveLimit,
      "non-live daily",
    );
  }
}

  const totalRows =
    await sql`
      INSERT INTO public.provider_api_usage_daily (
        provider,
        usage_date,
        category,
        request_count,
        updated_at
      )
      VALUES (
        ${PROVIDER},
        (
          clock_timestamp()
          AT TIME ZONE 'UTC'
        )::date,
        ${TOTAL_CATEGORY},
        1,
        clock_timestamp()
      )

      ON CONFLICT (
        provider,
        usage_date,
        category
      )

      DO UPDATE SET
        request_count =
          public.provider_api_usage_daily.request_count
          + 1,

        updated_at =
          clock_timestamp()

      WHERE
        public.provider_api_usage_daily.request_count
        < ${limit}

      RETURNING
        usage_date,
        request_count
    `;

  if (
    totalRows.length ===
      0
  ) {
    throw new ApiFootballQuotaExceededError(
      limit,
    );
  }

  /*
   * Category accounting is informational.
   * The __total__ row is the authoritative
   * hard quota gate.
   */
  await sql`
    INSERT INTO public.provider_api_usage_daily (
      provider,
      usage_date,
      category,
      request_count,
      updated_at
    )
    VALUES (
      ${PROVIDER},
      (
        clock_timestamp()
        AT TIME ZONE 'UTC'
      )::date,
      ${category},
      1,
      clock_timestamp()
    )

    ON CONFLICT (
      provider,
      usage_date,
      category
    )

    DO UPDATE SET
      request_count =
        public.provider_api_usage_daily.request_count
        + 1,

      updated_at =
        clock_timestamp()
  `;

  const used =
    Number(
      totalRows[0]
        .request_count,
    );

  return {
    provider:
      PROVIDER,

    category,

    limit,

    used,

    remaining:
      Math.max(
        0,
        limit -
          used,
      ),

    usageDate:
      String(
        totalRows[0]
          .usage_date,
      ),
  };
}

export async function synchronizeApiFootballQuotaFromHeaders(
  headers:
    Headers,
): Promise<void> {
  const rawLimit =
    headers
      .get(
        "x-ratelimit-requests-limit",
      )
      ?.trim();

  const rawRemaining =
    headers
      .get(
        "x-ratelimit-requests-remaining",
      )
      ?.trim();

  if (
    !rawLimit ||
    !rawRemaining
  ) {
    return;
  }

  const providerLimit =
    Number(
      rawLimit,
    );

  const providerRemaining =
    Number(
      rawRemaining,
    );

  if (
    !Number.isInteger(
      providerLimit,
    ) ||
    !Number.isInteger(
      providerRemaining,
    ) ||
    providerLimit < 1 ||
    providerRemaining < 0 ||
    providerRemaining >
      providerLimit
  ) {
    return;
  }

  const providerUsed =
    providerLimit -
    providerRemaining;

  const sql =
    neon(
      getDatabaseUrl(),
    );

  await sql`
    INSERT INTO public.provider_api_usage_daily (
      provider,
      usage_date,
      category,
      request_count,
      updated_at
    )
    VALUES (
      ${PROVIDER},
      (
        clock_timestamp()
        AT TIME ZONE 'UTC'
      )::date,
      ${TOTAL_CATEGORY},
      ${providerUsed},
      clock_timestamp()
    )

    ON CONFLICT (
      provider,
      usage_date,
      category
    )

    DO UPDATE SET
      request_count =
        GREATEST(
          public.provider_api_usage_daily.request_count,
          EXCLUDED.request_count
        ),

      updated_at =
        clock_timestamp()
  `;
}
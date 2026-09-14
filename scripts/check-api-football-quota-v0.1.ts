import "./load-env";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

async function main() {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const tableRows =
    await sql`
      SELECT
        to_regclass(
          'public.provider_api_usage_daily'
        )::text
          AS table_name
    `;

  if (
    String(
      tableRows[0]?.table_name ??
        "",
    ) !==
    "provider_api_usage_daily"
  ) {
    throw new Error(
      "provider_api_usage_daily table is missing.",
    );
  }

  const rows =
    await sql`
      SELECT
        category,
        request_count,
        usage_date,
        updated_at

      FROM public.provider_api_usage_daily

      WHERE
        provider =
          'api-football'

        AND usage_date =
          (
            clock_timestamp()
            AT TIME ZONE 'UTC'
          )::date

      ORDER BY
        category
    `;

  console.log(
    "========================================",
  );

  console.log(
    "DictazIQ API-Football Quota Status",
  );

  console.log(
    "========================================",
  );

  console.log(
    "Provider: api-football",
  );

  console.log(
    "Hard daily limit: 100",
  );

  console.log(
    "Non-live allocation: 50",
  );

  console.log(
    "Live allocation: 50",
  );

  console.log("");

  if (
    rows.length ===
      0
  ) {
    console.log(
      "No DictazIQ-tracked API calls recorded for the current UTC day.",
    );
  } else {
    for (
      const row
      of rows
    ) {
      console.log(
        `${String(
          row.category,
        )}: ${String(
          row.request_count,
        )}`,
      );
    }
  }

  console.log("");

  console.log(
    "PASS: quota ledger is available.",
  );

  console.log(
    "PASS: no API-Football request was made by this check.",
  );
}

main().catch(
  (
    error:
      unknown,
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
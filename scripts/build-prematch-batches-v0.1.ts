import "./load-env";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const VERSION =
  "dictaziq-prematch-batch-builder-v0.1";

type FixtureRow = {
  fixture_id: string;
  kickoff_at: string | Date;
  home_name: string;
  away_name: string;
};

function parseDate(): string {
  const value =
    process.argv[2] ??
    new Date()
      .toISOString()
      .slice(0, 10);

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

function iso(
  value: string | Date,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    throw new Error(
      `Invalid kickoff timestamp: ${String(value)}`,
    );
  }

  return date.toISOString();
}

async function main(): Promise<void> {
  const date =
    parseDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Prematch Batch Builder",
  );
  console.log(
    `Version: ${VERSION}`,
  );
  console.log(
    `Date: ${date}`,
  );
  console.log(
    "Source: DATABASE ONLY",
  );

  const rows =
    await sql`
      SELECT
        fixture.id::text
          AS fixture_id,

        fixture.kickoff_at,

        home.name
          AS home_name,

        away_team.name
          AS away_name

      FROM public.fixtures
        AS fixture

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      WHERE
        fixture.is_demo =
          false

        AND fixture.status =
          'scheduled'

        AND fixture.kickoff_at
          IS NOT NULL

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

        AND fixture.kickoff_at >
          clock_timestamp()

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    ` as FixtureRow[];

  const groups =
    new Map<
      string,
      FixtureRow[]
    >();

  for (
    const row
    of rows
  ) {
    const kickoff =
      iso(
        row.kickoff_at,
      );

    const existing =
      groups.get(
        kickoff,
      ) ?? [];

    existing.push(
      row,
    );

    groups.set(
      kickoff,
      existing,
    );
  }

  console.log(
    `Future scheduled fixtures: ${rows.length}`,
  );
  console.log(
    `Kickoff batches: ${groups.size}`,
  );

  for (
    const [
      kickoff,
      fixtures,
    ]
    of groups
  ) {
    const kickoffDate =
      new Date(
        kickoff,
      );

    const lineupCheckAt =
      new Date(
        kickoffDate.getTime() -
        60 * 60 * 1000,
      );

    const lineupRetryAt =
      new Date(
        kickoffDate.getTime() -
        30 * 60 * 1000,
      );

    const finalReviewAt =
      new Date(
        kickoffDate.getTime() -
        15 * 60 * 1000,
      );

    const batchRows =
      await sql`
        INSERT INTO public.prematch_batches (
          kickoff_at,
          lineup_check_at,
          lineup_retry_at,
          final_review_at,
          fixture_count,
          updated_at
        )
        VALUES (
          ${kickoffDate.toISOString()}::timestamptz,
          ${lineupCheckAt.toISOString()}::timestamptz,
          ${lineupRetryAt.toISOString()}::timestamptz,
          ${finalReviewAt.toISOString()}::timestamptz,
          ${fixtures.length},
          clock_timestamp()
        )
        ON CONFLICT (
          kickoff_at
        )
        DO UPDATE SET
          lineup_check_at =
            EXCLUDED.lineup_check_at,

          lineup_retry_at =
            EXCLUDED.lineup_retry_at,

          final_review_at =
            EXCLUDED.final_review_at,

          fixture_count =
            EXCLUDED.fixture_count,

          updated_at =
            clock_timestamp()
        RETURNING
          id::text
            AS batch_id
      `;

    const batchId =
      String(
        batchRows[0].batch_id,
      );

    for (
      const fixture
      of fixtures
    ) {
      await sql`
        INSERT INTO public.prematch_batch_fixtures (
          batch_id,
          fixture_id
        )
        VALUES (
          ${batchId}::uuid,
          ${fixture.fixture_id}::uuid
        )
        ON CONFLICT (
          fixture_id
        )
        DO UPDATE SET
          batch_id =
            EXCLUDED.batch_id
      `;
    }

    console.log("");
    console.log(
      `Kickoff: ${kickoffDate.toISOString()}`,
    );
    console.log(
      `Fixtures: ${fixtures.length}`,
    );
    console.log(
      `T-60 lineup: ${lineupCheckAt.toISOString()}`,
    );
    console.log(
      `T-30 retry: ${lineupRetryAt.toISOString()}`,
    );
    console.log(
      `T-15 final: ${finalReviewAt.toISOString()}`,
    );

    for (
      const fixture
      of fixtures
    ) {
      console.log(
        `  - ${fixture.home_name} vs ${fixture.away_name}`,
      );
    }
  }

  console.log("");
  console.log(
    "Prematch batch schedule persisted.",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      "Prematch batch build failed:",
      error,
    );

    process.exitCode =
      1;
  },
);

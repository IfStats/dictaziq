import "./load-env";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const VERSION =
  "dictaziq-prematch-scheduler-v0.1";

const MAX_SLEEP_MS =
  15 * 60 * 1000;

type ActionType =
  | "lineup_check"
  | "lineup_retry"
  | "final_review";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type QueryRow =
  Record<
    string,
    unknown
  >;

type PendingAction = {
  batch_id: string;
  kickoff_at: string | Date;
  run_at: string | Date;
  action_type: ActionType;
  fixture_count: number | string;
};

function toDate(
  value: string | Date,
): Date {
  const date =
    value instanceof Date
      ? value
      : new Date(
          value,
        );

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    throw new Error(
      `Invalid scheduler timestamp: ${String(value)}`,
    );
  }

  return date;
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (
      resolve,
    ) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

async function loadNextAction(
  sql: SqlClient,
): Promise<PendingAction | null> {
  const rows =
    await sql`
      WITH batch_actions AS (
        SELECT
          batch.id::text
            AS batch_id,

          batch.kickoff_at,
          batch.fixture_count,

          CASE
            WHEN
              batch.final_review_status = 'pending'
              AND batch.final_review_at <= clock_timestamp()
            THEN 'final_review'

            WHEN
              batch.lineup_retry_status = 'pending'
              AND batch.lineup_retry_at <= clock_timestamp()
            THEN 'lineup_retry'

            WHEN
              batch.lineup_check_status = 'pending'
              AND batch.lineup_check_at <= clock_timestamp()
            THEN 'lineup_check'

            WHEN
              batch.lineup_check_status = 'pending'
            THEN 'lineup_check'

            WHEN
              batch.lineup_retry_status = 'pending'
            THEN 'lineup_retry'

            WHEN
              batch.final_review_status = 'pending'
            THEN 'final_review'

            ELSE NULL
          END
            AS action_type,

          CASE
            WHEN
              batch.final_review_status = 'pending'
              AND batch.final_review_at <= clock_timestamp()
            THEN batch.final_review_at

            WHEN
              batch.lineup_retry_status = 'pending'
              AND batch.lineup_retry_at <= clock_timestamp()
            THEN batch.lineup_retry_at

            WHEN
              batch.lineup_check_status = 'pending'
              AND batch.lineup_check_at <= clock_timestamp()
            THEN batch.lineup_check_at

            WHEN
              batch.lineup_check_status = 'pending'
            THEN batch.lineup_check_at

            WHEN
              batch.lineup_retry_status = 'pending'
            THEN batch.lineup_retry_at

            WHEN
              batch.final_review_status = 'pending'
            THEN batch.final_review_at

            ELSE NULL
          END
            AS run_at

        FROM public.prematch_batches
          AS batch

        WHERE
          batch.kickoff_at >
            clock_timestamp()
      )

      SELECT
        batch_id,
        kickoff_at,
        run_at,
        action_type,
        fixture_count

      FROM batch_actions

      WHERE
        action_type IS NOT NULL
        AND run_at IS NOT NULL

      ORDER BY
        CASE
          WHEN run_at <= clock_timestamp()
          THEN 0
          ELSE 1
        END,
        CASE
          WHEN run_at <= clock_timestamp()
          THEN kickoff_at
          ELSE run_at
        END,
        kickoff_at,
        batch_id

      LIMIT 1
    ` as QueryRow[];

  if (
    rows.length ===
    0
  ) {
    return null;
  }

  const row =
    rows[0];

  const actionType =
    String(
      row.action_type,
    );

  if (
    actionType !==
      "lineup_check" &&
    actionType !==
      "lineup_retry" &&
    actionType !==
      "final_review"
  ) {
    throw new Error(
      `Unexpected action type: ${actionType}`,
    );
  }

  return {
    batch_id:
      String(
        row.batch_id,
      ),

    kickoff_at:
      row.kickoff_at as
        string | Date,

    run_at:
      row.run_at as
        string | Date,

    action_type:
      actionType,

    fixture_count:
      row.fixture_count as
        number | string,
  };
}

async function loadFixtureNames(
  sql: SqlClient,
  batchId: string,
): Promise<string[]> {
  const rows =
    await sql`
      SELECT
        home.name
          AS home_name,

        away_team.name
          AS away_name

      FROM public.prematch_batch_fixtures
        AS batch_fixture

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          batch_fixture.fixture_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      WHERE
        batch_fixture.batch_id =
          ${batchId}::uuid

      ORDER BY
        fixture.provider_id
    ` as QueryRow[];

  return rows.map(
    (
      row,
    ) =>
      `${String(row.home_name)} vs ${String(row.away_name)}`,
  );
}

async function main(): Promise<void> {
  const once =
    process.argv.includes(
      "--once",
    );

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Prematch Scheduler",
  );
  console.log(
    `Version: ${VERSION}`,
  );
  console.log(
    "Mode: OBSERVE ONLY",
  );
  console.log(
    "Provider access: NONE",
  );
  console.log(
    "Forecast execution: DISABLED",
  );

  for (;;) {
    const action =
      await loadNextAction(
        sql,
      );

    if (!action) {
      console.log(
        "No pending prematch actions.",
      );

      if (once) {
        return;
      }

      await sleep(
        5 * 60 * 1000,
      );

      continue;
    }

    const runAt =
      toDate(
        action.run_at,
      );

    const kickoffAt =
      toDate(
        action.kickoff_at,
      );

    const now =
      new Date();

    const delayMs =
      runAt.getTime() -
      now.getTime();

    const fixtureNames =
      await loadFixtureNames(
        sql,
        action.batch_id,
      );

    console.log("");
    console.log(
      `Next action: ${action.action_type}`,
    );
    console.log(
      `Batch: ${action.batch_id}`,
    );
    console.log(
      `Run at: ${runAt.toISOString()}`,
    );
    console.log(
      `Kickoff: ${kickoffAt.toISOString()}`,
    );
    console.log(
      `Fixtures: ${action.fixture_count}`,
    );

    for (
      const fixtureName
      of fixtureNames
    ) {
      console.log(
        `  - ${fixtureName}`,
      );
    }

    if (
      delayMs >
      0
    ) {
      console.log(
        `Wake in: ${Math.ceil(delayMs / 1000)} seconds`,
      );

      if (once) {
        return;
      }

      await sleep(
        Math.min(
          delayMs,
          MAX_SLEEP_MS,
        ),
      );

      continue;
    }

    console.log(
      "ACTION DUE NOW.",
    );

    if (once) {
      return;
    }

    /*
     * v0.1 is deliberately observe-only.
     * Execution wiring is added after the scheduler
     * proves it selects the correct next DB action.
     */
    await sleep(
      60 * 1000,
    );
  }
}

main().catch(
  (
    error,
  ) => {
    console.error(
      "Prematch scheduler failed:",
      error,
    );

    process.exitCode =
      1;
  },
);

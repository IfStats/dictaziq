import "./load-env";

import {
  existsSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  spawnSync,
} from "node:child_process";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const VERSION =
  "dictaziq-prematch-worker-v0.1";

const POLL_INTERVAL_MS =
  60 * 1000;

const STALE_RUNNING_MINUTES =
  30;

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

type ActionType =
  | "lineup_check"
  | "lineup_retry"
  | "final_review";

type TerminalStatus =
  | "completed"
  | "skipped"
  | "failed";

type PendingAction = {
  batchId: string;
  kickoffAt: Date;
  runAt: Date;
  actionType: ActionType;
  fixtureCount: number;
};

type ChildResult = {
  status: number;
  output: string;
};

let stopping =
  false;

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (
      resolveSleep,
    ) => {
      setTimeout(
        resolveSleep,
        milliseconds,
      );
    },
  );
}

function timestamp(
  value: unknown,
  label: string,
): Date {
  const result =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(
            value,
          ),
        );

  if (
    !Number.isFinite(
      result.getTime(),
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return result;
}

function tsxCliPath():
string {
  const path =
    resolve(
      process.cwd(),
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    );

  if (
    !existsSync(
      path,
    )
  ) {
    throw new Error(
      `Local tsx CLI was not found at ${path}.`,
    );
  }

  return path;
}

function printOutput(
  value: string,
): void {
  if (
    value.length ===
    0
  ) {
    return;
  }

  process.stdout.write(
    value,
  );

  if (
    !value.endsWith(
      "\n",
    )
  ) {
    process.stdout.write(
      "\n",
    );
  }
}

function quotaUnavailable(
  output: string,
): boolean {
  const normalized =
    output.toLowerCase();

  return (
    normalized.includes(
      "apifootballquotaexceedederror",
    ) ||
    normalized.includes(
      "api-football daily request limit reached",
    )
  );
}

function openAiUnavailable(
  output: string,
): boolean {
  const normalized =
    output.toLowerCase();

  return [
    "no credits remaining",
    "insufficient_quota",
    "billing_hard_limit_reached",
    "you exceeded your current quota",
    "quota has been exceeded",
  ].some(
    (
      marker,
    ) =>
      normalized.includes(
        marker,
      ),
  );
}

async function recoverStaleClaims(
  sql: SqlClient,
): Promise<number> {
  const lineupCheck =
    await sql`
      UPDATE public.prematch_batches

      SET
        lineup_check_status =
          'pending',

        updated_at =
          clock_timestamp()

      WHERE
        lineup_check_status =
          'running'

        AND updated_at <
          clock_timestamp()
          - (
              ${STALE_RUNNING_MINUTES}
              * interval '1 minute'
            )

        AND kickoff_at >
          clock_timestamp()

      RETURNING id
    `;

  const lineupRetry =
    await sql`
      UPDATE public.prematch_batches

      SET
        lineup_retry_status =
          'pending',

        updated_at =
          clock_timestamp()

      WHERE
        lineup_retry_status =
          'running'

        AND updated_at <
          clock_timestamp()
          - (
              ${STALE_RUNNING_MINUTES}
              * interval '1 minute'
            )

        AND kickoff_at >
          clock_timestamp()

      RETURNING id
    `;

  const finalReview =
    await sql`
      UPDATE public.prematch_batches

      SET
        final_review_status =
          'pending',

        updated_at =
          clock_timestamp()

      WHERE
        final_review_status =
          'running'

        AND updated_at <
          clock_timestamp()
          - (
              ${STALE_RUNNING_MINUTES}
              * interval '1 minute'
            )

        AND kickoff_at >
          clock_timestamp()

      RETURNING id
    `;

  return (
    lineupCheck.length +
    lineupRetry.length +
    finalReview.length
  );
}

async function nextDueAction(
  sql: SqlClient,
): Promise<PendingAction | null> {
  const rows =
    await sql`
      WITH due AS (
        SELECT
          batch.id::text
            AS batch_id,

          batch.kickoff_at,

          batch.lineup_check_at
            AS run_at,

          batch.fixture_count,

          'lineup_check'::text
            AS action_type,

          1
            AS priority

        FROM public.prematch_batches
          AS batch

        WHERE
          batch.kickoff_at >
            clock_timestamp()

          AND batch.lineup_check_status =
            'pending'

          AND batch.lineup_check_at <=
            clock_timestamp()

          AND batch.lineup_retry_status <>
            'running'

          AND batch.final_review_status <>
            'running'

        UNION ALL

        SELECT
          batch.id::text,
          batch.kickoff_at,
          batch.lineup_retry_at,
          batch.fixture_count,
          'lineup_retry'::text,
          2

        FROM public.prematch_batches
          AS batch

        WHERE
          batch.kickoff_at >
            clock_timestamp()

          AND batch.lineup_retry_status =
            'pending'

          AND batch.lineup_retry_at <=
            clock_timestamp()

          AND batch.lineup_check_status
            IN (
              'completed',
              'skipped',
              'failed'
            )

          AND batch.lineup_check_status <>
            'running'

          AND batch.final_review_status <>
            'running'

        UNION ALL

        SELECT
          batch.id::text,
          batch.kickoff_at,
          batch.final_review_at,
          batch.fixture_count,
          'final_review'::text,
          3

        FROM public.prematch_batches
          AS batch

        WHERE
          batch.kickoff_at >
            clock_timestamp()

          AND batch.final_review_status =
            'pending'

          AND batch.final_review_at <=
            clock_timestamp()

          AND batch.lineup_check_status
            IN (
              'completed',
              'skipped',
              'failed'
            )

          AND batch.lineup_retry_status
            IN (
              'completed',
              'skipped',
              'failed'
            )

          AND batch.lineup_check_status <>
            'running'

          AND batch.lineup_retry_status <>
            'running'
      )

      SELECT
        batch_id,
        kickoff_at,
        run_at,
        fixture_count,
        action_type

      FROM due

      ORDER BY
        run_at,
        priority,
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
      `Unexpected prematch action: ${actionType}`,
    );
  }

  return {
    batchId:
      String(
        row.batch_id,
      ),

    kickoffAt:
      timestamp(
        row.kickoff_at,
        "Kickoff",
      ),

    runAt:
      timestamp(
        row.run_at,
        "Action time",
      ),

    actionType,

    fixtureCount:
      Number(
        row.fixture_count,
      ),
  };
}

async function claimAction(
  sql: SqlClient,
  action: PendingAction,
): Promise<boolean> {
  let rows:
    QueryRow[];

  switch (
    action.actionType
  ) {
    case "lineup_check":
      rows =
        await sql`
          UPDATE public.prematch_batches

          SET
            lineup_check_status =
              'running',

            updated_at =
              clock_timestamp()

          WHERE
            id =
              ${action.batchId}::uuid

            AND lineup_check_status =
              'pending'

            AND lineup_check_at <=
              clock_timestamp()

            AND kickoff_at >
              clock_timestamp()

          RETURNING id
        ` as QueryRow[];

      break;

    case "lineup_retry":
      rows =
        await sql`
          UPDATE public.prematch_batches

          SET
            lineup_retry_status =
              'running',

            updated_at =
              clock_timestamp()

          WHERE
            id =
              ${action.batchId}::uuid

            AND lineup_retry_status =
              'pending'

            AND lineup_retry_at <=
              clock_timestamp()

            AND kickoff_at >
              clock_timestamp()

          RETURNING id
        ` as QueryRow[];

      break;

    case "final_review":
      rows =
        await sql`
          UPDATE public.prematch_batches

          SET
            final_review_status =
              'running',

            updated_at =
              clock_timestamp()

          WHERE
            id =
              ${action.batchId}::uuid

            AND final_review_status =
              'pending'

            AND final_review_at <=
              clock_timestamp()

            AND kickoff_at >
              clock_timestamp()

          RETURNING id
        ` as QueryRow[];

      break;
  }

  return (
    rows.length ===
    1
  );
}

function runScript(
  scriptPath: string,
  args: string[],
): ChildResult {
  const absoluteScript =
    resolve(
      process.cwd(),
      scriptPath,
    );

  if (
    !existsSync(
      absoluteScript,
    )
  ) {
    throw new Error(
      `Required script is missing: ${scriptPath}`,
    );
  }

  const result =
    spawnSync(
      process.execPath,
      [
        tsxCliPath(),
        absoluteScript,
        ...args,
      ],
      {
        cwd:
          process.cwd(),

        env:
          process.env,

        encoding:
          "utf8",

        windowsHide:
          false,

        maxBuffer:
          10 *
          1024 *
          1024,
      },
    );

  const stdout =
    result.stdout ??
    "";

  const stderr =
    result.stderr ??
    "";

  printOutput(
    stdout,
  );

  if (
    stderr.length >
    0
  ) {
    process.stderr.write(
      stderr,
    );

    if (
      !stderr.endsWith(
        "\n",
      )
    ) {
      process.stderr.write(
        "\n",
      );
    }
  }

  const errorText =
    result.error
      ? `\n${result.error.message}`
      : "";

  return {
    status:
      result.status ??
      1,

    output:
      `${stdout}\n${stderr}${errorText}`,
  };
}

function executeAction(
  action: PendingAction,
): {
  status: TerminalStatus;
  reason: string;
} {
  if (
    action.actionType ===
      "lineup_check" ||
    action.actionType ===
      "lineup_retry"
  ) {
    const result =
      runScript(
        "scripts/ingest-prematch-lineups-v0.1.ts",
        [
          `--batch-id=${action.batchId}`,
          "--missing-only",
        ],
      );

    if (
      result.status ===
      0
    ) {
      return {
        status:
          "completed",

        reason:
          "Lineup ingestion completed.",
      };
    }

    if (
      quotaUnavailable(
        result.output,
      )
    ) {
      return {
        status:
          "skipped",

        reason:
          "API-Football quota unavailable; later prematch stages may continue.",
      };
    }

    return {
      status:
        "failed",

      reason:
        `Lineup ingestion exited ${result.status}.`,
    };
  }

  const date =
    action.kickoffAt
      .toISOString()
      .slice(
        0,
        10,
      );

  const result =
    runScript(
      "scripts/monitor-real-prematch-gpt-v0.3.ts",
      [
        date,
        "--persist",
        `--batch-id=${action.batchId}`,
      ],
    );

  if (
    result.status ===
    0
  ) {
    return {
      status:
        "completed",

      reason:
        "Final prematch review completed.",
    };
  }

  if (
    openAiUnavailable(
      result.output,
    )
  ) {
    return {
      status:
        "skipped",

      reason:
        "OpenAI unavailable; deterministic published forecast remains authoritative.",
    };
  }

  return {
    status:
      "failed",

    reason:
      `Final prematch review exited ${result.status}.`,
  };
}

async function finishAction(
  sql: SqlClient,
  action: PendingAction,
  status: TerminalStatus,
): Promise<void> {
  switch (
    action.actionType
  ) {
    case "lineup_check":
      await sql`
        UPDATE public.prematch_batches

        SET
          lineup_check_status =
            ${status},

          lineup_check_completed_at =
            clock_timestamp(),

          updated_at =
            clock_timestamp()

        WHERE
          id =
            ${action.batchId}::uuid

          AND lineup_check_status =
            'running'
      `;

      break;

    case "lineup_retry":
      await sql`
        UPDATE public.prematch_batches

        SET
          lineup_retry_status =
            ${status},

          lineup_retry_completed_at =
            clock_timestamp(),

          updated_at =
            clock_timestamp()

        WHERE
          id =
            ${action.batchId}::uuid

          AND lineup_retry_status =
            'running'
      `;

      break;

    case "final_review":
      await sql`
        UPDATE public.prematch_batches

        SET
          final_review_status =
            ${status},

          final_review_completed_at =
            clock_timestamp(),

          updated_at =
            clock_timestamp()

        WHERE
          id =
            ${action.batchId}::uuid

          AND final_review_status =
            'running'
      `;

      break;
  }
}

async function main():
Promise<void> {
  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ AUTONOMOUS PREMATCH WORKER",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Version: ${VERSION}`,
  );

  console.log(
    "T-60: confirmed lineup check",
  );

  console.log(
    "T-30: missing-lineup retry",
  );

  console.log(
    "T-15: final prematch review",
  );

  const recovered =
    await recoverStaleClaims(
      sql,
    );

  console.log(
    `Recovered stale claims: ${recovered}`,
  );

  while (
    !stopping
  ) {
    try {
      const action =
        await nextDueAction(
          sql,
        );

      if (
        !action
      ) {
        await sleep(
          POLL_INTERVAL_MS,
        );

        continue;
      }

      console.log("");
      console.log(
        "========================================",
      );

      console.log(
        `ACTION: ${action.actionType}`,
      );

      console.log(
        `Batch: ${action.batchId}`,
      );

      console.log(
        `Fixtures: ${action.fixtureCount}`,
      );

      console.log(
        `Scheduled: ${action.runAt.toISOString()}`,
      );

      console.log(
        `Kickoff: ${action.kickoffAt.toISOString()}`,
      );

      const claimed =
        await claimAction(
          sql,
          action,
        );

      if (
        !claimed
      ) {
        console.log(
          "Action was already claimed by another worker.",
        );

        continue;
      }

      let outcome:
        {
          status: TerminalStatus;
          reason: string;
        };

      try {
        outcome =
          executeAction(
            action,
          );
      } catch (
        error
      ) {
        outcome = {
          status:
            "failed",

          reason:
            error instanceof Error
              ? error.message
              : "Unknown execution failure.",
        };
      }

      await finishAction(
        sql,
        action,
        outcome.status,
      );

      console.log(
        `Result: ${outcome.status.toUpperCase()}`,
      );

      console.log(
        `Reason: ${outcome.reason}`,
      );
    } catch (
      error
    ) {
      console.error(
        "Prematch worker cycle failed:",
        error instanceof Error
          ? error.message
          : error,
      );

      await sleep(
        POLL_INTERVAL_MS,
      );
    }
  }

  console.log(
    "Prematch worker stopped cleanly.",
  );
}

process.on(
  "SIGTERM",
  () => {
    console.log(
      "SIGTERM received. Stopping prematch worker...",
    );

    stopping =
      true;
  },
);

process.on(
  "SIGINT",
  () => {
    console.log(
      "SIGINT received. Stopping prematch worker...",
    );

    stopping =
      true;
  },
);

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? `Prematch worker failed: ${error.message}`
        : "Prematch worker failed.",
    );

    process.exitCode =
      1;
  },
);
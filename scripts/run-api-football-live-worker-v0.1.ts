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
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const WORKER_VERSION =
  "dictaziq-api-football-live-worker-v0.1";

const DEFAULT_LIVE_INTERVAL_SECONDS =
  300;

const DEFAULT_IDLE_INTERVAL_SECONDS =
  300;

const DEFAULT_LIVE_DAILY_BUDGET =
  50;

let stopping =
  false;

function positiveIntegerEnv(
  name: string,
  fallback: number,
): number {
  const raw =
    process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 30
  ) {
    throw new Error(
      `${name} must be an integer of at least 30 seconds.`,
    );
  }

  return value;
}

function positiveCountEnv(
  name: string,
  fallback: number,
): number {
  const raw =
    process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `${name} must be a positive integer.`,
    );
  }

  return value;
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolveSleep) => {
      setTimeout(
        resolveSleep,
        milliseconds,
      );
    },
  );
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
    !existsSync(path)
  ) {
    throw new Error(
      `Local tsx CLI was not found at ${path}.`,
    );
  }

  return path;
}

async function hasActiveMatchWindow():
Promise<boolean> {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const rows =
    await sql`
      SELECT EXISTS (
        SELECT 1

        FROM public.fixtures
          AS fixture

        WHERE
          fixture.provider =
            'api-football'

          AND fixture.is_demo =
            false

          AND fixture.kickoff_at >=
            clock_timestamp()
            - interval '3 hours'

          AND fixture.kickoff_at <=
            clock_timestamp()
            + interval '15 minutes'

          AND fixture.status IN (
            'scheduled',
            'live',
            'halftime',
            'suspended',
            'unknown'
          )
      ) AS active
    `;

  return (
    rows.length === 1 &&
    rows[0].active === true
  );
}

function runLiveIngestion():
boolean {
  const script =
    resolve(
      process.cwd(),
      "scripts",
      "ingest-api-football-live-fixtures-v0.1.ts",
    );

  if (
    !existsSync(script)
  ) {
    throw new Error(
      `Live ingestion script not found: ${script}`,
    );
  }

  const result =
    spawnSync(
      process.execPath,
      [
        tsxCliPath(),
        script,
      ],
      {
        cwd:
          process.cwd(),

        env:
          process.env,

        stdio:
          "inherit",

        windowsHide:
          false,
      },
    );

  if (
    result.error
  ) {
    console.error(
      "Live ingestion process error:",
      result.error.message,
    );

    return false;
  }

  if (
    result.status !== 0
  ) {
    console.error(
      `Live ingestion exited with code ${result.status ?? 1}.`,
    );

    return false;
  }

  return true;
}

async function liveUsageToday():
Promise<number> {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const rows =
    await sql`
      SELECT
        request_count

      FROM public.provider_api_usage_daily

      WHERE
        provider =
          'api-football'

        AND usage_date =
          (
            clock_timestamp()
            AT TIME ZONE 'UTC'
          )::date

        AND category =
          'live'

      LIMIT 1
    `;

  if (
    rows.length === 0
  ) {
    return 0;
  }

  const value =
    Number(
      rows[0].request_count,
    );

  return Number.isFinite(value)
    ? value
    : 0;
}

async function main() {
  const liveIntervalSeconds =
    positiveIntegerEnv(
      "LIVE_POLL_INTERVAL_SECONDS",
      DEFAULT_LIVE_INTERVAL_SECONDS,
    );

   const liveDailyBudget =
  positiveCountEnv(
    "API_FOOTBALL_LIVE_DAILY_BUDGET",
    DEFAULT_LIVE_DAILY_BUDGET,
  );

  const idleIntervalSeconds =
    positiveIntegerEnv(
      "LIVE_IDLE_INTERVAL_SECONDS",
      DEFAULT_IDLE_INTERVAL_SECONDS,
    );

  console.log(
  `Live daily budget: ${liveDailyBudget} calls`,
);

  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ LIVE SCORE WORKER",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Version: ${WORKER_VERSION}`,
  );

  console.log(
    `Live interval: ${liveIntervalSeconds}s`,
  );

  console.log(
    `Idle interval: ${idleIntervalSeconds}s`,
  );

  while (
    !stopping
  ) {
    try {
      const active =
        await hasActiveMatchWindow();

      if (
  active
) {
  const liveUsed =
    await liveUsageToday();

  console.log(
    `[${new Date().toISOString()}] Active match window detected. Live quota: ${liveUsed}/${liveDailyBudget}.`,
  );

  if (
    liveUsed >=
      liveDailyBudget
  ) {
    console.log(
      "Live API-Football allocation exhausted. Provider polling skipped.",
    );
  } else {
    runLiveIngestion();
  }
} else {
        console.log(
          `[${new Date().toISOString()}] No active match window. Provider polling skipped.`,
        );
      }

      const delay =
        active
          ? liveIntervalSeconds
          : idleIntervalSeconds;

      await sleep(
        delay * 1000,
      );
    } catch (
      error
    ) {
      console.error(
        "Live worker cycle failed:",
        error instanceof Error
          ? error.message
          : error,
      );

      await sleep(
        idleIntervalSeconds *
          1000,
      );
    }
  }

  console.log(
    "DictazIQ live worker stopped cleanly.",
  );
}

process.on(
  "SIGTERM",
  () => {
    console.log(
      "SIGTERM received. Stopping live worker...",
    );

    stopping =
      true;
  },
);

process.on(
  "SIGINT",
  () => {
    console.log(
      "SIGINT received. Stopping live worker...",
    );

    stopping =
      true;
  },
);

main().catch(
  (
    error,
  ) => {
    console.error(
      "Live worker failed:",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
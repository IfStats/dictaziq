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

const VERSION =
  "dictaziq-production-window-v0.1";

const PRODUCTION_CYCLE =
  "scripts/production-cycle-v0.4.ts";

function tsxCliPath(): string {
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
      `Local tsx CLI was not found at ${path}. Run npm install first.`,
    );
  }

  return path;
}

function timestamp(
  value: unknown,
  label: string,
): Date {
  const date =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(value),
        );

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return date;
}

function utcDate(
  value: Date,
): string {
  return value
    .toISOString()
    .slice(
      0,
      10,
    );
}

function plusUtcDays(
  value: Date,
  days: number,
): Date {
  return new Date(
    value.getTime() +
      days *
        24 *
        60 *
        60 *
        1000,
  );
}

function runProductionCycle(
  date: string,
  forecastOnly: boolean,
): number {
  const absoluteScript =
    resolve(
      process.cwd(),
      PRODUCTION_CYCLE,
    );

  if (
    !existsSync(
      absoluteScript,
    )
  ) {
    throw new Error(
      `Production cycle is missing: ${PRODUCTION_CYCLE}`,
    );
  }

  const result =
    spawnSync(
      process.execPath,
      [
  tsxCliPath(),
  absoluteScript,
  date,
  "--execute",

  ...(
    forecastOnly
      ? [
          "--forecast-only",
        ]
      : []
  ),
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
    throw result.error;
  }

  return result.status ?? 1;
}

async function main(): Promise<void> {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const rows =
    await sql`
      SELECT
        clock_timestamp()
          AS now
    `;

  if (
    rows.length !==
    1
  ) {
    throw new Error(
      "Database clock could not be read.",
    );
  }

  const now =
    timestamp(
      rows[0].now,
      "Database clock",
    );

  const today =
    utcDate(
      now,
    );

  const tomorrow =
    utcDate(
      plusUtcDays(
        now,
        1,
      ),
    );

  console.log(
    "========================================",
  );
  console.log(
    "DICTAZIQ AUTONOMOUS PRODUCTION WINDOW",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Version: ${VERSION}`,
  );
  console.log(
    `Database time: ${now.toISOString()}`,
  );
  console.log(
    `Today: ${today}`,
  );
  console.log(
    `Tomorrow: ${tomorrow}`,
  );

  const dates = [
    today,
    tomorrow,
  ];

  const failures:
    string[] = [];

  for (
    const date
    of dates
  ) {
    console.log("");
    console.log(
      "========================================",
    );
    console.log(
      `PRODUCTION DATE: ${date}`,
    );
    console.log(
      "========================================",
    );

    const forecastOnly =
  date ===
  tomorrow;

console.log(
  `Lifecycle: ${forecastOnly ? "FORECAST ONLY" : "FULL"}`,
);

    const status =
      runProductionCycle(
        date,
        forecastOnly,
      );

    if (
      status !==
      0
    ) {
      failures.push(
        `${date}: production cycle exited ${status}`,
      );

      console.error(
        `PRODUCTION DATE FAILED: ${date}`,
      );

      /*
       * Failure isolation:
       * one date must never prevent the other
       * date from being attempted.
       */
      continue;
    }

    console.log(
      `PRODUCTION DATE COMPLETE: ${date}`,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    "PRODUCTION WINDOW SUMMARY",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Dates attempted: ${dates.length}`,
  );
  console.log(
    `Dates successful: ${dates.length - failures.length}`,
  );
  console.log(
    `Dates failed: ${failures.length}`,
  );

  for (
    const failure
    of failures
  ) {
    console.error(
      `- ${failure}`,
    );
  }

  if (
    failures.length >
    0
  ) {
    throw new Error(
      "Production window completed with one or more isolated date failures. A later scheduled execution can safely retry.",
    );
  }

  console.log(
    "Autonomous production window completed successfully.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Production window failed: ${error.message}`
        : "Production window failed.",
    );

    process.exitCode =
      1;
  },
);

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
  "dictaziq-fixture-window-v0.1";

const INGEST_SCRIPT =
  "scripts/ingest-api-football-daily-fixtures-v0.4.ts";

const BATCH_SCRIPT =
  "scripts/build-prematch-batches-v0.1.ts";

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

function runScript(
  script: string,
  args: string[],
): number {
  const absoluteScript =
    resolve(
      process.cwd(),
      script,
    );

  if (
    !existsSync(
      absoluteScript,
    )
  ) {
    throw new Error(
      `Required runtime script is missing: ${script}`,
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

  const dates = [
    today,
    tomorrow,
  ];

  console.log(
    "========================================",
  );
  console.log(
    "DICTAZIQ FIXTURE WINDOW",
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
    `Dates: ${dates.join(", ")}`,
  );

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
      `FIXTURE INGESTION: ${date}`,
    );
    console.log(
      "========================================",
    );

    const ingestStatus =
      runScript(
        INGEST_SCRIPT,
        [
          date,
        ],
      );

    if (
      ingestStatus !==
      0
    ) {
      failures.push(
        `${date}: fixture ingestion exited ${ingestStatus}`,
      );

      console.error(
        `FIXTURE INGESTION FAILED: ${date}`,
      );

      // Do not let one date block the other.
      continue;
    }

    console.log("");
    console.log(
      `PREMATCH BATCH BUILD: ${date}`,
    );

    const batchStatus =
      runScript(
        BATCH_SCRIPT,
        [
          date,
        ],
      );

    if (
      batchStatus !==
      0
    ) {
      failures.push(
        `${date}: prematch batch build exited ${batchStatus}`,
      );

      console.error(
        `PREMATCH BATCH BUILD FAILED: ${date}`,
      );
    }
  }

  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    "FIXTURE WINDOW SUMMARY",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Dates attempted: ${dates.length}`,
  );
  console.log(
    `Failures: ${failures.length}`,
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
      "Fixture window completed with one or more failures. The next scheduled run can safely retry.",
    );
  }

  console.log(
    "Fixture window completed successfully.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Fixture window failed: ${error.message}`
        : "Fixture window failed.",
    );

    process.exitCode =
      1;
  },
);

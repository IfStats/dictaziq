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

const VERSION =
  "dictaziq-api-football-daily-fixtures-v0.2";

const INNER_SCRIPT =
  "scripts/ingest-api-football-daily-fixtures-v0.1.ts";

type Runner = {
  command:
    string;

  prefix:
    string[];
};

function resolveTsxRunner():
  Runner {
  const npmExecPath =
    process.env
      .npm_execpath
      ?.trim();

  if (
    npmExecPath
  ) {
    return {
      command:
        process.execPath,

      prefix: [
        npmExecPath,
        "exec",
        "--",
        "tsx",
      ],
    };
  }

  const localTsx =
    resolve(
      process.cwd(),
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    );

  if (
    !existsSync(
      localTsx,
    )
  ) {
    throw new Error(
      "Unable to locate local tsx runner.",
    );
  }

  return {
    command:
      process.execPath,

    prefix: [
      localTsx,
    ],
  };
}

function isQuotaError(
  text:
    string,
): boolean {
  const normalized =
    text.toLowerCase();

  return (
    normalized.includes(
      "reached the request limit",
    ) ||
    normalized.includes(
      "request limit for the day",
    ) ||
    normalized.includes(
      "daily request limit",
    ) ||
    (
      normalized.includes(
        "api-football returned errors",
      ) &&
      normalized.includes(
        "upgrade your plan",
      )
    )
  );
}

function main():
  void {
  const forwardedArgs =
    process.argv
      .slice(2);

  const runner =
    resolveTsxRunner();

  console.log(
    "DictazIQ Quota-Tolerant Fixture Ingestion",
  );

  console.log(
    `Version: ${VERSION}`,
  );

  console.log(
    `Underlying runner: ${INNER_SCRIPT}`,
  );

  const result =
    spawnSync(
      runner.command,
      [
        ...runner.prefix,
        INNER_SCRIPT,
        ...forwardedArgs,
      ],
      {
        env:
          process.env,

        encoding:
          "utf8",

        maxBuffer:
          16 *
          1024 *
          1024,

        windowsHide:
          false,
      },
    );

  const stdout =
    result.stdout ??
    "";

  const stderr =
    result.stderr ??
    "";

  if (
    stdout.length >
    0
  ) {
    process.stdout.write(
      stdout,
    );
  }

  if (
    stderr.length >
    0
  ) {
    process.stderr.write(
      stderr,
    );
  }

  if (
    result.error
  ) {
    throw result.error;
  }

  if (
    result.status ===
    0
  ) {
    console.log("");
    console.log(
      "FIXTURE INGESTION STATUS: COMPLETE",
    );

    return;
  }

  const combined =
    `${stdout}\n${stderr}`;

  if (
    isQuotaError(
      combined,
    )
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      "FIXTURE INGESTION DEFERRED",
    );

    console.log(
      "========================================",
    );

    console.log(
      "Reason: API-Football daily request quota exhausted.",
    );

    console.log(
      "No fixture identity was fabricated.",
    );

    console.log(
      "Existing persisted fixtures remain available to the production cycle.",
    );

    console.log(
      "Fixture ingestion will resume automatically when the provider quota is available.",
    );

    /*
     * Provider quota exhaustion is an
     * availability condition, not an integrity
     * failure. Exit successfully so the worker
     * may continue with already persisted data.
     */
    return;
  }

  throw new Error(
    `Underlying fixture ingestion failed with exit code ${String(
      result.status,
    )}.`,
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error("");

  console.error(
    error instanceof Error
      ? `Quota-tolerant fixture ingestion failed: ${error.message}`
      : "Quota-tolerant fixture ingestion failed.",
  );

  process.exitCode =
    1;
}

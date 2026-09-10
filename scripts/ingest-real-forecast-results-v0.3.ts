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
  "dictaziq-production-result-ingestion-v0.3";

const INNER_SCRIPT =
  "scripts/ingest-real-forecast-results-v0.2.ts";

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
    normalized.includes(
      "api-football returned errors",
    ) &&
    normalized.includes(
      "upgrade your plan",
    )
  );
}

function main(): void {
  const forwardedArgs =
    process.argv
      .slice(2);

  const runner =
    resolveTsxRunner();

  console.log(
    "DictazIQ Quota-Tolerant Result Ingestion",
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
          10 *
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
      "RESULT INGESTION STATUS: COMPLETE",
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
      "RESULT INGESTION DEFERRED",
    );

    console.log(
      "========================================",
    );

    console.log(
      "Reason: API-Football daily request quota exhausted.",
    );

    console.log(
      "No result snapshot was fabricated.",
    );

    console.log(
      "No pending forecast was force-settled.",
    );

    console.log(
      "The production cycle may continue; result ingestion can resume when the provider is available.",
    );

    /*
     * Intentional exit code 0.
     *
     * Result settlement is eventually consistent.
     * Provider quota exhaustion is not a corrupt
     * prediction-engine state.
     */
    return;
  }

  throw new Error(
    `Underlying result ingestion failed with exit code ${String(
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
      ? `Quota-tolerant result ingestion failed: ${error.message}`
      : "Quota-tolerant result ingestion failed.",
  );

  process.exitCode =
    1;
}
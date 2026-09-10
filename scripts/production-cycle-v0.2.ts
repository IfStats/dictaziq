import "./load-env";

import {
  existsSync,
} from "node:fs";

import {
  spawnSync,
} from "node:child_process";

import {
  resolve,
} from "node:path";

const CYCLE_VERSION =
  "dictaziq-production-cycle-v0.2";

type Stage = {
  name:
    string;

  script:
    string;

  args:
    string[];
};

type Runner = {
  command:
    string;

  prefix:
    string[];
};

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (
          argument,
        ) =>
          !argument.startsWith(
            "--",
          ),
      ) ??
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

  const parsed =
    new Date(
      `${value}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(0, 10) !==
      value
  ) {
    throw new Error(
      "Invalid production-cycle date.",
    );
  }

  return value;
}

function executeRequested():
  boolean {
  return process.argv.includes(
    "--execute",
  );
}

function optionalPositiveInteger(
  flag:
    string,
):
  number |
  null {
  const prefix =
    `--${flag}=`;

  const argument =
    process.argv.find(
      (
        value,
      ) =>
        value.startsWith(
          prefix,
        ),
    );

  if (
    !argument
  ) {
    return null;
  }

  const value =
    Number(
      argument.slice(
        prefix.length,
      ),
    );

  if (
    !Number.isInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new Error(
      `--${flag} must be a positive integer.`,
    );
  }

  return value;
}

function monitorWindowMinutes():
  number {
  const value =
    optionalPositiveInteger(
      "monitor-window",
    ) ??
    180;

  if (
    value >
    2880
  ) {
    throw new Error(
      "--monitor-window cannot exceed 2880 minutes.",
    );
  }

  return value;
}

function resolveTsxRunner():
  Runner {
  /*
   * Preferred path:
   *
   * npm/npx normally exposes npm_execpath.
   * Running npm-cli.js through the active Node
   * binary avoids Windows npm.cmd spawning issues.
   */
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

  /*
   * Direct fallback for environments where the
   * cycle is launched without npm metadata.
   */
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
      [
        "Unable to locate the local tsx runner.",
        "Run production-cycle-v0.2 through npm/npx",
        "or ensure tsx is installed locally.",
      ].join(
        " ",
      ),
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

function runStage(
  runner:
    Runner,

  stage:
    Stage,

  index:
    number,

  total:
    number,
): void {
  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `STAGE ${index}/${total}: ${stage.name}`,
  );

  console.log(
    "========================================",
  );

  console.log(
    `Script: ${stage.script}`,
  );

  if (
    stage.args.length >
    0
  ) {
    console.log(
      `Arguments: ${stage.args.join(" ")}`,
    );
  }

  const startedAt =
    Date.now();

  const result =
    spawnSync(
      runner.command,
      [
        ...runner.prefix,
        stage.script,
        ...stage.args,
      ],
      {
        stdio:
          "inherit",

        env:
          process.env,

        windowsHide:
          false,
      },
    );

  if (
    result.error
  ) {
    throw result.error;
  }

  if (
    result.status !==
    0
  ) {
    throw new Error(
      [
        `Production cycle stopped at "${stage.name}".`,
        `Exit code: ${String(
          result.status,
        )}.`,
      ].join(
        " ",
      ),
    );
  }

  const elapsedSeconds =
    (
      Date.now() -
      startedAt
    ) /
    1000;

  console.log("");
  console.log(
    `STAGE COMPLETE: ${stage.name} (${elapsedSeconds.toFixed(1)}s)`,
  );
}

function main(): void {
  const date =
    requestedDate();

  const execute =
    executeRequested();

  const gptLimit =
    optionalPositiveInteger(
      "gpt-limit",
    );

  const monitorLimit =
    optionalPositiveInteger(
      "monitor-limit",
    );

  const monitorWindow =
    monitorWindowMinutes();

  const runner =
    resolveTsxRunner();

  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ PRODUCTION CYCLE",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Version: ${CYCLE_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Mode: ${execute ? "EXECUTE" : "DRY RUN"}`,
  );

  console.log(
    `GPT fallback limit: ${gptLimit ?? "ALL"}`,
  );

  console.log(
    `Monitor window: ${monitorWindow} minutes`,
  );

  console.log(
    `Monitor limit: ${monitorLimit ?? "ALL"}`,
  );

  if (
    !execute
  ) {
    console.log("");
    console.log(
      "DRY RUN: prediction/result history will not be intentionally written.",
    );
  }

  const unifiedGenerationArgs =
    [
      date,
      ...(execute
        ? [
            "--persist",
          ]
        : []),
    ];

  const unifiedPublicationArgs =
    [
      date,
      ...(execute
        ? [
            "--publish",
          ]
        : []),
    ];

  const gptFallbackArgs =
    [
      date,

      ...(gptLimit !==
      null
        ? [
            `--limit=${gptLimit}`,
          ]
        : []),

      ...(execute
        ? [
            "--persist",
            "--publish",
          ]
        : []),
    ];

  const monitorArgs =
    [
      date,

      `--window-minutes=${monitorWindow}`,

      ...(monitorLimit !==
      null
        ? [
            `--limit=${monitorLimit}`,
          ]
        : []),

      ...(execute
        ? [
            "--persist",
          ]
        : []),
    ];

  const resultArgs =
    [
      date,

      ...(execute
        ? [
            "--persist",
          ]
        : []),
    ];

  const baselineSettlementArgs =
    [
      date,

      ...(execute
        ? [
            "--settle",
          ]
        : []),
    ];

  const revisionSettlementArgs =
    [
      date,

      ...(execute
        ? [
            "--settle",
          ]
        : []),
    ];

  const stages:
    Stage[] = [
      {
        name:
          "Database connectivity",

        script:
          "scripts/check-db.ts",

        args: [],
      },

      {
        name:
          "Generate Unified mathematical baselines",

        script:
          "scripts/generate-real-unified-predictions-v0.1.ts",

        args:
          unifiedGenerationArgs,
      },

      {
        name:
          "Publish Unified mathematical baselines",

        script:
          "scripts/publish-real-unified-predictions-v0.1.ts",

        args:
          unifiedPublicationArgs,
      },

      {
        name:
          "Generate GPT research fallback baselines",

        script:
          "scripts/generate-real-gpt-fallback-predictions-v0.1.ts",

        args:
          gptFallbackArgs,
      },

      {
        name:
          "Run GPT pre-match monitor",

        script:
          "scripts/monitor-real-prematch-gpt-v0.2.ts",

        args:
          monitorArgs,
      },

      {
        name:
          "Ingest production results",

        script:
          "scripts/ingest-real-forecast-results-v0.1.ts",

        args:
          resultArgs,
      },

      {
        name:
          "Settle baseline forecasts",

        script:
          "scripts/settle-real-baseline-forecasts-v0.1.ts",

        args:
          baselineSettlementArgs,
      },

      {
        name:
          "Settle forecast revisions",

        script:
          "scripts/settle-real-forecast-revisions-v0.1.ts",

        args:
          revisionSettlementArgs,
      },

      {
        name:
          "Generate real forecast scorecard",

        script:
          "scripts/scorecard-real-forecasts-v0.1.ts",

        args: [
          date,
        ],
      },
    ];

  const startedAt =
    Date.now();

  for (
    let index =
      0;
    index <
    stages.length;
    index +=
      1
  ) {
    runStage(
      runner,
      stages[index],
      index + 1,
      stages.length,
    );
  }

  const elapsedSeconds =
    (
      Date.now() -
      startedAt
    ) /
    1000;

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ PRODUCTION CYCLE COMPLETE",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Mode: ${execute ? "EXECUTE" : "DRY RUN"}`,
  );

  console.log(
    `Stages completed: ${stages.length}/${stages.length}`,
  );

  console.log(
    `Elapsed: ${elapsedSeconds.toFixed(1)}s`,
  );

  console.log("");
  console.log(
    execute
      ? "Production forecast lifecycle completed successfully."
      : "Dry-run lifecycle completed successfully.",
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
    "========================================",
  );

  console.error(
    "PRODUCTION CYCLE FAILED",
  );

  console.error(
    "========================================",
  );

  console.error(
    error instanceof Error
      ? error.message
      : String(
          error,
        ),
  );

  process.exitCode =
    1;
}
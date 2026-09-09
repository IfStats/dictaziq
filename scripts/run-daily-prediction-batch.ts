import "./load-env";

import {
  spawnSync,
} from "node:child_process";

function requestedDate():
  string {
  const value =
    process.argv[2]?.trim();

  if (!value) {
    return new Date()
      .toISOString()
      .slice(
        0,
        10,
      );
  }

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
      .slice(
        0,
        10,
      ) !== value
  ) {
    throw new Error(
      "Invalid prediction date.",
    );
  }

  return value;
}

function requestedRatingPages():
  number {
  const raw =
    process.argv[3]?.trim() ||
    "5";

  const value =
    Number(raw);

  if (
    !Number.isInteger(
      value,
    ) ||
    value < 1 ||
    value > 20
  ) {
    throw new Error(
      "Rating pages must be between 1 and 20.",
    );
  }

  return value;
}

type Stage = {
  name: string;
  script: string;
  args: string[];
};

function runStage(
  stage: Stage,
): void {
  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `STAGE: ${stage.name}`,
  );

  console.log(
    "========================================",
  );

  /*
   * When this script is itself launched through
   * npm, npm exposes the path to npm-cli.js in
   * npm_execpath.
   *
   * Running npm-cli.js through the current Node
   * executable avoids Windows .cmd spawning
   * problems such as:
   *
   * spawnSync npm.cmd EINVAL
   */
  const npmExecPath =
    process.env
      .npm_execpath
      ?.trim();

  if (!npmExecPath) {
    throw new Error(
      "npm_execpath is unavailable. Run this batch through npm.",
    );
  }

  const result =
    spawnSync(
      process.execPath,
      [
        npmExecPath,
        "run",
        stage.script,
        "--",
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

  if (result.error) {
    throw result.error;
  }

  if (
    result.status !== 0
  ) {
    throw new Error(
      `Daily pipeline stopped at stage "${stage.name}" with exit code ${String(
        result.status,
      )}.`,
    );
  }
}

function main() {
  const date =
    requestedDate();

  const ratingPages =
    requestedRatingPages();

  console.log(
    "DictazIQ Daily Prediction Batch",
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `FootballDatabase pages: ${ratingPages}`,
  );

  const stages:
    Stage[] = [
      {
        name:
          "Refresh structural ratings",

        script:
          "ingest:football-database",

        args: [
          String(
            ratingPages,
          ),
        ],
      },

      {
        name:
          "Scan rated fixtures",

        script:
          "scan:rated-fixtures",

        args: [
          date,
        ],
      },

      {
        name:
          "Persist supported fixtures",

        script:
          "ingest:rated-fixtures",

        args: [
          date,
        ],
      },

      {
  name:
    "Capture Goals and BTTS evidence",

  script:
    "analyze:real-markets",

  args: [
    date,
  ],
},

{
  name:
    "Generate preliminary market decisions",

  script:
    "predict:real-markets-v0.1",

  args: [
    date,
  ],
},

{
  name:
    "Capture result context",

  script:
    "ingest:result-context",

  args: [
    date,
  ],
},

      {
        name:
          "Generate frozen Core v1 predictions",

        script:
          "predict:real-markets-v0.2",

        args: [
          date,
        ],
      },

      {
        name:
          "Publish eligible predictions",

        script:
          "publish:real-markets-v0.2",

        args: [
          date,
        ],
      },
    ];

  for (
    const stage
    of stages
  ) {
    runStage(
      stage,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ DAILY BATCH COMPLETE",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Prediction date: ${date}`,
  );

  console.log(
    "Published predictions are now available to the homepage.",
  );

  console.log(
    "Unsupported or weak-evidence fixtures remain abstentions.",
  );
}

try {
  main();
} catch (
  error
) {
  console.error("");
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
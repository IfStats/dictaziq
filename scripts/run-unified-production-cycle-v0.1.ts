import "./load-env";

import {
  spawnSync,
} from "node:child_process";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

const PRODUCTION_CYCLE_VERSION =
  "dictaziq-unified-production-cycle-v0.1";

const MODEL_VERSION =
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01;

type Stage = {
  name:
    string;

  npmScript:
    string;

  dryRunArgs:
    string[];

  executeArgs:
    string[];
};

function requestedDate():
  string {
  const args =
    process.argv
      .slice(2)
      .filter(
        (
          value,
        ) =>
          !value.startsWith(
            "--",
          ),
      );

  const value =
    args[0] ??
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

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
      ) !==
      value
  ) {
    throw new Error(
      "Production-cycle date is invalid.",
    );
  }

  return value;
}

function executionRequested():
  boolean {
  return process.argv
    .slice(2)
    .includes(
      "--execute",
    );
}

function runStage(
  stage:
    Stage,
  execute:
    boolean,
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

  const npmExecPath =
    process.env
      .npm_execpath
      ?.trim();

  if (
    !npmExecPath
  ) {
    throw new Error(
      [
        "npm_execpath is unavailable.",
        "Run the production cycle through npm:",
        "npm run production:unified-v0.1 -- YYYY-MM-DD",
      ].join(
        " ",
      ),
    );
  }

  const args =
    execute
      ? stage.executeArgs
      : stage.dryRunArgs;

  const result =
    spawnSync(
      process.execPath,
      [
        npmExecPath,
        "run",
        stage.npmScript,
        "--",
        ...args,
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
        "Unified production cycle stopped.",
        `Stage="${stage.name}".`,
        `ExitCode=${String(
          result.status,
        )}.`,
      ].join(
        " ",
      ),
    );
  }
}

async function reportObservationState(
  date:
    string,
): Promise<void> {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const rows =
    await sql`
      SELECT
        count(DISTINCT prediction.id)::int
          AS published_forecasts,

        count(DISTINCT outcome.id)::int
          AS settled_forecasts,

        count(
          DISTINCT prediction.id
        ) FILTER (
          WHERE outcome.id IS NULL
        )::int
          AS pending_forecasts,

        count(
          DISTINCT outcome.id
        ) FILTER (
          WHERE outcome.outcome = 'won'
        )::int
          AS won,

        count(
          DISTINCT outcome.id
        ) FILTER (
          WHERE outcome.outcome = 'lost'
        )::int
          AS lost,

        count(
          DISTINCT outcome.id
        ) FILTER (
          WHERE outcome.outcome = 'void'
        )::int
          AS voided

      FROM public.predictions
        AS prediction

      JOIN public.model_versions
        AS model
        ON model.id =
          prediction.model_version_id

      LEFT JOIN public.prediction_outcomes
        AS outcome
        ON outcome.prediction_id =
          prediction.id

        AND outcome.market =
          '1x2'

      WHERE model.version =
        ${MODEL_VERSION}

        AND prediction.is_demo =
          false

        AND prediction.published_at
          IS NOT NULL

        AND (
          prediction.kickoff_at_generation
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date
    `;

  const row =
    rows[0];

  const published =
    Number(
      row?.published_forecasts ??
        0,
    );

  const settled =
    Number(
      row?.settled_forecasts ??
        0,
    );

  const pending =
    Number(
      row?.pending_forecasts ??
        0,
    );

  const won =
    Number(
      row?.won ??
        0,
    );

  const lost =
    Number(
      row?.lost ??
        0,
    );

  const voided =
    Number(
      row?.voided ??
        0,
    );

  const graded =
    won +
    lost;

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "PRODUCTION OBSERVATION STATE",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Published forecasts: ${published}`,
  );

  console.log(
    `Settled forecasts: ${settled}`,
  );

  console.log(
    `Pending forecasts: ${pending}`,
  );

  console.log(
    `Won: ${won}`,
  );

  console.log(
    `Lost: ${lost}`,
  );

  console.log(
    `Void: ${voided}`,
  );

  console.log(
    `Graded: ${graded}`,
  );

  console.log(
    graded >
      0
      ? `Raw forecast accuracy: ${(
          (
            won /
            graded
          ) *
          100
        ).toFixed(
          2,
        )}%`
      : "Raw forecast accuracy: N/A",
  );
}

async function main() {
  const date =
    requestedDate();

  const execute =
    executionRequested();

  console.log(
    "DictazIQ Unified Production Cycle",
  );

  console.log(
    `Cycle: ${PRODUCTION_CYCLE_VERSION}`,
  );

  console.log(
    `Model: ${MODEL_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Mode: ${execute ? "EXECUTE" : "DRY RUN"}`,
  );

  /*
   * This orchestration layer intentionally does
   * not alter model mathematics.
   *
   * It coordinates already-versioned,
   * independently guarded production stages.
   */
  const stages:
    Stage[] = [
      {
        name:
          "Generate Unified forecasts",

        npmScript:
          "predict:real-unified-v0.1",

        dryRunArgs: [
          date,
        ],

        executeArgs: [
          date,
          "--persist",
        ],
      },

      {
        name:
          "Publish eligible Unified forecasts",

        npmScript:
          "publish:real-unified-v0.1",

        dryRunArgs: [
          date,
        ],

        executeArgs: [
          date,
          "--publish",
        ],
      },

      {
        name:
          "Ingest completed API-Football results",

        npmScript:
          "ingest:real-unified-results-v0.1",

        dryRunArgs: [
          date,
        ],

        executeArgs: [
          date,
          "--persist",
        ],
      },

      {
        name:
          "Settle published Unified forecasts",

        npmScript:
          "settle:real-unified-v0.1",

        dryRunArgs: [
          date,
        ],

        executeArgs: [
          date,
          "--settle",
        ],
      },
    ];

  for (
    const stage
    of stages
  ) {
    runStage(
      stage,
      execute,
    );
  }

  await reportObservationState(
    date,
  );

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "UNIFIED PRODUCTION CYCLE COMPLETE",
  );

  console.log(
    "========================================",
  );

  if (
    execute
  ) {
    console.log(
      "All eligible writes were attempted through their guarded production stages.",
    );

    console.log(
      "Repeated execution is expected to be idempotent.",
    );
  } else {
    console.log(
      "Dry run only. No production-cycle write flags were supplied to child stages.",
    );
  }
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Unified production cycle failed: ${error.message}`
        : "Unified production cycle failed.",
    );

    process.exitCode =
      1;
  },
);
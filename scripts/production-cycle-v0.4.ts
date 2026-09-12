import "./load-env";

import assert from "node:assert/strict";
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
  "dictaziq-production-cycle-v0.4";

const DEFAULT_MONITOR_WINDOW_MINUTES =
  180;

const MAX_TRANSIENT_ATTEMPTS =
  3;

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type Stage = {
  name: string;
  script: string;
  args: string[];
  retryTransient?: boolean;
};

type ParsedArgs = {
  date: string;
  execute: boolean;
  gptLimit:
    number |
    null;
  monitorLimit:
    number |
    null;
  monitorWindowMinutes:
    number;
};

type CommandResult = {
  status: number;
  output: string;
};

function parsePositiveIntegerFlag(
  flag: string,
  value: string,
): number {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed < 1
  ) {
    throw new Error(
      `${flag} must be a positive integer.`,
    );
  }

  return parsed;
}

function parseArguments():
ParsedArgs {
  const args =
    process.argv.slice(
      2,
    );

  const positional =
    args.filter(
      (
        argument,
      ) =>
        !argument.startsWith(
          "--",
        ),
    );

  if (
    positional.length > 1
  ) {
    throw new Error(
      "Only one positional date argument is supported.",
    );
  }

  const date =
    positional[0] ??
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  const parsedDate =
    new Date(
      `${date}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(
      parsedDate.getTime(),
    ) ||
    parsedDate
      .toISOString()
      .slice(
        0,
        10,
      ) !== date
  ) {
    throw new Error(
      "Invalid production-cycle date.",
    );
  }

  let execute =
    false;

  let gptLimit:
    number |
    null =
    null;

  let monitorLimit:
    number |
    null =
    null;

  let monitorWindowMinutes =
    DEFAULT_MONITOR_WINDOW_MINUTES;

  for (
    const argument
    of args
  ) {
    if (
      !argument.startsWith(
        "--",
      )
    ) {
      continue;
    }

    if (
      argument ===
      "--execute"
    ) {
      execute =
        true;

      continue;
    }

    if (
      argument.startsWith(
        "--gpt-limit=",
      )
    ) {
      gptLimit =
        parsePositiveIntegerFlag(
          "--gpt-limit",
          argument.slice(
            "--gpt-limit=".length,
          ),
        );

      continue;
    }

    if (
      argument.startsWith(
        "--monitor-limit=",
      )
    ) {
      monitorLimit =
        parsePositiveIntegerFlag(
          "--monitor-limit",
          argument.slice(
            "--monitor-limit=".length,
          ),
        );

      continue;
    }

    if (
      argument.startsWith(
        "--window-minutes=",
      )
    ) {
      monitorWindowMinutes =
        parsePositiveIntegerFlag(
          "--window-minutes",
          argument.slice(
            "--window-minutes=".length,
          ),
        );

      continue;
    }

    throw new Error(
      `Unknown production-cycle argument: ${argument}`,
    );
  }

  return {
    date,
    execute,
    gptLimit,
    monitorLimit,
    monitorWindowMinutes,
  };
}

function sleep(
  milliseconds: number,
): void {
  const buffer =
    new SharedArrayBuffer(
      4,
    );

  const view =
    new Int32Array(
      buffer,
    );

  Atomics.wait(
    view,
    0,
    0,
    milliseconds,
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

function stageOutput(
  stdout:
    string |
    null,
  stderr:
    string |
    null,
): string {
  return [
    stdout ?? "",
    stderr ?? "",
  ]
    .filter(
      (
        value,
      ) =>
        value.length > 0,
    )
    .join(
      "\n",
    );
}

function printCapturedOutput(
  stdout:
    string |
    null,
  stderr:
    string |
    null,
): void {
  if (
    stdout &&
    stdout.length > 0
  ) {
    process.stdout.write(
      stdout,
    );

    if (
      !stdout.endsWith(
        "\n",
      )
    ) {
      process.stdout.write(
        "\n",
      );
    }
  }

  if (
    stderr &&
    stderr.length > 0
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
}

function isTransientInfrastructureFailure(
  output: string,
): boolean {
  const normalized =
    output.toLowerCase();

  const signals = [
    "error connecting to database",
    "typeerror: fetch failed",
    "econnreset",
    "etimedout",
    "eai_again",
    "socket hang up",
    "connection terminated unexpectedly",
    "connection reset by peer",
    "server closed the connection unexpectedly",
    "network error",
  ];

  return signals.some(
    (
      signal,
    ) =>
      normalized.includes(
        signal,
      ),
  );
}

function runTsx(
  script: string,
  args: string[],
): CommandResult {
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
      `Required production script is missing: ${script}`,
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

        maxBuffer:
          64 *
          1024 *
          1024,

        windowsHide:
          false,
      },
    );

  if (
    result.error
  ) {
    throw result.error;
  }

  printCapturedOutput(
    result.stdout,
    result.stderr,
  );

  return {
    status:
      result.status ??
      1,

    output:
      stageOutput(
        result.stdout,
        result.stderr,
      ),
  };
}

async function verifyProductionInvariants(
  sql: SqlClient,
): Promise<void> {
  console.log(
    "Checking production invariants...",
  );

  const viewRows =
    await sql`
      SELECT
        to_regclass(
          'public.production_forecast_baselines_v01'
        )::text
          AS route_view
    `;

  assert.equal(
    viewRows.length,
    1,
    "Unable to inspect authoritative route view.",
  );

  assert.equal(
    String(
      viewRows[0].route_view ??
      "",
    ),
    "production_forecast_baselines_v01",
    "Authoritative production route view is missing.",
  );

  const duplicateRows =
    await sql`
      SELECT
        fixture_id,
        COUNT(*)
          AS route_count

      FROM public.production_forecast_baselines_v01

      GROUP BY
        fixture_id

      HAVING COUNT(*) >
        1

      LIMIT 1
    `;

  assert.equal(
    duplicateRows.length,
    0,
    "Authoritative route view contains duplicate fixture routes.",
  );

  const triggerRows =
    await sql`
      SELECT
        trigger.tgname
          AS trigger_name,

        trigger.tgenabled
          AS enabled,

        procedure.proname
          AS function_name

      FROM pg_trigger
        AS trigger

      JOIN pg_proc
        AS procedure
        ON procedure.oid =
          trigger.tgfoid

      JOIN pg_class
        AS relation
        ON relation.oid =
          trigger.tgrelid

      JOIN pg_namespace
        AS namespace
        ON namespace.oid =
          relation.relnamespace

      WHERE namespace.nspname =
        'public'

        AND relation.relname =
          'forecast_revisions'

        AND trigger.tgname =
          'aaa_forecast_revisions_authoritative_guard'

        AND trigger.tgisinternal =
          false
    `;

  assert.equal(
    triggerRows.length,
    1,
    [
      "Authoritative forecast-revision guard is missing.",
      "Apply the authoritative_revision_guard_v01 migration before production execution.",
    ].join(
      " ",
    ),
  );

  assert.equal(
    String(
      triggerRows[0].enabled,
    ),
    "O",
    "Authoritative forecast-revision guard exists but is not enabled.",
  );

  assert.equal(
    String(
      triggerRows[0].function_name,
    ),
    "dictaziq_guard_authoritative_forecast_revision_v01",
    "Unexpected authoritative forecast-revision guard function.",
  );

  console.log(
    "PASS: authoritative route view exists and has one route per fixture.",
  );

  console.log(
    "PASS: authoritative forecast-revision database guard is enabled.",
  );
}

function buildStages(
  config: ParsedArgs,
): Stage[] {
  const write =
    config.execute;

  /*
   * OpenAI and DeepSeek currently share the
   * research-baseline limit so controlled launch
   * runs compare like-for-like fixture counts.
   */
  const researchArgs = [
    config.date,

    ...(
      config.gptLimit ===
      null
        ? []
        : [
            `--limit=${config.gptLimit}`,
          ]
    ),

    ...(
      write
        ? [
            "--persist",
            "--publish",
          ]
        : []
    ),
  ];

  const monitorArgs = [
    config.date,
    `--window-minutes=${config.monitorWindowMinutes}`,

    ...(
      config.monitorLimit ===
      null
        ? []
        : [
            `--limit=${config.monitorLimit}`,
          ]
    ),

    ...(
      write
        ? [
            "--persist",
          ]
        : []
    ),
  ];

  return [
    {
      name:
        "Database connectivity",

      script:
        "scripts/check-db.ts",

      args:
        [],

      retryTransient:
        true,
    },

    {
      name:
        "Generate Unified mathematical candidates",

      script:
        "scripts/generate-real-unified-predictions-v0.1.ts",

      args: [
        config.date,

        ...(
          write
            ? [
                "--persist",
              ]
            : []
        ),
      ],
    },

    {
      name:
        "Publish mathematical-only Unified baselines",

      script:
        "scripts/publish-real-unified-predictions-v0.2.ts",

      args: [
        config.date,

        ...(
          write
            ? [
                "--publish",
              ]
            : []
        ),
      ],
    },

    {
      name:
        "Generate OpenAI v0.2 research fallback baselines",

      script:
        "scripts/generate-real-gpt-fallback-predictions-v0.2.ts",

      args:
        researchArgs,

      retryTransient:
        true,
    },

    {
      name:
        "Generate independent DeepSeek predictions",

      script:
        "scripts/generate-real-deepseek-predictions-v0.1.ts",

      args:
        researchArgs,

      retryTransient:
        true,
    },

    {
      name:
        "Audit authoritative production routes",

      script:
        "scripts/audit-production-forecast-routes-v0.1.ts",

      args: [
        config.date,
      ],
    },

    {
      name:
        "Run research fusion shadow",

      script:
        "scripts/run-research-fusion-shadow-v0.1.ts",

      args: [
        config.date,
      ],
    },

    {
      name:
        "Run authoritative GPT pre-match monitor",

      script:
        "scripts/monitor-real-prematch-gpt-v0.3.ts",

      args:
        monitorArgs,
    },

    {
      name:
        "Ingest authoritative production results",

      script:
        "scripts/ingest-real-forecast-results-v0.3.ts",

      args: [
        config.date,

        ...(
          write
            ? [
                "--persist",
              ]
            : []
        ),
      ],
    },

    {
      name:
        "Settle authoritative baseline forecasts",

      script:
        "scripts/settle-real-baseline-forecasts-v0.2.ts",

      args: [
        config.date,

        ...(
          write
            ? [
                "--settle",
              ]
            : []
        ),
      ],
    },

    {
      name:
        "Settle forecast revisions",

      script:
        "scripts/settle-real-forecast-revisions-v0.1.ts",

      args: [
        config.date,

        ...(
          write
            ? [
                "--settle",
              ]
            : []
        ),
      ],
    },

    {
      name:
        "Generate authoritative forecast scorecard",

      script:
        "scripts/scorecard-real-forecasts-v0.2.ts",

      args: [
        config.date,
      ],
    },
  ];
}

function verifyRequiredScripts(
  stages: Stage[],
): void {
  const missing =
    stages
      .map(
        (
          stage,
        ) =>
          stage.script,
      )
      .filter(
        (
          script,
        ) =>
          !existsSync(
            resolve(
              process.cwd(),
              script,
            ),
          ),
      );

  assert.equal(
    missing.length,
    0,
    `Required production scripts are missing: ${missing.join(", ")}`,
  );
}

async function runStage(
  stage: Stage,
  index: number,
  total: number,
): Promise<void> {
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

  console.log(
    `Arguments: ${
      stage.args.length > 0
        ? stage.args.join(
            " ",
          )
        : "(none)"
    }`,
  );

  const startedAt =
    Date.now();

  let attempt =
    0;

  while (
    attempt <
    MAX_TRANSIENT_ATTEMPTS
  ) {
    attempt +=
      1;

    if (
      attempt > 1
    ) {
      console.log(
        `Retry attempt ${attempt}/${MAX_TRANSIENT_ATTEMPTS} after transient infrastructure failure.`,
      );
    }

    const result =
      runTsx(
        stage.script,
        stage.args,
      );

    if (
      result.status ===
      0
    ) {
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

      return;
    }

    const transient =
      stage.retryTransient ===
        true &&
      isTransientInfrastructureFailure(
        result.output,
      );

    if (
      !transient ||
      attempt >=
        MAX_TRANSIENT_ATTEMPTS
    ) {
      throw new Error(
        [
          `Production cycle stopped at "${stage.name}".`,
          `Exit code: ${result.status}.`,
          transient
            ? "Transient retry budget exhausted."
            : "Failure is not classified as safely retryable.",
        ].join(
          " ",
        ),
      );
    }

    console.log("");
    console.log(
      "TRANSIENT INFRASTRUCTURE FAILURE DETECTED",
    );

    console.log(
      "Safe retry permitted because immutable/unique database guards make this stage resumable.",
    );

    sleep(
      1500,
    );
  }

  throw new Error(
    `Unexpected retry-loop termination at stage "${stage.name}".`,
  );
}

async function main() {
  const config =
    parseArguments();

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const stages =
    buildStages(
      config,
    );

  verifyRequiredScripts(
    stages,
  );

  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ AUTONOMOUS PRODUCTION CYCLE",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Version: ${VERSION}`,
  );

  console.log(
    `Date: ${config.date}`,
  );

  console.log(
    `Mode: ${config.execute ? "EXECUTE" : "DRY RUN"}`,
  );

  console.log(
    `Research baseline limit: ${config.gptLimit ?? "ALL"}`,
  );

  console.log(
    `Monitor window: ${config.monitorWindowMinutes} minutes`,
  );

  console.log(
    `Monitor limit: ${config.monitorLimit ?? "ALL"}`,
  );

  console.log("");

  if (
    !config.execute
  ) {
    console.log(
      "DRY RUN: prediction/result history will not be intentionally written.",
    );
  } else {
    console.log(
      "EXECUTE: immutable production writes are enabled for eligible pre-kickoff forecasts, revisions, results and settlements.",
    );
  }

  console.log("");
  console.log(
    "PRODUCTION PREFLIGHT",
  );

  console.log(
    "========================================",
  );

  await verifyProductionInvariants(
    sql,
  );

  const cycleStartedAt =
    Date.now();

  for (
    let index =
      0;
    index <
    stages.length;
    index +=
      1
  ) {
    await runStage(
      stages[index],
      index + 1,
      stages.length,
    );
  }

  const elapsedSeconds =
    (
      Date.now() -
      cycleStartedAt
    ) /
    1000;

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ AUTONOMOUS PRODUCTION CYCLE COMPLETE",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Date: ${config.date}`,
  );

  console.log(
    `Mode: ${config.execute ? "EXECUTE" : "DRY RUN"}`,
  );

  console.log(
    `Stages completed: ${stages.length}/${stages.length}`,
  );

  console.log(
    `Elapsed: ${elapsedSeconds.toFixed(1)}s`,
  );

  if (
    config.execute
  ) {
    console.log(
      "Production lifecycle completed successfully.",
    );
  } else {
    console.log(
      "Dry-run lifecycle completed successfully.",
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
        : "Unknown production-cycle failure.",
    );

    process.exitCode =
      1;
  },
);

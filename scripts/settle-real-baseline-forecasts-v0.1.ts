import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const RUNNER_VERSION =
  "dictaziq-baseline-forecast-settlement-v0.1";

const SETTLEMENT_RULES_VERSION =
  "football-baseline-1x2-settlement-v0.1";

const UNIFIED_MODEL =
  "dictaziq-unified-match-analysis-v0.1";

const GPT_MODEL =
  "dictaziq-gpt-research-prediction-v0.1";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type ForecastSelection =
  | "home"
  | "draw"
  | "away";

type JsonObject =
  Record<
    string,
    unknown
  >;

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (argument) =>
          !argument.startsWith(
            "--",
          ),
      ) ??
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

  return value;
}

function settleRequested():
  boolean {
  return process.argv.includes(
    "--settle",
  );
}

function isRecord(
  value:
    unknown,
): value is JsonObject {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
}

function forecastSelection(
  value:
    unknown,
):
  ForecastSelection {
  if (
    value !== "home" &&
    value !== "draw" &&
    value !== "away"
  ) {
    throw new Error(
      "Prediction output does not contain a valid HOME/DRAW/AWAY forecast.",
    );
  }

  return value;
}

function timestamp(
  value:
    unknown,

  label:
    string,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(
          String(
            value,
          ),
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

  return date.toISOString();
}

async function databaseNow(
  sql:
    SqlClient,
): Promise<string> {
  const rows =
    await sql`
      SELECT
        clock_timestamp()
          AS now
    `;

  assert.equal(
    rows.length,
    1,
  );

  return timestamp(
    rows[0].now,
    "Database clock",
  );
}

function validateAndExtractForecast(
  modelVersion:
    string,

  rawOutput:
    unknown,
):
  ForecastSelection {
  if (
    !isRecord(
      rawOutput,
    )
  ) {
    throw new Error(
      "Prediction output must be a JSON object.",
    );
  }

  if (
    modelVersion ===
    UNIFIED_MODEL
  ) {
    if (
      rawOutput.modelVersion !==
      UNIFIED_MODEL
    ) {
      throw new Error(
        "Unified prediction output model version mismatch.",
      );
    }

    if (
      rawOutput.calibratedProbability !==
      null
    ) {
      throw new Error(
        "Unified baseline cannot contain a calibrated probability.",
      );
    }

    if (
      rawOutput.recommendationStatus !==
      "not_evaluated"
    ) {
      throw new Error(
        "Unified recommendation contamination detected.",
      );
    }

    return forecastSelection(
      rawOutput.forecast,
    );
  }

  if (
    modelVersion ===
    GPT_MODEL
  ) {
    if (
      rawOutput.engine !==
        "gpt_research" ||
      rawOutput.engineVersion !==
        GPT_MODEL
    ) {
      throw new Error(
        "GPT baseline output identity mismatch.",
      );
    }

    if (
      rawOutput.probability !==
        null ||
      rawOutput.calibratedProbability !==
        null
    ) {
      throw new Error(
        "GPT baseline cannot contain a fabricated probability.",
      );
    }

    if (
      rawOutput.modelOverride !==
      false
    ) {
      throw new Error(
        "GPT baseline modelOverride must remain false.",
      );
    }

    return forecastSelection(
      rawOutput.forecast,
    );
  }

  throw new Error(
    `Unsupported baseline model: ${modelVersion}.`,
  );
}

function actualResult(
  homeScore:
    number,

  awayScore:
    number,
):
  ForecastSelection {
  if (
    homeScore >
    awayScore
  ) {
    return "home";
  }

  if (
    homeScore <
    awayScore
  ) {
    return "away";
  }

  return "draw";
}

async function main() {
  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const date =
    requestedDate();

  const settle =
    settleRequested();

  const now =
    await databaseNow(
      sql,
    );

  console.log(
    "DictazIQ Baseline Forecast Settlement",
  );

  console.log(
    `Runner: ${RUNNER_VERSION}`,
  );

  console.log(
    `Rules: ${SETTLEMENT_RULES_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Database time: ${now}`,
  );

  console.log(
    `Mode: ${settle ? "SETTLE" : "DRY RUN"}`,
  );

  const rows =
    await sql`
      SELECT
        prediction.id
          AS prediction_id,

        prediction.output,

        prediction.published_at,

        model.version
          AS model_version,

        fixture.id
          AS fixture_id,

        fixture.kickoff_at,

        home_team.name
          AS home_team,

        away_team.name
          AS away_team,

        result.id
          AS result_snapshot_id,

        result.regulation_home_score,

        result.regulation_away_score,

        result.observed_at
          AS result_observed_at,

        existing.id
          AS outcome_id,

        existing.selection
          AS settled_selection,

        existing.outcome
          AS settled_outcome

      FROM public.predictions
        AS prediction

      JOIN public.model_versions
        AS model
        ON model.id =
          prediction.model_version_id

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          prediction.fixture_id

      JOIN public.teams
        AS home_team
        ON home_team.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      LEFT JOIN LATERAL (
        SELECT
          snapshot.id,
          snapshot.regulation_home_score,
          snapshot.regulation_away_score,
          snapshot.observed_at

        FROM public.result_snapshots
          AS snapshot

        WHERE snapshot.fixture_id =
          fixture.id

          AND snapshot.status =
            'finished'

          AND snapshot.regulation_confirmed =
            true

          AND snapshot.regulation_home_score
            IS NOT NULL

          AND snapshot.regulation_away_score
            IS NOT NULL

        ORDER BY
          snapshot.observed_at DESC,
          snapshot.id DESC

        LIMIT 1
      )
        AS result
        ON true

      LEFT JOIN LATERAL (
        SELECT
          outcome.id,
          outcome.selection,
          outcome.outcome

        FROM public.prediction_outcomes
          AS outcome

        WHERE outcome.prediction_id =
          prediction.id

          AND outcome.market =
            '1x2'

        ORDER BY
          outcome.settled_at DESC,
          outcome.id DESC

        LIMIT 1
      )
        AS existing
        ON true

      WHERE prediction.is_demo =
        false

        AND prediction.published_at
          IS NOT NULL

        AND model.version
          IN (
            ${UNIFIED_MODEL},
            ${GPT_MODEL}
          )

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        prediction.id
    `;

  console.log(
    `Published baseline forecasts: ${rows.length}`,
  );

  let ready =
    0;

  let pending =
    0;

  let existing =
    0;

  let inserted =
    0;

  let won =
    0;

  let lost =
    0;

  for (
    const row
    of rows
  ) {
    const modelVersion =
      String(
        row.model_version,
      );

    const prediction =
      validateAndExtractForecast(
        modelVersion,
        row.output,
      );

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${row.home_team} vs ${row.away_team}`,
    );

    console.log(
      `Model: ${modelVersion}`,
    );

    console.log(
      `Forecast: ${prediction.toUpperCase()}`,
    );

    if (
      row.outcome_id !==
        null &&
      row.outcome_id !==
        undefined
    ) {
      existing +=
        1;

      const outcome =
        String(
          row.settled_outcome,
        );

      if (
        outcome ===
        "won"
      ) {
        won +=
          1;
      } else if (
        outcome ===
        "lost"
      ) {
        lost +=
          1;
      }

      console.log(
        `ALREADY SETTLED: ${outcome.toUpperCase()}`,
      );

      continue;
    }

    if (
      row.result_snapshot_id ===
        null ||
      row.result_snapshot_id ===
        undefined
    ) {
      pending +=
        1;

      console.log(
        "PENDING RESULT",
      );

      continue;
    }

    const homeScore =
      Number(
        row.regulation_home_score,
      );

    const awayScore =
      Number(
        row.regulation_away_score,
      );

    assert.ok(
      Number.isInteger(
        homeScore,
      ) &&
      homeScore >=
        0,
      "Invalid regulation home score.",
    );

    assert.ok(
      Number.isInteger(
        awayScore,
      ) &&
      awayScore >=
        0,
      "Invalid regulation away score.",
    );

    const actual =
      actualResult(
        homeScore,
        awayScore,
      );

    const outcome =
      prediction ===
      actual
        ? "won"
        : "lost";

    ready +=
      1;

    console.log(
      `Regulation score: ${homeScore}-${awayScore}`,
    );

    console.log(
      `Actual: ${actual.toUpperCase()}`,
    );

    console.log(
      `Outcome: ${outcome.toUpperCase()}`,
    );

    if (
      !settle
    ) {
      console.log(
        "READY TO SETTLE",
      );

      continue;
    }

    const insertRows =
      await sql`
        INSERT INTO public.prediction_outcomes (
          prediction_id,
          result_snapshot_id,
          market,
          selection,
          outcome,
          rules_version
        )
        VALUES (
          ${String(
            row.prediction_id,
          )}::uuid,

          ${String(
            row.result_snapshot_id,
          )}::uuid,

          '1x2',

          ${prediction},

          ${outcome},

          ${SETTLEMENT_RULES_VERSION}
        )

        ON CONFLICT DO NOTHING

        RETURNING
          id,
          selection,
          outcome,
          settled_at
      `;

    if (
      insertRows.length ===
      0
    ) {
      existing +=
        1;

      console.log(
        "ALREADY SETTLED BY CONCURRENT RUN",
      );

      continue;
    }

    inserted +=
      1;

    if (
      outcome ===
      "won"
    ) {
      won +=
        1;
    } else {
      lost +=
        1;
    }

    console.log(
      `SETTLED: ${outcome.toUpperCase()}`,
    );

    console.log(
      `Settled at: ${timestamp(
        insertRows[0]
          .settled_at,
        "Settlement",
      )}`,
    );
  }

  const graded =
    won +
    lost;

  const accuracy =
    graded >
      0
      ? (
          won /
          graded
        ) *
        100
      : null;

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "BASELINE SETTLEMENT SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Ready: ${ready}`,
  );

  console.log(
    `Pending: ${pending}`,
  );

  console.log(
    `Already settled: ${existing}`,
  );

  console.log(
    `Inserted: ${inserted}`,
  );

  console.log(
    `Won: ${won}`,
  );

  console.log(
    `Lost: ${lost}`,
  );

  console.log(
    `Graded: ${graded}`,
  );

  console.log(
    `Accuracy: ${
      accuracy ===
      null
        ? "N/A"
        : `${accuracy.toFixed(
            1,
          )}%`
    }`,
  );

  if (
    !settle
  ) {
    console.log(
      "DRY RUN COMPLETE: no baseline outcomes were written.",
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
        ? `Baseline settlement failed: ${error.message}`
        : "Baseline settlement failed.",
    );

    process.exitCode =
      1;
  },
);
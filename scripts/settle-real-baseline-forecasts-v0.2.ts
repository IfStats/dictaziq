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
  "dictaziq-baseline-forecast-settlement-v0.2";

const SETTLEMENT_RULES_VERSION =
  "football-baseline-1x2-settlement-v0.2";

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
  Record<string, unknown>;

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (argument) =>
          !argument.startsWith("--"),
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
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
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

function validateAndExtractForecast(
  route:
    string,

  modelVersion:
    string,

  rawOutput:
    unknown,
):
  ForecastSelection {
  if (
    !isRecord(rawOutput)
  ) {
    throw new Error(
      "Prediction output must be a JSON object.",
    );
  }

  if (
    route === "mathematical"
  ) {
    assert.equal(
      modelVersion,
      UNIFIED_MODEL,
      "Mathematical route does not use the Unified model.",
    );

    assert.equal(
      rawOutput.modelVersion,
      UNIFIED_MODEL,
      "Unified model identity mismatch.",
    );

    assert.equal(
      rawOutput.calibratedProbability,
      null,
      "Unified baseline contains a calibrated probability.",
    );

    return forecastSelection(
      rawOutput.forecast,
    );
  }

  if (
    route === "gpt_research"
  ) {
    assert.equal(
      modelVersion,
      GPT_MODEL,
      "GPT route does not use the GPT research model.",
    );

    assert.equal(
      rawOutput.engine,
      "gpt_research",
      "GPT baseline engine mismatch.",
    );

    assert.equal(
      rawOutput.engineVersion,
      GPT_MODEL,
      "GPT baseline engine version mismatch.",
    );

    assert.equal(
      rawOutput.probability,
      null,
      "GPT baseline contains a fabricated probability.",
    );

    assert.equal(
      rawOutput.calibratedProbability,
      null,
      "GPT baseline contains a calibrated probability.",
    );

    assert.equal(
      rawOutput.modelOverride,
      false,
      "GPT baseline modelOverride must remain false.",
    );

    return forecastSelection(
      rawOutput.forecast,
    );
  }

  throw new Error(
    `Unsupported production route: ${route}.`,
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

  console.log(
    "DictazIQ Authoritative Baseline Settlement",
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
    `Mode: ${settle ? "SETTLE" : "DRY RUN"}`,
  );

  const rows =
    await sql`
      SELECT
        route.baseline_prediction_id
          AS prediction_id,

        route.fixture_id,

        route.route,

        route.route_reason,

        route.model_version,

        route.output,

        route.published_at,

        fixture.kickoff_at,

        home.name
          AS home_team,

        away.name
          AS away_team,

        result.id
          AS result_snapshot_id,

        result.regulation_home_score,

        result.regulation_away_score,

        existing.id
          AS existing_outcome_id,

        existing.selection
          AS existing_selection,

        existing.outcome
          AS existing_outcome

      FROM public.production_forecast_baselines_v01
        AS route

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          route.fixture_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away
        ON away.id =
          fixture.away_team_id

      LEFT JOIN LATERAL (
        SELECT
          snapshot.id,
          snapshot.regulation_home_score,
          snapshot.regulation_away_score

        FROM public.result_snapshots
          AS snapshot

        WHERE snapshot.fixture_id =
          route.fixture_id

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
          route.baseline_prediction_id

          AND outcome.market =
            '1x2'

        ORDER BY
          outcome.settled_at DESC,
          outcome.id DESC

        LIMIT 1
      )
        AS existing
        ON true

      WHERE (
        fixture.kickoff_at
        AT TIME ZONE 'UTC'
      )::date =
        ${date}::date

      ORDER BY
        fixture.kickoff_at,
        route.fixture_id
    `;

  console.log(
    `Authoritative baselines: ${rows.length}`,
  );

  let mathematical =
    0;

  let gpt =
    0;

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
    const route =
      String(
        row.route,
      );

    const modelVersion =
      String(
        row.model_version,
      );

    const prediction =
      validateAndExtractForecast(
        route,
        modelVersion,
        row.output,
      );

    if (
      route ===
      "mathematical"
    ) {
      mathematical += 1;
    } else {
      gpt += 1;
    }

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${row.home_team} vs ${row.away_team}`,
    );

    console.log(
      `Route: ${route.toUpperCase()}`,
    );

    console.log(
      `Model: ${modelVersion}`,
    );

    console.log(
      `Forecast: ${prediction.toUpperCase()}`,
    );

    if (
      row.existing_outcome_id !==
        null &&
      row.existing_outcome_id !==
        undefined
    ) {
      existing += 1;

      const outcome =
        String(
          row.existing_outcome,
        );

      if (
        outcome === "won"
      ) {
        won += 1;
      } else if (
        outcome === "lost"
      ) {
        lost += 1;
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
      pending += 1;

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
      homeScore >= 0,
      "Invalid home regulation score.",
    );

    assert.ok(
      Number.isInteger(
        awayScore,
      ) &&
      awayScore >= 0,
      "Invalid away regulation score.",
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

    ready += 1;

    console.log(
      `Regulation score: ${homeScore}-${awayScore}`,
    );

    console.log(
      `Actual: ${actual.toUpperCase()}`,
    );

    console.log(
      `Calculated outcome: ${outcome.toUpperCase()}`,
    );

    if (
      !settle
    ) {
      console.log(
        "READY TO SETTLE",
      );

      continue;
    }

    const insertedRows =
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

        ON CONFLICT
        DO NOTHING

        RETURNING
          id,
          selection,
          outcome,
          settled_at
      `;

    if (
      insertedRows.length ===
      0
    ) {
      existing += 1;

      console.log(
        "ALREADY SETTLED BY CONCURRENT RUN",
      );

      continue;
    }

    assert.equal(
      insertedRows.length,
      1,
    );

    inserted += 1;

    if (
      outcome === "won"
    ) {
      won += 1;
    } else {
      lost += 1;
    }

    console.log(
      `SETTLED: ${outcome.toUpperCase()}`,
    );
  }

  const graded =
    won +
    lost;

  const accuracy =
    graded ===
    0
      ? null
      : (
          won /
          graded
        ) *
        100;

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "AUTHORITATIVE BASELINE SETTLEMENT SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Authoritative baselines: ${rows.length}`,
  );

  console.log(
    `Mathematical routes: ${mathematical}`,
  );

  console.log(
    `GPT research routes: ${gpt}`,
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
    `Accuracy: ${
      accuracy ===
      null
        ? "N/A"
        : `${accuracy.toFixed(
            1,
          )}%`
    }`,
  );

  console.log("");
  console.log(
    "Prior-only Unified historical records are excluded from settlement.",
  );

  if (
    !settle
  ) {
    console.log(
      "DRY RUN COMPLETE: no outcomes were written.",
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
        ? `Authoritative baseline settlement failed: ${error.message}`
        : "Authoritative baseline settlement failed.",
    );

    process.exitCode =
      1;
  },
);
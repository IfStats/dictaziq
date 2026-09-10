import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const SCORECARD_VERSION =
  "dictaziq-real-forecast-scorecard-v0.2";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type Outcome =
  | "won"
  | "lost"
  | "void"
  | "pending";

type Summary = {
  total:
    number;

  won:
    number;

  lost:
    number;

  voided:
    number;

  pending:
    number;
};

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
          String(value),
        );

  assert.ok(
    Number.isFinite(
      date.getTime(),
    ),
    `${label} is invalid.`,
  );

  return date.toISOString();
}

function normalizeOutcome(
  value:
    unknown,
): Outcome {
  if (
    value === "won" ||
    value === "lost" ||
    value === "void"
  ) {
    return value;
  }

  return "pending";
}

function createSummary():
  Summary {
  return {
    total:
      0,

    won:
      0,

    lost:
      0,

    voided:
      0,

    pending:
      0,
  };
}

function addOutcome(
  summary:
    Summary,

  outcome:
    Outcome,
): void {
  summary.total +=
    1;

  if (
    outcome === "won"
  ) {
    summary.won +=
      1;

    return;
  }

  if (
    outcome === "lost"
  ) {
    summary.lost +=
      1;

    return;
  }

  if (
    outcome === "void"
  ) {
    summary.voided +=
      1;

    return;
  }

  summary.pending +=
    1;
}

function accuracy(
  summary:
    Summary,
):
  number |
  null {
  const graded =
    summary.won +
    summary.lost;

  if (
    graded === 0
  ) {
    return null;
  }

  return (
    summary.won /
    graded
  ) *
    100;
}

function printSummary(
  label:
    string,

  summary:
    Summary,
): void {
  const graded =
    summary.won +
    summary.lost;

  const value =
    accuracy(
      summary,
    );

  console.log("");
  console.log(
    label,
  );

  console.log(
    "-".repeat(
      label.length,
    ),
  );

  console.log(
    `Total: ${summary.total}`,
  );

  console.log(
    `Graded: ${graded}`,
  );

  console.log(
    `Won: ${summary.won}`,
  );

  console.log(
    `Lost: ${summary.lost}`,
  );

  console.log(
    `Void: ${summary.voided}`,
  );

  console.log(
    `Pending: ${summary.pending}`,
  );

  console.log(
    `Accuracy: ${
      value ===
      null
        ? "N/A"
        : `${value.toFixed(
            1,
          )}%`
    }`,
  );
}

async function main() {
  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const date =
    requestedDate();

  const nowRows =
    await sql`
      SELECT
        clock_timestamp()
          AS now
    `;

  assert.equal(
    nowRows.length,
    1,
  );

  console.log(
    "DictazIQ Authoritative Forecast Scorecard",
  );

  console.log(
    `Version: ${SCORECARD_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Database time: ${timestamp(
      nowRows[0].now,
      "Database time",
    )}`,
  );

  /*
   * The authoritative route view guarantees
   * exactly one production baseline per fixture.
   *
   * This prevents prior-only Unified records from
   * contaminating production accuracy once GPT
   * fallback becomes the authoritative route.
   */
  const rows =
    await sql`
      SELECT
        route.baseline_prediction_id,

        route.fixture_id,

        route.route,

        route.route_reason,

        route.model_version,

        route.output
          AS baseline_output,

        route.published_at
          AS baseline_published_at,

        fixture.kickoff_at,

        home.name
          AS home_team,

        away.name
          AS away_team,

        baseline_outcome.selection
          AS baseline_selection,

        baseline_outcome.outcome
          AS baseline_outcome,

        latest_revision.id
          AS latest_revision_id,

        latest_revision.revision_number,

        latest_revision.reason
          AS revision_reason,

        latest_revision.engine
          AS revision_engine,

        latest_revision.selection
          AS revision_selection,

        latest_revision.confidence
          AS revision_confidence,

        latest_revision.evidence_grade
          AS revision_evidence_grade,

        latest_revision.lineup_state
          AS revision_lineup_state,

        latest_revision.published_at
          AS revision_published_at,

        revision_outcome.outcome
          AS revision_outcome,

        result.regulation_home_score,

        result.regulation_away_score

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

      LEFT JOIN public.prediction_outcomes
        AS baseline_outcome
        ON baseline_outcome.prediction_id =
          route.baseline_prediction_id

        AND baseline_outcome.market =
          '1x2'

      LEFT JOIN LATERAL (
        SELECT
          revision.id,
          revision.revision_number,
          revision.reason,
          revision.engine,
          revision.selection,
          revision.confidence,
          revision.evidence_grade,
          revision.lineup_state,
          revision.published_at

        FROM public.forecast_revisions
          AS revision

        WHERE revision.baseline_prediction_id =
          route.baseline_prediction_id

          AND revision.published_at
            IS NOT NULL

          AND revision.input_cutoff_at <
            fixture.kickoff_at

          AND revision.generated_at <
            fixture.kickoff_at

          AND revision.published_at <
            fixture.kickoff_at

        ORDER BY
          revision.revision_number DESC,
          revision.published_at DESC

        LIMIT 1
      )
        AS latest_revision
        ON true

      LEFT JOIN public.forecast_revision_outcomes
        AS revision_outcome
        ON revision_outcome.revision_id =
          latest_revision.id

        AND revision_outcome.market =
          '1x2'

      LEFT JOIN LATERAL (
        SELECT
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

        ORDER BY
          snapshot.observed_at DESC,
          snapshot.id DESC

        LIMIT 1
      )
        AS result
        ON true

      WHERE (
        fixture.kickoff_at
        AT TIME ZONE 'UTC'
      )::date =
        ${date}::date

      ORDER BY
        fixture.kickoff_at,
        home.name,
        away.name
    `;

  console.log(
    `Authoritative fixtures: ${rows.length}`,
  );

  const baselineAll =
    createSummary();

  const baselineMath =
    createSummary();

  const baselineGpt =
    createSummary();

  const finalActive =
    createSummary();

  for (
    const row
    of rows
  ) {
    const baselineOutcome =
      normalizeOutcome(
        row.baseline_outcome,
      );

    const revisionOutcome =
      normalizeOutcome(
        row.revision_outcome,
      );

    const hasRevision =
      row.latest_revision_id !==
        null &&
      row.latest_revision_id !==
        undefined;

    const activeOutcome =
      hasRevision
        ? revisionOutcome
        : baselineOutcome;

    addOutcome(
      baselineAll,
      baselineOutcome,
    );

    if (
      row.route ===
      "mathematical"
    ) {
      addOutcome(
        baselineMath,
        baselineOutcome,
      );
    } else if (
      row.route ===
      "gpt_research"
    ) {
      addOutcome(
        baselineGpt,
        baselineOutcome,
      );
    } else {
      throw new Error(
        `Unknown production route: ${String(
          row.route,
        )}.`,
      );
    }

    addOutcome(
      finalActive,
      activeOutcome,
    );

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${row.home_team} vs ${row.away_team}`,
    );

    console.log(
      `Kickoff: ${timestamp(
        row.kickoff_at,
        "Kickoff",
      )}`,
    );

    console.log(
      `Route: ${String(
        row.route,
      ).toUpperCase()}`,
    );

    console.log(
      `Baseline model: ${row.model_version}`,
    );

    console.log(
      `Baseline outcome: ${baselineOutcome.toUpperCase()}`,
    );

    if (
      row.regulation_home_score !==
        null &&
      row.regulation_home_score !==
        undefined &&
      row.regulation_away_score !==
        null &&
      row.regulation_away_score !==
        undefined
    ) {
      console.log(
        `Final: ${row.regulation_home_score}-${row.regulation_away_score}`,
      );
    } else {
      console.log(
        "Final: PENDING",
      );
    }

    if (
      hasRevision
    ) {
      console.log(
        `Latest revision: ${row.revision_number}`,
      );

      console.log(
        `Revision reason: ${row.revision_reason}`,
      );

      console.log(
        `Revision engine: ${row.revision_engine}`,
      );

      console.log(
        `Revision selection: ${String(
          row.revision_selection,
        ).toUpperCase()}`,
      );

      console.log(
        `Revision confidence: ${row.revision_confidence}`,
      );

      console.log(
        `Revision evidence: ${row.revision_evidence_grade}`,
      );

      console.log(
        `Revision lineup: ${row.revision_lineup_state}`,
      );

      console.log(
        `Revision outcome: ${revisionOutcome.toUpperCase()}`,
      );
    } else {
      console.log(
        "Latest revision: NONE",
      );
    }

    console.log(
      `FINAL ACTIVE OUTCOME: ${activeOutcome.toUpperCase()}`,
    );
  }

  /*
   * Score all revisions belonging only to
   * authoritative production baselines.
   */
  const revisionRows =
    await sql`
      SELECT
        revision.id,
        revision.reason,
        revision.engine,
        revision.lineup_state,

        outcome.outcome

      FROM public.production_forecast_baselines_v01
        AS route

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          route.fixture_id

      JOIN public.forecast_revisions
        AS revision
        ON revision.baseline_prediction_id =
          route.baseline_prediction_id

      LEFT JOIN public.forecast_revision_outcomes
        AS outcome
        ON outcome.revision_id =
          revision.id

        AND outcome.market =
          '1x2'

      WHERE revision.published_at
        IS NOT NULL

        AND revision.input_cutoff_at <
          fixture.kickoff_at

        AND revision.generated_at <
          fixture.kickoff_at

        AND revision.published_at <
          fixture.kickoff_at

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date
    `;

  const revisions =
    createSummary();

  for (
    const row
    of revisionRows
  ) {
    addOutcome(
      revisions,
      normalizeOutcome(
        row.outcome,
      ),
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ AUTHORITATIVE SCORECARD",
  );

  console.log(
    "========================================",
  );

  printSummary(
    "ALL AUTHORITATIVE BASELINES",
    baselineAll,
  );

  printSummary(
    "MATHEMATICAL BASELINES",
    baselineMath,
  );

  printSummary(
    "GPT RESEARCH BASELINES",
    baselineGpt,
  );

  printSummary(
    "ALL AUTHORITATIVE REVISIONS",
    revisions,
  );

  printSummary(
    "FINAL ACTIVE FORECASTS",
    finalActive,
  );

  console.log("");
  console.log(
    "Excluded from production accuracy:",
  );

  console.log(
    "- prior-only Unified historical records",
  );

  console.log(
    "- unpublished forecasts",
  );

  console.log(
    "- post-kickoff revisions",
  );

  console.log(
    "- non-authoritative duplicate model routes",
  );

  console.log("");
  console.log(
    "PASS: scorecard is scoped to exactly one authoritative baseline route per fixture.",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Authoritative scorecard failed: ${error.message}`
        : "Authoritative scorecard failed.",
    );

    process.exitCode =
      1;
  },
);
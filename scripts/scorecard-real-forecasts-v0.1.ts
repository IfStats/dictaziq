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
  "dictaziq-real-forecast-scorecard-v0.1";

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

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (
          argument,
        ) =>
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

function accuracy(
  won:
    number,

  lost:
    number,
):
  number |
  null {
  const graded =
    won +
    lost;

  if (
    graded === 0
  ) {
    return null;
  }

  return (
    won /
    graded
  ) *
    100;
}

function printAccuracy(
  value:
    number |
    null,
): string {
  return value ===
    null
    ? "N/A"
    : `${value.toFixed(1)}%`;
}

function printSummary(
  label:
    string,

  values: {
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
  },
): void {
  const graded =
    values.won +
    values.lost;

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
    `Total: ${values.total}`,
  );

  console.log(
    `Graded: ${graded}`,
  );

  console.log(
    `Won: ${values.won}`,
  );

  console.log(
    `Lost: ${values.lost}`,
  );

  console.log(
    `Void: ${values.voided}`,
  );

  console.log(
    `Pending: ${values.pending}`,
  );

  console.log(
    `Accuracy: ${printAccuracy(
      accuracy(
        values.won,
        values.lost,
      ),
    )}`,
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

  const now =
    await databaseNow(
      sql,
    );

  console.log(
    "DictazIQ Real Forecast Scorecard",
  );

  console.log(
    `Version: ${SCORECARD_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Database time: ${now}`,
  );

  /*
   * One row per published baseline.
   *
   * latest_revision is the final published
   * pre-match revision for that baseline.
   *
   * The final active forecast is:
   *
   * latest published revision
   * OR baseline when no revision exists.
   */
  const rows =
    await sql`
      SELECT
        prediction.id
          AS prediction_id,

        model.version
          AS baseline_model_version,

        fixture.id
          AS fixture_id,

        fixture.kickoff_at,

        home_team.name
          AS home_team,

        away_team.name
          AS away_team,

        baseline_outcome.outcome
          AS baseline_outcome,

        baseline_outcome.selection
          AS baseline_selection,

        latest_revision.id
          AS latest_revision_id,

        latest_revision.revision_number
          AS latest_revision_number,

        latest_revision.reason
          AS latest_revision_reason,

        latest_revision.selection
          AS latest_revision_selection,

        latest_revision.confidence
          AS latest_revision_confidence,

        latest_revision.evidence_grade
          AS latest_revision_evidence_grade,

        latest_revision.lineup_state
          AS latest_revision_lineup_state,

        revision_outcome.outcome
          AS latest_revision_outcome,

        result.regulation_home_score,

        result.regulation_away_score

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

      LEFT JOIN public.prediction_outcomes
        AS baseline_outcome
        ON baseline_outcome.prediction_id =
          prediction.id

        AND baseline_outcome.market =
          '1x2'

      LEFT JOIN LATERAL (
        SELECT
          revision.id,
          revision.revision_number,
          revision.reason,
          revision.selection,
          revision.confidence,
          revision.evidence_grade,
          revision.lineup_state

        FROM public.forecast_revisions
          AS revision

        WHERE revision.baseline_prediction_id =
          prediction.id

          AND revision.published_at
            IS NOT NULL

        ORDER BY
          revision.revision_number DESC

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
          fixture.id

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

      WHERE prediction.is_demo =
        false

        AND prediction.published_at
          IS NOT NULL

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.id,
        prediction.id
    `;

  console.log(
    `Published fixtures: ${rows.length}`,
  );

  const baseline = {
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

  const finalActive = {
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

  for (
    const row
    of rows
  ) {
    const baselineOutcome =
      normalizeOutcome(
        row.baseline_outcome,
      );

    const hasRevision =
      row.latest_revision_id !==
        null &&
      row.latest_revision_id !==
        undefined;

    const revisionOutcome =
      normalizeOutcome(
        row.latest_revision_outcome,
      );

    const activeOutcome =
      hasRevision
        ? revisionOutcome
        : baselineOutcome;

    baseline.total +=
      1;

    finalActive.total +=
      1;

    if (
      baselineOutcome ===
      "won"
    ) {
      baseline.won +=
        1;
    } else if (
      baselineOutcome ===
      "lost"
    ) {
      baseline.lost +=
        1;
    } else if (
      baselineOutcome ===
      "void"
    ) {
      baseline.voided +=
        1;
    } else {
      baseline.pending +=
        1;
    }

    if (
      activeOutcome ===
      "won"
    ) {
      finalActive.won +=
        1;
    } else if (
      activeOutcome ===
      "lost"
    ) {
      finalActive.lost +=
        1;
    } else if (
      activeOutcome ===
      "void"
    ) {
      finalActive.voided +=
        1;
    } else {
      finalActive.pending +=
        1;
    }

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

    console.log(
      `Baseline model: ${row.baseline_model_version}`,
    );

    console.log(
      `Baseline selection: ${
        row.baseline_selection ??
        "UNSETTLED"
      }`,
    );

    console.log(
      `Baseline outcome: ${baselineOutcome.toUpperCase()}`,
    );

    if (
      hasRevision
    ) {
      console.log(
        `Latest revision: ${row.latest_revision_number}`,
      );

      console.log(
        `Revision reason: ${row.latest_revision_reason}`,
      );

      console.log(
        `Revision selection: ${String(
          row.latest_revision_selection,
        ).toUpperCase()}`,
      );

      console.log(
        `Revision confidence: ${row.latest_revision_confidence}`,
      );

      console.log(
        `Revision evidence: ${row.latest_revision_evidence_grade}`,
      );

      console.log(
        `Revision lineup: ${row.latest_revision_lineup_state}`,
      );

      console.log(
        `Revision outcome: ${revisionOutcome.toUpperCase()}`,
      );

      console.log(
        `FINAL ACTIVE OUTCOME: ${activeOutcome.toUpperCase()}`,
      );
    } else {
      console.log(
        "Latest revision: NONE",
      );

      console.log(
        `FINAL ACTIVE OUTCOME: ${baselineOutcome.toUpperCase()}`,
      );
    }
  }

  /*
   * Score every individual revision separately.
   *
   * This is useful for analysing:
   * developing_news
   * confirmed_lineup
   * final_prematch
   */
  const revisionRows =
    await sql`
      SELECT
        revision.reason,
        revision.lineup_state,
        outcome.outcome

      FROM public.forecast_revisions
        AS revision

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          revision.fixture_id

      LEFT JOIN public.forecast_revision_outcomes
        AS outcome
        ON outcome.revision_id =
          revision.id

        AND outcome.market =
          '1x2'

      WHERE revision.is_demo =
        false

        AND revision.published_at
          IS NOT NULL

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date
    `;

  const revisions = {
    total:
      revisionRows.length,

    won:
      0,

    lost:
      0,

    voided:
      0,

    pending:
      0,
  };

  for (
    const row
    of revisionRows
  ) {
    const outcome =
      normalizeOutcome(
        row.outcome,
      );

    if (
      outcome === "won"
    ) {
      revisions.won +=
        1;
    } else if (
      outcome === "lost"
    ) {
      revisions.lost +=
        1;
    } else if (
      outcome === "void"
    ) {
      revisions.voided +=
        1;
    } else {
      revisions.pending +=
        1;
    }
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ SCORECARD",
  );

  console.log(
    "========================================",
  );

  printSummary(
    "BASELINE FORECASTS",
    baseline,
  );

  printSummary(
    "ALL PUBLISHED REVISIONS",
    revisions,
  );

  printSummary(
    "FINAL ACTIVE FORECASTS",
    finalActive,
  );

  console.log("");
  console.log(
    "Final active accuracy uses exactly one forecast per published fixture:",
  );

  console.log(
    "latest published pre-kickoff revision when present, otherwise the immutable baseline.",
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
        ? `Scorecard failed: ${error.message}`
        : "Scorecard failed.",
    );

    process.exitCode =
      1;
  },
);
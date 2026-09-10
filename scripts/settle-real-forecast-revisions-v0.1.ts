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
  "dictaziq-forecast-revision-settlement-runner-v0.1";

const RULES_VERSION =
  "football-revision-settlement-v0.1";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

function requestedDate():
  string {
  const argument =
    process.argv
      .slice(2)
      .find(
        (
          value,
        ) =>
          !value.startsWith("--"),
      );

  const value =
    argument ??
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

function requestedLimit():
  number |
  null {
  const argument =
    process.argv.find(
      (
        value,
      ) =>
        value.startsWith(
          "--limit=",
        ),
    );

  if (!argument) {
    return null;
  }

  const result =
    Number(
      argument.slice(
        "--limit=".length,
      ),
    );

  if (
    !Number.isInteger(result) ||
    result <= 0
  ) {
    throw new Error(
      "--limit must be a positive integer.",
    );
  }

  return result;
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
    "Could not read database clock.",
  );

  return timestamp(
    rows[0].now,
    "Database clock",
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

  const settle =
    settleRequested();

  const limit =
    requestedLimit();

  const now =
    await databaseNow(sql);

  console.log(
    "DictazIQ Forecast Revision Settlement",
  );

  console.log(
    `Runner: ${RUNNER_VERSION}`,
  );

  console.log(
    `Rules: ${RULES_VERSION}`,
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
        revision.id
          AS revision_id,

        revision.baseline_prediction_id,

        revision.fixture_id,

        revision.revision_number,

        revision.reason,

        revision.engine,

        revision.engine_version,

        revision.selection,

        revision.confidence,

        revision.evidence_grade,

        revision.lineup_state,

        revision.published_at,

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
          AS existing_outcome_id,

        existing.outcome
          AS existing_outcome,

        existing.settled_at
          AS existing_settled_at

      FROM public.forecast_revisions
        AS revision

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          revision.fixture_id

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
          revision.fixture_id

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

      LEFT JOIN public.forecast_revision_outcomes
        AS existing
        ON existing.revision_id =
          revision.id

        AND existing.market =
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

      ORDER BY
        fixture.kickoff_at,
        revision.baseline_prediction_id,
        revision.revision_number
    `;

  console.log(
    `Published revisions found: ${rows.length}`,
  );

  let inspected =
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

  let voided =
    0;

  for (
    const row
    of rows
  ) {
    if (
      limit !== null &&
      inspected >= limit
    ) {
      break;
    }

    inspected += 1;

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${row.home_team} vs ${row.away_team}`,
    );

    console.log(
      `Revision: ${row.revision_number}`,
    );

    console.log(
      `Reason: ${row.reason}`,
    );

    console.log(
      `Engine: ${row.engine}`,
    );

    console.log(
      `Selection: ${String(
        row.selection,
      ).toUpperCase()}`,
    );

    console.log(
      `Confidence: ${row.confidence}`,
    );

    console.log(
      `Evidence grade: ${row.evidence_grade}`,
    );

    console.log(
      `Lineup state: ${row.lineup_state}`,
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

      if (outcome === "won") {
        won += 1;
      } else if (
        outcome === "lost"
      ) {
        lost += 1;
      } else if (
        outcome === "void"
      ) {
        voided += 1;
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

    ready += 1;

    console.log(
      `Regulation score: ${row.regulation_home_score}-${row.regulation_away_score}`,
    );

    if (!settle) {
      console.log(
        "READY TO SETTLE",
      );

      continue;
    }

    /*
     * These values are deliberately placeholders.
     *
     * The database BEFORE INSERT trigger owns:
     * - market
     * - selection
     * - won/lost outcome
     * - rules version
     * - settled_at
     *
     * Application code therefore cannot fabricate
     * a successful settlement.
     */
    const insertedRows =
      await sql`
        INSERT INTO public.forecast_revision_outcomes (
          revision_id,
          result_snapshot_id,
          market,
          selection,
          outcome,
          rules_version,
          settled_at
        )
        VALUES (
          ${String(
            row.revision_id,
          )}::uuid,

          ${String(
            row.result_snapshot_id,
          )}::uuid,

          '1x2',

          'draw',

          'void',

          'caller-placeholder',

          clock_timestamp()
        )

        ON CONFLICT (
          revision_id,
          market
        )
        DO NOTHING

        RETURNING
          id,
          market,
          selection,
          outcome,
          rules_version,
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

    const settled =
      insertedRows[0];

    assert.equal(
      settled.market,
      "1x2",
      "Database did not enforce revision market.",
    );

    assert.equal(
      settled.selection,
      row.selection,
      "Database did not enforce revision selection.",
    );

    assert.equal(
      settled.rules_version,
      RULES_VERSION,
      "Database did not enforce settlement rules version.",
    );

    const outcome =
      String(
        settled.outcome,
      );

    assert.ok(
      outcome === "won" ||
      outcome === "lost" ||
      outcome === "void",
      "Database returned invalid revision outcome.",
    );

    inserted += 1;

    if (
      outcome === "won"
    ) {
      won += 1;
    } else if (
      outcome === "lost"
    ) {
      lost += 1;
    } else {
      voided += 1;
    }

    console.log(
      `SETTLED: ${outcome.toUpperCase()}`,
    );

    console.log(
      `DB selection: ${String(
        settled.selection,
      ).toUpperCase()}`,
    );

    console.log(
      `Settled at: ${timestamp(
        settled.settled_at,
        "Settlement time",
      )}`,
    );
  }

  const graded =
    won +
    lost;

  const accuracy =
    graded === 0
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
    "REVISION SETTLEMENT SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Revisions inspected: ${inspected}`,
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
    `Void: ${voided}`,
  );

  console.log(
    `Graded: ${graded}`,
  );

  console.log(
    `Accuracy: ${
      accuracy === null
        ? "N/A"
        : `${accuracy.toFixed(
            1,
          )}%`
    }`,
  );

  if (!settle) {
    console.log(
      "DRY RUN COMPLETE: no revision outcomes were written.",
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
        ? `Revision settlement failed: ${error.message}`
        : "Revision settlement failed.",
    );

    process.exitCode =
      1;
  },
);
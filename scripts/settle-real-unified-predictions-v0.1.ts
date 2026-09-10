import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

import {
  SETTLEMENT_RULES_VERSION,
  settleFootballSelection,
} from "../src/lib/predictions/settlement";

import {
  extractUnifiedSettlementTargetV01,
} from "../src/lib/predictions/unified-settlement-target-v0.1";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

const MODEL_VERSION =
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01;

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

  return value;
}

function settlementRequested():
  boolean {
  return process.argv
    .slice(2)
    .includes(
      "--settle",
    );
}

function timestamp(
  value:
    unknown,
  label:
    string,
): Date {
  const result =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(
            value,
          ),
        );

  assert.ok(
    Number.isFinite(
      result.getTime(),
    ),
    `${label} is invalid.`,
  );

  return result;
}

function jsonObject(
  value:
    unknown,
  label:
    string,
): Record<
  string,
  unknown
> {
  assert.ok(
    typeof value ===
      "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      ),
    `${label} must be an object.`,
  );

  return value as
    Record<
      string,
      unknown
    >;
}

async function main() {
  const date =
    requestedDate();

  const settle =
    settlementRequested();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Model: ${MODEL_VERSION}`,
  );

  console.log(
    `Mode: ${settle ? "SETTLE" : "DRY RUN"}`,
  );

  const predictions =
    await sql`
      SELECT
        prediction.id,
        prediction.fixture_id,
        prediction.output,
        prediction.input_sha256,
        prediction.input_snapshot,
        prediction.input_cutoff_at,
        prediction.generated_at,
        prediction.kickoff_at_generation,
        prediction.published_at,

        model.code_sha256
          AS model_code_sha256,

        fixture.kickoff_at,
        fixture.status
          AS fixture_status,

        home.name
          AS home_team_name,

        away_team.name
          AS away_team_name,

        result.id
          AS result_snapshot_id,

        result.status
          AS result_status,

        result.regulation_home_score,

        result.regulation_away_score,

        result.regulation_confirmed,

        result.finished_at,

        result.observed_at
          AS result_observed_at

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
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      LEFT JOIN LATERAL (
        SELECT
          snapshot.*

        FROM public.result_snapshots
          AS snapshot

        WHERE snapshot.fixture_id =
          fixture.id

          AND snapshot.is_demo =
            false

        ORDER BY
          snapshot.observed_at DESC,
          snapshot.id DESC

        LIMIT 1
      ) AS result
        ON true

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

      ORDER BY
        prediction.kickoff_at_generation,
        prediction.fixture_id
    `;

  if (
    predictions.length ===
    0
  ) {
    console.log(
      "No published Unified forecasts found.",
    );

    return;
  }

  console.log(
    `Published forecasts found: ${predictions.length}`,
  );

  const seenFixtures =
    new Set<string>();

  let ready =
    0;

  let inserted =
    0;

  let existing =
    0;

  let pending =
    0;

  let won =
    0;

  let lost =
    0;

  let voided =
    0;

  for (
    const prediction
    of predictions
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${prediction.home_team_name} vs ${prediction.away_team_name}`,
    );

    const fixtureId =
      String(
        prediction.fixture_id,
      );

    if (
      seenFixtures.has(
        fixtureId,
      )
    ) {
      throw new Error(
        `Multiple published ${MODEL_VERSION} baselines exist for fixture ${fixtureId}.`,
      );
    }

    seenFixtures.add(
      fixtureId,
    );

    /*
     * Re-verify immutable prediction input.
     */
    const inputSnapshot =
      jsonObject(
        prediction.input_snapshot,
        "Prediction input snapshot",
      );

    const modelIdentity =
      jsonObject(
        inputSnapshot.model,
        "Prediction model identity",
      );

    assert.equal(
      modelIdentity.version,
      MODEL_VERSION,
      "Prediction input model version mismatch.",
    );

    assert.equal(
      modelIdentity.codeSha256,
      String(
        prediction.model_code_sha256,
      ),
      "Prediction model fingerprint mismatch.",
    );

    assert.equal(
      canonicalSha256(
        inputSnapshot,
      ),
      String(
        prediction.input_sha256,
      ),
      "Prediction input SHA verification failed.",
    );

    const generatedAt =
      timestamp(
        prediction.generated_at,
        "Generated timestamp",
      );

    const publishedAt =
      timestamp(
        prediction.published_at,
        "Published timestamp",
      );

    const frozenKickoff =
      timestamp(
        prediction.kickoff_at_generation,
        "Frozen kickoff",
      );

    assert.ok(
      generatedAt.getTime() <
        frozenKickoff.getTime(),
      "Forecast was not generated before kickoff.",
    );

    assert.ok(
      publishedAt.getTime() >=
        generatedAt.getTime(),
      "Forecast publication precedes generation.",
    );

    assert.ok(
      publishedAt.getTime() <
        frozenKickoff.getTime(),
      "Forecast was not published before kickoff.",
    );

    const target =
      extractUnifiedSettlementTargetV01(
        prediction.output,
      );

    console.log(
      `Forecast: ${target.selection.toUpperCase()}`,
    );

    if (
      prediction.result_snapshot_id ===
      null
    ) {
      console.log(
        "Status: PENDING RESULT",
      );

      pending +=
        1;

      continue;
    }

    if (
      prediction.result_status !==
        "finished" ||
      prediction.regulation_confirmed !==
        true ||
      prediction.regulation_home_score ===
        null ||
      prediction.regulation_away_score ===
        null
    ) {
      console.log(
        "Status: RESULT NOT SETTLEMENT-READY",
      );

      pending +=
        1;

      continue;
    }

    const resultObservedAt =
      timestamp(
        prediction.result_observed_at,
        "Result observation timestamp",
      );

    assert.ok(
      resultObservedAt.getTime() >=
        frozenKickoff.getTime(),
      "Result snapshot was observed before kickoff.",
    );

    const homeScore =
      Number(
        prediction.regulation_home_score,
      );

    const awayScore =
      Number(
        prediction.regulation_away_score,
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

    console.log(
      `Result: ${homeScore}-${awayScore}`,
    );

    const settlement =
      settleFootballSelection({
        market:
          target.market,

        selection:
          target.selection,

        regulationHomeScore:
          homeScore,

        regulationAwayScore:
          awayScore,
      });

    console.log(
      `Outcome: ${settlement.outcome.toUpperCase()}`,
    );

    ready +=
      1;

    if (
      settlement.outcome ===
      "won"
    ) {
      won +=
        1;
    } else if (
      settlement.outcome ===
      "lost"
    ) {
      lost +=
        1;
    } else {
      voided +=
        1;
    }

    if (
      !settle
    ) {
      console.log(
        "Status: READY TO SETTLE",
      );

      continue;
    }

    const rows =
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
            prediction.id,
          )}::uuid,

          ${String(
            prediction.result_snapshot_id,
          )}::uuid,

          ${target.market},

          ${target.selection},

          ${settlement.outcome},

          ${SETTLEMENT_RULES_VERSION}
        )

        ON CONFLICT (
          prediction_id,
          market,
          selection
        )
        DO NOTHING

        RETURNING
          id,
          settled_at
      `;

    if (
      rows.length ===
      1
    ) {
      inserted +=
        1;

      console.log(
        "Status: SETTLED",
      );

      continue;
    }

    const existingRows =
      await sql`
        SELECT
          result_snapshot_id,
          outcome,
          rules_version

        FROM public.prediction_outcomes

        WHERE prediction_id =
          ${String(
            prediction.id,
          )}::uuid

          AND market =
            ${target.market}

          AND selection =
            ${target.selection}

        LIMIT 1
      `;

    assert.equal(
      existingRows.length,
      1,
      "Existing settlement could not be reloaded.",
    );

    assert.equal(
      String(
        existingRows[0]
          .result_snapshot_id,
      ),
      String(
        prediction.result_snapshot_id,
      ),
      "Existing settlement references a different result snapshot.",
    );

    assert.equal(
      existingRows[0].outcome,
      settlement.outcome,
      "Existing settlement outcome differs from recalculation.",
    );

    assert.equal(
      existingRows[0]
        .rules_version,
      SETTLEMENT_RULES_VERSION,
      "Existing settlement rules version differs.",
    );

    existing +=
      1;

    console.log(
      "Status: ALREADY SETTLED",
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Settlement-ready: ${ready}`,
  );

  console.log(
    `Inserted: ${inserted}`,
  );

  console.log(
    `Existing: ${existing}`,
  );

  console.log(
    `Pending: ${pending}`,
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

  const graded =
    won +
    lost;

  console.log(
    `Graded forecasts: ${graded}`,
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

  if (
    !settle
  ) {
    console.log(
      "DRY RUN COMPLETE: prediction_outcomes was not modified.",
    );
  } else {
    console.log(
      "Unified settlement complete.",
    );
  }
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error instanceof Error
        ? `Unified settlement failed: ${error.message}`
        : "Unified settlement failed.",
    );

    process.exitCode =
      1;
  },
);
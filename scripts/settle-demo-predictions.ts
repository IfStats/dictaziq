import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";
import {
  SETTLEMENT_RULES_VERSION,
  settleFootballSelection,
  type SupportedMarket,
} from "../src/lib/predictions/settlement";

type PredictionRow = {
  id: string;
  model_version: string;
  published_at: string | Date;
  output: unknown;
};

type SettlementTarget = {
  predictionId: string;
  modelVersion: string;
  market: SupportedMarket;
  selection: string;
  outcome: "won" | "lost" | "void";
};

const SUPPORTED_MARKETS = new Set<string>([
  "1x2",
  "btts",
  "goals_1.5",
  "goals_2.5",
  "goals_3.5",
]);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isSupportedMarket(
  value: string,
): value is SupportedMarket {
  return SUPPORTED_MARKETS.has(value);
}

function extractSelections(
  output: unknown,
): Array<{
  market: SupportedMarket;
  selection: string;
}> {
  assert.ok(
    isRecord(output),
    "Prediction output must be an object.",
  );

  const markets = output.markets;

  assert.ok(
    isRecord(markets),
    "Prediction output must contain a markets object.",
  );

  const selections: Array<{
    market: SupportedMarket;
    selection: string;
  }> = [];

  for (
    const [marketName, marketOutput]
    of Object.entries(markets)
  ) {
    assert.ok(
      isSupportedMarket(marketName),
      `Unsupported prediction market: ${marketName}`,
    );

    assert.ok(
      isRecord(marketOutput),
      `Prediction market ${marketName} must be an object.`,
    );

    for (const selection of Object.keys(marketOutput)) {
      assert.ok(
        selection.trim().length > 0,
        `Prediction market ${marketName} has an empty selection.`,
      );

      selections.push({
        market: marketName,
        selection,
      });
    }
  }

  return selections;
}

async function main() {
  const client = neon(getDatabaseUrl());

  const fixtures = await client`
    SELECT
      id,
      slug,
      kickoff_at,
      is_demo
    FROM public.fixtures
    WHERE provider = 'demo'
      AND provider_id = 'fixture-001'
      AND is_demo = true
  `;

  assert.equal(
    fixtures.length,
    1,
    "Demo fixture fixture-001 is missing.",
  );

  const fixture = fixtures[0];

  /*
   * Always inspect the latest observation first.
   *
   * An earlier "finished" result must not be used if a later
   * provider observation withdraws or changes its status.
   */
  const snapshots = await client`
    SELECT
      id,
      fixture_id,
      observation_key,
      status,
      regulation_home_score,
      regulation_away_score,
      regulation_confirmed,
      observed_at
    FROM public.result_snapshots
    WHERE fixture_id = ${fixture.id}::uuid
    ORDER BY
      observed_at DESC,
      id DESC
    LIMIT 1
  `;

  if (snapshots.length === 0) {
    console.log(
      "SKIP: no result snapshot exists for the fixture yet.",
    );

    console.log(
      `Fixture: ${fixture.slug}`,
    );

    console.log(
      `Kickoff: ${fixture.kickoff_at}`,
    );

    console.log(
      "No prediction outcomes were written.",
    );

    return;
  }

  const snapshot = snapshots[0];

  if (
    snapshot.status !== "finished" ||
    snapshot.regulation_confirmed !== true ||
    snapshot.regulation_home_score === null ||
    snapshot.regulation_away_score === null
  ) {
    console.log(
      "SKIP: latest result snapshot is not settlement-ready.",
    );

    console.log(
      `Snapshot status: ${snapshot.status}`,
    );

    console.log(
      `Regulation confirmed: ${snapshot.regulation_confirmed}`,
    );

    console.log(
      "No prediction outcomes were written.",
    );

    return;
  }

  const homeScore =
    Number(snapshot.regulation_home_score);

  const awayScore =
    Number(snapshot.regulation_away_score);

  assert.ok(
    Number.isInteger(homeScore) &&
      homeScore >= 0,
    "Invalid regulation home score.",
  );

  assert.ok(
    Number.isInteger(awayScore) &&
      awayScore >= 0,
    "Invalid regulation away score.",
  );

  const predictions = await client`
    SELECT
      prediction.id,
      prediction.published_at,
      prediction.output,
      model.version AS model_version

    FROM public.predictions AS prediction

    JOIN public.model_versions AS model
      ON model.id =
        prediction.model_version_id

    WHERE prediction.fixture_id =
      ${fixture.id}::uuid

      AND prediction.is_demo = true

      AND prediction.published_at
        IS NOT NULL

    ORDER BY
      model.version,
      prediction.generated_at
  `;

  assert.ok(
    predictions.length > 0,
    "No published predictions exist for settlement.",
  );

  const targets: SettlementTarget[] = [];

  for (const rawPrediction of predictions) {
    const prediction =
      rawPrediction as PredictionRow;

    const selections =
      extractSelections(prediction.output);

    for (const {
      market,
      selection,
    } of selections) {
      const result =
        settleFootballSelection({
          market,
          selection,
          regulationHomeScore:
            homeScore,
          regulationAwayScore:
            awayScore,
        });

      targets.push({
        predictionId:
          prediction.id,

        modelVersion:
          prediction.model_version,

        market,
        selection,

        outcome:
          result.outcome,
      });
    }
  }

  assert.ok(
    targets.length > 0,
    "Published predictions contain no settleable selections.",
  );

  /*
   * Insert canonical outcomes.
   *
   * The database trigger independently verifies:
   * - prediction is published,
   * - result and prediction use the same fixture,
   * - result is finished,
   * - regulation scores are confirmed,
   * - result observation occurred after kickoff,
   * - market/selection exists in the original prediction.
   *
   * ON CONFLICT makes repeat execution idempotent.
   */
  for (const target of targets) {
    await client`
      INSERT INTO public.prediction_outcomes (
        prediction_id,
        result_snapshot_id,
        market,
        selection,
        outcome,
        rules_version
      )
      VALUES (
        ${target.predictionId}::uuid,
        ${snapshot.id}::uuid,
        ${target.market},
        ${target.selection},
        ${target.outcome},
        ${SETTLEMENT_RULES_VERSION}
      )
      ON CONFLICT (
        prediction_id,
        market,
        selection
      )
      DO NOTHING
    `;
  }

  /*
   * Verify every canonical settlement rather than assuming
   * ON CONFLICT meant the existing record was equivalent.
   */
  for (const target of targets) {
    const rows = await client`
      SELECT
        prediction_id,
        result_snapshot_id,
        market,
        selection,
        outcome,
        rules_version,
        settled_at
      FROM public.prediction_outcomes
      WHERE prediction_id =
        ${target.predictionId}::uuid
        AND market =
          ${target.market}
        AND selection =
          ${target.selection}
    `;

    assert.equal(
      rows.length,
      1,
      "Canonical settlement record is missing.",
    );

    const saved = rows[0];

    assert.equal(
      saved.result_snapshot_id,
      snapshot.id,
      "Existing settlement references a different result snapshot.",
    );

    assert.equal(
      saved.outcome,
      target.outcome,
      "Existing settlement has a different outcome.",
    );

    assert.equal(
      saved.rules_version,
      SETTLEMENT_RULES_VERSION,
      "Existing settlement uses a different rules version.",
    );
  }

  console.log(
    "PASS: latest settlement-ready result snapshot selected.",
  );

  console.log(
    "PASS: published predictions loaded.",
  );

  console.log(
    "PASS: prediction selections settled deterministically.",
  );

  console.log(
    "PASS: canonical outcome records persisted.",
  );

  console.log(
    "PASS: settlement replay is idempotent.",
  );

  console.log("");

  console.log(
    `Fixture: ${fixture.slug}`,
  );

  console.log(
    `Regulation result: ${homeScore}-${awayScore}`,
  );

  console.log(
    `Result Snapshot ID: ${snapshot.id}`,
  );

  console.log(
    `Settlement rules: ${SETTLEMENT_RULES_VERSION}`,
  );

  console.log("");

  for (const target of targets) {
    console.log(
      `${target.modelVersion} | ` +
        `${target.market} | ` +
        `${target.selection} | ` +
        `${target.outcome}`,
    );
  }

  console.log("");

  console.log(
    "WARNING: demo/synthetic outcome records are pipeline verification evidence, not real model performance evidence.",
  );
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(
      `Settlement verification failed: ${error.message}`,
    );
  } else {
    console.error(
      error instanceof Error
        ? `Settlement failed: ${error.message}`
        : "Settlement failed.",
    );
  }

  process.exitCode = 1;
});
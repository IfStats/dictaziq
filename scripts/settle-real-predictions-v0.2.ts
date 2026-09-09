import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  SETTLEMENT_RULES_VERSION,
  settleFootballSelection,
} from "../src/lib/predictions/settlement";

import {
  extractSettlementTargetsV02,
} from "../src/lib/predictions/settlement-targets-v0.2";

const MODEL_VERSION =
  "dictaziq-prematch-markets-v0.2";

function requestedDate():
  string {
  const value =
    process.argv[2]?.trim() ??
    "2026-09-09";

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

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  const predictions =
    await sql`
      SELECT
        prediction.id,
        prediction.output,
        prediction.published_at,

        fixture.id
          AS fixture_id,

        fixture.slug,

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

        result.regulation_confirmed

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
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  assert.ok(
    predictions.length > 0,
    `No published v0.2 predictions found for ${date}.`,
  );

  let won = 0;
  let lost = 0;
  let voided = 0;
  let inserted = 0;
  let existing = 0;
  let pending = 0;

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

    if (
      prediction
        .result_snapshot_id ===
        null
    ) {
      console.log(
        "SKIP: no result snapshot.",
      );

      pending += 1;
      continue;
    }

    if (
      prediction.result_status !==
        "finished" ||
      prediction
        .regulation_confirmed !==
        true ||
      prediction
        .regulation_home_score ===
        null ||
      prediction
        .regulation_away_score ===
        null
    ) {
      console.log(
        "SKIP: latest result snapshot is not settlement-ready.",
      );

      pending += 1;
      continue;
    }

    const homeScore =
      Number(
        prediction
          .regulation_home_score,
      );

    const awayScore =
      Number(
        prediction
          .regulation_away_score,
      );

    assert.ok(
      Number.isInteger(
        homeScore,
      ) &&
        homeScore >= 0,
      "Invalid regulation home score.",
    );

    assert.ok(
      Number.isInteger(
        awayScore,
      ) &&
        awayScore >= 0,
      "Invalid regulation away score.",
    );

    console.log(
      `Regulation result: ${homeScore}-${awayScore}`,
    );

    const targets =
      extractSettlementTargetsV02(
        prediction.output,
      );

    if (
      targets.length ===
      0
    ) {
      console.log(
        "SETTLEMENT TARGETS: NONE",
      );

      continue;
    }

    for (
      const target
      of targets
    ) {
      const result =
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
              prediction
                .result_snapshot_id,
            )}::uuid,

            ${target.market},

            ${target.selection},

            ${result.outcome},

            ${SETTLEMENT_RULES_VERSION}
          )

          ON CONFLICT (
            prediction_id,
            market,
            selection
          )
          DO NOTHING

          RETURNING
            id
        `;

      if (
        rows.length ===
        1
      ) {
        inserted += 1;
      } else {
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
            prediction
              .result_snapshot_id,
          ),
          "Existing outcome references a different result snapshot.",
        );

        assert.equal(
          existingRows[0]
            .outcome,
          result.outcome,
          "Existing settlement outcome differs.",
        );

        assert.equal(
          existingRows[0]
            .rules_version,
          SETTLEMENT_RULES_VERSION,
          "Existing settlement rules differ.",
        );

        existing += 1;
      }

      if (
        result.outcome ===
        "won"
      ) {
        won += 1;
      } else if (
        result.outcome ===
        "lost"
      ) {
        lost += 1;
      } else {
        voided += 1;
      }

      console.log(
        `${result.outcome.toUpperCase()} | ${target.market} | ${target.selection}`,
      );
    }
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Settlements inserted: ${inserted}`,
  );

  console.log(
    `Settlements existing: ${existing}`,
  );

  console.log(
    `Pending fixtures: ${pending}`,
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
    won + lost;

  console.log(
    `Graded selections: ${graded}`,
  );

  console.log(
    graded > 0
      ? `Raw hit rate: ${(
          (
            won /
            graded
          ) *
          100
        ).toFixed(
          2,
        )}%`
      : "Raw hit rate: N/A",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
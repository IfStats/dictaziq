import assert from "node:assert/strict";

import {
  evaluatePreMatchDecisionV02,
  PREMATCH_ENGINE_VERSION_V02,
} from "../src/lib/predictions/prematch-decision-v0.2";

const SOURCE =
  "footballdatabase.com";

const SNAPSHOT_DATE =
  "2026-09-06";

const CUTOFF =
  "2026-09-09T18:30:00.000Z";

const KICKOFF =
  "2026-09-09T19:00:00.000Z";

function ratings(
  gap: number,
) {
  const away = 1800;

  return {
    home: {
      rating:
        away + gap,

      source:
        SOURCE,

      snapshotDate:
        SNAPSHOT_DATE,
    },

    away: {
      rating:
        away,

      source:
        SOURCE,

      snapshotDate:
        SNAPSHOT_DATE,
    },
  };
}

function main() {
  /*
   * Liverpool-style D=39:
   * result context required.
   */
  {
    const result =
      evaluatePreMatchDecisionV02({
        ratings:
          ratings(39),
      });

    assert.equal(
      result.engineVersion,
      PREMATCH_ENGINE_VERSION_V02,
    );

    assert.equal(
      result.route,
      "result_context_required",
    );

    assert.equal(
      result.finalResultSelection,
      null,
    );

    assert.equal(
      result.resultContextRequired,
      true,
    );

    assert.equal(
      result.marketAnalysis.goals.selection,
      null,
    );

    assert.equal(
      result.marketAnalysis.btts.selection,
      null,
    );

    assert.equal(
      result.marketAnalysis.corners.selection,
      null,
    );
  }

  /*
   * Resolve a 5-49 result using verified
   * football context.
   */
  {
    const result =
      evaluatePreMatchDecisionV02({
        ratings:
          ratings(39),

        resultContext: {
          cutoffAt:
            CUTOFF,

          kickoffAt:
            KICKOFF,

          factors: [
            {
              kind:
                "recent_form",

              side:
                "home",

              description:
                "Verified recent form supports the home side.",

              source:
                "test-source",

              observedAt:
                "2026-09-09T17:00:00.000Z",
            },

            {
              kind:
                "home_away_form",

              side:
                "home",

              description:
                "Verified home-away split supports the home side.",

              source:
                "test-source",

              observedAt:
                "2026-09-09T17:05:00.000Z",
            },

            {
              kind:
                "rest_schedule",

              side:
                "neutral",

              description:
                "Verified rest schedule is neutral.",

              source:
                "test-source",

              observedAt:
                "2026-09-09T17:10:00.000Z",
            },
          ],
        },
      });

    assert.equal(
      result.route,
      "rating_gap_plus_context",
    );

    assert.equal(
      result.finalResultSelection,
      "home",
    );

    assert.equal(
      result.resultContextResolved,
      true,
    );

    /*
     * Result resolution must NOT leak
     * into other markets.
     */
    assert.equal(
      result.marketAnalysis.goals.selection,
      null,
    );

    assert.equal(
      result.marketAnalysis.btts.selection,
      null,
    );
  }

  /*
   * Napoli-Arsenal style:
   * large rating mismatch.
   */
  {
    const result =
      evaluatePreMatchDecisionV02({
        ratings:
          ratings(-289),
      });

    assert.equal(
      result.route,
      "rating_gap_only",
    );

    assert.equal(
      result.ratingGap.resultSignal,
      "strong_win",
    );

    assert.equal(
      result.finalResultSelection,
      "away",
    );

    /*
     * 150+ only contributes a goal-analysis
     * feature. It is not an O2.5 pick.
     */
    assert.equal(
      result.marketAnalysis
        .goals
        .ratingMismatchCandidate,
      true,
    );

    assert.equal(
      result.marketAnalysis
        .goals
        .selection,
      null,
    );

    assert.equal(
      result.marketAnalysis
        .btts
        .selection,
      null,
    );
  }

  /*
   * Sporting-Galatasaray style:
   * cautious result selection but goal
   * markets remain open for analysis.
   */
  {
    const result =
      evaluatePreMatchDecisionV02({
        ratings:
          ratings(104),
      });

    assert.equal(
      result.ratingGap.resultSignal,
      "cautious_win",
    );

    assert.equal(
      result.finalResultSelection,
      "home",
    );

    assert.equal(
      result.marketAnalysis
        .goals
        .ratingMismatchCandidate,
      false,
    );

    assert.equal(
      result.marketAnalysis
        .goals
        .status,
      "analysis_required",
    );

    assert.equal(
      result.marketAnalysis
        .btts
        .status,
      "analysis_required",
    );
  }

  /*
   * Draw band still does not imply
   * any goal/BTTS market.
   */
  {
    const result =
      evaluatePreMatchDecisionV02({
        ratings:
          ratings(-2),
      });

    assert.equal(
      result.finalResultSelection,
      "draw",
    );

    assert.equal(
      result.marketAnalysis
        .goals
        .selection,
      null,
    );

    assert.equal(
      result.marketAnalysis
        .btts
        .selection,
      null,
    );
  }

  /*
   * Context cannot override a mathematical
   * result outside the 5-49 band.
   */
  assert.throws(
    () =>
      evaluatePreMatchDecisionV02({
        ratings:
          ratings(104),

        resultContext: {
          cutoffAt:
            CUTOFF,

          kickoffAt:
            KICKOFF,

          factors: [],
        },
      }),

    /only be supplied/,
  );

  /*
   * Explicit market catalogue.
   */
  {
    const result =
      evaluatePreMatchDecisionV02({
        ratings:
          ratings(26),
      });

    assert.deepEqual(
      result.marketAnalysis
        .goals
        .markets,

      [
        "goals_1.5",
        "goals_2.5",
        "goals_3.5",
        "team_totals",
      ],
    );

    assert.deepEqual(
      result.marketAnalysis
        .resultDerivatives
        .markets,

      [
        "double_chance",
        "draw_no_bet",
      ],
    );

    assert.deepEqual(
      result.marketAnalysis
        .corners
        .markets,

      [
        "total_corners",
        "team_corners",
      ],
    );
  }

  /*
   * Still no fabricated probabilities.
   */
  assert.equal(
    evaluatePreMatchDecisionV02({
      ratings:
        ratings(-289),
    }).calibratedProbability,

    null,
  );

  console.log(
    "PASS: prematch v0.2 uses rating-gap v0.2.",
  );

  console.log(
    "PASS: result context remains isolated to |D| 5-49.",
  );

  console.log(
    "PASS: verified context can resolve the result without resolving other markets.",
  );

  console.log(
    "PASS: 150+ is only a goals-analysis feature, never automatic O2.5.",
  );

  console.log(
    "PASS: BTTS always requires independent analysis.",
  );

  console.log(
    "PASS: goals/team totals require independent analysis.",
  );

  console.log(
    "PASS: double chance and DNB have independent analysis contracts.",
  );

  console.log(
    "PASS: corners have an independent analysis contract.",
  );

  console.log(
    "PASS: no calibrated probabilities fabricated.",
  );
}

main();
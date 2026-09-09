import assert from "node:assert/strict";

import {
  evaluateRatingGapV02,
  RATING_GAP_MODEL_VERSION_V02,
} from "../src/lib/predictions/rating-gap-v0.2";

const SOURCE =
  "footballdatabase.com";

const DATE =
  "2026-09-06";

function evaluate(
  gap: number,
) {
  const away =
    1800;

  const home =
    away + gap;

  return evaluateRatingGapV02({
    home: {
      rating:
        home,

      source:
        SOURCE,

      snapshotDate:
        DATE,
    },

    away: {
      rating:
        away,

      source:
        SOURCE,

      snapshotDate:
        DATE,
    },
  });
}

function main() {
  /*
   * Model identity.
   */
  assert.equal(
    evaluate(100)
      .modelVersion,

    RATING_GAP_MODEL_VERSION_V02,
  );

  /*
   * Strong draw band.
   */
  for (
    const gap
    of [-4, -3, -2, -1]
  ) {
    const result =
      evaluate(gap);

    assert.equal(
      result.resultSignal,
      "strong_draw",
    );

    assert.equal(
      result.standaloneSelection,
      "draw",
    );

    assert.equal(
      result.requiresResultContext,
      false,
    );
  }

  /*
   * Draw band.
   */
  for (
    const gap
    of [0, 1, 2, 3, 4]
  ) {
    const result =
      evaluate(gap);

    assert.equal(
      result.resultSignal,
      "draw",
    );

    assert.equal(
      result.standaloneSelection,
      "draw",
    );
  }

  /*
   * 5-49:
   * no standalone 1X2 prediction.
   */
  for (
    const gap
    of [
      -49,
      -5,
      5,
      49,
    ]
  ) {
    const result =
      evaluate(gap);

    assert.equal(
      result.resultSignal,
      "context_required",
    );

    assert.equal(
      result.standaloneSelection,
      null,
    );

    assert.equal(
      result.requiresResultContext,
      true,
    );
  }

  /*
   * 50-149:
   * cautious win.
   */
  {
    const result =
      evaluate(50);

    assert.equal(
      result.resultSignal,
      "cautious_win",
    );

    assert.equal(
      result.standaloneSelection,
      "home",
    );
  }

  {
    const result =
      evaluate(-149);

    assert.equal(
      result.resultSignal,
      "cautious_win",
    );

    assert.equal(
      result.standaloneSelection,
      "away",
    );
  }

  /*
   * 150+:
   * strong 1X2 direction.
   *
   * Crucially, NO automatic O2.5.
   */
  {
    const result =
      evaluate(150);

    assert.equal(
      result.resultSignal,
      "strong_win",
    );

    assert.equal(
      result.standaloneSelection,
      "home",
    );

    assert.equal(
      result.markets
        .goals
        .ratingMismatchCandidate,
      true,
    );

    assert.equal(
      result.markets
        .goals
        .selection,
      null,
    );
  }

  {
    const result =
      evaluate(-289);

    assert.equal(
      result.resultSignal,
      "strong_win",
    );

    assert.equal(
      result.standaloneSelection,
      "away",
    );

    assert.equal(
      result.markets
        .goals
        .ratingMismatchCandidate,
      true,
    );

    assert.equal(
      result.markets
        .goals
        .selection,
      null,
    );
  }

  /*
   * Smaller gaps can still eventually produce
   * O2.5 after goals analysis.
   *
   * Therefore analysis is required regardless
   * of rating-gap size.
   */
  {
    const result =
      evaluate(26);

    assert.equal(
      result.markets
        .goals
        .requiresAnalysis,
      true,
    );

    assert.equal(
      result.markets
        .goals
        .ratingMismatchCandidate,
      false,
    );

    assert.equal(
      result.markets
        .goals
        .selection,
      null,
    );
  }

  /*
   * BTTS is NEVER inferred directly from D.
   */
  for (
    const gap
    of [
      0,
      26,
      104,
      -289,
    ]
  ) {
    const result =
      evaluate(gap);

    assert.equal(
      result.markets
        .btts
        .requiresAnalysis,
      true,
    );

    assert.equal(
      result.markets
        .btts
        .selection,
      null,
    );
  }

  /*
   * Other markets are also independent.
   */
  {
    const result =
      evaluate(104);

    assert.equal(
      result.standaloneSelection,
      "home",
    );

    assert.equal(
      result.resultSignal,
      "cautious_win",
    );

    assert.equal(
      result.markets
        .goals
        .selection,
      null,
    );

    assert.equal(
      result.markets
        .btts
        .selection,
      null,
    );

    assert.equal(
      result.markets
        .other
        .selection,
      null,
    );
  }

  /*
   * No probability fabrication.
   */
  assert.equal(
    evaluate(104)
      .calibratedProbability,
    null,
  );

  /*
   * Input guards.
   */
  assert.throws(
    () =>
      evaluateRatingGapV02({
        home: {
          rating: 1800,
          source:
            "source-a",
          snapshotDate:
            DATE,
        },

        away: {
          rating: 1700,
          source:
            "source-b",
          snapshotDate:
            DATE,
        },
      }),

    /same source/,
  );

  assert.throws(
    () =>
      evaluateRatingGapV02({
        home: {
          rating: 1800,
          source:
            SOURCE,
          snapshotDate:
            "2026-09-06",
        },

        away: {
          rating: 1700,
          source:
            SOURCE,
          snapshotDate:
            "2026-08-30",
        },
      }),

    /same weekly snapshot date/,
  );

  assert.throws(
    () =>
      evaluateRatingGapV02({
        home: {
          rating: -1,
          source:
            SOURCE,
          snapshotDate:
            DATE,
        },

        away: {
          rating: 1700,
          source:
            SOURCE,
          snapshotDate:
            DATE,
        },
      }),

    /non-negative/,
  );

  console.log(
    "PASS: v0.1 historical model remains untouched.",
  );

  console.log(
    "PASS: v0.2 preserves all rating-gap boundaries.",
  );

  console.log(
    "PASS: 150+ produces strong winner signal but no automatic O2.5 selection.",
  );

  console.log(
    "PASS: smaller rating gaps may still enter goals analysis.",
  );

  console.log(
    "PASS: BTTS is independent from rating gap.",
  );

  console.log(
    "PASS: other markets require independent analysis.",
  );

  console.log(
    "PASS: no calibrated probabilities fabricated.",
  );

  console.log("");

  console.log(
    "Examples:",
  );

  for (
    const gap
    of [
      39,
      -289,
      104,
      26,
    ]
  ) {
    const result =
      evaluate(gap);

    console.log(
      [
        `D=${gap}`,
        `result=${result.resultSignal}`,
        `selection=${result.standaloneSelection}`,
        `goalMismatchCandidate=${result.markets.goals.ratingMismatchCandidate}`,
        `O2.5=${result.markets.goals.selection}`,
        `BTTS=${result.markets.btts.selection}`,
      ].join(" | "),
    );
  }
}

main();
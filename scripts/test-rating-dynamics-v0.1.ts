import assert from "node:assert/strict";

import {
  evaluateRatingDynamicsV01,
  RATING_DYNAMICS_MODEL_VERSION_V01,
} from "../src/lib/predictions/rating-dynamics-v0.1";

const SOURCE =
  "footballdatabase.com";

function snapshot(
  rating: number,
  snapshotDate: string,
) {
  return {
    rating,
    snapshotDate,
    source:
      SOURCE,
  };
}

function main() {
  /*
   * Strong upward trajectory.
   */
  const rising =
    evaluateRatingDynamicsV01({
      teamId:
        "rising-team",

      teamName:
        "Rising Team",

      asOfDate:
        "2026-09-10",

      snapshots: [
        snapshot(
          1700,
          "2026-08-16",
        ),

        snapshot(
          1710,
          "2026-08-23",
        ),

        snapshot(
          1725,
          "2026-08-30",
        ),

        snapshot(
          1740,
          "2026-09-06",
        ),
      ],
    });

  assert.equal(
    rising.status,
    "available",
  );

  assert.equal(
    rising.currentRating,
    1740,
  );

  assert.equal(
    rising.previousRating,
    1725,
  );

  assert.equal(
    rising.lastChange,
    15,
  );

  assert.equal(
    rising.netChange,
    40,
  );

  assert.equal(
    rising.direction,
    "rising",
  );

  assert.equal(
    rising.currentPosition,
    "period_high",
  );

  assert.ok(
    rising.shortTermSlopePer7Days !==
      null &&
      rising.shortTermSlopePer7Days >
        0,
  );

  /*
   * Falling trajectory.
   */
  const falling =
    evaluateRatingDynamicsV01({
      teamId:
        "falling-team",

      teamName:
        "Falling Team",

      asOfDate:
        "2026-09-10",

      snapshots: [
        snapshot(
          1900,
          "2026-08-16",
        ),

        snapshot(
          1880,
          "2026-08-23",
        ),

        snapshot(
          1850,
          "2026-08-30",
        ),

        snapshot(
          1820,
          "2026-09-06",
        ),
      ],
    });

  assert.equal(
    falling.currentRating,
    1820,
  );

  assert.equal(
    falling.direction,
    "falling",
  );

  assert.equal(
    falling.currentPosition,
    "period_low",
  );

  assert.equal(
    falling.netChange,
    -80,
  );

  /*
   * Same current rating, completely different
   * trajectory.
   *
   * This illustrates exactly why current rating
   * remains the strength measure while history
   * provides additional mathematical context.
   */
  const risingTo1800 =
    evaluateRatingDynamicsV01({
      teamId:
        "rising-1800",

      teamName:
        "Rising 1800",

      asOfDate:
        "2026-09-10",

      snapshots: [
        snapshot(
          1710,
          "2026-08-16",
        ),

        snapshot(
          1740,
          "2026-08-23",
        ),

        snapshot(
          1770,
          "2026-08-30",
        ),

        snapshot(
          1800,
          "2026-09-06",
        ),
      ],
    });

  const fallingTo1800 =
    evaluateRatingDynamicsV01({
      teamId:
        "falling-1800",

      teamName:
        "Falling 1800",

      asOfDate:
        "2026-09-10",

      snapshots: [
        snapshot(
          1900,
          "2026-08-16",
        ),

        snapshot(
          1870,
          "2026-08-23",
        ),

        snapshot(
          1835,
          "2026-08-30",
        ),

        snapshot(
          1800,
          "2026-09-06",
        ),
      ],
    });

  assert.equal(
    risingTo1800.currentRating,
    1800,
  );

  assert.equal(
    fallingTo1800.currentRating,
    1800,
  );

  assert.equal(
    risingTo1800.direction,
    "rising",
  );

  assert.equal(
    fallingTo1800.direction,
    "falling",
  );

  /*
   * The engine must never create an adjusted
   * or alternative strength rating.
   */
  assert.equal(
    "adjustedRating" in
      risingTo1800,
    false,
  );

  assert.equal(
    "structuralRating" in
      risingTo1800,
    false,
  );

  /*
   * Flat trajectory.
   */
  const flat =
    evaluateRatingDynamicsV01({
      teamId:
        "flat-team",

      teamName:
        "Flat Team",

      asOfDate:
        "2026-09-10",

      snapshots: [
        snapshot(
          1700,
          "2026-08-16",
        ),

        snapshot(
          1700,
          "2026-08-23",
        ),

        snapshot(
          1700,
          "2026-08-30",
        ),

        snapshot(
          1700,
          "2026-09-06",
        ),
      ],
    });

  assert.equal(
    flat.direction,
    "flat",
  );

  assert.equal(
    flat.currentPosition,
    "flat_range",
  );

  assert.equal(
    flat.periodRatingRange,
    0,
  );

  assert.equal(
    flat.lastChange,
    0,
  );

  /*
   * Volatile trajectory.
   */
  const volatile =
    evaluateRatingDynamicsV01({
      teamId:
        "volatile-team",

      teamName:
        "Volatile Team",

      asOfDate:
        "2026-09-10",

      snapshots: [
        snapshot(
          1700,
          "2026-08-16",
        ),

        snapshot(
          1750,
          "2026-08-23",
        ),

        snapshot(
          1680,
          "2026-08-30",
        ),

        snapshot(
          1730,
          "2026-09-06",
        ),
      ],
    });

  assert.ok(
    volatile
      .stepChangeStandardDeviation !==
      null,
  );

  assert.ok(
    volatile
      .meanAbsoluteStepChange !==
      null,
  );

  assert.equal(
    volatile.periodRatingRange,
    70,
  );

  /*
   * One current rating remains valid, but there
   * is no trajectory yet.
   */
  const oneObservation =
    evaluateRatingDynamicsV01({
      teamId:
        "new-team",

      teamName:
        "New Team",

      asOfDate:
        "2026-09-10",

      snapshots: [
        snapshot(
          1666,
          "2026-09-06",
        ),
      ],
    });

  assert.equal(
    oneObservation.status,
    "unavailable",
  );

  assert.equal(
    oneObservation.currentRating,
    1666,
  );

  assert.equal(
    oneObservation.direction,
    "unavailable",
  );

  assert.equal(
    oneObservation.lastChange,
    null,
  );

  /*
   * No snapshots means dynamics and current
   * rating are both unavailable within this
   * specific component.
   */
  const noHistory =
    evaluateRatingDynamicsV01({
      teamId:
        "no-history",

      teamName:
        "No History",

      asOfDate:
        "2026-09-10",

      snapshots: [],
    });

  assert.equal(
    noHistory.status,
    "unavailable",
  );

  assert.equal(
    noHistory.currentRating,
    null,
  );

  /*
   * Future leakage rejected.
   */
  assert.throws(
    () =>
      evaluateRatingDynamicsV01({
        teamId:
          "future-team",

        teamName:
          "Future Team",

        asOfDate:
          "2026-09-10",

        snapshots: [
          snapshot(
            1700,
            "2026-09-13",
          ),
        ],
      }),
    /after the as-of date/,
  );

  /*
   * Duplicate weekly observations rejected.
   */
  assert.throws(
    () =>
      evaluateRatingDynamicsV01({
        teamId:
          "duplicate-team",

        teamName:
          "Duplicate Team",

        asOfDate:
          "2026-09-10",

        snapshots: [
          snapshot(
            1700,
            "2026-09-06",
          ),

          snapshot(
            1710,
            "2026-09-06",
          ),
        ],
      }),
    /Duplicate rating snapshot date/,
  );

  /*
   * Mixed rating scales/providers rejected.
   */
  assert.throws(
    () =>
      evaluateRatingDynamicsV01({
        teamId:
          "mixed-team",

        teamName:
          "Mixed Team",

        asOfDate:
          "2026-09-10",

        snapshots: [
          snapshot(
            1700,
            "2026-08-30",
          ),

          {
            rating:
              1710,

            snapshotDate:
              "2026-09-06",

            source:
              "other-provider",
          },
        ],
      }),
    /same source/,
  );

  const outputs = [
    rising,
    falling,
    risingTo1800,
    fallingTo1800,
    flat,
    volatile,
    oneObservation,
    noHistory,
  ];

  for (
    const output
    of outputs
  ) {
    assert.equal(
      output.modelVersion,
      RATING_DYNAMICS_MODEL_VERSION_V01,
    );

    assert.equal(
      output.calibratedProbability,
      null,
    );

    assert.equal(
      output.recommendationStatus,
      "not_evaluated",
    );
  }

  console.log(
    `PASS: ${RATING_DYNAMICS_MODEL_VERSION_V01}`,
  );

  console.log(
    "PASS: current FootballDatabase rating remains the primary team-strength number.",
  );

  console.log(
    "PASS: rating history produces trajectory statistics rather than a second strength score.",
  );

  console.log(
    "PASS: rising, falling and flat trajectories are mathematically detected.",
  );

  console.log(
    "PASS: same current rating can retain different historical trajectories.",
  );

  console.log(
    "PASS: step volatility is measured numerically.",
  );

  console.log(
    "PASS: insufficient history does not fabricate trend information.",
  );

  console.log(
    "PASS: future snapshots are rejected.",
  );

  console.log(
    "PASS: mixed rating providers are rejected.",
  );

  console.log(
    "PASS: no calibrated probability is fabricated.",
  );

  console.log(
    "PASS: no betting recommendation is produced.",
  );

  console.log("");

  console.log(
    `Rising 1800: current=${risingTo1800.currentRating} | trend=${risingTo1800.direction} | slope/7d=${risingTo1800.shortTermSlopePer7Days}`,
  );

  console.log(
    `Falling 1800: current=${fallingTo1800.currentRating} | trend=${fallingTo1800.direction} | slope/7d=${fallingTo1800.shortTermSlopePer7Days}`,
  );
}

main();
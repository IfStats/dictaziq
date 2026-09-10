import assert from "node:assert/strict";

import {
  evaluateRatingInteractionV01,
  RATING_INTERACTION_MODEL_VERSION_V01,
} from "../src/lib/predictions/rating-interaction-v0.1";

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

function team(
  teamId: string,
  teamName: string,
  ratings: number[],
) {
  const dates = [
    "2026-08-16",
    "2026-08-23",
    "2026-08-30",
    "2026-09-06",
  ];

  return {
    teamId,
    teamName,

    asOfDate:
      "2026-09-10",

    snapshots:
      ratings.map(
        (
          rating,
          index,
        ) =>
          snapshot(
            rating,
            dates[index],
          ),
      ),
  };
}

function main() {
  /*
   * CONFIRMING:
   *
   * Home already stronger.
   * Home rising.
   * Away falling.
   */
  const confirming =
    evaluateRatingInteractionV01({
      home:
        team(
          "home-confirming",
          "Home Confirming",
          [
            1740,
            1760,
            1780,
            1800,
          ],
        ),

      away:
        team(
          "away-confirming",
          "Away Confirming",
          [
            1760,
            1740,
            1720,
            1700,
          ],
        ),
    });

  assert.equal(
    confirming.currentRatingGap,
    100,
  );

  assert.equal(
    confirming.higherRatedSide,
    "home",
  );

  assert.equal(
    confirming.interaction,
    "confirming",
  );

  assert.equal(
    confirming.gapMovement,
    "widening",
  );

  assert.equal(
    confirming.currentAdvantageInterpretation,
    "reinforced",
  );

  /*
   * CONFLICTING:
   *
   * Home still stronger now,
   * but home is falling while away rises.
   */
  const conflicting =
    evaluateRatingInteractionV01({
      home:
        team(
          "home-conflict",
          "Home Conflict",
          [
            1860,
            1840,
            1820,
            1800,
          ],
        ),

      away:
        team(
          "away-conflict",
          "Away Conflict",
          [
            1640,
            1660,
            1680,
            1700,
          ],
        ),
    });

  assert.equal(
    conflicting.currentRatingGap,
    100,
  );

  assert.equal(
    conflicting.interaction,
    "conflicting",
  );

  assert.equal(
    conflicting.gapMovement,
    "narrowing",
  );

  assert.equal(
    conflicting.currentAdvantageInterpretation,
    "challenged",
  );

  /*
   * DIVERGING:
   *
   * Both teams rising.
   * Home is already stronger and rising faster.
   */
  const diverging =
    evaluateRatingInteractionV01({
      home:
        team(
          "home-diverging",
          "Home Diverging",
          [
            1700,
            1730,
            1760,
            1800,
          ],
        ),

      away:
        team(
          "away-diverging",
          "Away Diverging",
          [
            1650,
            1665,
            1680,
            1700,
          ],
        ),
    });

  assert.equal(
    diverging.currentRatingGap,
    100,
  );

  assert.equal(
    diverging.interaction,
    "diverging",
  );

  assert.equal(
    diverging.gapMovement,
    "widening",
  );

  /*
   * CONVERGING:
   *
   * Both teams rising,
   * but the lower-rated away side is rising faster.
   */
  const converging =
    evaluateRatingInteractionV01({
      home:
        team(
          "home-converging",
          "Home Converging",
          [
            1750,
            1765,
            1780,
            1800,
          ],
        ),

      away:
        team(
          "away-converging",
          "Away Converging",
          [
            1550,
            1600,
            1650,
            1700,
          ],
        ),
    });

  assert.equal(
    converging.currentRatingGap,
    100,
  );

  assert.equal(
    converging.interaction,
    "converging",
  );

  assert.equal(
    converging.gapMovement,
    "narrowing",
  );

  /*
   * STABLE:
   *
   * Same weekly trajectory rate.
   */
  const stable =
    evaluateRatingInteractionV01({
      home:
        team(
          "home-stable",
          "Home Stable",
          [
            1770,
            1780,
            1790,
            1800,
          ],
        ),

      away:
        team(
          "away-stable",
          "Away Stable",
          [
            1670,
            1680,
            1690,
            1700,
          ],
        ),
    });

  assert.equal(
    stable.currentRatingGap,
    100,
  );

  assert.equal(
    stable.interaction,
    "stable",
  );

  assert.equal(
    stable.gapMovement,
    "stable",
  );

  /*
   * CURRENT PARITY:
   *
   * Both finish at 1800,
   * but home has risen while away has fallen.
   *
   * Current D remains exactly zero.
   */
  const parityMovingHome =
    evaluateRatingInteractionV01({
      home:
        team(
          "home-parity",
          "Home Parity",
          [
            1710,
            1740,
            1770,
            1800,
          ],
        ),

      away:
        team(
          "away-parity",
          "Away Parity",
          [
            1890,
            1860,
            1830,
            1800,
          ],
        ),
    });

  assert.equal(
    parityMovingHome.currentRatingGap,
    0,
  );

  assert.equal(
    parityMovingHome.higherRatedSide,
    "level",
  );

  assert.equal(
    parityMovingHome.interaction,
    "diverging",
  );

  assert.equal(
    parityMovingHome.trajectoryLeader,
    "home",
  );

  assert.equal(
    parityMovingHome.currentAdvantageInterpretation,
    "parity_moving_home",
  );

  /*
   * AWAY advantage confirmation.
   */
  const awayConfirming =
    evaluateRatingInteractionV01({
      home:
        team(
          "home-away-confirm",
          "Home Away Confirm",
          [
            1760,
            1740,
            1720,
            1700,
          ],
        ),

      away:
        team(
          "away-away-confirm",
          "Away Away Confirm",
          [
            1840,
            1860,
            1880,
            1900,
          ],
        ),
    });

  assert.equal(
    awayConfirming.currentRatingGap,
    -200,
  );

  assert.equal(
    awayConfirming.higherRatedSide,
    "away",
  );

  assert.equal(
    awayConfirming.interaction,
    "confirming",
  );

  assert.equal(
    awayConfirming.gapMovement,
    "widening",
  );

  /*
   * Current ratings remain untouched.
   */
  assert.equal(
    confirming.home.currentRating,
    1800,
  );

  assert.equal(
    confirming.away.currentRating,
    1700,
  );

  assert.equal(
    "adjustedHomeRating" in
      confirming,
    false,
  );

  assert.equal(
    "adjustedAwayRating" in
      confirming,
    false,
  );

  /*
   * Insufficient trajectory:
   *
   * Current D remains available even though
   * historical interaction cannot be calculated.
   */
  const insufficient =
    evaluateRatingInteractionV01({
      home: {
        teamId:
          "home-short",

        teamName:
          "Home Short",

        asOfDate:
          "2026-09-10",

        snapshots: [
          snapshot(
            1800,
            "2026-09-06",
          ),
        ],
      },

      away: {
        teamId:
          "away-short",

        teamName:
          "Away Short",

        asOfDate:
          "2026-09-10",

        snapshots: [
          snapshot(
            1700,
            "2026-09-06",
          ),
        ],
      },
    });

  assert.equal(
    insufficient.currentRatingGap,
    100,
  );

  assert.equal(
    insufficient.interaction,
    "insufficient",
  );

  assert.equal(
    insufficient.gapMovement,
    "unavailable",
  );

  /*
   * No ratings at all.
   */
  const noRatings =
    evaluateRatingInteractionV01({
      home: {
        teamId:
          "home-none",

        teamName:
          "Home None",

        asOfDate:
          "2026-09-10",

        snapshots: [],
      },

      away: {
        teamId:
          "away-none",

        teamName:
          "Away None",

        asOfDate:
          "2026-09-10",

        snapshots: [],
      },
    });

  assert.equal(
    noRatings.currentRatingGap,
    null,
  );

  assert.equal(
    noRatings.interaction,
    "insufficient",
  );

  /*
   * No probabilities or recommendations.
   */
  const outputs = [
    confirming,
    conflicting,
    diverging,
    converging,
    stable,
    parityMovingHome,
    awayConfirming,
    insufficient,
    noRatings,
  ];

  for (
    const output
    of outputs
  ) {
    assert.equal(
      output.modelVersion,
      RATING_INTERACTION_MODEL_VERSION_V01,
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
    `PASS: ${RATING_INTERACTION_MODEL_VERSION_V01}`,
  );

  console.log(
    "PASS: current rating gap remains the primary mathematical relationship.",
  );

  console.log(
    "PASS: higher-rated rising plus lower-rated falling is classified as confirming.",
  );

  console.log(
    "PASS: higher-rated falling plus lower-rated rising is classified as conflicting.",
  );

  console.log(
    "PASS: widening same-direction trajectories are classified as diverging.",
  );

  console.log(
    "PASS: narrowing same-direction trajectories are classified as converging.",
  );

  console.log(
    "PASS: equal relative trajectories are classified as stable.",
  );

  console.log(
    "PASS: parity can mathematically move toward home or away without changing current D.",
  );

  console.log(
    "PASS: insufficient history never fabricates trajectory interaction.",
  );

  console.log(
    "PASS: current ratings are never adjusted.",
  );

  console.log(
    "PASS: no calibrated probabilities are fabricated.",
  );

  console.log(
    "PASS: no betting recommendation is generated.",
  );

  console.log("");

  console.log(
    `CONFIRMING: D=${confirming.currentRatingGap} | relative slope=${confirming.relativeSlopePer7Days} | ${confirming.interaction}`,
  );

  console.log(
    `CONFLICTING: D=${conflicting.currentRatingGap} | relative slope=${conflicting.relativeSlopePer7Days} | ${conflicting.interaction}`,
  );

  console.log(
    `DIVERGING: D=${diverging.currentRatingGap} | relative slope=${diverging.relativeSlopePer7Days} | ${diverging.interaction}`,
  );

  console.log(
    `CONVERGING: D=${converging.currentRatingGap} | relative slope=${converging.relativeSlopePer7Days} | ${converging.interaction}`,
  );
}

main();
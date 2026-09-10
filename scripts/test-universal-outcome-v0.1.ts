import assert from "node:assert/strict";

import {
  evaluateUniversalOutcomeV01,
  UNIVERSAL_OUTCOME_MODEL_VERSION_V01,
} from "../src/lib/predictions/universal-outcome-v0.1";

function main() {
  /*
   * Exact parity.
   */
  const level =
    evaluateUniversalOutcomeV01({
      home: {
        rating: 1700,
      },

      away: {
        rating: 1700,
      },
    });

  assert.equal(
    level.forecast,
    "draw",
  );

  assert.equal(
    level.ratingGap,
    0,
  );

  assert.equal(
    level.ratingBand,
    "micro_gap",
  );

  /*
   * User's experienced 1-4 draw band.
   */
  const microNegative =
    evaluateUniversalOutcomeV01({
      home: {
        rating: 1697,
      },

      away: {
        rating: 1700,
      },
    });

  assert.equal(
    microNegative.forecast,
    "draw",
  );

  assert.equal(
    microNegative.ratingGap,
    -3,
  );

  /*
   * 5-49 no longer means "no forecast".
   *
   * It forecasts toward the higher-rated side
   * while remaining low confidence.
   */
  const smallHome =
    evaluateUniversalOutcomeV01({
      home: {
        rating: 1750,
      },

      away: {
        rating: 1725,
      },
    });

  assert.equal(
    smallHome.forecast,
    "home",
  );

  assert.equal(
    smallHome.confidence,
    "low",
  );

  assert.equal(
    smallHome.ratingBand,
    "small_gap",
  );

  const smallAway =
    evaluateUniversalOutcomeV01({
      home: {
        rating: 1725,
      },

      away: {
        rating: 1750,
      },
    });

  assert.equal(
    smallAway.forecast,
    "away",
  );

  /*
   * 50-149 cautious directional band.
   */
  const cautious =
    evaluateUniversalOutcomeV01({
      home: {
        rating: 1800,
      },

      away: {
        rating: 1700,
      },
    });

  assert.equal(
    cautious.forecast,
    "home",
  );

  assert.equal(
    cautious.confidence,
    "medium",
  );

  /*
   * Today's Fenerbahçe vs Roma rating pair.
   *
   * D = 1702 - 1865 = -163.
   */
  const fenerRoma =
    evaluateUniversalOutcomeV01({
      home: {
        rating: 1702,
      },

      away: {
        rating: 1865,
      },
    });

  assert.equal(
    fenerRoma.ratingGap,
    -163,
  );

  assert.equal(
    fenerRoma.forecast,
    "away",
  );

  assert.equal(
    fenerRoma.confidence,
    "high",
  );

  /*
   * Today's PSV vs Shakhtar rating pair.
   *
   * D = 1832 - 1666 = +166.
   */
  const psvShakhtar =
    evaluateUniversalOutcomeV01({
      home: {
        rating: 1832,
      },

      away: {
        rating: 1666,
      },
    });

  assert.equal(
    psvShakhtar.ratingGap,
    166,
  );

  assert.equal(
    psvShakhtar.forecast,
    "home",
  );

  assert.equal(
    psvShakhtar.confidence,
    "high",
  );

  /*
   * Missing comparable rating pair with
   * empirical competition prior.
   */
  const competitionFallback =
    evaluateUniversalOutcomeV01({
      home: {
        rating: 1700,
      },

      away: {
        rating: null,
      },

      competitionPrior: {
        outcome:
          "draw",

        source:
          "test-competition-history",

        sampleSize:
          250,
      },
    });

  assert.equal(
    competitionFallback.forecast,
    "draw",
  );

  assert.equal(
    competitionFallback.basis,
    "competition_prior",
  );

  assert.equal(
    competitionFallback.evidenceGrade,
    "D",
  );

  /*
   * Almost zero information still returns
   * a forecast.
   */
  const genericFallback =
    evaluateUniversalOutcomeV01({
      home: {
        rating: null,
      },

      away: {
        rating: null,
      },
    });

  assert.equal(
    genericFallback.forecast,
    "home",
  );

  assert.equal(
    genericFallback.basis,
    "generic_home_prior",
  );

  assert.equal(
    genericFallback.evidenceGrade,
    "E",
  );

  assert.equal(
    genericFallback.confidence,
    "very_low",
  );

  /*
   * Universal model never fabricates
   * calibrated probabilities.
   */
  const outputs = [
    level,
    microNegative,
    smallHome,
    smallAway,
    cautious,
    fenerRoma,
    psvShakhtar,
    competitionFallback,
    genericFallback,
  ];

  for (
    const output
    of outputs
  ) {
    assert.equal(
      output.modelVersion,
      UNIVERSAL_OUTCOME_MODEL_VERSION_V01,
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
    `PASS: ${UNIVERSAL_OUTCOME_MODEL_VERSION_V01}`,
  );

  console.log(
    "PASS: every valid fixture input returns HOME, DRAW or AWAY.",
  );

  console.log(
    "PASS: 5-49 rating parity now produces a low-confidence directional forecast.",
  );

  console.log(
    "PASS: 1-4 micro-gap remains an experimental draw forecast.",
  );

  console.log(
    "PASS: 50-149 produces a medium-confidence higher-rated-team forecast.",
  );

  console.log(
    "PASS: 150+ produces a high-confidence higher-rated-team forecast.",
  );

  console.log(
    "PASS: missing rating pairs fall back to competition prior when supplied.",
  );

  console.log(
    "PASS: minimal-information fixtures still receive a very-low-confidence forecast.",
  );

  console.log(
    "PASS: recommendation remains separate from universal forecasting.",
  );

  console.log(
    "PASS: calibrated probabilities remain null.",
  );

  console.log("");

  console.log(
    `Fenerbahçe vs Roma: ${fenerRoma.forecast.toUpperCase()} | D=${fenerRoma.ratingGap} | confidence=${fenerRoma.confidence}`,
  );

  console.log(
    `PSV vs Shakhtar: ${psvShakhtar.forecast.toUpperCase()} | D=${psvShakhtar.ratingGap} | confidence=${psvShakhtar.confidence}`,
  );
}

main();
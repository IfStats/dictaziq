import assert from "node:assert/strict";

import {
  evaluateUniversalOutcomeLeagueV01,
  UNIVERSAL_OUTCOME_LEAGUE_MODEL_VERSION_V01,
} from "../src/lib/predictions/universal-outcome-league-v0.1";

function main() {
  /*
   * Egypt micro-gap.
   *
   * D = +2
   *
   * Universal:
   * DRAW
   *
   * League:
   * Draw support + Under 2.5 support.
   */
  const egypt =
    evaluateUniversalOutcomeLeagueV01({
      country:
        "Egypt",

      competitionName:
        "Premier League",

      home: {
        rating:
          1502,
      },

      away: {
        rating:
          1500,
      },
    });

  assert.equal(
    egypt.forecast,
    "draw",
  );

  assert.equal(
    egypt.ratingGap,
    2,
  );

  assert.equal(
    egypt.leagueAgreement,
    "reinforces",
  );

  assert.equal(
    egypt.leagueProfile,
    "egypt_micro_gap",
  );

  assert.equal(
    egypt.marketSignals.result,
    "draw_support",
  );

  assert.equal(
    egypt.marketSignals.goals,
    "under_2_5_support",
  );

  /*
   * We deliberately do not upgrade confidence
   * based only on an uncalibrated experienced
   * league prior.
   */
  assert.equal(
    egypt.confidence,
    "low",
  );

  /*
   * Slovenia swing league.
   *
   * D = +100
   *
   * Universal:
   * HOME / medium
   *
   * Composite:
   * HOME / low
   */
  const slovenia =
    evaluateUniversalOutcomeLeagueV01({
      country:
        "Slovenia",

      competitionName:
        "PrvaLiga",

      home: {
        rating:
          1700,
      },

      away: {
        rating:
          1600,
      },
    });

  assert.equal(
    slovenia.forecast,
    "home",
  );

  assert.equal(
    slovenia.components
      .universalOutcome
      .confidence,
    "medium",
  );

  assert.equal(
    slovenia.confidence,
    "low",
  );

  assert.equal(
    slovenia.leagueAgreement,
    "reduced_reliability",
  );

  assert.equal(
    slovenia.gapReliability,
    "reduced",
  );

  /*
   * Slovakia strong rating signal.
   *
   * D = -170
   *
   * Universal:
   * AWAY / high
   *
   * Composite:
   * AWAY / medium
   *
   * Swing status does NOT reverse the pick.
   */
  const slovakia =
    evaluateUniversalOutcomeLeagueV01({
      country:
        "Slovakia",

      competitionName:
        "Super Liga",

      home: {
        rating:
          1600,
      },

      away: {
        rating:
          1770,
      },
    });

  assert.equal(
    slovakia.forecast,
    "away",
  );

  assert.equal(
    slovakia.components
      .universalOutcome
      .confidence,
    "high",
  );

  assert.equal(
    slovakia.confidence,
    "medium",
  );

  /*
   * England remains neutral.
   */
  const england =
    evaluateUniversalOutcomeLeagueV01({
      country:
        "England",

      competitionName:
        "Premier League",

      home: {
        rating:
          1820,
      },

      away: {
        rating:
          1800,
      },
    });

  assert.equal(
    england.forecast,
    "home",
  );

  assert.equal(
    england.confidence,
    "low",
  );

  assert.equal(
    england.leagueAgreement,
    "neutral",
  );

  assert.equal(
    england.leagueProfile,
    "neutral",
  );

  /*
   * Today's Fenerbahçe vs Roma.
   *
   * UEFA competition is not currently given a
   * special league behaviour prior.
   *
   * D = -163
   */
  const fenerRoma =
    evaluateUniversalOutcomeLeagueV01({
      country:
        "World",

      competitionName:
        "UEFA Champions League",

      home: {
        rating:
          1702,
      },

      away: {
        rating:
          1865,
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

  assert.equal(
    fenerRoma.leagueAgreement,
    "neutral",
  );

  /*
   * Today's PSV vs Shakhtar.
   *
   * D = +166
   */
  const psvShakhtar =
    evaluateUniversalOutcomeLeagueV01({
      country:
        "World",

      competitionName:
        "UEFA Champions League",

      home: {
        rating:
          1832,
      },

      away: {
        rating:
          1666,
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
   * Missing ratings still produce a forecast
   * through Universal Outcome fallback.
   */
  const minimal =
    evaluateUniversalOutcomeLeagueV01({
      country:
        null,

      competitionName:
        null,

      home: {
        rating:
          null,
      },

      away: {
        rating:
          null,
      },
    });

  assert.equal(
    minimal.forecast,
    "home",
  );

  assert.equal(
    minimal.confidence,
    "very_low",
  );

  assert.equal(
    minimal.evidenceGrade,
    "E",
  );

  /*
   * No component in this composite is allowed
   * to fabricate calibrated probabilities or
   * qualified betting recommendations.
   */
  const outputs = [
    egypt,
    slovenia,
    slovakia,
    england,
    fenerRoma,
    psvShakhtar,
    minimal,
  ];

  for (
    const output
    of outputs
  ) {
    assert.equal(
      output.modelVersion,
      UNIVERSAL_OUTCOME_LEAGUE_MODEL_VERSION_V01,
    );

    assert.equal(
      output.calibratedProbability,
      null,
    );

    assert.equal(
      output.recommendationStatus,
      "not_evaluated",
    );

    assert.equal(
      output.components
        .universalOutcome
        .calibratedProbability,
      null,
    );

    assert.equal(
      output.components
        .leagueBehaviour
        .calibratedProbability,
      null,
    );
  }

  console.log(
    `PASS: ${UNIVERSAL_OUTCOME_LEAGUE_MODEL_VERSION_V01}`,
  );

  console.log(
    "PASS: universal forecast remains available for every fixture.",
  );

  console.log(
    "PASS: Egypt 1-4 micro-gap reinforces Draw interpretation.",
  );

  console.log(
    "PASS: Egypt micro-gap surfaces Under 2.5 support without qualifying a bet.",
  );

  console.log(
    "PASS: uncalibrated Egypt prior does not artificially increase confidence.",
  );

  console.log(
    "PASS: Slovenia swing behaviour downgrades rating confidence.",
  );

  console.log(
    "PASS: Slovakia swing behaviour downgrades rating confidence.",
  );

  console.log(
    "PASS: swing classification never automatically reverses the forecast.",
  );

  console.log(
    "PASS: neutral leagues preserve the universal forecast.",
  );

  console.log(
    "PASS: calibrated probabilities remain null.",
  );

  console.log(
    "PASS: recommendation remains independent.",
  );

  console.log("");

  console.log(
    `Egypt D=${egypt.ratingGap}: ${egypt.forecast.toUpperCase()} | league=${egypt.leagueAgreement} | goals=${egypt.marketSignals.goals}`,
  );

  console.log(
    `Slovenia D=${slovenia.ratingGap}: ${slovenia.forecast.toUpperCase()} | universal=${slovenia.components.universalOutcome.confidence} | adjusted=${slovenia.confidence}`,
  );

  console.log(
    `Fenerbahçe vs Roma: ${fenerRoma.forecast.toUpperCase()} | D=${fenerRoma.ratingGap} | confidence=${fenerRoma.confidence}`,
  );

  console.log(
    `PSV vs Shakhtar: ${psvShakhtar.forecast.toUpperCase()} | D=${psvShakhtar.ratingGap} | confidence=${psvShakhtar.confidence}`,
  );
}

main();
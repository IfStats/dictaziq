import assert from "node:assert/strict";

import {
  explainUnifiedForecastV01,
  projectUnifiedForecastForExplanationV01,
  UNIFIED_FORECAST_EXPLAINER_ADAPTER_VERSION_V01,
} from "../src/lib/predictions/unified-forecast-explainer-adapter-v0.1";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

function realStyleUnifiedOutput() {
  return {
    modelVersion:
      UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,

    validationStatus:
      "valid",

    forecast:
      "away",

    confidence:
      "high",

    evidenceGrade:
      "C",

    /*
     * Proprietary/internal mathematical fields.
     * These must never cross the adapter.
     */
    ratingGap:
      -163,

    absoluteRatingGap:
      163,

    matchProfile:
      "dominant_advantage",

    scoringArchetype:
      "insufficient",

    coverage:
      "result_only",

    /*
     * THIS is the real Unified v0.1 structure.
     */
    marketEvidence: {
      goals: {
        signal:
          "none",

        agreement:
          "none",

        leagueSignal:
          "none",

        scoringSignal:
          "none",
      },

      btts: {
        signal:
          "none",

        agreement:
          "none",

        scoringSignal:
          "none",
      },
    },

    components: {
      privateRatingAnalysis: {
        homeRating:
          1702,

        awayRating:
          1865,

        ratingDifference:
          -163,
      },
    },

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason:
      "internal-model-reason",

    publicationStatus:
      "draft",

    generatedFrom: {
      inputSha256:
        "internal-only",

      modelSha256:
        "internal-only",
    },
  };
}

const projection =
  projectUnifiedForecastForExplanationV01({
    homeTeamName:
      "Fenerbahçe",

    awayTeamName:
      "AS Roma",

    unifiedOutput:
      realStyleUnifiedOutput(),
  });

assert.deepEqual(
  projection,
  {
    homeTeamName:
      "Fenerbahçe",

    awayTeamName:
      "AS Roma",

    forecast:
      "away",

    confidence:
      "high",

    matchProfile:
      "dominant_advantage",

    coverage:
      "result_only",

    scoringArchetype:
      "insufficient",

    goalsSignal:
      "none",

    bttsSignal:
      "none",
  },
);

console.log(
  "PASS: real Unified v0.1 marketEvidence structure is projected correctly.",
);

/*
 * Proprietary-boundary verification.
 */
const serializedProjection =
  JSON.stringify(
    projection,
  );

for (
  const forbidden
  of [
    "ratingGap",
    "absoluteRatingGap",
    "homeRating",
    "awayRating",
    "ratingDifference",
    "inputSha256",
    "modelSha256",
    "1702",
    "1865",
    "-163",
  ]
) {
  assert.equal(
    serializedProjection.includes(
      forbidden,
    ),
    false,
    `Public projection leaked forbidden value: ${forbidden}`,
  );
}

console.log(
  "PASS: proprietary model mechanics do not cross the public projection boundary.",
);

const result =
  explainUnifiedForecastV01({
    homeTeamName:
      "Fenerbahçe",

    awayTeamName:
      "AS Roma",

    unifiedOutput:
      realStyleUnifiedOutput(),
  });

assert.equal(
  result.adapterVersion,
  UNIFIED_FORECAST_EXPLAINER_ADAPTER_VERSION_V01,
);

assert.equal(
  result.sourceModelVersion,
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
);

assert.equal(
  result.explanation.forecast,
  "away",
);

assert.equal(
  result.explanation.forecastLabel,
  "AS Roma",
);

assert.equal(
  result.explanation.confidence,
  "high",
);

assert.equal(
  result.explanation.profile,
  "dominant_advantage",
);

assert.match(
  result.explanation.summary,
  /AS Roma/i,
);

assert.match(
  result.explanation.summary,
  /dominant advantage/i,
);

assert.match(
  result.explanation.evidenceNote,
  /scoring evidence was insufficient/i,
);

assert.equal(
  result.explanation.marketContext.length,
  0,
);

assert.equal(
  result.explanation.calibratedProbability,
  null,
);

console.log(
  "PASS: Fenerbahçe vs AS Roma receives the expected public explanation.",
);

/*
 * PSV real-style case.
 */
const psvResult =
  explainUnifiedForecastV01({
    homeTeamName:
      "PSV Eindhoven",

    awayTeamName:
      "Shakhtar Donetsk",

    unifiedOutput: {
      ...realStyleUnifiedOutput(),

      forecast:
        "home",

      ratingGap:
        166,

      absoluteRatingGap:
        166,

      components: {
        privateRatingAnalysis: {
          homeRating:
            1832,

          awayRating:
            1666,

          ratingDifference:
            166,
        },
      },
    },
  });

assert.equal(
  psvResult.explanation.forecast,
  "home",
);

assert.equal(
  psvResult.explanation.forecastLabel,
  "PSV Eindhoven",
);

assert.equal(
  psvResult.explanation.profile,
  "dominant_advantage",
);

assert.match(
  psvResult.explanation.summary,
  /PSV Eindhoven/i,
);

console.log(
  "PASS: PSV Eindhoven vs Shakhtar receives the expected public explanation.",
);

/*
 * Full scoring evidence.
 */
const openParity =
  explainUnifiedForecastV01({
    homeTeamName:
      "Home FC",

    awayTeamName:
      "Away FC",

    unifiedOutput: {
      ...realStyleUnifiedOutput(),

      forecast:
        "home",

      confidence:
        "medium",

      matchProfile:
        "directional_parity",

      scoringArchetype:
        "open_parity",

      coverage:
        "full",

      marketEvidence: {
        goals: {
          signal:
            "over_2_5_support",

          agreement:
            "single_source",

          leagueSignal:
            "none",

          scoringSignal:
            "over_2_5_support",
        },

        btts: {
          signal:
            "yes_support",

          agreement:
            "single_source",

          scoringSignal:
            "yes_support",
        },
      },
    },
  });

assert.equal(
  openParity.explanation.marketContext.length,
  2,
);

assert.match(
  openParity.explanation.marketContext[0],
  /higher-scoring/i,
);

assert.match(
  openParity.explanation.marketContext[1],
  /both teams/i,
);

console.log(
  "PASS: full scoring evidence is translated into public match context.",
);

/*
 * Goals conflict must remain conflict.
 */
const goalsConflict =
  explainUnifiedForecastV01({
    homeTeamName:
      "Home FC",

    awayTeamName:
      "Away FC",

    unifiedOutput: {
      ...realStyleUnifiedOutput(),

      forecast:
        "draw",

      confidence:
        "low",

      matchProfile:
        "true_parity",

      scoringArchetype:
        "open_parity",

      coverage:
        "full",

      marketEvidence: {
        goals: {
          signal:
            "conflict",

          agreement:
            "conflict",

          leagueSignal:
            "under_2_5_support",

          scoringSignal:
            "over_2_5_support",
        },

        btts: {
          signal:
            "yes_support",

          agreement:
            "single_source",

          scoringSignal:
            "yes_support",
        },
      },
    },
  });

assert.match(
  goalsConflict.explanation.marketContext[0],
  /conflict/i,
);

console.log(
  "PASS: Unified goals conflict is preserved in the public explanation.",
);

/*
 * Wrong model version.
 */
assert.throws(
  () =>
    explainUnifiedForecastV01({
      homeTeamName:
        "Home FC",

      awayTeamName:
        "Away FC",

      unifiedOutput: {
        ...realStyleUnifiedOutput(),

        modelVersion:
          "dictaziq-other-model-v9",
      },
    }),
  /Expected dictaziq-unified-match-analysis-v0\.1/i,
);

console.log(
  "PASS: foreign model versions are rejected.",
);

/*
 * Fabricated calibrated probabilities fail.
 */
assert.throws(
  () =>
    explainUnifiedForecastV01({
      homeTeamName:
        "Home FC",

      awayTeamName:
        "Away FC",

      unifiedOutput: {
        ...realStyleUnifiedOutput(),

        calibratedProbability:
          0.82,
      },
    }),
  /cannot expose a calibrated probability/i,
);

console.log(
  "PASS: fabricated calibrated probabilities are rejected.",
);

/*
 * Recommendation contamination fails.
 */
assert.throws(
  () =>
    explainUnifiedForecastV01({
      homeTeamName:
        "Home FC",

      awayTeamName:
        "Away FC",

      unifiedOutput: {
        ...realStyleUnifiedOutput(),

        recommendationStatus:
          "recommended",
      },
    }),
  /recommendation status must be not_evaluated/i,
);

console.log(
  "PASS: recommendation logic cannot contaminate the forecast explainer.",
);

/*
 * Missing market evidence must fail closed.
 */
assert.throws(
  () => {
    const value =
      realStyleUnifiedOutput();

    const {
      marketEvidence:
        _removed,
      ...withoutMarketEvidence
    } = value;

    explainUnifiedForecastV01({
      homeTeamName:
        "Home FC",

      awayTeamName:
        "Away FC",

      unifiedOutput:
        withoutMarketEvidence,
    });
  },
  /Unified market evidence must be a JSON object/i,
);

console.log(
  "PASS: missing Unified market-evidence structure fails closed.",
);

/*
 * Unknown signal must fail closed.
 */
assert.throws(
  () =>
    explainUnifiedForecastV01({
      homeTeamName:
        "Home FC",

      awayTeamName:
        "Away FC",

      unifiedOutput: {
        ...realStyleUnifiedOutput(),

        marketEvidence: {
          goals: {
            signal:
              "mystery_signal",
          },

          btts: {
            signal:
              "none",
          },
        },
      },
    }),
  /Unsupported Unified goals signal/i,
);

console.log(
  "PASS: unknown Unified classifications fail closed.",
);

const publicSerialized =
  JSON.stringify(
    result,
  );

for (
  const forbidden
  of [
    "ratingGap",
    "absoluteRatingGap",
    "homeRating",
    "awayRating",
    "ratingDifference",
    "inputSha256",
    "modelSha256",
    "1702",
    "1865",
    "-163",
  ]
) {
  assert.equal(
    publicSerialized.includes(
      forbidden,
    ),
    false,
    `Completed explanation leaked forbidden value: ${forbidden}`,
  );
}

console.log(
  "PASS: completed explanation contains no proprietary rating mechanics.",
);

console.log("");
console.log(
  `PASS: ${UNIFIED_FORECAST_EXPLAINER_ADAPTER_VERSION_V01}`,
);
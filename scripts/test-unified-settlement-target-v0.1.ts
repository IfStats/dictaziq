import assert from "node:assert/strict";

import {
  extractUnifiedSettlementTargetV01,
  UNIFIED_SETTLEMENT_TARGET_VERSION_V01,
} from "../src/lib/predictions/unified-settlement-target-v0.1";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

function output(
  forecast:
    "home" |
    "draw" |
    "away",
) {
  return {
    modelVersion:
      UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,

    forecast,

    confidence:
      "high",

    matchProfile:
      "dominant_advantage",

    calibratedProbability:
      null,

    recommendationStatus:
      "not_evaluated",

    publicationStatus:
      "draft",

    /*
     * Internal fields are deliberately irrelevant
     * to settlement-target extraction.
     */
    ratingGap:
      166,

    marketEvidence: {
      goals: {
        signal:
          "none",
      },

      btts: {
        signal:
          "none",
      },
    },
  };
}

assert.deepEqual(
  extractUnifiedSettlementTargetV01(
    output(
      "home",
    ),
  ),
  {
    market:
      "1x2",

    selection:
      "home",
  },
);

console.log(
  "PASS: HOME Unified forecast becomes a 1X2 settlement target.",
);

assert.deepEqual(
  extractUnifiedSettlementTargetV01(
    output(
      "draw",
    ),
  ),
  {
    market:
      "1x2",

    selection:
      "draw",
  },
);

console.log(
  "PASS: DRAW Unified forecast becomes a 1X2 settlement target.",
);

assert.deepEqual(
  extractUnifiedSettlementTargetV01(
    output(
      "away",
    ),
  ),
  {
    market:
      "1x2",

    selection:
      "away",
  },
);

console.log(
  "PASS: AWAY Unified forecast becomes a 1X2 settlement target.",
);

assert.throws(
  () =>
    extractUnifiedSettlementTargetV01({
      ...output(
        "home",
      ),

      modelVersion:
        "dictaziq-unknown-v9",
    }),
  /Expected dictaziq-unified-match-analysis-v0\.1/i,
);

console.log(
  "PASS: foreign model versions are rejected.",
);

assert.throws(
  () =>
    extractUnifiedSettlementTargetV01({
      ...output(
        "home",
      ),

      forecast:
        "mystery",
    }),
  /Unsupported Unified forecast/i,
);

console.log(
  "PASS: unknown forecast states are rejected.",
);

assert.throws(
  () =>
    extractUnifiedSettlementTargetV01({
      ...output(
        "home",
      ),

      calibratedProbability:
        0.81,
    }),
  /cannot contain a calibrated probability/i,
);

console.log(
  "PASS: fabricated calibrated probability is rejected.",
);

assert.throws(
  () =>
    extractUnifiedSettlementTargetV01({
      ...output(
        "home",
      ),

      recommendationStatus:
        "recommended",
    }),
  /recommendation status must remain not_evaluated/i,
);

console.log(
  "PASS: recommendation state cannot contaminate forecast settlement.",
);

assert.throws(
  () =>
    extractUnifiedSettlementTargetV01({
      ...output(
        "home",
      ),

      publicationStatus:
        "published",
    }),
  /publicationStatus must remain draft/i,
);

console.log(
  "PASS: immutable generation-time publication state is enforced.",
);

console.log("");
console.log(
  `PASS: ${UNIFIED_SETTLEMENT_TARGET_VERSION_V01}`,
);
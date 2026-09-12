import assert from "node:assert/strict";

import {
  RESEARCH_FUSION_VERSION_V01,
  fuseResearchPredictionsV01,
} from "../src/lib/ai/research-fusion-v0.1";

import type {
  GptResearchPredictionOutputV02,
} from "../src/lib/ai/gpt-research-prediction-v0.2";

function prediction(
  selection:
    GptResearchPredictionOutputV02["selection"],

  confidence:
    GptResearchPredictionOutputV02["confidence"],

  evidenceGrade:
    GptResearchPredictionOutputV02["evidenceGrade"],
): GptResearchPredictionOutputV02 {
  return {
    version:
      "dictaziq-gpt-research-prediction-v0.2",

    selection,

    confidence,

    evidenceGrade,

    goalsView:
      "neutral",

    bttsView:
      "neutral",

    materialFactors: [
      "test factor",
    ],

    reasoningSummary: [
      "test conclusion",
    ],

    contradictions: [],

    missingInformation: [],

    probability:
      null,

    modelOverride:
      false,
  };
}

const unanimous =
  fuseResearchPredictionsV01({
    mathematical: {
      selection:
        "away",

      strength:
        "strong",

      provenance:
        "rating-gap-v0.2",
    },

    openai:
      prediction(
        "away",
        "high",
        "A",
      ),

    deepseek:
      prediction(
        "away",
        "medium",
        "B",
      ),
  });

assert.equal(
  unanimous.version,
  RESEARCH_FUSION_VERSION_V01,
);

assert.equal(
  unanimous.selection,
  "away",
);

assert.equal(
  unanimous.confidence,
  "high",
);

assert.equal(
  unanimous.probability,
  null,
);

assert.deepEqual(
  unanimous.support,
  {
    mathematical:
      true,

    openai:
      true,

    deepseek:
      true,
  },
);

console.log(
  "PASS: three-source agreement produces a fused selection.",
);

const llmConsensus =
  fuseResearchPredictionsV01({
    mathematical: {
      selection:
        "no_pick",

      strength:
        "none",

      provenance:
        "rating-gap-v0.2",
    },

    openai:
      prediction(
        "home",
        "medium",
        "B",
      ),

    deepseek:
      prediction(
        "home",
        "low",
        "C",
      ),
  });

assert.equal(
  llmConsensus.selection,
  "home",
);

assert.equal(
  llmConsensus.support.openai,
  true,
);

assert.equal(
  llmConsensus.support.deepseek,
  true,
);

console.log(
  "PASS: independent OpenAI and DeepSeek agreement can resolve mathematical no_pick.",
);

const llmOverride =
  fuseResearchPredictionsV01({
    mathematical: {
      selection:
        "home",

      strength:
        "strong",

      provenance:
        "rating-gap-v0.2",
    },

    openai:
      prediction(
        "away",
        "high",
        "A",
      ),

    deepseek:
      prediction(
        "away",
        "high",
        "B",
      ),
  });

assert.equal(
  llmOverride.selection,
  "away",
);

assert.equal(
  llmOverride.support.mathematical,
  false,
);

assert.equal(
  llmOverride.support.openai,
  true,
);

assert.equal(
  llmOverride.support.deepseek,
  true,
);

console.log(
  "PASS: two strong independent research signals can defeat a conflicting mathematical signal.",
);

const unresolvedConflict =
  fuseResearchPredictionsV01({
    mathematical: {
      selection:
        "home",

      strength:
        "strong",

      provenance:
        "rating-gap-v0.2",
    },

    openai:
      prediction(
        "away",
        "high",
        "A",
      ),

    deepseek:
      null,
  });

assert.equal(
  unresolvedConflict.selection,
  "no_pick",
);

console.log(
  "PASS: unresolved one-versus-one conflict remains no_pick.",
);

const weakEvidence =
  fuseResearchPredictionsV01({
    mathematical: {
      selection:
        "no_pick",

      strength:
        "none",

      provenance:
        "rating-gap-v0.2",
    },

    openai:
      prediction(
        "draw",
        "very_low",
        "E",
      ),

    deepseek:
      prediction(
        "draw",
        "very_low",
        "E",
      ),
  });

assert.equal(
  weakEvidence.selection,
  "no_pick",
);

assert.equal(
  weakEvidence.confidence,
  "very_low",
);

console.log(
  "PASS: agreement without credible evidence remains no_pick.",
);

assert.throws(
  () =>
    fuseResearchPredictionsV01({
      mathematical: {
        selection:
          "no_pick",

        strength:
          "strong",

        provenance:
          "rating-gap-v0.2",
      },

      openai:
        null,

      deepseek:
        null,
    }),
  /no_pick must have strength none/,
);

console.log(
  "PASS: invalid mathematical fusion signal rejected.",
);

console.log("");
console.log(
  `PASS: ${RESEARCH_FUSION_VERSION_V01}`,
);

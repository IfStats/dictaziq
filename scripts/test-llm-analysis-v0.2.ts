import assert from "node:assert/strict";

import {
  LLM_ANALYSIS_VERSION_V02,
  buildLlmAnalysisPromptV02,
  validateLlmAnalysisInputV02,
  validateLlmAnalysisOutputV02,
  type LlmAnalysisInputV02,
} from "../src/lib/ai/llm-analysis-v0.2";

const input:
  LlmAnalysisInputV02 = {
    fixture: {
      fixtureId:
        "fixture-test-001",

      homeTeam:
        "Alpha FC",

      awayTeam:
        "Beta FC",

      competition:
        "Test Competition",

      kickoffAt:
        "2026-09-10T18:00:00.000Z",
    },

    evidence: {
      cutoffAt:
        "2026-09-10T16:30:00.000Z",

      facts: [
        {
          kind:
            "recent_form",

          side:
            "away",

          description:
            "Verified recent-match evidence indicates stronger recent results for the away side.",

          source:
            "verified-test-source",

          observedAt:
            "2026-09-10T15:00:00.000Z",
        },

        {
          kind:
            "squad_availability",

          side:
            "neutral",

          description:
            "No material verified squad disadvantage is present in the supplied evidence.",

          source:
            "verified-test-source",

          observedAt:
            "2026-09-10T16:00:00.000Z",
        },
      ],
    },
  };

const validatedInput =
  validateLlmAnalysisInputV02(
    input,
  );

assert.equal(
  validatedInput
    .fixture
    .homeTeam,
  "Alpha FC",
);

assert.equal(
  validatedInput
    .evidence
    .facts
    .length,
  2,
);

console.log(
  "PASS: valid pre-match LLM v0.2 input accepted.",
);

const directional =
  validateLlmAnalysisOutputV02({
    version:
      LLM_ANALYSIS_VERSION_V02,

    assessment:
      "away",

    confidence:
      "medium",

    resultSignalStrength:
      "moderate",

    goalsView:
      "neutral",

    bttsView:
      "neutral",

    evidenceQuality:
      "moderate",

    reasoningSummary: [
      "The supplied verified evidence provides a moderate directional case toward the away side.",
    ],

    contradictions: [],

    missingInformation: [
      "Confirmed starting lineups are not present in the supplied evidence.",
    ],

    modelOverride:
      false,

    probability:
      null,
  });

assert.equal(
  directional.assessment,
  "away",
);

assert.equal(
  directional.probability,
  null,
);

console.log(
  "PASS: independent directional assessment accepted.",
);

/*
 * Unlike LLM v0.1 there is deliberately no
 * deterministic forecast comparison here.
 */
const prompt =
  buildLlmAnalysisPromptV02(
    input,
  );

assert.match(
  prompt.system,
  /independent/i,
);

assert.match(
  prompt.system,
  /mathematical forecast is deliberately NOT supplied/i,
);

assert.doesNotMatch(
  prompt.user,
  /deterministicSelection/i,
);

assert.doesNotMatch(
  prompt.user,
  /finalSelection/i,
);

console.log(
  "PASS: GPT prompt is independent of the mathematical selection.",
);

assert.throws(
  () =>
    validateLlmAnalysisOutputV02({
      ...directional,

      probability:
        0.76,
    }),
  /cannot fabricate a probability/,
);

console.log(
  "PASS: fabricated probability rejected.",
);

assert.throws(
  () =>
    validateLlmAnalysisOutputV02({
      ...directional,

      modelOverride:
        true,
    }),
  /modelOverride must remain false/,
);

console.log(
  "PASS: direct mathematical model override rejected.",
);

assert.throws(
  () =>
    validateLlmAnalysisOutputV02({
      ...directional,

      assessment:
        "no_pick",

      confidence:
        "medium",

      resultSignalStrength:
        "moderate",
    }),
  /no_pick must use resultSignalStrength=none/,
);

console.log(
  "PASS: inconsistent no_pick state rejected.",
);

const noPick =
  validateLlmAnalysisOutputV02({
    version:
      LLM_ANALYSIS_VERSION_V02,

    assessment:
      "no_pick",

    confidence:
      "insufficient",

    resultSignalStrength:
      "none",

    goalsView:
      "neutral",

    bttsView:
      "neutral",

    evidenceQuality:
      "insufficient",

    reasoningSummary: [
      "The available evidence is insufficient for a defensible directional result assessment.",
    ],

    contradictions: [],

    missingInformation: [
      "Additional verified pre-match evidence is required.",
    ],

    modelOverride:
      false,

    probability:
      null,
  });

assert.equal(
  noPick.assessment,
  "no_pick",
);

console.log(
  "PASS: legitimate independent no_pick accepted.",
);

/*
 * Post-cutoff evidence must never enter GPT.
 */
const postCutoffInput:
  LlmAnalysisInputV02 = {
    ...input,

    evidence: {
      ...input.evidence,

      facts: [
        {
          kind:
            "illegal_future_fact",

          side:
            "home",

          description:
            "This evidence was observed after the permitted cutoff.",

          source:
            "test-source",

          observedAt:
            "2026-09-10T17:00:00.000Z",
        },
      ],
    },
  };

assert.throws(
  () =>
    validateLlmAnalysisInputV02(
      postCutoffInput,
    ),
  /after the LLM evidence cutoff/,
);

console.log(
  "PASS: post-cutoff evidence rejected.",
);

const postKickoffCutoff:
  LlmAnalysisInputV02 = {
    ...input,

    evidence: {
      cutoffAt:
        "2026-09-10T18:01:00.000Z",

      facts: [],
    },
  };

assert.throws(
  () =>
    validateLlmAnalysisInputV02(
      postKickoffCutoff,
    ),
  /cutoff must occur before kickoff/,
);

console.log(
  "PASS: post-kickoff LLM cutoff rejected.",
);

assert.throws(
  () =>
    validateLlmAnalysisOutputV02({
      ...directional,

      reasoningSummary: [],
    }),
  /between 1 and 8 items/,
);

console.log(
  "PASS: empty GPT reasoning summary rejected.",
);

console.log("");
console.log(
  `PASS: ${LLM_ANALYSIS_VERSION_V02}`,
);

console.log(
  "PASS: GPT may disagree with the mathematical engine without modifying it.",
);
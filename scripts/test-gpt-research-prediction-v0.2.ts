import assert from "node:assert/strict";

import {
  GPT_RESEARCH_PREDICTION_VERSION_V02,
  buildGptResearchPromptV02,
  validateGptResearchInputV02,
  validateGptResearchOutputV02,
  type GptResearchPredictionInputV02,
} from "../src/lib/ai/gpt-research-prediction-v0.2";

const input:
  GptResearchPredictionInputV02 = {
    purpose:
      "fallback",

    fixture: {
      fixtureId:
        "fixture-research-test",

      homeTeam:
        "Alpha FC",

      awayTeam:
        "Beta FC",

      competition:
        "Test League",

      country:
        "Test Country",

      kickoffAt:
        "2026-09-11T18:00:00.000Z",
    },

    evidence: {
      cutoffAt:
        "2026-09-11T15:00:00.000Z",

      structuredFacts: [
        {
          kind:
            "recent_form",

          side:
            "home",

          description:
            "Verified recent evidence shows stronger home-side results.",

          source:
            "dictaziq-test",

          observedAt:
            "2026-09-11T14:00:00.000Z",
        },
      ],
    },
  };

const validatedInput =
  validateGptResearchInputV02(
    input,
  );

assert.equal(
  validatedInput.purpose,
  "fallback",
);

console.log(
  "PASS: GPT research input accepted.",
);

const prediction =
  validateGptResearchOutputV02({
    version:
      GPT_RESEARCH_PREDICTION_VERSION_V02,

    selection:
      "away",

    confidence:
      "low",

    evidenceGrade:
      "D",

    goalsView:
      "neutral",

    bttsView:
      "neutral",

    materialFactors: [
      "Available evidence produces a slight directional advantage toward the away side.",
    ],

    reasoningSummary: [
      "The evidence remains limited, so the forecast carries low confidence.",
    ],

    contradictions: [],

    missingInformation: [
      "Confirmed starting lineups are unavailable.",
    ],

    probability:
      null,

    modelOverride:
      false,
  });

assert.equal(
  prediction.selection,
  "away",
);

console.log(
  "PASS: directional GPT prediction accepted.",
);

/*
 * There is deliberately no no_pick state.
 */
assert.throws(
  () =>
    validateGptResearchOutputV02({
      ...prediction,

      selection:
        "no_pick",
    }),
  /must produce HOME, DRAW or AWAY/,
);

console.log(
  "PASS: GPT abstention rejected.",
);

assert.throws(
  () =>
    validateGptResearchOutputV02({
      ...prediction,

      probability:
        0.71,
    }),
  /cannot fabricate a probability/,
);

console.log(
  "PASS: fabricated GPT probability rejected.",
);

assert.throws(
  () =>
    validateGptResearchOutputV02({
      ...prediction,

      modelOverride:
        true,
    }),
  /modelOverride must remain false/,
);

console.log(
  "PASS: direct model override rejected.",
);

const prompt =
  buildGptResearchPromptV02(
    input,
  );

assert.match(
  prompt.system,
  /MUST choose exactly one 1X2 result/,
);

assert.match(
  prompt.system,
  /There is no no_pick option/,
);

assert.match(
  prompt.system,
  /Actively search the web/,
);

assert.match(
  prompt.system,
  /confirmed starting lineups/i,
);

assert.doesNotMatch(
  prompt.user,
  /mathematicalSelection/,
);

assert.doesNotMatch(
  prompt.user,
  /ratingGap/,
);

console.log(
  "PASS: GPT research prompt requires active independent prediction.",
);

const lateEvidence:
  GptResearchPredictionInputV02 = {
    ...input,

    evidence: {
      cutoffAt:
        "2026-09-11T15:00:00.000Z",

      structuredFacts: [
        {
          ...input
            .evidence
            .structuredFacts[0],

          observedAt:
            "2026-09-11T16:00:00.000Z",
        },
      ],
    },
  };

assert.throws(
  () =>
    validateGptResearchInputV02(
      lateEvidence,
    ),
  /after the research cutoff/,
);

console.log(
  "PASS: post-cutoff structured evidence rejected.",
);

const postKickoff:
  GptResearchPredictionInputV02 = {
    ...input,

    evidence: {
      cutoffAt:
        "2026-09-11T18:01:00.000Z",

      structuredFacts: [],
    },
  };

assert.throws(
  () =>
    validateGptResearchInputV02(
      postKickoff,
    ),
  /cutoff must be before kickoff/,
);

console.log(
  "PASS: post-kickoff research cutoff rejected.",
);

console.log("");

console.log(
  `PASS: ${GPT_RESEARCH_PREDICTION_VERSION_V02}`,
);

console.log(
  "PASS: every GPT research fixture receives HOME, DRAW or AWAY.",
);

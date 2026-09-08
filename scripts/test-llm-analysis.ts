import assert from "node:assert/strict";

import {
  LLM_ANALYSIS_VERSION,
  buildLlmAnalysisPrompt,
  validateLlmAnalysisOutput,
  type LlmAnalysisInput,
} from "../src/lib/ai/llm-analysis";

const contextualInput:
  LlmAnalysisInput = {
    fixture: {
      homeTeam:
        "Northbridge FC (Demo)",

      awayTeam:
        "Riverside Athletic (Demo)",
    },

    prediction: {
      predictionId:
        "fa571d9b-e5d6-4bce-a75c-c050a4ccde6b",

      modelVersion:
        "dictaziq-prematch-v0.1",

      route:
        "rating_gap_plus_context",

      ratingGap: 25,

      ratingSignal:
        "context_required",

      contextDecision:
        "home_lean",

      finalSelection:
        "home",

      over25Signal: false,

      calibratedProbability: null,
    },

    evidence: {
  contextFactorCount: 4,
  homeSupport: 3,
  awaySupport: 0,
  neutralFactors: 1,

  contextFactors: [
    {
      kind:
        "recent_form",

      side:
        "home",

      description:
        "Synthetic verified recent-form evidence favours the home side.",

      source:
        "verified-demo-source",

      observedAt:
        "2026-09-08T12:00:00.000Z",
    },

    {
      kind:
        "home_away_form",

      side:
        "home",

      description:
        "Synthetic verified venue-form evidence favours the home side.",

      source:
        "verified-demo-source",

      observedAt:
        "2026-09-08T12:00:00.000Z",
    },

    {
      kind:
        "squad_availability",

      side:
        "home",

      description:
        "Synthetic verified squad-availability evidence favours the home side.",

      source:
        "verified-demo-source",

      observedAt:
        "2026-09-08T12:00:00.000Z",
    },

    {
      kind:
        "rest_schedule",

      side:
        "neutral",

      description:
        "Synthetic verified rest-schedule evidence is neutral.",

      source:
        "verified-demo-source",

      observedAt:
        "2026-09-08T12:00:00.000Z",
    },
  ],
},
  };

const valid =
  validateLlmAnalysisOutput(
    contextualInput,
    {
      version:
        LLM_ANALYSIS_VERSION,

      assessment: "home",

      confidenceLabel:
        "contextual",

      explanation: [
        "The 25-point rating difference falls inside the context-required band.",
        "Three verified contextual factors favour the home side.",
        "One contextual factor is neutral and none favour the away side.",
      ],

      contradictions: [],

      missingInformation: [],

      modelOverride: false,

      probability: null,
    },
  );

assert.equal(
  valid.assessment,
  "home",
);

assert.equal(
  valid.confidenceLabel,
  "contextual",
);

assert.equal(
  valid.modelOverride,
  false,
);

assert.equal(
  valid.probability,
  null,
);

/*
 * LLM cannot override home → away.
 */
assert.throws(
  () =>
    validateLlmAnalysisOutput(
      contextualInput,
      {
        ...valid,
        assessment: "away",
      },
    ),
  /override deterministic selection/,
);

/*
 * LLM cannot invent probability.
 */
assert.throws(
  () =>
    validateLlmAnalysisOutput(
      contextualInput,
      {
        ...valid,
        probability: 0.78,
      },
    ),
  /cannot create a probability/,
);

/*
 * Explicit override forbidden.
 */
assert.throws(
  () =>
    validateLlmAnalysisOutput(
      contextualInput,
      {
        ...valid,
        modelOverride: true,
      },
    ),
  /modelOverride must remain false/,
);

/*
 * Contextual route must remain labelled
 * contextual.
 */
assert.throws(
  () =>
    validateLlmAnalysisOutput(
      contextualInput,
      {
        ...valid,
        confidenceLabel:
          "deterministic",
      },
    ),
  /conflicts with deterministic route/,
);

/*
 * Empty explanation forbidden.
 */
assert.throws(
  () =>
    validateLlmAnalysisOutput(
      contextualInput,
      {
        ...valid,
        explanation: [],
      },
    ),
  /at least one item/,
);

/*
 * No-pick case.
 */
const unresolvedInput:
  LlmAnalysisInput = {
    ...contextualInput,

    prediction: {
      ...contextualInput.prediction,

      route:
        "context_required",

      contextDecision: null,

      finalSelection: null,
    },

    evidence: {
      contextFactorCount: 0,
      homeSupport: 0,
      awaySupport: 0,
      neutralFactors: 0,
      contextFactors: [],
    },
  };

const unresolved =
  validateLlmAnalysisOutput(
    unresolvedInput,
    {
      version:
        LLM_ANALYSIS_VERSION,

      assessment:
        "no_pick",

      confidenceLabel:
        "insufficient_evidence",

      explanation: [
        "The rating difference requires contextual evidence, but sufficient verified context is unavailable.",
      ],

      contradictions: [],

      missingInformation: [
        "Additional verified pre-match context is required.",
      ],

      modelOverride: false,

      probability: null,
    },
  );

assert.equal(
  unresolved.assessment,
  "no_pick",
);

assert.equal(
  unresolved.confidenceLabel,
  "insufficient_evidence",
);

/*
 * Prompt itself must carry the hard
 * deterministic requirements.
 */
const prompt =
  buildLlmAnalysisPrompt(
    contextualInput,
  );

assert.match(
  prompt.system,
  /assessment MUST be: home/,
);

assert.match(
  prompt.system,
  /confidenceLabel MUST be: contextual/,
);

assert.match(
  prompt.system,
  /Do not override/,
);

assert.match(
  prompt.system,
  /Do not calculate or estimate a win probability/,
);

assert.match(
  prompt.user,
  /dictaziq-llm-analysis-v0\.1/,
);

console.log(
  "PASS: valid contextual LLM explanation accepted.",
);

console.log(
  "PASS: deterministic selection override rejected.",
);

console.log(
  "PASS: fabricated probability rejected.",
);

console.log(
  "PASS: modelOverride=true rejected.",
);

console.log(
  "PASS: confidence label cannot contradict deterministic routing.",
);

console.log(
  "PASS: empty explanation rejected.",
);

console.log(
  "PASS: unresolved 5-49 case remains no_pick.",
);

console.log(
  "PASS: LLM prompt carries deterministic safety contract.",
);

console.log(
  `PASS: LLM analysis contract = ${LLM_ANALYSIS_VERSION}.`,
);

const contextEvidence =
  snapshot.context_evidence;

assert.ok(
  Array.isArray(contextEvidence),
  "Prediction snapshot must contain context evidence.",
);
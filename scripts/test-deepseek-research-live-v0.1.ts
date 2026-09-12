import "./load-env";

import assert from "node:assert/strict";

import {
  generateDeepSeekResearchPredictionV01,
} from "../src/lib/ai/deepseek-research-prediction-v0.1";

import {
  GPT_RESEARCH_PREDICTION_VERSION_V02,
  type GptResearchPredictionInputV02,
} from "../src/lib/ai/gpt-research-prediction-v0.2";

async function main() {
  console.log(
    "DictazIQ DeepSeek Research Smoke Test",
  );

  console.log(
    "Provider: DeepSeek",
  );

  console.log(
    `Model: ${
      process.env
        .DEEPSEEK_LLM_MODEL
        ?.trim() ||
      "deepseek-v4-flash"
    }`,
  );

  console.log(
    "API-Football calls: 0",
  );

  /*
   * Tomorrow's Manchester derby is used only
   * as a live web-research smoke test.
   *
   * Nothing is persisted to Neon.
   */
  const input:
    GptResearchPredictionInputV02 = {
    purpose:
      "fallback",

    fixture: {
      fixtureId:
        "deepseek-live-smoke-test",

      homeTeam:
        "Manchester United",

      awayTeam:
        "Manchester City",

      competition:
        "Premier League",

      country:
        "England",

      kickoffAt:
        "2026-09-13T15:30:00.000Z",
    },

    evidence: {
      cutoffAt:
        "2026-09-12T10:30:00.000Z",

      structuredFacts: [],
    },
  };

  console.log("");
  console.log(
    "Analyzing Manchester United vs Manchester City...",
  );

  const result =
    await generateDeepSeekResearchPredictionV01(
      input,
    );

  assert.equal(
    result.provider,
    "deepseek",
  );

  assert.equal(
    result.prediction.version,
    GPT_RESEARCH_PREDICTION_VERSION_V02,
  );

  assert.equal(
    result.webSearchUsed,
    false,
    "DeepSeek unexpectedly reported native web research.",
  );

  assert.ok(
    [
      "home",
      "draw",
      "away",
    ].includes(
      result.prediction.selection,
    ),
    "DeepSeek did not produce a valid 1X2 forecast.",
  );

  assert.equal(
    result.prediction.probability,
    null,
  );

  assert.equal(
    result.prediction.modelOverride,
    false,
  );

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "DEEPSEEK RESEARCH RESULT",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Response ID: ${result.responseId}`,
  );

  console.log(
    `Model: ${result.model}`,
  );

  console.log(
    `Forecast: ${result.prediction.selection.toUpperCase()}`,
  );

  console.log(
    `Confidence: ${result.prediction.confidence}`,
  );

  console.log(
    `Evidence grade: ${result.prediction.evidenceGrade}`,
  );

  console.log(
    `Goals view: ${result.prediction.goalsView}`,
  );

  console.log(
    `BTTS view: ${result.prediction.bttsView}`,
  );

  console.log(
    `Web search used: ${result.webSearchUsed ? "YES" : "NO"}`,
  );

  console.log(
    `Web sources captured: ${result.webSources.length}`,
  );

  console.log("");
  console.log(
    "Material factors:",
  );

  for (
    const factor
    of result.prediction.materialFactors
  ) {
    console.log(
      `- ${factor}`,
    );
  }

  console.log("");
  console.log(
    "Reasoning summary:",
  );

  for (
    const reason
    of result.prediction.reasoningSummary
  ) {
    console.log(
      `- ${reason}`,
    );
  }

  if (
    result.prediction
      .contradictions
      .length >
    0
  ) {
    console.log("");
    console.log(
      "Contradictions:",
    );

    for (
      const contradiction
      of result.prediction.contradictions
    ) {
      console.log(
        `- ${contradiction}`,
      );
    }
  }

  if (
    result.prediction
      .missingInformation
      .length >
    0
  ) {
    console.log("");
    console.log(
      "Missing information:",
    );

    for (
      const missing
      of result.prediction.missingInformation
    ) {
      console.log(
        `- ${missing}`,
      );
    }
  }

  console.log("");
  console.log(
    "Usage:",
  );

  console.log(
    `Input tokens: ${result.usage.inputTokens ?? "unknown"}`,
  );

  console.log(
    `Output tokens: ${result.usage.outputTokens ?? "unknown"}`,
  );

  console.log(
    `Total tokens: ${result.usage.totalTokens ?? "unknown"}`,
  );

  console.log("");
  console.log(
    "PASS: DeepSeek produced an independent DictazIQ forecast.",
  );

  console.log(
    "PASS: no database records were created.",
  );

  console.log(
    "PASS: no API-Football calls were consumed.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `DeepSeek smoke test failed: ${error.message}`
        : "DeepSeek smoke test failed.",
    );

    process.exitCode =
      1;
  },
);

import {
  explainForecastV01,
  type ForecastExplainerInputV01,
  type ForecastExplanationV01,
  type PublicBttsSignalV01,
  type PublicConfidenceV01,
  type PublicCoverageV01,
  type PublicForecastV01,
  type PublicGoalsSignalV01,
  type PublicMatchProfileV01,
  type PublicScoringArchetypeV01,
} from "./forecast-explainer-v0.1";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "./unified-match-analysis-v0.1";

export const UNIFIED_FORECAST_EXPLAINER_ADAPTER_VERSION_V01 =
  "dictaziq-unified-forecast-explainer-adapter-v0.1" as const;

type JsonObject =
  Record<string, unknown>;

export interface UnifiedForecastExplainerAdapterInputV01 {
  homeTeamName:
    string;

  awayTeamName:
    string;

  unifiedOutput:
    unknown;
}

export interface UnifiedForecastExplainerAdapterResultV01 {
  adapterVersion:
    typeof UNIFIED_FORECAST_EXPLAINER_ADAPTER_VERSION_V01;

  sourceModelVersion:
    typeof UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01;

  explanation:
    ForecastExplanationV01;
}

function objectValue(
  value:
    unknown,
  label:
    string,
): JsonObject {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `${label} must be a JSON object.`,
    );
  }

  return value as
    JsonObject;
}

function nonEmptyString(
  value:
    unknown,
  label:
    string,
): string {
  if (
    typeof value !==
      "string" ||
    value.trim().length ===
      0
  ) {
    throw new Error(
      `${label} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function assertForecast(
  value:
    string,
): asserts value is PublicForecastV01 {
  if (
    value !==
      "home" &&
    value !==
      "draw" &&
    value !==
      "away"
  ) {
    throw new Error(
      `Unsupported Unified forecast: ${value}.`,
    );
  }
}

function assertConfidence(
  value:
    string,
): asserts value is PublicConfidenceV01 {
  if (
    value !==
      "high" &&
    value !==
      "medium" &&
    value !==
      "low" &&
    value !==
      "very_low"
  ) {
    throw new Error(
      `Unsupported Unified confidence: ${value}.`,
    );
  }
}

function assertMatchProfile(
  value:
    string,
): asserts value is PublicMatchProfileV01 {
  const allowed:
    readonly PublicMatchProfileV01[] = [
      "true_parity",
      "directional_parity",
      "unstable_parity",
      "stable_advantage",
      "reinforced_advantage",
      "challenged_advantage",
      "dominant_advantage",
      "prior_only",
    ];

  if (
    !allowed.includes(
      value as
        PublicMatchProfileV01,
    )
  ) {
    throw new Error(
      `Unsupported Unified match profile: ${value}.`,
    );
  }
}

function assertCoverage(
  value:
    string,
): asserts value is PublicCoverageV01 {
  if (
    value !==
      "full" &&
    value !==
      "result_only" &&
    value !==
      "prior_result_only"
  ) {
    throw new Error(
      `Unsupported Unified coverage: ${value}.`,
    );
  }
}

function assertScoringArchetype(
  value:
    string,
): asserts value is PublicScoringArchetypeV01 {
  const allowed:
    readonly PublicScoringArchetypeV01[] = [
      "open_parity",
      "closed_parity",
      "mixed_parity",
      "open_mismatch",
      "closed_mismatch",
      "mixed_mismatch",
      "insufficient",
    ];

  if (
    !allowed.includes(
      value as
        PublicScoringArchetypeV01,
    )
  ) {
    throw new Error(
      `Unsupported Unified scoring archetype: ${value}.`,
    );
  }
}

function assertGoalsSignal(
  value:
    string,
): asserts value is PublicGoalsSignalV01 {
  if (
    value !==
      "over_2_5_support" &&
    value !==
      "under_2_5_support" &&
    value !==
      "conflict" &&
    value !==
      "none"
  ) {
    throw new Error(
      `Unsupported Unified goals signal: ${value}.`,
    );
  }
}

function assertBttsSignal(
  value:
    string,
): asserts value is PublicBttsSignalV01 {
  /*
   * Unified Match Analysis v0.1 currently
   * produces only these BTTS states.
   *
   * The generic public explainer understands
   * "conflict" for future versions, but this
   * v0.1 adapter deliberately follows the
   * current Unified v0.1 contract exactly.
   */
  if (
    value !==
      "yes_support" &&
    value !==
      "no_support" &&
    value !==
      "none"
  ) {
    throw new Error(
      `Unsupported Unified BTTS signal: ${value}.`,
    );
  }
}

export function projectUnifiedForecastForExplanationV01(
  input:
    UnifiedForecastExplainerAdapterInputV01,
): ForecastExplainerInputV01 {
  const output =
    objectValue(
      input.unifiedOutput,
      "Unified output",
    );

  const modelVersion =
    nonEmptyString(
      output.modelVersion,
      "Unified model version",
    );

  if (
    modelVersion !==
    UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01
  ) {
    throw new Error(
      `Expected ${UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01}, received ${modelVersion}.`,
    );
  }

  /*
   * Unified v0.1 guarantees that probability
   * remains uncalibrated.
   */
  if (
    output.calibratedProbability !==
    null
  ) {
    throw new Error(
      "Unified v0.1 cannot expose a calibrated probability.",
    );
  }

  /*
   * The explainer is strictly a forecast
   * presentation layer.
   *
   * Recommendation logic remains downstream.
   */
  if (
    output.recommendationStatus !==
    "not_evaluated"
  ) {
    throw new Error(
      "Unified v0.1 recommendation status must be not_evaluated.",
    );
  }

  const forecast =
    nonEmptyString(
      output.forecast,
      "Unified forecast",
    );

  const confidence =
    nonEmptyString(
      output.confidence,
      "Unified confidence",
    );

  const matchProfile =
    nonEmptyString(
      output.matchProfile,
      "Unified match profile",
    );

  const scoringArchetype =
    nonEmptyString(
      output.scoringArchetype,
      "Unified scoring archetype",
    );

  const coverage =
    nonEmptyString(
      output.coverage,
      "Unified coverage",
    );

  /*
   * IMPORTANT:
   *
   * Goals and BTTS live inside the
   * marketEvidence object in the real
   * Unified v0.1 output contract.
   */
  const marketEvidence =
    objectValue(
      output.marketEvidence,
      "Unified market evidence",
    );

  const goals =
    objectValue(
      marketEvidence.goals,
      "Unified goals evidence",
    );

  const btts =
    objectValue(
      marketEvidence.btts,
      "Unified BTTS evidence",
    );

  const goalsSignal =
    nonEmptyString(
      goals.signal,
      "Unified goals signal",
    );

  const bttsSignal =
    nonEmptyString(
      btts.signal,
      "Unified BTTS signal",
    );

  assertForecast(
    forecast,
  );

  assertConfidence(
    confidence,
  );

  assertMatchProfile(
    matchProfile,
  );

  assertScoringArchetype(
    scoringArchetype,
  );

  assertCoverage(
    coverage,
  );

  assertGoalsSignal(
    goalsSignal,
  );

  assertBttsSignal(
    bttsSignal,
  );

  /*
   * PUBLIC-SAFE PROJECTION
   *
   * Deliberately excluded:
   *
   * - ratingGap
   * - absoluteRatingGap
   * - raw ratings
   * - rating history
   * - rating dynamics
   * - source identifiers
   * - evidence hashes
   * - model SHA
   * - input SHA
   * - component diagnostics
   * - internal reasons
   */
  return {
    homeTeamName:
      nonEmptyString(
        input.homeTeamName,
        "Home team name",
      ),

    awayTeamName:
      nonEmptyString(
        input.awayTeamName,
        "Away team name",
      ),

    forecast,

    confidence,

    matchProfile,

    coverage,

    scoringArchetype,

    goalsSignal,

    bttsSignal,
  };
}

export function explainUnifiedForecastV01(
  input:
    UnifiedForecastExplainerAdapterInputV01,
): UnifiedForecastExplainerAdapterResultV01 {
  const projection =
    projectUnifiedForecastForExplanationV01(
      input,
    );

  return {
    adapterVersion:
      UNIFIED_FORECAST_EXPLAINER_ADAPTER_VERSION_V01,

    sourceModelVersion:
      UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,

    explanation:
      explainForecastV01(
        projection,
      ),
  };
}
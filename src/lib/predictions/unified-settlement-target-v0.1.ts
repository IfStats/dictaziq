import {
  type SupportedMarket,
} from "./settlement";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "./unified-match-analysis-v0.1";

export const UNIFIED_SETTLEMENT_TARGET_VERSION_V01 =
  "dictaziq-unified-settlement-target-v0.1" as const;

export type UnifiedSettlementSelectionV01 =
  | "home"
  | "draw"
  | "away";

export interface UnifiedSettlementTargetV01 {
  market:
    Extract<
      SupportedMarket,
      "1x2"
    >;

  selection:
    UnifiedSettlementSelectionV01;
}

type JsonObject =
  Record<string, unknown>;

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

function settlementSelection(
  value:
    string,
): UnifiedSettlementSelectionV01 {
  if (
    value !==
      "home" &&
    value !==
      "draw" &&
    value !==
      "away"
  ) {
    throw new Error(
      `Unsupported Unified forecast for settlement: ${value}.`,
    );
  }

  return value;
}

export function extractUnifiedSettlementTargetV01(
  rawOutput:
    unknown,
): UnifiedSettlementTargetV01 {
  const output =
    objectValue(
      rawOutput,
      "Unified prediction output",
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
   * Unified v0.1 is an uncalibrated forecast model.
   * A probability appearing here would indicate
   * that the historical contract has been altered.
   */
  if (
    output.calibratedProbability !==
    null
  ) {
    throw new Error(
      "Unified v0.1 cannot contain a calibrated probability.",
    );
  }

  /*
   * Forecast settlement is independent of the
   * downstream betting/recommendation layer.
   */
  if (
    output.recommendationStatus !==
    "not_evaluated"
  ) {
    throw new Error(
      "Unified v0.1 recommendation status must remain not_evaluated.",
    );
  }

  /*
   * The immutable output records the generation
   * state as draft. Publication itself is stored
   * in predictions.published_at and must not
   * rewrite the model output.
   */
  if (
    output.publicationStatus !==
    "draft"
  ) {
    throw new Error(
      "Unified v0.1 immutable output publicationStatus must remain draft.",
    );
  }

  const forecast =
    settlementSelection(
      nonEmptyString(
        output.forecast,
        "Unified forecast",
      ),
    );

  return {
    market:
      "1x2",

    selection:
      forecast,
  };
}
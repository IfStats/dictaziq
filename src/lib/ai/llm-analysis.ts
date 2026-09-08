export const LLM_ANALYSIS_VERSION =
  "dictaziq-llm-analysis-v0.1" as const;

export type DeterministicSelection =
  | "home"
  | "away"
  | "draw"
  | null;

export type LlmAssessment =
  | "home"
  | "away"
  | "draw"
  | "no_pick";

export type LlmConfidenceLabel =
  | "deterministic"
  | "contextual"
  | "insufficient_evidence";

export type LlmAnalysisInput = {
  fixture: {
    homeTeam: string;
    awayTeam: string;
  };

  prediction: {
    predictionId: string;
    modelVersion: string;

    route:
      | "rating_gap_only"
      | "context_required"
      | "rating_gap_plus_context";

    ratingGap: number;
    ratingSignal: string;

    contextDecision:
      | string
      | null;

    finalSelection:
      DeterministicSelection;

    over25Signal: boolean;

    /*
     * The current DictazIQ heuristic does not
     * supply a calibrated probability.
     */
    calibratedProbability: null;
  };

  evidence: {
  contextFactorCount: number;
  homeSupport: number;
  awaySupport: number;
  neutralFactors: number;

  contextFactors: Array<{
    kind: string;

    side:
      | "home"
      | "away"
      | "neutral";

    description: string;

    source: string;

    observedAt: string;
  }>;
};
};

export type LlmAnalysisOutput = {
  version:
    typeof LLM_ANALYSIS_VERSION;

  assessment:
    LlmAssessment;

  confidenceLabel:
    LlmConfidenceLabel;

  explanation: string[];

  contradictions: string[];

  missingInformation: string[];

  /*
   * v0.1 LLM is strictly explanatory.
   */
  modelOverride: false;

  /*
   * LLM cannot manufacture a probability.
   */
  probability: null;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requireStringArray(
  value: unknown,
  field: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${field} must be an array.`,
    );
  }

  if (value.length > 10) {
    throw new Error(
      `${field} may contain at most 10 items.`,
    );
  }

  return value.map(
    (item, index) => {
      if (
        typeof item !== "string" ||
        !item.trim()
      ) {
        throw new Error(
          `${field}[${index}] must be a non-empty string.`,
        );
      }

      return item.trim();
    },
  );
}

export function validateLlmAnalysisOutput(
  input: LlmAnalysisInput,
  candidate: unknown,
): LlmAnalysisOutput {
  if (!isRecord(candidate)) {
    throw new Error(
      "LLM analysis must be an object.",
    );
  }

  if (
    candidate.version !==
    LLM_ANALYSIS_VERSION
  ) {
    throw new Error(
      "LLM analysis version is invalid.",
    );
  }

  const validAssessments =
    new Set<LlmAssessment>([
      "home",
      "away",
      "draw",
      "no_pick",
    ]);

  if (
    typeof candidate.assessment !==
      "string" ||
    !validAssessments.has(
      candidate.assessment as LlmAssessment,
    )
  ) {
    throw new Error(
      "LLM assessment is invalid.",
    );
  }

  const assessment =
    candidate.assessment as LlmAssessment;

  /*
   * Critical rule:
   *
   * LLM v0.1 cannot change the deterministic
   * model's final selection.
   */
  const expectedAssessment:
    LlmAssessment =
      input.prediction.finalSelection ??
      "no_pick";

  if (
    assessment !==
    expectedAssessment
  ) {
    throw new Error(
      `LLM attempted to override deterministic selection. Expected ${expectedAssessment}, received ${assessment}.`,
    );
  }

  const validConfidenceLabels =
    new Set<LlmConfidenceLabel>([
      "deterministic",
      "contextual",
      "insufficient_evidence",
    ]);

  if (
    typeof candidate.confidenceLabel !==
      "string" ||
    !validConfidenceLabels.has(
      candidate.confidenceLabel as LlmConfidenceLabel,
    )
  ) {
    throw new Error(
      "LLM confidence label is invalid.",
    );
  }

  /*
   * Confidence wording must also remain
   * consistent with the deterministic route.
   */
  const expectedConfidence:
    LlmConfidenceLabel =
      input.prediction.finalSelection ===
      null
        ? "insufficient_evidence"
        : input.prediction.route ===
            "rating_gap_plus_context"
          ? "contextual"
          : "deterministic";

  if (
    candidate.confidenceLabel !==
    expectedConfidence
  ) {
    throw new Error(
      `LLM confidence label conflicts with deterministic route. Expected ${expectedConfidence}.`,
    );
  }

  if (
    candidate.modelOverride !== false
  ) {
    throw new Error(
      "LLM modelOverride must remain false.",
    );
  }

  if (
    candidate.probability !== null
  ) {
    throw new Error(
      "LLM cannot create a probability.",
    );
  }

  const explanation =
    requireStringArray(
      candidate.explanation,
      "explanation",
    );

  if (explanation.length === 0) {
    throw new Error(
      "LLM explanation must contain at least one item.",
    );
  }

  const contradictions =
    requireStringArray(
      candidate.contradictions,
      "contradictions",
    );

  const missingInformation =
    requireStringArray(
      candidate.missingInformation,
      "missingInformation",
    );

  return {
    version:
      LLM_ANALYSIS_VERSION,

    assessment,

    confidenceLabel:
      candidate.confidenceLabel as LlmConfidenceLabel,

    explanation,

    contradictions,

    missingInformation,

    modelOverride: false,

    probability: null,
  };
}

export function buildLlmAnalysisPrompt(
  input: LlmAnalysisInput,
): {
  system: string;
  user: string;
} {
  const expectedAssessment =
    input.prediction.finalSelection ??
    "no_pick";

  const expectedConfidence =
    input.prediction.finalSelection ===
    null
      ? "insufficient_evidence"
      : input.prediction.route ===
          "rating_gap_plus_context"
        ? "contextual"
        : "deterministic";

  const system = [
    "You are the DictazIQ pre-match analysis explanation layer.",
    "",
    "Use only the structured evidence supplied by DictazIQ.",
    "Do not invent injuries, form, lineups, statistics, probabilities, or external facts.",
    "Do not use post-match information.",
    "Do not override the deterministic DictazIQ selection.",
    "Do not calculate or estimate a win probability.",
    "",
    `Your assessment MUST be: ${expectedAssessment}.`,
    `Your confidenceLabel MUST be: ${expectedConfidence}.`,
    "modelOverride MUST be false.",
    "probability MUST be null.",
    "",
    "Explain why the deterministic system reached its decision.",
    "Identify contradictions only when they exist in the supplied evidence.",
    "Identify missing information when appropriate.",
    "",
    "Return only valid JSON.",
  ].join("\n");

  const user = JSON.stringify(
    {
      contractVersion:
        LLM_ANALYSIS_VERSION,

      requiredOutput: {
        version:
          LLM_ANALYSIS_VERSION,

        assessment:
          expectedAssessment,

        confidenceLabel:
          expectedConfidence,

        explanation: [
          "string",
        ],

        contradictions: [
          "string",
        ],

        missingInformation: [
          "string",
        ],

        modelOverride: false,

        probability: null,
      },

      input,
    },
    null,
    2,
  );

  return {
    system,
    user,
  };
}
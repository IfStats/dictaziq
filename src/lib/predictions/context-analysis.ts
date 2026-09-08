export const CONTEXT_MODEL_VERSION =
  "dictaziq-context-v0.1" as const;

export type ContextSide =
  | "home"
  | "away"
  | "neutral";

export type ContextFactorKind =
  | "recent_form"
  | "home_away_form"
  | "squad_availability"
  | "rest_schedule"
  | "competition_position"
  | "head_to_head"
  | "tactical_matchup"
  | "other_verified";

export type ContextFactor = {
  kind: ContextFactorKind;

  // Which side this verified factor favours.
  side: ContextSide;

  // Human-readable evidence, not an LLM invention.
  description: string;

  // Where the evidence came from.
  source: string;

  // When DictazIQ observed/verified it.
  observedAt: string;
};

export type ContextAnalysisInput = {
  ratingGap: number;

  cutoffAt: string;
  kickoffAt: string;

  factors: ContextFactor[];
};

export type ContextDecision =
  | "home_lean"
  | "away_lean"
  | "insufficient_context";

export type ContextAnalysisResult = {
  modelVersion: typeof CONTEXT_MODEL_VERSION;

  validationStatus: "experimental";

  ratingGap: number;
  absoluteGap: number;

  applicable: true;

  homeSupport: number;
  awaySupport: number;
  neutralFactors: number;

  directionalMargin: number;

  decision: ContextDecision;

  selection: "home" | "away" | null;

  requiresHumanOrLLMExplanation: boolean;

  factorCount: number;

  factors: ContextFactor[];
};

function parseTimestamp(
  value: string,
  label: string,
): number {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(
      `${label} must be a valid timestamp.`,
    );
  }

  return timestamp;
}

function assertNonEmpty(
  value: string,
  label: string,
): void {
  if (!value.trim()) {
    throw new Error(
      `${label} must not be empty.`,
    );
  }
}

export function evaluateMatchContext(
  input: ContextAnalysisInput,
): ContextAnalysisResult {
  if (
    !Number.isInteger(input.ratingGap)
  ) {
    throw new Error(
      "Rating gap must be an integer.",
    );
  }

  const absoluteGap =
    Math.abs(input.ratingGap);

  if (
    absoluteGap < 5 ||
    absoluteGap > 49
  ) {
    throw new Error(
      "Context engine applies only to absolute rating gaps from 5 through 49.",
    );
  }

  const cutoff =
    parseTimestamp(
      input.cutoffAt,
      "Context cutoff",
    );

  const kickoff =
    parseTimestamp(
      input.kickoffAt,
      "Fixture kickoff",
    );

  if (cutoff >= kickoff) {
    throw new Error(
      "Context cutoff must be before kickoff.",
    );
  }

  let homeSupport = 0;
  let awaySupport = 0;
  let neutralFactors = 0;

  const uniqueFactors =
    new Set<string>();

  for (const factor of input.factors) {
    assertNonEmpty(
      factor.description,
      "Context description",
    );

    assertNonEmpty(
      factor.source,
      "Context source",
    );

    const observedAt =
      parseTimestamp(
        factor.observedAt,
        "Context observation time",
      );

    if (observedAt > cutoff) {
      throw new Error(
        "Context evidence observed after the prediction cutoff cannot be used.",
      );
    }

    if (observedAt >= kickoff) {
      throw new Error(
        "Post-kickoff evidence cannot be used in a pre-match context analysis.",
      );
    }

    const identity = [
      factor.kind,
      factor.side,
      factor.source.trim().toLowerCase(),
      factor.description.trim().toLowerCase(),
    ].join("|");

    if (uniqueFactors.has(identity)) {
      throw new Error(
        "Duplicate context evidence is not allowed.",
      );
    }

    uniqueFactors.add(identity);

    if (factor.side === "home") {
      homeSupport += 1;
    } else if (factor.side === "away") {
      awaySupport += 1;
    } else {
      neutralFactors += 1;
    }
  }

  const directionalMargin =
    homeSupport - awaySupport;

  let decision: ContextDecision =
    "insufficient_context";

  let selection:
    | "home"
    | "away"
    | null = null;

  /*
   * Conservative experimental rule:
   *
   * - At least 3 verified context factors.
   * - One side must have at least 2 more supporting
   *   factors than the other.
   *
   * This produces a contextual LEAN, not a calibrated
   * win probability.
   */
  if (
    input.factors.length >= 3 &&
    directionalMargin >= 2
  ) {
    decision = "home_lean";
    selection = "home";
  } else if (
    input.factors.length >= 3 &&
    directionalMargin <= -2
  ) {
    decision = "away_lean";
    selection = "away";
  }

  return {
    modelVersion:
      CONTEXT_MODEL_VERSION,

    validationStatus:
      "experimental",

    ratingGap:
      input.ratingGap,

    absoluteGap,

    applicable: true,

    homeSupport,
    awaySupport,
    neutralFactors,

    directionalMargin,

    decision,
    selection,

    requiresHumanOrLLMExplanation:
      true,

    factorCount:
      input.factors.length,

    factors:
      input.factors,
  };
}
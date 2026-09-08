import {
  evaluateRatingGap,
  type RatingGapInput,
  type RatingGapResult,
} from "./rating-gap";

import {
  evaluateMatchContext,
  type ContextAnalysisResult,
  type ContextFactor,
} from "./context-analysis";

export const PREMATCH_ENGINE_VERSION =
  "dictaziq-prematch-v0.1" as const;

export type PreMatchRoute =
  | "rating_gap_only"
  | "context_required"
  | "rating_gap_plus_context";

export type PreMatchSelection =
  | "home"
  | "away"
  | "draw"
  | null;

export type PreMatchContextInput = {
  cutoffAt: string;
  kickoffAt: string;
  factors: ContextFactor[];
};

export type PreMatchDecisionInput = {
  ratings: RatingGapInput;

  /*
   * Context must only be supplied when the rating-gap
   * model returns |D| = 5 through 49.
   */
  context?: PreMatchContextInput;
};

export type PreMatchDecisionResult = {
  engineVersion:
    typeof PREMATCH_ENGINE_VERSION;

  validationStatus: "experimental";

  route: PreMatchRoute;

  ratingGap: RatingGapResult;

  context: ContextAnalysisResult | null;

  finalSelection: PreMatchSelection;

  over25Signal: boolean;

  contextRequired: boolean;

  contextResolved: boolean;

  calibratedProbability: null;
};

export function evaluatePreMatchDecision(
  input: PreMatchDecisionInput,
): PreMatchDecisionResult {
  const ratingGap =
    evaluateRatingGap(input.ratings);

  /*
   * Outside |D| 5-49 the mathematical rating model
   * is authoritative for this model family.
   *
   * Context is deliberately forbidden here so it
   * cannot silently override the mathematical rules.
   */
  if (!ratingGap.requiresContext) {
    if (input.context) {
      throw new Error(
        "Context may only be supplied when the rating-gap model requires it.",
      );
    }

    return {
      engineVersion:
        PREMATCH_ENGINE_VERSION,

      validationStatus:
        "experimental",

      route:
        "rating_gap_only",

      ratingGap,

      context: null,

      finalSelection:
        ratingGap.standaloneSelection,

      over25Signal:
        ratingGap.over25Signal,

      contextRequired: false,

      contextResolved: false,

      calibratedProbability: null,
    };
  }

  /*
   * D is in the 5-49 band but no verified context
   * has been supplied yet.
   */
  if (!input.context) {
    return {
      engineVersion:
        PREMATCH_ENGINE_VERSION,

      validationStatus:
        "experimental",

      route:
        "context_required",

      ratingGap,

      context: null,

      finalSelection: null,

      over25Signal: false,

      contextRequired: true,

      contextResolved: false,

      calibratedProbability: null,
    };
  }

  const context =
    evaluateMatchContext({
      ratingGap:
        ratingGap.ratingGap,

      cutoffAt:
        input.context.cutoffAt,

      kickoffAt:
        input.context.kickoffAt,

      factors:
        input.context.factors,
    });

  return {
    engineVersion:
      PREMATCH_ENGINE_VERSION,

    validationStatus:
      "experimental",

    route:
      "rating_gap_plus_context",

    ratingGap,

    context,

    finalSelection:
      context.selection,

    over25Signal: false,

    contextRequired: true,

    contextResolved:
      context.selection !== null,

    calibratedProbability: null,
  };
}
import {
  evaluateRatingGapV02,
  type RatingGapInputV02,
  type RatingGapResultV02,
} from "./rating-gap-v0.2";

import {
  evaluateMatchContext,
  type ContextAnalysisResult,
  type ContextFactor,
} from "./context-analysis";

import {
  buildMarketAnalysisPlan,
  type MarketAnalysisPlan,
} from "./market-analysis";

export const PREMATCH_ENGINE_VERSION_V02 =
  "dictaziq-prematch-v0.2" as const;

export type PreMatchRouteV02 =
  | "rating_gap_only"
  | "result_context_required"
  | "rating_gap_plus_context";

export type PreMatchSelectionV02 =
  | "home"
  | "away"
  | "draw"
  | null;

export type PreMatchResultContextInputV02 = {
  cutoffAt: string;
  kickoffAt: string;
  factors: ContextFactor[];
};

export type PreMatchDecisionInputV02 = {
  ratings: RatingGapInputV02;

  /*
   * Result context is used only for the
   * |D| = 5 through 49 result band.
   *
   * Goals, BTTS, corners and other markets
   * have separate evidence engines.
   */
  resultContext?:
    PreMatchResultContextInputV02;
};

export type PreMatchDecisionResultV02 = {
  engineVersion:
    typeof PREMATCH_ENGINE_VERSION_V02;

  validationStatus:
    "experimental";

  route:
    PreMatchRouteV02;

  ratingGap:
    RatingGapResultV02;

  resultContext:
    ContextAnalysisResult | null;

  finalResultSelection:
    PreMatchSelectionV02;

  resultContextRequired:
    boolean;

  resultContextResolved:
    boolean;

  /*
   * These markets deliberately remain unresolved
   * at this layer.
   */
  marketAnalysis:
    MarketAnalysisPlan;

  calibratedProbability:
    null;
};

export function evaluatePreMatchDecisionV02(
  input:
    PreMatchDecisionInputV02,
): PreMatchDecisionResultV02 {
  const ratingGap =
    evaluateRatingGapV02(
      input.ratings,
    );

  const marketAnalysis =
    buildMarketAnalysisPlan({
      ratingMismatchCandidate:
        ratingGap
          .markets
          .goals
          .ratingMismatchCandidate,
    });

  /*
   * Outside the 5-49 band, rating-gap v0.2
   * provides the structural 1X2 decision.
   *
   * Result context is forbidden here so it
   * cannot silently override the mathematical
   * rating rule.
   *
   * This restriction applies only to the RESULT
   * engine. Goals/BTTS/etc still require their
   * own analysis.
   */
  if (
    !ratingGap
      .requiresResultContext
  ) {
    if (
      input.resultContext
    ) {
      throw new Error(
        "Result context may only be supplied when rating-gap v0.2 requires it.",
      );
    }

    return {
      engineVersion:
        PREMATCH_ENGINE_VERSION_V02,

      validationStatus:
        "experimental",

      route:
        "rating_gap_only",

      ratingGap,

      resultContext:
        null,

      finalResultSelection:
        ratingGap
          .standaloneSelection,

      resultContextRequired:
        false,

      resultContextResolved:
        false,

      marketAnalysis,

      calibratedProbability:
        null,
    };
  }

  /*
   * |D| = 5 through 49 and no verified
   * result evidence has been supplied.
   */
  if (
    !input.resultContext
  ) {
    return {
      engineVersion:
        PREMATCH_ENGINE_VERSION_V02,

      validationStatus:
        "experimental",

      route:
        "result_context_required",

      ratingGap,

      resultContext:
        null,

      finalResultSelection:
        null,

      resultContextRequired:
        true,

      resultContextResolved:
        false,

      marketAnalysis,

      calibratedProbability:
        null,
    };
  }

  /*
   * Reuse the existing verified result-context
   * engine. It remains applicable specifically
   * to the 5-49 rating band.
   */
  const resultContext =
    evaluateMatchContext({
      ratingGap:
        ratingGap.ratingGap,

      cutoffAt:
        input
          .resultContext
          .cutoffAt,

      kickoffAt:
        input
          .resultContext
          .kickoffAt,

      factors:
        input
          .resultContext
          .factors,
    });

  return {
    engineVersion:
      PREMATCH_ENGINE_VERSION_V02,

    validationStatus:
      "experimental",

    route:
      "rating_gap_plus_context",

    ratingGap,

    resultContext,

    finalResultSelection:
      resultContext.selection,

    resultContextRequired:
      true,

    resultContextResolved:
      resultContext
        .selection !== null,

    /*
     * Resolving the match-result context does
     * NOT automatically resolve goals, BTTS,
     * corners or other markets.
     */
    marketAnalysis,

    calibratedProbability:
      null,
  };
}
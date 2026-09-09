import {
  evaluateRatingGapV02,
  RATING_GAP_MODEL_VERSION_V02,
  type RatingGapInputV02,
} from "./rating-gap-v0.2";

import {
  evaluateGoalsAndBttsV02,
  GOALS_BTTS_ENGINE_VERSION_V02,
} from "./goals-btts-engine-v0.2";

import {
  MARKET_EVIDENCE_VERSION_V02,
  validateMarketEvidenceSnapshotV02,
  type MarketEvidenceSnapshotV02,
} from "./market-evidence-v0.2";

import {
  evaluateResultContextV02,
  RESULT_CONTEXT_VERSION_V02,
  type ResultContextInputV02,
} from "./result-context-v0.2";

export const PREMATCH_MARKETS_MODEL_VERSION_V02 =
  "dictaziq-prematch-markets-v0.2" as const;

export const PREMATCH_MARKETS_CONFIGURATION_V02 = {
  validationStatus:
    "experimental",

  calibratedProbabilities:
    false,

  evidenceVersion:
    MARKET_EVIDENCE_VERSION_V02,

  components: {
    ratingGap:
      RATING_GAP_MODEL_VERSION_V02,

    goalsBtts:
      GOALS_BTTS_ENGINE_VERSION_V02,

    resultContext:
      RESULT_CONTEXT_VERSION_V02,
  },

  resultPolicy: {
    ratingGapContextBand: {
      minAbsoluteGap: 5,
      maxAbsoluteGap: 49,
    },

    contextSelectionStatus:
      "context_lean",

    contextLeanIsQualifiedRecommendation:
      false,

    unresolvedContextMeansNoPick:
      true,
  },

  recommendationPolicy: {
    qualifiedMarketsOnly:
      true,

    marketLeanStoredButNotRecommended:
      true,

    marketNoPickExcluded:
      true,

    resultContextLeanStoredButNotRecommended:
      true,
  },
} as const;

export type PrematchResultContextV02 =
  Omit<
    ResultContextInputV02,
    "ratingGap"
  >;

export type QualifiedMarketRecommendationV02 = {
  market:
    | "goals_1.5"
    | "goals_2.5"
    | "goals_3.5"
    | "btts";

  selection: string;

  status:
    "qualified";
};

export function evaluatePrematchMarketsV02(
  input: {
    rating:
      RatingGapInputV02;

    evidence:
      MarketEvidenceSnapshotV02;

    /*
     * Only relevant when the rating-gap model
     * says result context is required.
     *
     * Null means no verified result-context
     * package is available.
     */
    resultContext:
      PrematchResultContextV02 |
      null;
  },
) {
  const evidence =
    validateMarketEvidenceSnapshotV02(
      input.evidence,
    );

  const rating =
    evaluateRatingGapV02(
      input.rating,
    );

  const markets =
    evaluateGoalsAndBttsV02({
      evidence,

      ratingMismatchCandidate:
        rating
          .markets
          .goals
          .ratingMismatchCandidate,
    });

  let context:
    ReturnType<
      typeof evaluateResultContextV02
    > |
    null =
      null;

  let resultSelection =
    rating.standaloneSelection;

  /*
   * 5-49 rating gap:
   * rating alone may not select a winner.
   */
  if (
    rating.requiresResultContext
  ) {
    if (
      input.resultContext !==
      null
    ) {
      context =
        evaluateResultContextV02({
          ratingGap:
            rating.ratingGap,

          ...input.resultContext,
        });

      /*
       * Only a successfully resolved contextual
       * lean may populate result selection.
       *
       * no_pick remains null.
       */
      resultSelection =
        context.selection;
    } else {
      resultSelection =
        null;
    }
  } else if (
    input.resultContext !==
    null
  ) {
    /*
     * Prevent accidentally applying the 5-49
     * context engine outside its intended band.
     */
    throw new Error(
      "Result context must not be supplied outside the 5-49 rating-gap band.",
    );
  }

  const recommendations:
    QualifiedMarketRecommendationV02[] =
      [];

  const candidates = [
    [
      "goals_1.5",
      markets.goals15,
    ],

    [
      "goals_2.5",
      markets.goals25,
    ],

    [
      "goals_3.5",
      markets.goals35,
    ],

    [
      "btts",
      markets.btts,
    ],
  ] as const;

  for (
    const [
      market,
      decision,
    ]
    of candidates
  ) {
    if (
      decision.status ===
        "qualified" &&
      decision.selection !==
        null
    ) {
      recommendations.push({
        market,

        selection:
          decision.selection,

        status:
          "qualified",
      });
    }
  }

  return {
    modelVersion:
      PREMATCH_MARKETS_MODEL_VERSION_V02,

    validationStatus:
      "experimental" as const,

    componentVersions: {
      ratingGap:
        RATING_GAP_MODEL_VERSION_V02,

      goalsBtts:
        GOALS_BTTS_ENGINE_VERSION_V02,

      marketEvidence:
        MARKET_EVIDENCE_VERSION_V02,

      resultContext:
        RESULT_CONTEXT_VERSION_V02,
    },

    result: {
      ratingSignal:
        rating.resultSignal,

      selection:
        resultSelection,

      requiresContext:
        rating.requiresResultContext,

      contextStatus:
        rating.requiresResultContext
          ? context === null
            ? "missing"
            : context.status
          : "not_required",

      context,

      ratingGap:
        rating.ratingGap,

      absoluteGap:
        rating.absoluteGap,

      higherRatedTeam:
        rating.higherRatedTeam,

      /*
       * A context lean is deliberately NOT yet
       * called a qualified recommendation.
       */
      recommended:
        !rating.requiresResultContext &&
        resultSelection !== null,

      calibratedProbability:
        null,
    },

    markets,

    qualifiedRecommendations:
      recommendations,

    calibratedProbability:
      null,
  };
}
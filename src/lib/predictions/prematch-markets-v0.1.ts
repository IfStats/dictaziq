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

export const PREMATCH_MARKETS_MODEL_VERSION_V01 =
  "dictaziq-prematch-markets-v0.1" as const;

export const PREMATCH_MARKETS_CONFIGURATION_V01 = {
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
  },

  recommendationPolicy: {
    qualifiedOnly:
      true,

    leanStoredButNotRecommended:
      true,

    noPickExcluded:
      true,
  },
} as const;

export type QualifiedMarketRecommendation = {
  market:
    | "goals_1.5"
    | "goals_2.5"
    | "goals_3.5"
    | "btts";

  selection:
    string;

  status:
    "qualified";
};

export function evaluatePrematchMarketsV01(
  input: {
    rating:
      RatingGapInputV02;

    evidence:
      MarketEvidenceSnapshotV02;
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

  const recommendations:
    QualifiedMarketRecommendation[] = [];

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
      PREMATCH_MARKETS_MODEL_VERSION_V01,

    validationStatus:
      "experimental" as const,

    componentVersions: {
      ratingGap:
        RATING_GAP_MODEL_VERSION_V02,

      goalsBtts:
        GOALS_BTTS_ENGINE_VERSION_V02,

      evidence:
        MARKET_EVIDENCE_VERSION_V02,
    },

    result: {
      signal:
        rating.resultSignal,

      selection:
        rating.standaloneSelection,

      requiresContext:
        rating.requiresResultContext,

      ratingGap:
        rating.ratingGap,

      absoluteGap:
        rating.absoluteGap,

      higherRatedTeam:
        rating.higherRatedTeam,

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
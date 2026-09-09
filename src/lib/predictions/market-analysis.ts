export const MARKET_ANALYSIS_CONTRACT_VERSION =
  "dictaziq-market-analysis-v0.1" as const;

export type MarketAnalysisRequirement = {
  status: "analysis_required";
  selection: null;
  calibratedProbability: null;
};

export type MarketAnalysisPlan = {
  contractVersion:
    typeof MARKET_ANALYSIS_CONTRACT_VERSION;

  goals: MarketAnalysisRequirement & {
    ratingMismatchCandidate: boolean;

    markets: readonly [
      "goals_1.5",
      "goals_2.5",
      "goals_3.5",
      "team_totals",
    ];
  };

  btts: MarketAnalysisRequirement & {
    markets: readonly ["btts"];
  };

  resultDerivatives:
    MarketAnalysisRequirement & {
      markets: readonly [
        "double_chance",
        "draw_no_bet",
      ];
    };

  corners: MarketAnalysisRequirement & {
    markets: readonly [
      "total_corners",
      "team_corners",
    ];
  };
};

export function buildMarketAnalysisPlan(
  input: {
    ratingMismatchCandidate: boolean;
  },
): MarketAnalysisPlan {
  return {
    contractVersion:
      MARKET_ANALYSIS_CONTRACT_VERSION,

    goals: {
      status:
        "analysis_required",

      selection: null,

      calibratedProbability:
        null,

      ratingMismatchCandidate:
        input.ratingMismatchCandidate,

      markets: [
        "goals_1.5",
        "goals_2.5",
        "goals_3.5",
        "team_totals",
      ],
    },

    btts: {
      status:
        "analysis_required",

      selection: null,

      calibratedProbability:
        null,

      markets: [
        "btts",
      ],
    },

    resultDerivatives: {
      status:
        "analysis_required",

      selection: null,

      calibratedProbability:
        null,

      markets: [
        "double_chance",
        "draw_no_bet",
      ],
    },

    corners: {
      status:
        "analysis_required",

      selection: null,

      calibratedProbability:
        null,

      markets: [
        "total_corners",
        "team_corners",
      ],
    },
  };
}
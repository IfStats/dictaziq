import type {
  GptResearchPredictionOutputV02,
} from "./gpt-research-prediction-v0.2";

export const RESEARCH_FUSION_VERSION_V01 =
  "dictaziq-research-fusion-v0.1" as const;

export type FusionSelectionV01 =
  GptResearchPredictionOutputV02["selection"];

export type FusionFinalSelectionV01 =
  | FusionSelectionV01
  | "no_pick";

export type MathematicalStrengthV01 =
  | "strong"
  | "moderate"
  | "weak"
  | "none";

export type FusionConfidenceV01 =
  | "high"
  | "medium"
  | "low"
  | "very_low";

export type ResearchFusionInputV01 = {
  mathematical: {
    selection:
      FusionFinalSelectionV01;

    strength:
      MathematicalStrengthV01;

    provenance:
      string;
  };

  openai:
    GptResearchPredictionOutputV02 |
    null;

  deepseek:
    GptResearchPredictionOutputV02 |
    null;
};

export type ResearchFusionResultV01 = {
  version:
    typeof RESEARCH_FUSION_VERSION_V01;

  selection:
    FusionFinalSelectionV01;

  confidence:
    FusionConfidenceV01;

  probability:
    null;

  scores: {
    home: number;
    draw: number;
    away: number;
  };

  support: {
    mathematical: boolean;
    openai: boolean;
    deepseek: boolean;
  };

  reasons:
    string[];
};

type SignalSourceV01 =
  | "mathematical"
  | "openai"
  | "deepseek";

type WeightedSignalV01 = {
  source:
    SignalSourceV01;

  selection:
    FusionSelectionV01 |
    null;

  weight:
    number;
};

const mathematicalWeights:
  Record<
    MathematicalStrengthV01,
    number
  > = {
    strong: 4,
    moderate: 3,
    weak: 1,
    none: 0,
  };

const confidenceWeights:
  Record<
    GptResearchPredictionOutputV02["confidence"],
    number
  > = {
    high: 4,
    medium: 3,
    low: 2,
    very_low: 1,
  };

const evidenceCaps:
  Record<
    GptResearchPredictionOutputV02["evidenceGrade"],
    number
  > = {
    A: 4,
    B: 3,
    C: 2,
    D: 1,
    E: 0,
  };

function researchWeight(
  prediction:
    GptResearchPredictionOutputV02 |
    null,
): number {
  if (
    prediction ===
    null
  ) {
    return 0;
  }

  return Math.min(
    confidenceWeights[
      prediction.confidence
    ],
    evidenceCaps[
      prediction.evidenceGrade
    ],
  );
}

function validateMathematicalSignal(
  input:
    ResearchFusionInputV01["mathematical"],
): void {
  if (
    input.selection ===
      "no_pick" &&
    input.strength !==
      "none"
  ) {
    throw new Error(
      "Mathematical no_pick must have strength none.",
    );
  }

  if (
    input.selection !==
      "no_pick" &&
    input.strength ===
      "none"
  ) {
    throw new Error(
      "Mathematical directional selection cannot have strength none.",
    );
  }

  if (
    !input.provenance.trim()
  ) {
    throw new Error(
      "Mathematical provenance is required.",
    );
  }
}

export function fuseResearchPredictionsV01(
  input:
    ResearchFusionInputV01,
): ResearchFusionResultV01 {
  validateMathematicalSignal(
    input.mathematical,
  );

  const signals:
    WeightedSignalV01[] = [
    {
      source:
        "mathematical",

      selection:
        input.mathematical
          .selection ===
        "no_pick"
          ? null
          : input.mathematical
              .selection,

      weight:
        input.mathematical
          .selection ===
        "no_pick"
          ? 0
          : mathematicalWeights[
              input.mathematical
                .strength
            ],
    },
    {
      source:
        "openai",

      selection:
        input.openai
          ?.selection ??
        null,

      weight:
        researchWeight(
          input.openai,
        ),
    },
    {
      source:
        "deepseek",

      selection:
        input.deepseek
          ?.selection ??
        null,

      weight:
        researchWeight(
          input.deepseek,
        ),
    },
  ];

  const scores = {
    home: 0,
    draw: 0,
    away: 0,
  };

  for (
    const signal
    of signals
  ) {
    if (
      signal.selection ===
        null ||
      signal.weight <=
        0
    ) {
      continue;
    }

    scores[
      signal.selection
    ] += signal.weight;
  }

  const ranked =
    (
      Object.entries(
        scores,
      ) as Array<
        [
          FusionSelectionV01,
          number,
        ]
      >
    ).sort(
      (
        left,
        right,
      ) =>
        right[1] -
        left[1],
    );

  const [
    winner,
    winnerScore,
  ] =
    ranked[0];

  const secondScore =
    ranked[1][1];

  const margin =
    winnerScore -
    secondScore;

  const winnerSignals =
    signals.filter(
      (
        signal,
      ) =>
        signal.selection ===
          winner &&
        signal.weight >
          0,
    );

  const strongMathematicalSupport =
    input.mathematical
      .selection ===
      winner &&
    input.mathematical
      .strength ===
      "strong";

  const twoSourceConsensus =
    winnerSignals.length >=
      2;

  const clearWinner =
    winnerScore >=
      4 &&
    margin >=
      2;

  const selectable =
    clearWinner &&
    (
      twoSourceConsensus ||
      strongMathematicalSupport
    );

  const selection:
    FusionFinalSelectionV01 =
    selectable
      ? winner
      : "no_pick";

  let confidence:
    FusionConfidenceV01 =
    "very_low";

  if (
    selection !==
    "no_pick"
  ) {
    if (
      winnerSignals.length ===
        3 &&
      winnerScore >=
        8
    ) {
      confidence =
        "high";
    } else if (
      winnerSignals.length >=
        2 &&
      winnerScore >=
        5 &&
      margin >=
        3
    ) {
      confidence =
        "medium";
    } else {
      confidence =
        "low";
    }
  }

  const support = {
    mathematical:
      selection !==
        "no_pick" &&
      signals[0]
        .selection ===
        selection &&
      signals[0]
        .weight >
        0,

    openai:
      selection !==
        "no_pick" &&
      signals[1]
        .selection ===
        selection &&
      signals[1]
        .weight >
        0,

    deepseek:
      selection !==
        "no_pick" &&
      signals[2]
        .selection ===
        selection &&
      signals[2]
        .weight >
        0,
  };

  const reasons:
    string[] = [];

  if (
    selection ===
    "no_pick"
  ) {
    if (
      winnerScore ===
      secondScore
    ) {
      reasons.push(
        "top_signal_scores_tied",
      );
    }

    if (
      winnerScore <
      4
    ) {
      reasons.push(
        "insufficient_combined_strength",
      );
    }

    if (
      margin <
      2
    ) {
      reasons.push(
        "insufficient_winner_margin",
      );
    }

    if (
      !twoSourceConsensus &&
      !strongMathematicalSupport
    ) {
      reasons.push(
        "insufficient_independent_support",
      );
    }
  } else {
    if (
      winnerSignals.length ===
      3
    ) {
      reasons.push(
        "three_source_agreement",
      );
    } else if (
      twoSourceConsensus
    ) {
      reasons.push(
        "multi_source_agreement",
      );
    }

    if (
      strongMathematicalSupport
    ) {
      reasons.push(
        "strong_mathematical_support",
      );
    }

    if (
      margin >=
      3
    ) {
      reasons.push(
        "clear_score_margin",
      );
    }
  }

  return {
    version:
      RESEARCH_FUSION_VERSION_V01,

    selection,

    confidence,

    probability:
      null,

    scores,

    support,

    reasons,
  };
}

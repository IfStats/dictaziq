export const LLM_ANALYSIS_VERSION_V02 =
  "dictaziq-llm-analysis-v0.2" as const;

export type LlmAssessmentV02 =
  | "home"
  | "draw"
  | "away"
  | "no_pick";

export type LlmConfidenceV02 =
  | "high"
  | "medium"
  | "low"
  | "insufficient";

export type LlmSignalStrengthV02 =
  | "strong"
  | "moderate"
  | "weak"
  | "none";

export type LlmGoalsViewV02 =
  | "over_2_5"
  | "under_2_5"
  | "neutral";

export type LlmBttsViewV02 =
  | "yes"
  | "no"
  | "neutral";

export type LlmEvidenceQualityV02 =
  | "strong"
  | "moderate"
  | "weak"
  | "insufficient";

export type LlmEvidenceSideV02 =
  | "home"
  | "away"
  | "neutral";

export type LlmEvidenceFactV02 = {
  kind: string;

  side:
    LlmEvidenceSideV02;

  description:
    string;

  source:
    string;

  observedAt:
    string;
};

export type LlmAnalysisInputV02 = {
  fixture: {
    fixtureId:
      string;

    homeTeam:
      string;

    awayTeam:
      string;

    competition:
      string;

    kickoffAt:
      string;
  };

  evidence: {
    cutoffAt:
      string;

    facts:
      LlmEvidenceFactV02[];
  };
};

export type LlmAnalysisOutputV02 = {
  version:
    typeof LLM_ANALYSIS_VERSION_V02;

  assessment:
    LlmAssessmentV02;

  confidence:
    LlmConfidenceV02;

  resultSignalStrength:
    LlmSignalStrengthV02;

  goalsView:
    LlmGoalsViewV02;

  bttsView:
    LlmBttsViewV02;

  evidenceQuality:
    LlmEvidenceQualityV02;

  reasoningSummary:
    string[];

  contradictions:
    string[];

  missingInformation:
    string[];

  /*
   * GPT is an independent assessor.
   *
   * It can disagree with the mathematical
   * forecast, but it cannot mutate it.
   */
  modelOverride:
    false;

  /*
   * Probability remains unavailable until
   * DictazIQ has empirical calibration.
   */
  probability:
    null;
};

type UnknownRecord =
  Record<string, unknown>;

function isRecord(
  value:
    unknown,
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
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

function timestamp(
  value:
    unknown,
  label:
    string,
): Date {
  const parsed =
    new Date(
      nonEmptyString(
        value,
        label,
      ),
    );

  if (
    !Number.isFinite(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`,
    );
  }

  return parsed;
}

function stringArray(
  value:
    unknown,
  label:
    string,
  maximum:
    number,
  minimum = 0,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `${label} must be an array.`,
    );
  }

  if (
    value.length <
      minimum ||
    value.length >
      maximum
  ) {
    throw new Error(
      `${label} must contain between ${minimum} and ${maximum} items.`,
    );
  }

  return value.map(
    (
      item,
      index,
    ) =>
      nonEmptyString(
        item,
        `${label}[${index}]`,
      ),
  );
}

export function validateLlmAnalysisInputV02(
  input:
    LlmAnalysisInputV02,
): LlmAnalysisInputV02 {
  const fixtureId =
    nonEmptyString(
      input.fixture.fixtureId,
      "Fixture ID",
    );

  const homeTeam =
    nonEmptyString(
      input.fixture.homeTeam,
      "Home team",
    );

  const awayTeam =
    nonEmptyString(
      input.fixture.awayTeam,
      "Away team",
    );

  const competition =
    nonEmptyString(
      input.fixture.competition,
      "Competition",
    );

  if (
    homeTeam ===
    awayTeam
  ) {
    throw new Error(
      "Home and away teams must be different.",
    );
  }

  const kickoffAt =
    timestamp(
      input.fixture.kickoffAt,
      "Kickoff",
    );

  const cutoffAt =
    timestamp(
      input.evidence.cutoffAt,
      "Evidence cutoff",
    );

  if (
    cutoffAt.getTime() >=
    kickoffAt.getTime()
  ) {
    throw new Error(
      "LLM evidence cutoff must occur before kickoff.",
    );
  }

  if (
    !Array.isArray(
      input.evidence.facts,
    )
  ) {
    throw new Error(
      "LLM evidence facts must be an array.",
    );
  }

  if (
    input.evidence.facts.length >
    40
  ) {
    throw new Error(
      "LLM v0.2 accepts at most 40 evidence facts.",
    );
  }

  const facts =
    input.evidence.facts.map(
      (
        fact,
        index,
      ): LlmEvidenceFactV02 => {
        const kind =
          nonEmptyString(
            fact.kind,
            `Evidence ${index} kind`,
          );

        const source =
          nonEmptyString(
            fact.source,
            `Evidence ${index} source`,
          );

        const description =
          nonEmptyString(
            fact.description,
            `Evidence ${index} description`,
          );

        if (
          fact.side !==
            "home" &&
          fact.side !==
            "away" &&
          fact.side !==
            "neutral"
        ) {
          throw new Error(
            `Evidence ${index} has an invalid side.`,
          );
        }

        const observedAt =
          timestamp(
            fact.observedAt,
            `Evidence ${index} observedAt`,
          );

        if (
          observedAt.getTime() >
          cutoffAt.getTime()
        ) {
          throw new Error(
            `Evidence ${index} occurs after the LLM evidence cutoff.`,
          );
        }

        if (
          observedAt.getTime() >=
          kickoffAt.getTime()
        ) {
          throw new Error(
            `Evidence ${index} occurs at or after kickoff.`,
          );
        }

        return {
          kind,

          side:
            fact.side,

          description,

          source,

          observedAt:
            observedAt.toISOString(),
        };
      },
    );

  return {
    fixture: {
      fixtureId,

      homeTeam,

      awayTeam,

      competition,

      kickoffAt:
        kickoffAt.toISOString(),
    },

    evidence: {
      cutoffAt:
        cutoffAt.toISOString(),

      facts,
    },
  };
}

export function validateLlmAnalysisOutputV02(
  candidate:
    unknown,
): LlmAnalysisOutputV02 {
  if (
    !isRecord(
      candidate,
    )
  ) {
    throw new Error(
      "LLM v0.2 output must be a JSON object.",
    );
  }

  if (
    candidate.version !==
    LLM_ANALYSIS_VERSION_V02
  ) {
    throw new Error(
      "LLM v0.2 version is invalid.",
    );
  }

  const assessments =
    new Set<LlmAssessmentV02>([
      "home",
      "draw",
      "away",
      "no_pick",
    ]);

  const assessment =
    candidate.assessment;

  if (
    typeof assessment !==
      "string" ||
    !assessments.has(
      assessment as
        LlmAssessmentV02,
    )
  ) {
    throw new Error(
      "LLM assessment is invalid.",
    );
  }

  const confidences =
    new Set<LlmConfidenceV02>([
      "high",
      "medium",
      "low",
      "insufficient",
    ]);

  if (
    typeof candidate.confidence !==
      "string" ||
    !confidences.has(
      candidate.confidence as
        LlmConfidenceV02,
    )
  ) {
    throw new Error(
      "LLM confidence is invalid.",
    );
  }

  const strengths =
    new Set<LlmSignalStrengthV02>([
      "strong",
      "moderate",
      "weak",
      "none",
    ]);

  if (
    typeof candidate.resultSignalStrength !==
      "string" ||
    !strengths.has(
      candidate.resultSignalStrength as
        LlmSignalStrengthV02,
    )
  ) {
    throw new Error(
      "LLM result signal strength is invalid.",
    );
  }

  const goalsViews =
    new Set<LlmGoalsViewV02>([
      "over_2_5",
      "under_2_5",
      "neutral",
    ]);

  if (
    typeof candidate.goalsView !==
      "string" ||
    !goalsViews.has(
      candidate.goalsView as
        LlmGoalsViewV02,
    )
  ) {
    throw new Error(
      "LLM goals view is invalid.",
    );
  }

  const bttsViews =
    new Set<LlmBttsViewV02>([
      "yes",
      "no",
      "neutral",
    ]);

  if (
    typeof candidate.bttsView !==
      "string" ||
    !bttsViews.has(
      candidate.bttsView as
        LlmBttsViewV02,
    )
  ) {
    throw new Error(
      "LLM BTTS view is invalid.",
    );
  }

  const evidenceQualities =
    new Set<LlmEvidenceQualityV02>([
      "strong",
      "moderate",
      "weak",
      "insufficient",
    ]);

  if (
    typeof candidate.evidenceQuality !==
      "string" ||
    !evidenceQualities.has(
      candidate.evidenceQuality as
        LlmEvidenceQualityV02,
    )
  ) {
    throw new Error(
      "LLM evidence quality is invalid.",
    );
  }

  /*
   * Internal consistency:
   *
   * no_pick means the GPT layer did not find
   * enough evidence for a directional 1X2 view.
   */
  if (
    assessment ===
    "no_pick"
  ) {
    if (
      candidate.resultSignalStrength !==
      "none"
    ) {
      throw new Error(
        "LLM no_pick must use resultSignalStrength=none.",
      );
    }

    if (
      candidate.confidence !==
      "insufficient"
    ) {
      throw new Error(
        "LLM no_pick must use confidence=insufficient.",
      );
    }
  } else {
    if (
      candidate.resultSignalStrength ===
      "none"
    ) {
      throw new Error(
        "Directional LLM assessment cannot use resultSignalStrength=none.",
      );
    }

    if (
      candidate.confidence ===
      "insufficient"
    ) {
      throw new Error(
        "Directional LLM assessment cannot use confidence=insufficient.",
      );
    }
  }

  if (
    candidate.modelOverride !==
    false
  ) {
    throw new Error(
      "LLM modelOverride must remain false.",
    );
  }

  if (
    candidate.probability !==
    null
  ) {
    throw new Error(
      "LLM cannot fabricate a probability.",
    );
  }

  const reasoningSummary =
    stringArray(
      candidate.reasoningSummary,
      "reasoningSummary",
      8,
      1,
    );

  const contradictions =
    stringArray(
      candidate.contradictions,
      "contradictions",
      8,
    );

  const missingInformation =
    stringArray(
      candidate.missingInformation,
      "missingInformation",
      8,
    );

  return {
    version:
      LLM_ANALYSIS_VERSION_V02,

    assessment:
      assessment as
        LlmAssessmentV02,

    confidence:
      candidate.confidence as
        LlmConfidenceV02,

    resultSignalStrength:
      candidate.resultSignalStrength as
        LlmSignalStrengthV02,

    goalsView:
      candidate.goalsView as
        LlmGoalsViewV02,

    bttsView:
      candidate.bttsView as
        LlmBttsViewV02,

    evidenceQuality:
      candidate.evidenceQuality as
        LlmEvidenceQualityV02,

    reasoningSummary,

    contradictions,

    missingInformation,

    modelOverride:
      false,

    probability:
      null,
  };
}

export function buildLlmAnalysisPromptV02(
  input:
    LlmAnalysisInputV02,
): {
  system:
    string;

  user:
    string;
} {
  const validated =
    validateLlmAnalysisInputV02(
      input,
    );

  const system =
    [
      "You are the independent GPT football-analysis layer for DictazIQ.",
      "",
      "Analyze the football match using only the structured pre-match evidence supplied.",
      "Do not use external facts, unstated knowledge, live results, or post-match information.",
      "Do not invent injuries, lineups, statistics, tactical facts, form, ratings, or probabilities.",
      "",
      "Your assessment is independent of DictazIQ's mathematical engine.",
      "The mathematical forecast is deliberately NOT supplied to you.",
      "You may select home, draw, away, or no_pick.",
      "",
      "Assess the 1X2 result separately from goals and BTTS.",
      "A result view does not automatically imply a goals or BTTS view.",
      "",
      "Use no_pick when the supplied evidence is insufficient for a defensible 1X2 direction.",
      "Use neutral for goals or BTTS when the evidence does not support a direction.",
      "",
      "Do not produce numerical probabilities.",
      "probability MUST be null.",
      "modelOverride MUST be false.",
      "",
      "reasoningSummary must contain concise evidence-based conclusions, not hidden chain-of-thought.",
      "contradictions must contain only conflicts visible in supplied evidence.",
      "missingInformation should identify materially useful evidence that is absent.",
      "",
      "Return only JSON matching the required schema.",
    ].join(
      "\n",
    );

  const user =
    JSON.stringify(
      {
        contractVersion:
          LLM_ANALYSIS_VERSION_V02,

        fixture:
          validated.fixture,

        evidence:
          validated.evidence,

        requiredOutput: {
          version:
            LLM_ANALYSIS_VERSION_V02,

          assessment:
            "home | draw | away | no_pick",

          confidence:
            "high | medium | low | insufficient",

          resultSignalStrength:
            "strong | moderate | weak | none",

          goalsView:
            "over_2_5 | under_2_5 | neutral",

          bttsView:
            "yes | no | neutral",

          evidenceQuality:
            "strong | moderate | weak | insufficient",

          reasoningSummary: [
            "concise evidence-based conclusion",
          ],

          contradictions: [],

          missingInformation: [],

          modelOverride:
            false,

          probability:
            null,
        },
      },
      null,
      2,
    );

  return {
    system,
    user,
  };
}
export const GPT_RESEARCH_PREDICTION_VERSION_V02 =
  "dictaziq-gpt-research-prediction-v0.2" as const;

export type GptResearchSelectionV02 =
  | "home"
  | "draw"
  | "away";

export type GptResearchConfidenceV02 =
  | "high"
  | "medium"
  | "low"
  | "very_low";

export type GptResearchEvidenceGradeV02 =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E";

export type GptResearchPurposeV02 =
  | "fallback"
  | "scheduled_refresh"
  | "developing_news"
  | "confirmed_lineup"
  | "final_prematch";

export type GptResearchGoalsV02 =
  | "over_2_5"
  | "under_2_5"
  | "neutral";

export type GptResearchBttsV02 =
  | "yes"
  | "no"
  | "neutral";

export type GptResearchFactV02 = {
  kind: string;

  side:
    | "home"
    | "away"
    | "neutral";

  description: string;

  source: string;

  observedAt: string;
};

export type GptResearchPredictionInputV02 = {
  purpose:
    GptResearchPurposeV02;

  fixture: {
    fixtureId: string;

    homeTeam: string;

    awayTeam: string;

    competition: string;

    country:
      string |
      null;

    kickoffAt: string;
  };

  evidence: {
    cutoffAt: string;

    structuredFacts:
      GptResearchFactV02[];
  };
};

export type GptResearchPredictionOutputV02 = {
  version:
    typeof GPT_RESEARCH_PREDICTION_VERSION_V02;

  /*
   * No no_pick.
   *
   * Every fixture gets a directional 1X2
   * forecast.
   */
  selection:
    GptResearchSelectionV02;

  confidence:
    GptResearchConfidenceV02;

  evidenceGrade:
    GptResearchEvidenceGradeV02;

  goalsView:
    GptResearchGoalsV02;

  bttsView:
    GptResearchBttsV02;

  /*
   * Factors materially influencing the
   * independent GPT assessment.
   */
  materialFactors:
    string[];

  /*
   * Concise conclusions, not hidden reasoning.
   */
  reasoningSummary:
    string[];

  contradictions:
    string[];

  missingInformation:
    string[];

  /*
   * Remains null until DictazIQ has empirical
   * calibration.
   */
  probability: null;

  /*
   * GPT cannot directly mutate another model.
   */
  modelOverride: false;
};

type UnknownRecord =
  Record<
    string,
    unknown
  >;

function isRecord(
  value: unknown,
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

function requireString(
  value: unknown,
  label: string,
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

function requireTimestamp(
  value: unknown,
  label: string,
): string {
  const text =
    requireString(
      value,
      label,
    );

  const parsed =
    new Date(
      text,
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

  return parsed.toISOString();
}

function requireStringArray(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
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
      requireString(
        item,
        `${label}[${index}]`,
      ),
  );
}

export function validateGptResearchInputV02(
  input:
    GptResearchPredictionInputV02,
): GptResearchPredictionInputV02 {
  const purposes =
    new Set<
      GptResearchPurposeV02
    >([
      "fallback",
      "scheduled_refresh",
      "developing_news",
      "confirmed_lineup",
      "final_prematch",
    ]);

  if (
    !purposes.has(
      input.purpose,
    )
  ) {
    throw new Error(
      "GPT research purpose is invalid.",
    );
  }

  const fixtureId =
    requireString(
      input.fixture.fixtureId,
      "Fixture ID",
    );

  const homeTeam =
    requireString(
      input.fixture.homeTeam,
      "Home team",
    );

  const awayTeam =
    requireString(
      input.fixture.awayTeam,
      "Away team",
    );

  if (
    homeTeam ===
    awayTeam
  ) {
    throw new Error(
      "Home and away teams must be different.",
    );
  }

  const competition =
    requireString(
      input.fixture.competition,
      "Competition",
    );

  const kickoffAt =
    requireTimestamp(
      input.fixture.kickoffAt,
      "Kickoff",
    );

  const cutoffAt =
    requireTimestamp(
      input.evidence.cutoffAt,
      "Research cutoff",
    );

  if (
    Date.parse(
      cutoffAt,
    ) >=
    Date.parse(
      kickoffAt,
    )
  ) {
    throw new Error(
      "GPT research cutoff must be before kickoff.",
    );
  }

  if (
    !Array.isArray(
      input.evidence.structuredFacts,
    )
  ) {
    throw new Error(
      "GPT structured facts must be an array.",
    );
  }

  if (
    input.evidence
      .structuredFacts
      .length >
    50
  ) {
    throw new Error(
      "GPT research accepts at most 50 structured facts.",
    );
  }

  const structuredFacts =
    input.evidence
      .structuredFacts
      .map(
        (
          fact,
          index,
        ): GptResearchFactV02 => {
          if (
            fact.side !==
              "home" &&
            fact.side !==
              "away" &&
            fact.side !==
              "neutral"
          ) {
            throw new Error(
              `Structured fact ${index} has an invalid side.`,
            );
          }

          const observedAt =
            requireTimestamp(
              fact.observedAt,
              `Structured fact ${index} observedAt`,
            );

          if (
            Date.parse(
              observedAt,
            ) >
            Date.parse(
              cutoffAt,
            )
          ) {
            throw new Error(
              `Structured fact ${index} occurs after the research cutoff.`,
            );
          }

          if (
            Date.parse(
              observedAt,
            ) >=
            Date.parse(
              kickoffAt,
            )
          ) {
            throw new Error(
              `Structured fact ${index} occurs at or after kickoff.`,
            );
          }

          return {
            kind:
              requireString(
                fact.kind,
                `Structured fact ${index} kind`,
              ),

            side:
              fact.side,

            description:
              requireString(
                fact.description,
                `Structured fact ${index} description`,
              ),

            source:
              requireString(
                fact.source,
                `Structured fact ${index} source`,
              ),

            observedAt,
          };
        },
      );

  return {
    purpose:
      input.purpose,

    fixture: {
      fixtureId,

      homeTeam,

      awayTeam,

      competition,

      country:
        input.fixture.country ===
          null
          ? null
          : requireString(
              input.fixture.country,
              "Country",
            ),

      kickoffAt,
    },

    evidence: {
      cutoffAt,

      structuredFacts,
    },
  };
}

export function validateGptResearchOutputV02(
  candidate: unknown,
): GptResearchPredictionOutputV02 {
  if (
    !isRecord(
      candidate,
    )
  ) {
    throw new Error(
      "GPT research output must be an object.",
    );
  }

  if (
    candidate.version !==
    GPT_RESEARCH_PREDICTION_VERSION_V02
  ) {
    throw new Error(
      "GPT research version is invalid.",
    );
  }

  const selections =
    new Set<
      GptResearchSelectionV02
    >([
      "home",
      "draw",
      "away",
    ]);

  if (
    typeof candidate.selection !==
      "string" ||
    !selections.has(
      candidate.selection as
        GptResearchSelectionV02,
    )
  ) {
    throw new Error(
      "GPT must produce HOME, DRAW or AWAY.",
    );
  }

  const confidences =
    new Set<
      GptResearchConfidenceV02
    >([
      "high",
      "medium",
      "low",
      "very_low",
    ]);

  if (
    typeof candidate.confidence !==
      "string" ||
    !confidences.has(
      candidate.confidence as
        GptResearchConfidenceV02,
    )
  ) {
    throw new Error(
      "GPT research confidence is invalid.",
    );
  }

  const grades =
    new Set<
      GptResearchEvidenceGradeV02
    >([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);

  if (
    typeof candidate.evidenceGrade !==
      "string" ||
    !grades.has(
      candidate.evidenceGrade as
        GptResearchEvidenceGradeV02,
    )
  ) {
    throw new Error(
      "GPT research evidence grade is invalid.",
    );
  }

  const goals =
    new Set<
      GptResearchGoalsV02
    >([
      "over_2_5",
      "under_2_5",
      "neutral",
    ]);

  if (
    typeof candidate.goalsView !==
      "string" ||
    !goals.has(
      candidate.goalsView as
        GptResearchGoalsV02,
    )
  ) {
    throw new Error(
      "GPT goals view is invalid.",
    );
  }

  const btts =
    new Set<
      GptResearchBttsV02
    >([
      "yes",
      "no",
      "neutral",
    ]);

  if (
    typeof candidate.bttsView !==
      "string" ||
    !btts.has(
      candidate.bttsView as
        GptResearchBttsV02,
    )
  ) {
    throw new Error(
      "GPT BTTS view is invalid.",
    );
  }

  if (
    candidate.probability !==
    null
  ) {
    throw new Error(
      "GPT research cannot fabricate a probability.",
    );
  }

  if (
    candidate.modelOverride !==
    false
  ) {
    throw new Error(
      "GPT research modelOverride must remain false.",
    );
  }

  return {
    version:
      GPT_RESEARCH_PREDICTION_VERSION_V02,

    selection:
      candidate.selection as
        GptResearchSelectionV02,

    confidence:
      candidate.confidence as
        GptResearchConfidenceV02,

    evidenceGrade:
      candidate.evidenceGrade as
        GptResearchEvidenceGradeV02,

    goalsView:
      candidate.goalsView as
        GptResearchGoalsV02,

    bttsView:
      candidate.bttsView as
        GptResearchBttsV02,

    materialFactors:
      requireStringArray(
        candidate.materialFactors,
        "materialFactors",
        1,
        12,
      ),

    reasoningSummary:
      requireStringArray(
        candidate.reasoningSummary,
        "reasoningSummary",
        1,
        8,
      ),

    contradictions:
      requireStringArray(
        candidate.contradictions,
        "contradictions",
        0,
        8,
      ),

    missingInformation:
      requireStringArray(
        candidate.missingInformation,
        "missingInformation",
        0,
        8,
      ),

    probability:
      null,

    modelOverride:
      false,
  };
}

export type GptResearchPromptCapabilitiesV02 = {
  webSearchAvailable:
    boolean;
};

export function buildGptResearchPromptV02(
  input:
    GptResearchPredictionInputV02,

 capabilities:
    GptResearchPromptCapabilitiesV02 = {
      webSearchAvailable:
        true,
    },
): {
  system: string;

  user: string;
} {
  const validated =
    validateGptResearchInputV02(
      input,
    );

const cutoffMs =
  Date.parse(
    validated.evidence.cutoffAt,
  );

const kickoffMs =
  Date.parse(
    validated.fixture.kickoffAt,
  );

const minutesUntilKickoff =
  Math.round(
    (
      kickoffMs -
      cutoffMs
    ) /
      60_000,
  );

const hoursUntilKickoff =
  Number(
    (
      minutesUntilKickoff /
      60
    ).toFixed(
      2,
    ),
  );

  const system =
    [
      "You are the DictazIQ GPT Research Prediction Engine.",
      "",
      "Your task is to independently forecast a football match before kickoff.",

      "TEMPORAL GROUNDING:",
"evidence.cutoffAt is the authoritative current analysis time for this prediction.",
"fixture.kickoffAt is the authoritative scheduled kickoff time.",
"Never substitute your own internal current date, training cutoff, system date or assumed present time.",
"Judge whether information is current, stale, pre-match or future only relative to evidence.cutoffAt.",
"Never use information observed after evidence.cutoffAt.",
"Never use in-play or post-match information.",
"",
      "",
      ...(
  capabilities
    .webSearchAvailable
    ? [
        "RESEARCH REQUIREMENTS:",
        "Actively search the web for current, relevant pre-match information.",
        "Use the structured evidence supplied by DictazIQ together with reliable web research.",
        "Prefer official clubs, leagues, federations and competition organizers.",
        "Then use reputable sports and news sources.",
        "Use betting-tip sites, prediction sites and bookmaker opinions only as weak contextual material, never as the basis of the forecast.",
        "Resolve conflicting reports where possible.",
        "",
      ]
    : [
        "ANALYSIS REQUIREMENTS:",
        "Native web search is not available in this provider invocation.",
        "Do not claim to have searched or verified information on the web.",
        "Use the structured evidence supplied by DictazIQ as the authoritative current evidence package.",
        "General football knowledge may be used only as a weak prior and must not be presented as verified current information.",
        "Treat unsupported current form, injuries, lineups, suspensions, standings or manager comments as missing information.",
        "Never say current information was unavailable, absent or did not exist unless the supplied evidence establishes that fact.",
"Instead say it was not supplied, not verified or not present in the DictazIQ evidence package.",
        "",
      ]
),
      "FOOTBALL INFORMATION TO CONSIDER WHEN AVAILABLE:",
      "recent results and current form;",
      "home and away performance;",
      "goals scored and conceded;",
      "shots, shots on target, xG and xGA when reliable;",
      "league or competition position;",
      "strength of recent opposition;",
      "injuries and suspensions;",
      "player availability;",
      "confirmed starting lineups;",
      "formations and likely tactical structure;",
      "rotation and fixture congestion;",
      "rest and travel;",
      "manager comments;",
      "competition importance and match context;",
      "reliable team and player news;",
      "and other materially relevant pre-match football information.",
      "",
      "CONFIRMED LINEUPS:",
      "When confirmed starting lineups are available, treat them as high-value evidence.",
      "Assess major omissions, unexpected starters, goalkeeper changes, defensive changes, attacking changes, formation changes and rotation.",
      "Do not assume that a larger number of absences automatically makes a team weaker; consider player and tactical importance.",
      "",
      "INDEPENDENCE:",
      "You are independent of the DictazIQ mathematical forecast.",
      "The mathematical selection is deliberately not supplied to you.",
      "Do not attempt to infer or reproduce another DictazIQ model.",
      "",
      "MANDATORY FORECAST:",
      "You MUST choose exactly one 1X2 result: home, draw or away.",
      "There is no no_pick option.",
      "If evidence is sparse or contradictory, still choose the most defensible direction and reduce confidence to very_low and evidenceGrade toward D or E.",
      "",
      "MARKETS:",
      "Assess the 1X2 result independently from goals and BTTS.",
      "Use neutral when goals or BTTS evidence is not adequate.",
      "",
      "INTEGRITY:",
      "Never use post-match or in-play information.",
      "Never invent injuries, statistics, lineups, quotations or sources.",
      "Never invent a numerical probability.",
      "probability MUST be null.",
      "modelOverride MUST be false.",
      "",
      "reasoningSummary must contain concise conclusions, not hidden chain-of-thought.",
      "Return only valid JSON matching the required schema.",
    ].join(
      "\n",
    );

  const user =
    JSON.stringify(
      {
        contractVersion:
          GPT_RESEARCH_PREDICTION_VERSION_V02,

        purpose:
          validated.purpose,

        fixture:
  validated.fixture,

temporalContext: {
  authoritativeAnalysisTime:
    validated.evidence.cutoffAt,

  kickoffTime:
    validated.fixture.kickoffAt,

  minutesUntilKickoff,

  hoursUntilKickoff,
},

evidence:
  validated.evidence,

        requiredOutput: {
          version:
            GPT_RESEARCH_PREDICTION_VERSION_V02,

          selection:
            "home | draw | away",

          confidence:
            "high | medium | low | very_low",

          evidenceGrade:
            "A | B | C | D | E",

          goalsView:
            "over_2_5 | under_2_5 | neutral",

          bttsView:
            "yes | no | neutral",

          materialFactors: [
            "material football factor",
          ],

          reasoningSummary: [
            "concise evidence-based conclusion",
          ],

          contradictions: [],

          missingInformation: [],

          probability:
            null,

          modelOverride:
            false,
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

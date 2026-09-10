import type {
  GptResearchPredictionOutputV01,
} from "./gpt-research-prediction-v0.1";

export const RESEARCH_SOURCE_POLICY_VERSION_V01 =
  "dictaziq-research-source-policy-v0.1" as const;

export type ResearchSourceTierV01 =
  | "official_primary"
  | "reputable_secondary"
  | "supplemental"
  | "prediction_tipster";

export type ResearchSourceInputV01 = {
  url: string;

  title:
    string |
    null;
};

export type ClassifiedResearchSourceV01 = {
  url: string;

  title:
    string |
    null;

  hostname: string;

  tier:
    ResearchSourceTierV01;

  mayDriveForecast:
    boolean;
};

export type ResearchSourcePolicyResultV01 = {
  version:
    typeof RESEARCH_SOURCE_POLICY_VERSION_V01;

  sources:
    ClassifiedResearchSourceV01[];

  counts: {
    structuredFacts: number;

    officialPrimary: number;

    reputableSecondary: number;

    supplemental: number;

    predictionTipster: number;
  };

  confidenceCap:
    | "high"
    | "medium"
    | "low"
    | "very_low";

  evidenceGradeCap:
    | "A"
    | "B"
    | "C"
    | "D"
    | "E";

  prediction:
    GptResearchPredictionOutputV01;

  downgraded:
    boolean;

  notes:
    string[];
};

const OFFICIAL_DOMAINS = [
  "fifa.com",
  "uefa.com",
  "cafonline.com",
  "the-afc.com",
  "concacaf.com",
  "conmebol.com",
  "premierleague.com",
  "laliga.com",
  "bundesliga.com",
  "legaseriea.it",
  "ligue1.com",
  "thefa.com",
] as const;

const REPUTABLE_SECONDARY_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "espn.com",
  "skysports.com",
  "theathletic.com",
  "goal.com",
] as const;

const TIPSTER_PATTERNS = [
  "betmines",
  "forebet",
  "predictz",
  "sportytrader",
  "windrawwin",
  "bettingexpert",
  "betting",
  "predictions",
  "prediction",
  "footballtips",
  "soccertips",
  "oddschecker",
] as const;

function hostnameFromUrl(
  url:
    string,
): string {
  try {
    return new URL(
      url,
    )
      .hostname
      .toLowerCase()
      .replace(
        /^www\./,
        "",
      );
  } catch {
    return "";
  }
}

function domainMatches(
  hostname:
    string,

  expected:
    string,
): boolean {
  return (
    hostname ===
      expected ||
    hostname.endsWith(
      `.${expected}`,
    )
  );
}

function isTipsterDomain(
  hostname:
    string,
): boolean {
  return TIPSTER_PATTERNS.some(
    (
      pattern,
    ) =>
      hostname.includes(
        pattern,
      ),
  );
}

export function classifyResearchSourceV01(
  source:
    ResearchSourceInputV01,
): ClassifiedResearchSourceV01 {
  const hostname =
    hostnameFromUrl(
      source.url,
    );

  let tier:
    ResearchSourceTierV01 =
      "supplemental";

  if (
    isTipsterDomain(
      hostname,
    )
  ) {
    tier =
      "prediction_tipster";
  } else if (
    OFFICIAL_DOMAINS.some(
      (
        domain,
      ) =>
        domainMatches(
          hostname,
          domain,
        ),
    )
  ) {
    tier =
      "official_primary";
  } else if (
    REPUTABLE_SECONDARY_DOMAINS.some(
      (
        domain,
      ) =>
        domainMatches(
          hostname,
          domain,
        ),
    )
  ) {
    tier =
      "reputable_secondary";
  }

  return {
    url:
      source.url,

    title:
      source.title,

    hostname,

    tier,

    mayDriveForecast:
      tier !==
      "prediction_tipster",
  };
}

const confidenceOrder = {
  high: 0,
  medium: 1,
  low: 2,
  very_low: 3,
} as const;

const evidenceOrder = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
} as const;

function capConfidence(
  current:
    GptResearchPredictionOutputV01["confidence"],

  cap:
    GptResearchPredictionOutputV01["confidence"],
):
  GptResearchPredictionOutputV01["confidence"] {
  return confidenceOrder[
    current
  ] >=
    confidenceOrder[
      cap
    ]
    ? current
    : cap;
}

function capEvidenceGrade(
  current:
    GptResearchPredictionOutputV01["evidenceGrade"],

  cap:
    GptResearchPredictionOutputV01["evidenceGrade"],
):
  GptResearchPredictionOutputV01["evidenceGrade"] {
  return evidenceOrder[
    current
  ] >=
    evidenceOrder[
      cap
    ]
    ? current
    : cap;
}

export function applyResearchSourcePolicyV01(
  prediction:
    GptResearchPredictionOutputV01,

  webSources:
    readonly ResearchSourceInputV01[],

  structuredFactCount:
    number,
): ResearchSourcePolicyResultV01 {
  if (
    !Number.isInteger(
      structuredFactCount,
    ) ||
    structuredFactCount <
      0
  ) {
    throw new Error(
      "Structured fact count must be a non-negative integer.",
    );
  }

  const sources =
    webSources.map(
      classifyResearchSourceV01,
    );

  const officialPrimary =
    sources.filter(
      (
        source,
      ) =>
        source.tier ===
        "official_primary",
    ).length;

  const reputableSecondary =
    sources.filter(
      (
        source,
      ) =>
        source.tier ===
        "reputable_secondary",
    ).length;

  const supplemental =
    sources.filter(
      (
        source,
      ) =>
        source.tier ===
        "supplemental",
    ).length;

  const predictionTipster =
    sources.filter(
      (
        source,
      ) =>
        source.tier ===
        "prediction_tipster",
    ).length;

  let confidenceCap:
    GptResearchPredictionOutputV01["confidence"] =
      "very_low";

  let evidenceGradeCap:
    GptResearchPredictionOutputV01["evidenceGrade"] =
      "E";

  const notes:
    string[] = [];

  /*
   * Structured provider/database evidence or
   * an official source permits the model's
   * assessed strength to stand.
   */
  if (
    structuredFactCount >
      0 ||
    officialPrimary >
      0
  ) {
    confidenceCap =
      "high";

    evidenceGradeCap =
      "A";

    notes.push(
      "Structured or official-source evidence is available.",
    );
  } else if (
    reputableSecondary >=
    2
  ) {
    confidenceCap =
      "medium";

    evidenceGradeCap =
      "B";

    notes.push(
      "Multiple reputable secondary sources are available.",
    );
  } else if (
    reputableSecondary ===
      1
  ) {
    confidenceCap =
      "low";

    evidenceGradeCap =
      "C";

    notes.push(
      "Only one recognized reputable secondary source is available.",
    );
  } else if (
    supplemental >=
      2
  ) {
    confidenceCap =
      "low";

    evidenceGradeCap =
      "D";

    notes.push(
      "Research is supported primarily by supplemental sources.",
    );
  } else {
    confidenceCap =
      "very_low";

    evidenceGradeCap =
      "E";

    notes.push(
      "No sufficiently strong independent source base was identified.",
    );
  }

  if (
    predictionTipster >
    0
  ) {
    notes.push(
      `${predictionTipster} prediction/tipster source(s) retained for provenance but excluded from primary evidential authority.`,
    );
  }

  const effectiveConfidence =
    capConfidence(
      prediction.confidence,
      confidenceCap,
    );

  const effectiveEvidenceGrade =
    capEvidenceGrade(
      prediction.evidenceGrade,
      evidenceGradeCap,
    );

  const downgraded =
    effectiveConfidence !==
      prediction.confidence ||
    effectiveEvidenceGrade !==
      prediction.evidenceGrade;

  return {
    version:
      RESEARCH_SOURCE_POLICY_VERSION_V01,

    sources,

    counts: {
      structuredFacts:
        structuredFactCount,

      officialPrimary,

      reputableSecondary,

      supplemental,

      predictionTipster,
    },

    confidenceCap,

    evidenceGradeCap,

    prediction: {
      ...prediction,

      confidence:
        effectiveConfidence,

      evidenceGrade:
        effectiveEvidenceGrade,
    },

    downgraded,

    notes,
  };
}
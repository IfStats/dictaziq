import type {
  ClassifiedResearchSourceV01,
} from "../ai/research-source-policy-v0.1";

import type {
  ForecastConfidenceV01,
  ForecastEvidenceGradeV01,
  ForecastLineupStateV01,
  ForecastSelectionV01,
} from "./forecast-revision-v0.1";

import type {
  GptResearchBttsV01,
  GptResearchFactV01,
  GptResearchGoalsV01,
  GptResearchPurposeV01,
} from "../ai/gpt-research-prediction-v0.1";

export const PREMATCH_REVISION_MATERIALITY_VERSION_V01 =
  "dictaziq-prematch-revision-materiality-v0.1" as const;

const SOFT_REVISION_COOLDOWN_MINUTES =
  15;

export type MaterialityForecastV01 = {
  selection:
    ForecastSelectionV01;

  confidence:
    ForecastConfidenceV01;

  evidenceGrade:
    ForecastEvidenceGradeV01;

  goalsView:
    GptResearchGoalsV01;

  bttsView:
    GptResearchBttsV01;

  lineupState:
    ForecastLineupStateV01;
};

export type PreviousRevisionEvidenceV01 = {
  publishedAt:
    string;

  structuredFacts:
    GptResearchFactV01[];

  webSources:
    ClassifiedResearchSourceV01[];
};

export type CurrentRevisionEvidenceV01 = {
  evaluatedAt:
    string;

  purpose:
    GptResearchPurposeV01;

  confirmedLineups:
    boolean;

  structuredFacts:
    GptResearchFactV01[];

  webSources:
    ClassifiedResearchSourceV01[];
};

export type PrematchRevisionMaterialityResultV01 = {
  version:
    typeof PREMATCH_REVISION_MATERIALITY_VERSION_V01;

  shouldRevise:
    boolean;

  hardTrigger:
    boolean;

  softTrigger:
    boolean;

  evidenceAdvanced:
    boolean;

  structuredEvidenceChanged:
    boolean;

  authoritativeWebEvidenceChanged:
    boolean;

  cooldownSatisfied:
    boolean;

  changes:
    string[];

  suppressionReasons:
    string[];
};

function timestampMs(
  value:
    string,

  label:
    string,
): number {
  const result =
    Date.parse(
      value,
    );

  if (
    !Number.isFinite(
      result,
    )
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`,
    );
  }

  return result;
}

function normalizedFactKey(
  fact:
    GptResearchFactV01,
): string {
  /*
   * observedAt is intentionally excluded.
   *
   * Re-fetching the same injury information at a
   * later clock time must not make it "new evidence".
   */
  return [
    fact.kind
      .trim()
      .toLowerCase(),

    fact.side,

    fact.source
      .trim()
      .toLowerCase(),

    fact.description
      .trim()
      .replace(
        /\s+/g,
        " ",
      )
      .toLowerCase(),
  ].join(
    "|",
  );
}

function normalizedFactSet(
  facts:
    readonly GptResearchFactV01[],
): Set<string> {
  return new Set(
    facts.map(
      normalizedFactKey,
    ),
  );
}

function normalizeUrl(
  value:
    string,
): string {
  try {
    const url =
      new URL(
        value,
      );

    url.hash =
      "";

    /*
     * Search/tracking parameters should not make
     * one article appear to be a new source.
     */
    url.search =
      "";

    return url
      .toString()
      .replace(
        /\/$/,
        "",
      )
      .toLowerCase();
  } catch {
    return value
      .trim()
      .toLowerCase();
  }
}

function authoritativeSourceKey(
  source:
    ClassifiedResearchSourceV01,
):
  string |
  null {
  if (
    source.tier !==
      "official_primary" &&
    source.tier !==
      "reputable_secondary"
  ) {
    return null;
  }

  return normalizeUrl(
    source.url,
  );
}

function authoritativeSourceSet(
  sources:
    readonly ClassifiedResearchSourceV01[],
): Set<string> {
  const result =
    new Set<string>();

  for (
    const source
    of sources
  ) {
    const key =
      authoritativeSourceKey(
        source,
      );

    if (
      key
    ) {
      result.add(
        key,
      );
    }
  }

  return result;
}

function hasNewItems(
  previous:
    Set<string>,

  current:
    Set<string>,
): boolean {
  for (
    const value
    of current
  ) {
    if (
      !previous.has(
        value,
      )
    ) {
      return true;
    }
  }

  return false;
}

function setsDiffer(
  left:
    Set<string>,

  right:
    Set<string>,
): boolean {
  if (
    left.size !==
    right.size
  ) {
    return true;
  }

  for (
    const value
    of left
  ) {
    if (
      !right.has(
        value,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function evaluatePrematchRevisionMaterialityV01(
  previousForecast:
    MaterialityForecastV01,

  nextForecast:
    MaterialityForecastV01,

  previousEvidence:
    PreviousRevisionEvidenceV01,

  currentEvidence:
    CurrentRevisionEvidenceV01,
): PrematchRevisionMaterialityResultV01 {
  const changes:
    string[] = [];

  const suppressionReasons:
    string[] = [];

  const selectionChanged =
    previousForecast.selection !==
    nextForecast.selection;

  const newlyConfirmedLineups =
    currentEvidence.confirmedLineups &&
    previousForecast.lineupState !==
      "confirmed";

  const confidenceChanged =
    previousForecast.confidence !==
    nextForecast.confidence;

  const evidenceGradeChanged =
    previousForecast.evidenceGrade !==
    nextForecast.evidenceGrade;

  const goalsChanged =
    previousForecast.goalsView !==
    nextForecast.goalsView;

  const bttsChanged =
    previousForecast.bttsView !==
    nextForecast.bttsView;

  if (
    selectionChanged
  ) {
    changes.push(
      `1X2 forecast changed from ${previousForecast.selection} to ${nextForecast.selection}.`,
    );
  }

  if (
    confidenceChanged
  ) {
    changes.push(
      `Confidence changed from ${previousForecast.confidence} to ${nextForecast.confidence}.`,
    );
  }

  if (
    evidenceGradeChanged
  ) {
    changes.push(
      `Evidence grade changed from ${previousForecast.evidenceGrade} to ${nextForecast.evidenceGrade}.`,
    );
  }

  if (
    goalsChanged
  ) {
    changes.push(
      `Goals view changed from ${previousForecast.goalsView} to ${nextForecast.goalsView}.`,
    );
  }

  if (
    bttsChanged
  ) {
    changes.push(
      `BTTS view changed from ${previousForecast.bttsView} to ${nextForecast.bttsView}.`,
    );
  }

  if (
    newlyConfirmedLineups
  ) {
    changes.push(
      "Both confirmed starting lineups became available.",
    );
  }

  const previousFacts =
    normalizedFactSet(
      previousEvidence
        .structuredFacts,
    );

  const currentFacts =
    normalizedFactSet(
      currentEvidence
        .structuredFacts,
    );

  const structuredEvidenceChanged =
    setsDiffer(
      previousFacts,
      currentFacts,
    );

  const previousAuthoritativeSources =
    authoritativeSourceSet(
      previousEvidence
        .webSources,
    );

  const currentAuthoritativeSources =
    authoritativeSourceSet(
      currentEvidence
        .webSources,
    );

  const authoritativeWebEvidenceChanged =
    hasNewItems(
      previousAuthoritativeSources,
      currentAuthoritativeSources,
    );

  const evidenceAdvanced =
    structuredEvidenceChanged ||
    authoritativeWebEvidenceChanged;

  const elapsedMinutes =
    (
      timestampMs(
        currentEvidence.evaluatedAt,
        "Evaluation time",
      ) -
      timestampMs(
        previousEvidence.publishedAt,
        "Previous publication time",
      )
    ) /
    60_000;

  const cooldownSatisfied =
    elapsedMinutes >=
    SOFT_REVISION_COOLDOWN_MINUTES;

  /*
   * HARD TRIGGERS
   *
   * These bypass cooldown because waiting could
   * leave an obsolete public match result forecast.
   */
  const hardTrigger =
    selectionChanged ||
    newlyConfirmedLineups;

  /*
   * SOFT TRIGGERS
   *
   * Confidence, evidence grade and secondary
   * market changes are not sufficient by
   * themselves.
   *
   * There must also be genuinely newer evidence.
   */
  const softForecastChanged =
    confidenceChanged ||
    evidenceGradeChanged ||
    goalsChanged ||
    bttsChanged;

  const finalPrematch =
    currentEvidence.purpose ===
      "final_prematch";

  const softTrigger =
    !hardTrigger &&
    softForecastChanged &&
    evidenceAdvanced &&
    (
      cooldownSatisfied ||
      finalPrematch
    );

  if (
    softForecastChanged &&
    !evidenceAdvanced &&
    !hardTrigger
  ) {
    suppressionReasons.push(
      "Forecast strength changed without genuinely newer structured or authoritative evidence.",
    );
  }

  if (
    softForecastChanged &&
    evidenceAdvanced &&
    !cooldownSatisfied &&
    !finalPrematch &&
    !hardTrigger
  ) {
    suppressionReasons.push(
      `Soft revision suppressed by ${SOFT_REVISION_COOLDOWN_MINUTES}-minute revision cooldown.`,
    );
  }

  if (
    changes.length ===
      0
  ) {
    suppressionReasons.push(
      "No forecast field changed.",
    );
  }

  return {
    version:
      PREMATCH_REVISION_MATERIALITY_VERSION_V01,

    shouldRevise:
      hardTrigger ||
      softTrigger,

    hardTrigger,

    softTrigger,

    evidenceAdvanced,

    structuredEvidenceChanged,

    authoritativeWebEvidenceChanged,

    cooldownSatisfied,

    changes,

    suppressionReasons,
  };
}
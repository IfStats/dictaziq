export const FORECAST_REVISION_VERSION_V01 =
  "dictaziq-forecast-revision-v0.1" as const;

export type ForecastSelectionV01 =
  | "home"
  | "draw"
  | "away";

export type ForecastConfidenceV01 =
  | "high"
  | "medium"
  | "low"
  | "very_low";

export type ForecastEvidenceGradeV01 =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E";

export type ForecastEngineV01 =
  | "mathematical"
  | "gpt_research"
  | "fusion";

export type ForecastRevisionReasonV01 =
  | "scheduled_refresh"
  | "developing_news"
  | "confirmed_lineup"
  | "final_prematch";

export type ForecastLineupStateV01 =
  | "unavailable"
  | "unconfirmed"
  | "confirmed";

export interface BaselineForecastV01 {
  predictionId: string;

  fixtureId: string;

  kickoffAt: string;

  inputCutoffAt: string;

  generatedAt: string;

  publishedAt: string;

  selection:
    ForecastSelectionV01;

  confidence:
    ForecastConfidenceV01;

  evidenceGrade:
    ForecastEvidenceGradeV01;

  engine:
    ForecastEngineV01;

  engineVersion: string;

  probability: null;
}

export interface ForecastRevisionInputV01 {
  baselinePredictionId: string;

  fixtureId: string;

  revisionNumber: number;

  reason:
    ForecastRevisionReasonV01;

  engine:
    ForecastEngineV01;

  engineVersion: string;

  lineupState:
    ForecastLineupStateV01;

  kickoffAt: string;

  inputCutoffAt: string;

  generatedAt: string;

  publishedAt:
    string |
    null;

  selection:
    ForecastSelectionV01;

  confidence:
    ForecastConfidenceV01;

  evidenceGrade:
    ForecastEvidenceGradeV01;

  materialChanges:
    string[];

  probability: null;
}

export interface ValidatedForecastRevisionV01
  extends ForecastRevisionInputV01 {
  version:
    typeof FORECAST_REVISION_VERSION_V01;
}

export interface ActiveForecastV01 {
  fixtureId: string;

  baselinePredictionId: string;

  source:
    "baseline" |
    "revision";

  revisionNumber:
    number | null;

  selection:
    ForecastSelectionV01;

  confidence:
    ForecastConfidenceV01;

  evidenceGrade:
    ForecastEvidenceGradeV01;

  engine:
    ForecastEngineV01;

  engineVersion:
    string;

  inputCutoffAt:
    string;

  publishedAt:
    string;

  probability:
    null;
}

function nonEmpty(
  value: string,
  label: string,
): string {
  const cleaned =
    value.trim();

  if (!cleaned) {
    throw new Error(
      `${label} cannot be empty.`,
    );
  }

  return cleaned;
}

function parseTimestamp(
  value: string,
  label: string,
): Date {
  const parsed =
    new Date(
      value,
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

function normalizeTimestamp(
  value: string,
  label: string,
): string {
  return parseTimestamp(
    value,
    label,
  ).toISOString();
}

function validateSelection(
  value:
    ForecastSelectionV01,
): ForecastSelectionV01 {
  if (
    value !== "home" &&
    value !== "draw" &&
    value !== "away"
  ) {
    throw new Error(
      "Forecast selection is invalid.",
    );
  }

  return value;
}

function validateConfidence(
  value:
    ForecastConfidenceV01,
): ForecastConfidenceV01 {
  if (
    value !== "high" &&
    value !== "medium" &&
    value !== "low" &&
    value !== "very_low"
  ) {
    throw new Error(
      "Forecast confidence is invalid.",
    );
  }

  return value;
}

function validateEvidenceGrade(
  value:
    ForecastEvidenceGradeV01,
): ForecastEvidenceGradeV01 {
  if (
    value !== "A" &&
    value !== "B" &&
    value !== "C" &&
    value !== "D" &&
    value !== "E"
  ) {
    throw new Error(
      "Forecast evidence grade is invalid.",
    );
  }

  return value;
}

function validateEngine(
  value:
    ForecastEngineV01,
): ForecastEngineV01 {
  if (
    value !== "mathematical" &&
    value !== "gpt_research" &&
    value !== "fusion"
  ) {
    throw new Error(
      "Forecast engine is invalid.",
    );
  }

  return value;
}

function validateReason(
  value:
    ForecastRevisionReasonV01,
): ForecastRevisionReasonV01 {
  if (
    value !== "scheduled_refresh" &&
    value !== "developing_news" &&
    value !== "confirmed_lineup" &&
    value !== "final_prematch"
  ) {
    throw new Error(
      "Forecast revision reason is invalid.",
    );
  }

  return value;
}

function validateLineupState(
  value:
    ForecastLineupStateV01,
): ForecastLineupStateV01 {
  if (
    value !== "unavailable" &&
    value !== "unconfirmed" &&
    value !== "confirmed"
  ) {
    throw new Error(
      "Forecast lineup state is invalid.",
    );
  }

  return value;
}

function validateMaterialChanges(
  values:
    string[],
): string[] {
  if (
    !Array.isArray(
      values,
    ) ||
    values.length === 0
  ) {
    throw new Error(
      "A forecast revision requires at least one material change.",
    );
  }

  if (
    values.length > 20
  ) {
    throw new Error(
      "A forecast revision may contain at most 20 material changes.",
    );
  }

  return values.map(
    (
      value,
      index,
    ) =>
      nonEmpty(
        value,
        `Material change ${index}`,
      ),
  );
}

export function validateBaselineForecastV01(
  baseline:
    BaselineForecastV01,
): BaselineForecastV01 {
  const kickoffAt =
    normalizeTimestamp(
      baseline.kickoffAt,
      "Baseline kickoff",
    );

  const inputCutoffAt =
    normalizeTimestamp(
      baseline.inputCutoffAt,
      "Baseline input cutoff",
    );

  const generatedAt =
    normalizeTimestamp(
      baseline.generatedAt,
      "Baseline generated time",
    );

  const publishedAt =
    normalizeTimestamp(
      baseline.publishedAt,
      "Baseline publication time",
    );

  const kickoffMs =
    Date.parse(
      kickoffAt,
    );

  const cutoffMs =
    Date.parse(
      inputCutoffAt,
    );

  const generatedMs =
    Date.parse(
      generatedAt,
    );

  const publishedMs =
    Date.parse(
      publishedAt,
    );

  if (
    cutoffMs >
    generatedMs
  ) {
    throw new Error(
      "Baseline input cutoff cannot occur after generation.",
    );
  }

  if (
    generatedMs >=
    kickoffMs
  ) {
    throw new Error(
      "Baseline generation must occur before kickoff.",
    );
  }

  if (
    publishedMs <
    generatedMs
  ) {
    throw new Error(
      "Baseline publication cannot occur before generation.",
    );
  }

  if (
    publishedMs >=
    kickoffMs
  ) {
    throw new Error(
      "Baseline publication must occur before kickoff.",
    );
  }

  if (
    baseline.probability !==
    null
  ) {
    throw new Error(
      "Uncalibrated baseline probability must remain null.",
    );
  }

  return {
    predictionId:
      nonEmpty(
        baseline.predictionId,
        "Baseline prediction ID",
      ),

    fixtureId:
      nonEmpty(
        baseline.fixtureId,
        "Baseline fixture ID",
      ),

    kickoffAt,

    inputCutoffAt,

    generatedAt,

    publishedAt,

    selection:
      validateSelection(
        baseline.selection,
      ),

    confidence:
      validateConfidence(
        baseline.confidence,
      ),

    evidenceGrade:
      validateEvidenceGrade(
        baseline.evidenceGrade,
      ),

    engine:
      validateEngine(
        baseline.engine,
      ),

    engineVersion:
      nonEmpty(
        baseline.engineVersion,
        "Baseline engine version",
      ),

    probability:
      null,
  };
}

export function validateForecastRevisionV01(
  baseline:
    BaselineForecastV01,

  candidate:
    ForecastRevisionInputV01,
): ValidatedForecastRevisionV01 {
  const validatedBaseline =
    validateBaselineForecastV01(
      baseline,
    );

  if (
    candidate.baselinePredictionId !==
    validatedBaseline.predictionId
  ) {
    throw new Error(
      "Revision baseline prediction does not match the baseline forecast.",
    );
  }

  if (
    candidate.fixtureId !==
    validatedBaseline.fixtureId
  ) {
    throw new Error(
      "Revision fixture does not match the baseline fixture.",
    );
  }

  if (
    !Number.isInteger(
      candidate.revisionNumber,
    ) ||
    candidate.revisionNumber < 1
  ) {
    throw new Error(
      "Revision number must be a positive integer.",
    );
  }

  const kickoffAt =
    normalizeTimestamp(
      candidate.kickoffAt,
      "Revision kickoff",
    );

  if (
    kickoffAt !==
    validatedBaseline.kickoffAt
  ) {
    throw new Error(
      "Revision kickoff must match the frozen baseline kickoff.",
    );
  }

  const inputCutoffAt =
    normalizeTimestamp(
      candidate.inputCutoffAt,
      "Revision input cutoff",
    );

  const generatedAt =
    normalizeTimestamp(
      candidate.generatedAt,
      "Revision generated time",
    );

  const publishedAt =
    candidate.publishedAt ===
    null
      ? null
      : normalizeTimestamp(
          candidate.publishedAt,
          "Revision publication time",
        );

  const baselineCutoffMs =
    Date.parse(
      validatedBaseline.inputCutoffAt,
    );

  const baselinePublishedMs =
    Date.parse(
      validatedBaseline.publishedAt,
    );

  const cutoffMs =
    Date.parse(
      inputCutoffAt,
    );

  const generatedMs =
    Date.parse(
      generatedAt,
    );

  const kickoffMs =
    Date.parse(
      kickoffAt,
    );

  if (
    cutoffMs <=
    baselineCutoffMs
  ) {
    throw new Error(
      "Revision must use evidence newer than the baseline input cutoff.",
    );
  }

  if (
    cutoffMs >
    generatedMs
  ) {
    throw new Error(
      "Revision input cutoff cannot occur after revision generation.",
    );
  }

  if (
    generatedMs <=
    baselinePublishedMs
  ) {
    throw new Error(
      "Revision generation must occur after baseline publication.",
    );
  }

  if (
    generatedMs >=
    kickoffMs
  ) {
    throw new Error(
      "Forecast revisions cannot be generated at or after kickoff.",
    );
  }

  if (
    publishedAt !==
    null
  ) {
    const publishedMs =
      Date.parse(
        publishedAt,
      );

    if (
      publishedMs <
      generatedMs
    ) {
      throw new Error(
        "Revision publication cannot occur before generation.",
      );
    }

    if (
      publishedMs >=
      kickoffMs
    ) {
      throw new Error(
        "Forecast revisions cannot be published at or after kickoff.",
      );
    }
  }

  const reason =
    validateReason(
      candidate.reason,
    );

  const lineupState =
    validateLineupState(
      candidate.lineupState,
    );

  if (
    reason ===
      "confirmed_lineup" &&
    lineupState !==
      "confirmed"
  ) {
    throw new Error(
      "A confirmed-lineup revision requires confirmed lineups.",
    );
  }

  if (
    candidate.probability !==
    null
  ) {
    throw new Error(
      "Forecast revision probability must remain null until calibrated.",
    );
  }

  return {
    version:
      FORECAST_REVISION_VERSION_V01,

    baselinePredictionId:
      validatedBaseline.predictionId,

    fixtureId:
      validatedBaseline.fixtureId,

    revisionNumber:
      candidate.revisionNumber,

    reason,

    engine:
      validateEngine(
        candidate.engine,
      ),

    engineVersion:
      nonEmpty(
        candidate.engineVersion,
        "Revision engine version",
      ),

    lineupState,

    kickoffAt,

    inputCutoffAt,

    generatedAt,

    publishedAt,

    selection:
      validateSelection(
        candidate.selection,
      ),

    confidence:
      validateConfidence(
        candidate.confidence,
      ),

    evidenceGrade:
      validateEvidenceGrade(
        candidate.evidenceGrade,
      ),

    materialChanges:
      validateMaterialChanges(
        candidate.materialChanges,
      ),

    probability:
      null,
  };
}

export function resolveActiveForecastV01(
  baseline:
    BaselineForecastV01,

  revisions:
    readonly ForecastRevisionInputV01[],

  asOf:
    string,
): ActiveForecastV01 {
  const validatedBaseline =
    validateBaselineForecastV01(
      baseline,
    );

  const asOfAt =
    normalizeTimestamp(
      asOf,
      "Active forecast asOf",
    );

  const asOfMs =
    Date.parse(
      asOfAt,
    );

  const kickoffMs =
    Date.parse(
      validatedBaseline.kickoffAt,
    );

  if (
    asOfMs >=
    kickoffMs
  ) {
    throw new Error(
      "Active pre-match forecast cannot be resolved at or after kickoff.",
    );
  }

  if (
    asOfMs <
    Date.parse(
      validatedBaseline.publishedAt,
    )
  ) {
    throw new Error(
      "Baseline forecast was not yet published at the requested time.",
    );
  }

  const validated =
    revisions.map(
      (
        revision,
      ) =>
        validateForecastRevisionV01(
          validatedBaseline,
          revision,
        ),
    );

  const revisionNumbers =
    new Set<number>();

  for (
    const revision
    of validated
  ) {
    if (
      revisionNumbers.has(
        revision.revisionNumber,
      )
    ) {
      throw new Error(
        `Duplicate forecast revision number ${revision.revisionNumber}.`,
      );
    }

    revisionNumbers.add(
      revision.revisionNumber,
    );
  }

  const eligible =
    validated
      .filter(
        (
          revision,
        ) =>
          revision.publishedAt !==
            null &&
          Date.parse(
            revision.publishedAt,
          ) <=
            asOfMs,
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.revisionNumber -
          right.revisionNumber,
      );

  const latest =
    eligible[
      eligible.length - 1
    ];

  if (
    !latest ||
    latest.publishedAt ===
      null
  ) {
    return {
      fixtureId:
        validatedBaseline.fixtureId,

      baselinePredictionId:
        validatedBaseline.predictionId,

      source:
        "baseline",

      revisionNumber:
        null,

      selection:
        validatedBaseline.selection,

      confidence:
        validatedBaseline.confidence,

      evidenceGrade:
        validatedBaseline.evidenceGrade,

      engine:
        validatedBaseline.engine,

      engineVersion:
        validatedBaseline.engineVersion,

      inputCutoffAt:
        validatedBaseline.inputCutoffAt,

      publishedAt:
        validatedBaseline.publishedAt,

      probability:
        null,
    };
  }

  return {
    fixtureId:
      latest.fixtureId,

    baselinePredictionId:
      latest.baselinePredictionId,

    source:
      "revision",

    revisionNumber:
      latest.revisionNumber,

    selection:
      latest.selection,

    confidence:
      latest.confidence,

    evidenceGrade:
      latest.evidenceGrade,

    engine:
      latest.engine,

    engineVersion:
      latest.engineVersion,

    inputCutoffAt:
      latest.inputCutoffAt,

    publishedAt:
      latest.publishedAt,

    probability:
      null,
  };
}
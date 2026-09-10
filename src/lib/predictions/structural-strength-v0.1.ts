export const STRUCTURAL_STRENGTH_MODEL_VERSION_V01 =
  "dictaziq-structural-strength-v0.1" as const;

export const STRUCTURAL_STRENGTH_MIN_SNAPSHOTS_V01 =
  6 as const;

export const STRUCTURAL_STRENGTH_MIN_SPAN_DAYS_V01 =
  35 as const;

export type StructuralStrengthStatusV01 =
  | "available"
  | "unavailable";

export type StructuralStrengthRelationshipV01 =
  | "structural_parity"
  | "home_advantage"
  | "away_advantage"
  | "strong_home_advantage"
  | "strong_away_advantage"
  | "insufficient_pair";

export type StructuralRatingSnapshotV01 = {
  rating:
    number;

  snapshotDate:
    string;

  source:
    string;
};

export type StructuralTeamStrengthInputV01 = {
  teamId:
    string;

  teamName:
    string;

  asOfDate:
    string;

  ratings:
    StructuralRatingSnapshotV01[];
};

export type StructuralTeamStrengthResultV01 = {
  modelVersion:
    typeof STRUCTURAL_STRENGTH_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  teamId:
    string;

  teamName:
    string;

  asOfDate:
    string;

  source:
    string | null;

  status:
    StructuralStrengthStatusV01;

  structuralRating:
    number | null;

  historySampleSize:
    number;

  historySpanDays:
    number | null;

  oldestSnapshotDate:
    string | null;

  newestSnapshotDate:
    string | null;

  minimumRating:
    number | null;

  maximumRating:
    number | null;

  ratingRange:
    number | null;

  /*
   * Structural strength is not itself a
   * betting recommendation.
   */
  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

export type StructuralStrengthMatchupV01 = {
  modelVersion:
    typeof STRUCTURAL_STRENGTH_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  home:
    StructuralTeamStrengthResultV01;

  away:
    StructuralTeamStrengthResultV01;

  structuralGap:
    number | null;

  absoluteStructuralGap:
    number | null;

  relationship:
    StructuralStrengthRelationshipV01;

  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

function assertDate(
  value: string,
  label: string,
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      `${label} must use YYYY-MM-DD format.`,
    );
  }

  const parsed =
    new Date(
      `${value}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(
        0,
        10,
      ) !== value
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }
}

function dateMs(
  value: string,
): number {
  return new Date(
    `${value}T00:00:00.000Z`,
  ).getTime();
}

function daysBetween(
  first: string,
  second: string,
): number {
  return Math.floor(
    (
      dateMs(second) -
      dateMs(first)
    ) /
      86_400_000,
  );
}

function median(
  values: number[],
): number {
  if (
    values.length === 0
  ) {
    throw new Error(
      "Median requires at least one value.",
    );
  }

  const ordered =
    [...values].sort(
      (
        left,
        right,
      ) =>
        left - right,
    );

  const middle =
    Math.floor(
      ordered.length /
        2,
    );

  if (
    ordered.length %
      2 ===
    1
  ) {
    return ordered[
      middle
    ];
  }

  return Math.round(
    (
      ordered[
        middle - 1
      ] +
      ordered[
        middle
      ]
    ) /
      2,
  );
}

function validateInput(
  input:
    StructuralTeamStrengthInputV01,
): void {
  if (
    !input.teamId.trim()
  ) {
    throw new Error(
      "Team ID must not be empty.",
    );
  }

  if (
    !input.teamName.trim()
  ) {
    throw new Error(
      "Team name must not be empty.",
    );
  }

  assertDate(
    input.asOfDate,
    "As-of date",
  );

  const dates =
    new Set<string>();

  let source:
    string | null =
      null;

  for (
    const snapshot
    of input.ratings
  ) {
    if (
      !Number.isFinite(
        snapshot.rating,
      ) ||
      !Number.isInteger(
        snapshot.rating,
      ) ||
      snapshot.rating < 0
    ) {
      throw new Error(
        "Historical rating must be a non-negative finite integer.",
      );
    }

    assertDate(
      snapshot.snapshotDate,
      "Rating snapshot date",
    );

    if (
      dateMs(
        snapshot.snapshotDate,
      ) >
      dateMs(
        input.asOfDate,
      )
    ) {
      throw new Error(
        "Structural strength cannot use a rating snapshot after the as-of date.",
      );
    }

    if (
      dates.has(
        snapshot.snapshotDate,
      )
    ) {
      throw new Error(
        `Duplicate structural rating snapshot date: ${snapshot.snapshotDate}.`,
      );
    }

    dates.add(
      snapshot.snapshotDate,
    );

    const snapshotSource =
      snapshot.source.trim();

    if (
      !snapshotSource
    ) {
      throw new Error(
        "Rating source must not be empty.",
      );
    }

    if (
      source === null
    ) {
      source =
        snapshotSource;
    } else if (
      source !==
      snapshotSource
    ) {
      throw new Error(
        "All structural rating snapshots must come from the same source.",
      );
    }
  }
}

/*
 * Structural Team Strength v0.1
 *
 * PURPOSE
 * -------
 * Estimate the team's slower-moving underlying
 * strength from historical weekly rating snapshots.
 *
 * This layer is deliberately separate from the
 * current/dynamic FootballDatabase rating.
 *
 * Dynamic Rating:
 *   How strong does the team look now?
 *
 * Structural Rating:
 *   Around what level has the team persistently
 *   existed over a longer period?
 *
 * METHOD
 * ------
 * v0.1 uses the MEDIAN historical rating.
 *
 * Why median?
 *
 * - resistant to one exceptional week
 * - resistant to one unusually poor week
 * - no arbitrary weighted formula
 * - easy to reproduce
 * - remains on the original FootballDatabase
 *   rating scale
 *
 * Availability rule:
 *
 * minimum 6 distinct snapshots
 * AND
 * minimum 35-day history span
 *
 * Until those conditions are satisfied,
 * structural strength is UNAVAILABLE rather
 * than fabricated.
 */
export function evaluateStructuralTeamStrengthV01(
  input:
    StructuralTeamStrengthInputV01,
): StructuralTeamStrengthResultV01 {
  validateInput(
    input,
  );

  if (
    input.ratings.length ===
    0
  ) {
    return {
      modelVersion:
        STRUCTURAL_STRENGTH_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      teamId:
        input.teamId,

      teamName:
        input.teamName,

      asOfDate:
        input.asOfDate,

      source:
        null,

      status:
        "unavailable",

      structuralRating:
        null,

      historySampleSize:
        0,

      historySpanDays:
        null,

      oldestSnapshotDate:
        null,

      newestSnapshotDate:
        null,

      minimumRating:
        null,

      maximumRating:
        null,

      ratingRange:
        null,

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "No historical rating snapshots are available. Structural strength is unavailable rather than estimated.",
    };
  }

  const ordered =
    [...input.ratings].sort(
      (
        left,
        right,
      ) =>
        dateMs(
          left.snapshotDate,
        ) -
        dateMs(
          right.snapshotDate,
        ),
    );

  const oldest =
    ordered[0];

  const newest =
    ordered[
      ordered.length - 1
    ];

  const historySpanDays =
    daysBetween(
      oldest.snapshotDate,
      newest.snapshotDate,
    );

  const values =
    ordered.map(
      (snapshot) =>
        snapshot.rating,
    );

  const minimumRating =
    Math.min(
      ...values,
    );

  const maximumRating =
    Math.max(
      ...values,
    );

  const ratingRange =
    maximumRating -
    minimumRating;

  const source =
    ordered[0]
      .source
      .trim();

  if (
    ordered.length <
      STRUCTURAL_STRENGTH_MIN_SNAPSHOTS_V01
  ) {
    return {
      modelVersion:
        STRUCTURAL_STRENGTH_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      teamId:
        input.teamId,

      teamName:
        input.teamName,

      asOfDate:
        input.asOfDate,

      source,

      status:
        "unavailable",

      structuralRating:
        null,

      historySampleSize:
        ordered.length,

      historySpanDays,

      oldestSnapshotDate:
        oldest.snapshotDate,

      newestSnapshotDate:
        newest.snapshotDate,

      minimumRating,

      maximumRating,

      ratingRange,

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Only ${ordered.length} historical rating snapshot(s) are available. Structural v0.1 requires at least ${STRUCTURAL_STRENGTH_MIN_SNAPSHOTS_V01}.`,
    };
  }

  if (
    historySpanDays <
      STRUCTURAL_STRENGTH_MIN_SPAN_DAYS_V01
  ) {
    return {
      modelVersion:
        STRUCTURAL_STRENGTH_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      teamId:
        input.teamId,

      teamName:
        input.teamName,

      asOfDate:
        input.asOfDate,

      source,

      status:
        "unavailable",

      structuralRating:
        null,

      historySampleSize:
        ordered.length,

      historySpanDays,

      oldestSnapshotDate:
        oldest.snapshotDate,

      newestSnapshotDate:
        newest.snapshotDate,

      minimumRating,

      maximumRating,

      ratingRange,

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Historical ratings span only ${historySpanDays} day(s). Structural v0.1 requires at least ${STRUCTURAL_STRENGTH_MIN_SPAN_DAYS_V01} days.`,
    };
  }

  const structuralRating =
    median(
      values,
    );

  return {
    modelVersion:
      STRUCTURAL_STRENGTH_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    teamId:
      input.teamId,

    teamName:
      input.teamName,

    asOfDate:
      input.asOfDate,

    source,

    status:
      "available",

    structuralRating,

    historySampleSize:
      ordered.length,

    historySpanDays,

    oldestSnapshotDate:
      oldest.snapshotDate,

    newestSnapshotDate:
      newest.snapshotDate,

    minimumRating,

    maximumRating,

    ratingRange,

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason:
      `Structural strength is available from ${ordered.length} historical weekly ratings spanning ${historySpanDays} days. The structural rating is the median historical rating.`,
  };
}

export function compareStructuralStrengthV01(
  homeInput:
    StructuralTeamStrengthInputV01,

  awayInput:
    StructuralTeamStrengthInputV01,
): StructuralStrengthMatchupV01 {
  const home =
    evaluateStructuralTeamStrengthV01(
      homeInput,
    );

  const away =
    evaluateStructuralTeamStrengthV01(
      awayInput,
    );

  if (
    home.status !==
      "available" ||
    away.status !==
      "available" ||
    home.structuralRating ===
      null ||
    away.structuralRating ===
      null
  ) {
    return {
      modelVersion:
        STRUCTURAL_STRENGTH_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      home,
      away,

      structuralGap:
        null,

      absoluteStructuralGap:
        null,

      relationship:
        "insufficient_pair",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "A comparable structural-strength pair is unavailable. The universal outcome model must continue using the best other available evidence.",
    };
  }

  const structuralGap =
    home.structuralRating -
    away.structuralRating;

  const absoluteStructuralGap =
    Math.abs(
      structuralGap,
    );

  let relationship:
    StructuralStrengthRelationshipV01;

  /*
   * Structural gap uses the same broad rating
   * separation language as the original DictazIQ
   * mathematical model.
   *
   * 0-49:
   * persistent structural parity
   *
   * 50-149:
   * persistent structural advantage
   *
   * 150+:
   * major persistent structural advantage
   *
   * This is NOT a final 1X2 prediction.
   */
  if (
    absoluteStructuralGap <=
    49
  ) {
    relationship =
      "structural_parity";
  } else if (
    absoluteStructuralGap <=
    149
  ) {
    relationship =
      structuralGap > 0
        ? "home_advantage"
        : "away_advantage";
  } else {
    relationship =
      structuralGap > 0
        ? "strong_home_advantage"
        : "strong_away_advantage";
  }

  return {
    modelVersion:
      STRUCTURAL_STRENGTH_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    home,
    away,

    structuralGap,

    absoluteStructuralGap,

    relationship,

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason:
      `The structural rating gap is ${structuralGap}. This describes persistent team-strength separation and is evidence for downstream matchup analysis, not a standalone betting recommendation.`,
  };
}
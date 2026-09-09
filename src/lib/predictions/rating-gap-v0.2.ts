export const RATING_GAP_MODEL_VERSION_V02 =
  "dictaziq-rating-gap-v0.2" as const;

export type RatingGapSideV02 =
  | "home"
  | "away"
  | "level";

export type RatingGapSignalV02 =
  | "strong_draw"
  | "draw"
  | "context_required"
  | "cautious_win"
  | "strong_win";

export type RatingSnapshotInputV02 = {
  rating: number;
  source: string;
  snapshotDate: string;
};

export type RatingGapInputV02 = {
  home: RatingSnapshotInputV02;
  away: RatingSnapshotInputV02;
};

export type MarketAnalysisRequirement = {
  requiresAnalysis: true;
  selection: null;
};

export type GoalsAnalysisRequirement =
  MarketAnalysisRequirement & {
    /*
     * A very large rating mismatch may be relevant
     * to goal expectancy, but it is NEVER itself an
     * Over 2.5 selection.
     */
    ratingMismatchCandidate: boolean;
  };

export type RatingGapResultV02 = {
  modelVersion:
    typeof RATING_GAP_MODEL_VERSION_V02;

  validationStatus:
    "experimental";

  homeRating: number;
  awayRating: number;

  ratingGap: number;
  absoluteGap: number;

  higherRatedTeam:
    RatingGapSideV02;

  /*
   * This signal concerns the structural 1X2
   * interpretation of the rating gap only.
   */
  resultSignal:
    RatingGapSignalV02;

  standaloneSelection:
    | "home"
    | "away"
    | "draw"
    | null;

  /*
   * True only when the rating gap itself cannot
   * determine the 1X2 direction.
   *
   * This is distinct from goals/BTTS analysis,
   * which is required for every fixture.
   */
  requiresResultContext:
    boolean;

  markets: {
    goals: GoalsAnalysisRequirement;

    btts:
      MarketAnalysisRequirement;

    other:
      MarketAnalysisRequirement;
  };

  calibratedProbability:
    null;

  source: string;
  snapshotDate: string;
};

function assertRating(
  value: number,
  label: string,
): asserts value is number {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} rating must be a non-negative finite integer.`,
    );
  }
}

function assertSnapshotDate(
  value: string,
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      "Rating snapshot dates must use YYYY-MM-DD format.",
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
      .slice(0, 10) !==
      value
  ) {
    throw new Error(
      "Rating snapshot date is invalid.",
    );
  }
}

function getHigherRatedSide(
  gap: number,
): RatingGapSideV02 {
  if (gap > 0) {
    return "home";
  }

  if (gap < 0) {
    return "away";
  }

  return "level";
}

export function evaluateRatingGapV02(
  input: RatingGapInputV02,
): RatingGapResultV02 {
  assertRating(
    input.home.rating,
    "Home",
  );

  assertRating(
    input.away.rating,
    "Away",
  );

  assertSnapshotDate(
    input.home.snapshotDate,
  );

  assertSnapshotDate(
    input.away.snapshotDate,
  );

  const homeSource =
    input.home.source.trim();

  const awaySource =
    input.away.source.trim();

  if (
    !homeSource ||
    !awaySource
  ) {
    throw new Error(
      "Rating source must not be empty.",
    );
  }

  if (
    homeSource !==
    awaySource
  ) {
    throw new Error(
      "Home and away ratings must come from the same source.",
    );
  }

  if (
    input.home.snapshotDate !==
    input.away.snapshotDate
  ) {
    throw new Error(
      "Home and away ratings must use the same weekly snapshot date.",
    );
  }

  const ratingGap =
    input.home.rating -
    input.away.rating;

  const absoluteGap =
    Math.abs(
      ratingGap,
    );

  const higherRatedTeam =
    getHigherRatedSide(
      ratingGap,
    );

  let resultSignal:
    RatingGapSignalV02;

  let standaloneSelection:
    | "home"
    | "away"
    | "draw"
    | null;

  let requiresResultContext =
    false;

  /*
   * D = -4 through -1:
   * user's strongest draw band.
   */
  if (
    ratingGap >= -4 &&
    ratingGap <= -1
  ) {
    resultSignal =
      "strong_draw";

    standaloneSelection =
      "draw";
  }

  /*
   * D = 0 through +4:
   * draw band.
   */
  else if (
    ratingGap >= 0 &&
    ratingGap <= 4
  ) {
    resultSignal =
      "draw";

    standaloneSelection =
      "draw";
  }

  /*
   * |D| = 5 through 49:
   * rating difference alone cannot determine
   * the 1X2 selection.
   */
  else if (
    absoluteGap <= 49
  ) {
    resultSignal =
      "context_required";

    standaloneSelection =
      null;

    requiresResultContext =
      true;
  }

  /*
   * |D| = 50 through 149:
   * cautious higher-rated-team selection.
   */
  else if (
    absoluteGap <= 149
  ) {
    resultSignal =
      "cautious_win";

    standaloneSelection =
      higherRatedTeam ===
      "home"
        ? "home"
        : "away";
  }

  /*
   * |D| >= 150:
   * strong higher-rated-team selection.
   *
   * IMPORTANT:
   * this does NOT automatically generate
   * an Over 2.5 selection.
   */
  else {
    resultSignal =
      "strong_win";

    standaloneSelection =
      higherRatedTeam ===
      "home"
        ? "home"
        : "away";
  }

  return {
    modelVersion:
      RATING_GAP_MODEL_VERSION_V02,

    validationStatus:
      "experimental",

    homeRating:
      input.home.rating,

    awayRating:
      input.away.rating,

    ratingGap,
    absoluteGap,

    higherRatedTeam,

    resultSignal,

    standaloneSelection,

    requiresResultContext,

    /*
     * Every non-1X2 market requires its own
     * evidence-driven analysis.
     *
     * A 150+ gap is merely an additional
     * goals-analysis feature.
     */
    markets: {
      goals: {
        requiresAnalysis:
          true,

        selection:
          null,

        ratingMismatchCandidate:
          absoluteGap >= 150,
      },

      btts: {
        requiresAnalysis:
          true,

        selection:
          null,
      },

      other: {
        requiresAnalysis:
          true,

        selection:
          null,
      },
    },

    calibratedProbability:
      null,

    source:
      homeSource,

    snapshotDate:
      input.home.snapshotDate,
  };
}
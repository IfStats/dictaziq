export const RATING_GAP_MODEL_VERSION =
  "dictaziq-rating-gap-v0.1" as const;

export type RatingGapSide = "home" | "away" | "level";

export type RatingGapSignal =
  | "strong_draw"
  | "draw"
  | "context_required"
  | "cautious_win"
  | "strong_win_over_2_5";

export type RatingSnapshotInput = {
  rating: number;
  source: string;
  snapshotDate: string;
};

export type RatingGapInput = {
  home: RatingSnapshotInput;
  away: RatingSnapshotInput;
};

export type RatingGapResult = {
  modelVersion: typeof RATING_GAP_MODEL_VERSION;
  validationStatus: "experimental";

  homeRating: number;
  awayRating: number;

  ratingGap: number;
  absoluteGap: number;

  higherRatedTeam: RatingGapSide;

  signal: RatingGapSignal;

  standaloneSelection: "home" | "away" | "draw" | null;

  over25Signal: boolean;
  requiresContext: boolean;

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

function assertSnapshotDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      "Rating snapshot dates must use YYYY-MM-DD format.",
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Rating snapshot date is invalid.");
  }
}

function getHigherRatedSide(
  gap: number,
): RatingGapSide {
  if (gap > 0) {
    return "home";
  }

  if (gap < 0) {
    return "away";
  }

  return "level";
}

export function evaluateRatingGap(
  input: RatingGapInput,
): RatingGapResult {
  assertRating(input.home.rating, "Home");
  assertRating(input.away.rating, "Away");

  assertSnapshotDate(input.home.snapshotDate);
  assertSnapshotDate(input.away.snapshotDate);

  const homeSource = input.home.source.trim();
  const awaySource = input.away.source.trim();

  if (!homeSource || !awaySource) {
    throw new Error("Rating source must not be empty.");
  }

  if (homeSource !== awaySource) {
    throw new Error(
      "Home and away ratings must come from the same source.",
    );
  }

  if (input.home.snapshotDate !== input.away.snapshotDate) {
    throw new Error(
      "Home and away ratings must use the same weekly snapshot date.",
    );
  }

  const ratingGap =
    input.home.rating - input.away.rating;

  const absoluteGap = Math.abs(ratingGap);

  const higherRatedTeam =
    getHigherRatedSide(ratingGap);

  let signal: RatingGapSignal;
  let standaloneSelection:
    | "home"
    | "away"
    | "draw"
    | null;

  let over25Signal = false;
  let requiresContext = false;

  // D = -4 through -1:
  // user's strongest draw band.
  if (ratingGap >= -4 && ratingGap <= -1) {
    signal = "strong_draw";
    standaloneSelection = "draw";
  }

  // D = 0 through +4:
  // draw band.
  else if (ratingGap >= 0 && ratingGap <= 4) {
    signal = "draw";
    standaloneSelection = "draw";
  }

  // |D| = 5 through 49:
  // rating gap alone must not generate a pick.
  else if (absoluteGap <= 49) {
    signal = "context_required";
    standaloneSelection = null;
    requiresContext = true;
  }

  // |D| = 50 through 149:
  // cautious win for higher-rated team.
  else if (absoluteGap <= 149) {
    signal = "cautious_win";

    standaloneSelection =
      higherRatedTeam === "home"
        ? "home"
        : "away";
  }

  // |D| >= 150:
  // higher-rated team plus O2.5 signal.
  else {
    signal = "strong_win_over_2_5";

    standaloneSelection =
      higherRatedTeam === "home"
        ? "home"
        : "away";

    over25Signal = true;
  }

  return {
    modelVersion: RATING_GAP_MODEL_VERSION,
    validationStatus: "experimental",

    homeRating: input.home.rating,
    awayRating: input.away.rating,

    ratingGap,
    absoluteGap,

    higherRatedTeam,

    signal,
    standaloneSelection,

    over25Signal,
    requiresContext,

    source: homeSource,
    snapshotDate: input.home.snapshotDate,
  };
}
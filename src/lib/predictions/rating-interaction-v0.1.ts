import {
  evaluateRatingDynamicsV01,
  type RatingDynamicsInputV01,
  type RatingDynamicsResultV01,
} from "./rating-dynamics-v0.1";

export const RATING_INTERACTION_MODEL_VERSION_V01 =
  "dictaziq-rating-interaction-v0.1" as const;

export type RatingInteractionSideV01 =
  | "home"
  | "away"
  | "level";

export type RatingGapMovementV01 =
  | "widening"
  | "narrowing"
  | "stable"
  | "unavailable";

export type RatingInteractionTypeV01 =
  | "confirming"
  | "diverging"
  | "converging"
  | "conflicting"
  | "stable"
  | "insufficient";

export type RatingInteractionEvidenceV01 =
  | "full"
  | "partial"
  | "unavailable";

export type RatingInteractionInputV01 = {
  home:
    RatingDynamicsInputV01;

  away:
    RatingDynamicsInputV01;
};

export type RatingInteractionResultV01 = {
  modelVersion:
    typeof RATING_INTERACTION_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  home:
    RatingDynamicsResultV01;

  away:
    RatingDynamicsResultV01;

  currentRatingGap:
    number | null;

  absoluteCurrentRatingGap:
    number | null;

  higherRatedSide:
    RatingInteractionSideV01;

  /*
   * Difference between the teams'
   * short-term rating slopes.
   *
   * Formula:
   *
   * home slope - away slope
   *
   * Units:
   * rating points per 7 days.
   */
  relativeSlopePer7Days:
    number | null;

  /*
   * Which team's direction is favoured by
   * the relative trajectory?
   */
  trajectoryLeader:
    RatingInteractionSideV01;

  gapMovement:
    RatingGapMovementV01;

  interaction:
    RatingInteractionTypeV01;

  trajectoryEvidence:
    RatingInteractionEvidenceV01;

  /*
   * Descriptive interpretation only.
   *
   * No rating points are added or removed.
   */
  currentAdvantageInterpretation:
    | "reinforced"
    | "challenged"
    | "unchanged"
    | "parity_moving_home"
    | "parity_moving_away"
    | "unavailable";

  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

const FLOATING_TOLERANCE =
  1e-10;

function signSide(
  value: number,
): RatingInteractionSideV01 {
  if (
    value >
    FLOATING_TOLERANCE
  ) {
    return "home";
  }

  if (
    value <
    -FLOATING_TOLERANCE
  ) {
    return "away";
  }

  return "level";
}

function evidenceLevel(
  home:
    RatingDynamicsResultV01,

  away:
    RatingDynamicsResultV01,
): RatingInteractionEvidenceV01 {
  if (
    home.shortTermSlopePer7Days ===
      null ||
    away.shortTermSlopePer7Days ===
      null
  ) {
    return "unavailable";
  }

  if (
    home.status ===
      "available" &&
    away.status ===
      "available"
  ) {
    return "full";
  }

  return "partial";
}

/*
 * Rating Interaction v0.1
 *
 * PURPOSE
 * -------
 *
 * Compare:
 *
 *   CURRENT RATING GAP
 *
 * with:
 *
 *   HOME RATING TRAJECTORY
 *   AWAY RATING TRAJECTORY
 *
 * This answers:
 *
 * - Is the current advantage widening?
 * - Is it narrowing?
 * - Are the two trajectories strongly
 *   confirming the current rating advantage?
 * - Are the trajectories challenging it?
 *
 * IMPORTANT
 * ---------
 *
 * This model NEVER modifies the actual
 * FootballDatabase ratings.
 *
 * Example:
 *
 * Home = 1800
 * Away = 1750
 *
 * D = +50
 *
 * If home is rising while away is falling,
 * D remains +50.
 *
 * Rating Interaction only records that the
 * mathematical trajectory reinforces the
 * current +50 relationship.
 */
export function evaluateRatingInteractionV01(
  input:
    RatingInteractionInputV01,
): RatingInteractionResultV01 {
  const home =
    evaluateRatingDynamicsV01(
      input.home,
    );

  const away =
    evaluateRatingDynamicsV01(
      input.away,
    );

  const trajectoryEvidence =
    evidenceLevel(
      home,
      away,
    );

  /*
   * If either current rating is unavailable,
   * even the current rating gap cannot be
   * calculated.
   */
  if (
    home.currentRating ===
      null ||
    away.currentRating ===
      null
  ) {
    return {
      modelVersion:
        RATING_INTERACTION_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      home,
      away,

      currentRatingGap:
        null,

      absoluteCurrentRatingGap:
        null,

      higherRatedSide:
        "level",

      relativeSlopePer7Days:
        null,

      trajectoryLeader:
        "level",

      gapMovement:
        "unavailable",

      interaction:
        "insufficient",

      trajectoryEvidence:
        "unavailable",

      currentAdvantageInterpretation:
        "unavailable",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "A comparable current rating pair is unavailable. Rating Interaction cannot calculate the mathematical strength difference.",
    };
  }

  const currentRatingGap =
    home.currentRating -
    away.currentRating;

  const absoluteCurrentRatingGap =
    Math.abs(
      currentRatingGap,
    );

  const higherRatedSide =
    signSide(
      currentRatingGap,
    );

  /*
   * A current rating gap remains valid even
   * when trajectory history is unavailable.
   */
  if (
    home.shortTermSlopePer7Days ===
      null ||
    away.shortTermSlopePer7Days ===
      null
  ) {
    return {
      modelVersion:
        RATING_INTERACTION_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      home,
      away,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide,

      relativeSlopePer7Days:
        null,

      trajectoryLeader:
        "level",

      gapMovement:
        "unavailable",

      interaction:
        "insufficient",

      trajectoryEvidence,

      currentAdvantageInterpretation:
        "unavailable",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating gap is ${currentRatingGap}, but sufficient historical observations are not available for both teams. The current rating relationship remains valid; trajectory interaction is unavailable.`,
    };
  }

  const homeSlope =
    home.shortTermSlopePer7Days;

  const awaySlope =
    away.shortTermSlopePer7Days;

  const relativeSlopePer7Days =
    Number(
      (
        homeSlope -
        awaySlope
      ).toFixed(
        4,
      ),
    );

  const trajectoryLeader =
    signSide(
      relativeSlopePer7Days,
    );

  /*
   * Current parity.
   *
   * There is no existing higher-rated team
   * to confirm or challenge.
   *
   * Relative trajectory tells us which side
   * is mathematically moving away from parity.
   */
  if (
    currentRatingGap ===
    0
  ) {
    if (
      Math.abs(
        relativeSlopePer7Days,
      ) <=
      FLOATING_TOLERANCE
    ) {
      return {
        modelVersion:
          RATING_INTERACTION_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        home,
        away,

        currentRatingGap,

        absoluteCurrentRatingGap,

        higherRatedSide:
          "level",

        relativeSlopePer7Days,

        trajectoryLeader:
          "level",

        gapMovement:
          "stable",

        interaction:
          "stable",

        trajectoryEvidence,

        currentAdvantageInterpretation:
          "unchanged",

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,

        reason:
          "The teams currently have identical ratings and their relative rating trajectory is effectively stable.",
      };
    }

    return {
      modelVersion:
        RATING_INTERACTION_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      home,
      away,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide:
        "level",

      relativeSlopePer7Days,

      trajectoryLeader,

      gapMovement:
        "widening",

      interaction:
        "diverging",

      trajectoryEvidence,

      currentAdvantageInterpretation:
        trajectoryLeader ===
        "home"
          ? "parity_moving_home"
          : "parity_moving_away",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `The teams are currently level in rating, but their relative trajectory is ${relativeSlopePer7Days} rating points per seven days. The rating relationship is moving away from parity toward ${trajectoryLeader}.`,
    };
  }

  /*
   * Convert relative slope into movement in
   * the direction of the CURRENT advantage.
   *
   * Example:
   *
   * D > 0:
   * positive relative slope = home gap widens
   *
   * D < 0:
   * negative relative slope = away gap widens
   */
  const advantageDirection =
    currentRatingGap > 0
      ? 1
      : -1;

  const advantageMovement =
    relativeSlopePer7Days *
    advantageDirection;

  let gapMovement:
    RatingGapMovementV01;

  if (
    Math.abs(
      advantageMovement,
    ) <=
    FLOATING_TOLERANCE
  ) {
    gapMovement =
      "stable";
  } else if (
    advantageMovement >
    0
  ) {
    gapMovement =
      "widening";
  } else {
    gapMovement =
      "narrowing";
  }

  const higherSlope =
    higherRatedSide ===
    "home"
      ? homeSlope
      : awaySlope;

  const lowerSlope =
    higherRatedSide ===
    "home"
      ? awaySlope
      : homeSlope;

  /*
   * CONFIRMING
   *
   * Higher-rated team is rising
   * AND
   * lower-rated team is falling.
   *
   * This is the cleanest trajectory
   * confirmation of the current mathematical
   * rating advantage.
   */
  if (
    higherSlope >
      FLOATING_TOLERANCE &&
    lowerSlope <
      -FLOATING_TOLERANCE
  ) {
    return {
      modelVersion:
        RATING_INTERACTION_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      home,
      away,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide,

      relativeSlopePer7Days,

      trajectoryLeader,

      gapMovement:
        "widening",

      interaction:
        "confirming",

      trajectoryEvidence,

      currentAdvantageInterpretation:
        "reinforced",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating gap is ${currentRatingGap}. The higher-rated ${higherRatedSide} side is rising while the lower-rated side is falling, so the rating trajectories mathematically reinforce the existing advantage.`,
    };
  }

  /*
   * CONFLICTING
   *
   * Higher-rated team is falling
   * AND
   * lower-rated team is rising.
   *
   * The current rating advantage remains real,
   * but the recent trajectories challenge it.
   */
  if (
    higherSlope <
      -FLOATING_TOLERANCE &&
    lowerSlope >
      FLOATING_TOLERANCE
  ) {
    return {
      modelVersion:
        RATING_INTERACTION_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      home,
      away,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide,

      relativeSlopePer7Days,

      trajectoryLeader,

      gapMovement:
        "narrowing",

      interaction:
        "conflicting",

      trajectoryEvidence,

      currentAdvantageInterpretation:
        "challenged",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating gap is ${currentRatingGap}. The higher-rated ${higherRatedSide} side is falling while the lower-rated side is rising, so recent rating trajectories challenge the existing advantage without replacing the current ratings.`,
    };
  }

  /*
   * DIVERGING
   *
   * The current gap is widening, but not through
   * the strongest opposing-trend pattern above.
   *
   * Example:
   * both teams rising, but the already
   * higher-rated team is rising faster.
   */
  if (
    gapMovement ===
    "widening"
  ) {
    return {
      modelVersion:
        RATING_INTERACTION_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      home,
      away,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide,

      relativeSlopePer7Days,

      trajectoryLeader,

      gapMovement,

      interaction:
        "diverging",

      trajectoryEvidence,

      currentAdvantageInterpretation:
        "reinforced",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating gap is ${currentRatingGap}. The relative rating trajectory is widening the existing ${higherRatedSide} advantage.`,
    };
  }

  /*
   * CONVERGING
   *
   * Current gap is narrowing, but not through
   * the strongest direct conflict pattern.
   */
  if (
    gapMovement ===
    "narrowing"
  ) {
    return {
      modelVersion:
        RATING_INTERACTION_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      home,
      away,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide,

      relativeSlopePer7Days,

      trajectoryLeader,

      gapMovement,

      interaction:
        "converging",

      trajectoryEvidence,

      currentAdvantageInterpretation:
        "challenged",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating gap is ${currentRatingGap}. The relative rating trajectory is narrowing the existing ${higherRatedSide} advantage.`,
    };
  }

  /*
   * Stable relative movement.
   */
  return {
    modelVersion:
      RATING_INTERACTION_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    home,
    away,

    currentRatingGap,

    absoluteCurrentRatingGap,

    higherRatedSide,

    relativeSlopePer7Days,

    trajectoryLeader:
      "level",

    gapMovement:
      "stable",

    interaction:
      "stable",

    trajectoryEvidence,

    currentAdvantageInterpretation:
      "unchanged",

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason:
      `Current rating gap is ${currentRatingGap}. Both teams' recent rating trajectories are moving at approximately the same rate, so the relative mathematical relationship is stable.`,
  };
}
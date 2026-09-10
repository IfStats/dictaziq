export const UNIVERSAL_OUTCOME_MODEL_VERSION_V01 =
  "dictaziq-universal-outcome-v0.1" as const;

export type UniversalOutcomeV01 =
  | "home"
  | "draw"
  | "away";

export type UniversalOutcomeEvidenceGradeV01 =
  | "C"
  | "D"
  | "E";

export type UniversalOutcomeConfidenceV01 =
  | "high"
  | "medium"
  | "low"
  | "very_low";

export type UniversalOutcomeBasisV01 =
  | "dynamic_rating_pair"
  | "competition_prior"
  | "generic_home_prior";

export type UniversalRatingBandV01 =
  | "micro_gap"
  | "small_gap"
  | "cautious_gap"
  | "strong_gap"
  | null;

export type CompetitionOutcomePriorV01 = {
  outcome:
    UniversalOutcomeV01;

  source:
    string;

  sampleSize:
    number | null;
};

export type UniversalOutcomeInputV01 = {
  home: {
    rating:
      number | null;
  };

  away: {
    rating:
      number | null;
  };

  competitionPrior?:
    CompetitionOutcomePriorV01 | null;
};

export type UniversalOutcomeResultV01 = {
  modelVersion:
    typeof UNIVERSAL_OUTCOME_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  forecast:
    UniversalOutcomeV01;

  basis:
    UniversalOutcomeBasisV01;

  evidenceGrade:
    UniversalOutcomeEvidenceGradeV01;

  confidence:
    UniversalOutcomeConfidenceV01;

  homeRating:
    number | null;

  awayRating:
    number | null;

  ratingGap:
    number | null;

  absoluteGap:
    number | null;

  ratingBand:
    UniversalRatingBandV01;

  reason:
    string;

  /*
   * Universal forecast and betting recommendation
   * are deliberately separate concerns.
   *
   * This engine predicts the result only.
   */
  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;
};

function assertOptionalRating(
  value: number | null,
  label: string,
): void {
  if (
    value === null
  ) {
    return;
  }

  if (
    !Number.isFinite(
      value,
    ) ||
    !Number.isInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new Error(
      `${label} rating must be null or a non-negative finite integer.`,
    );
  }
}

function validateCompetitionPrior(
  prior:
    CompetitionOutcomePriorV01 | null | undefined,
): void {
  if (
    prior === null ||
    prior === undefined
  ) {
    return;
  }

  if (
    prior.outcome !== "home" &&
    prior.outcome !== "draw" &&
    prior.outcome !== "away"
  ) {
    throw new Error(
      "Competition prior outcome is invalid.",
    );
  }

  if (
    !prior.source.trim()
  ) {
    throw new Error(
      "Competition prior source must not be empty.",
    );
  }

  if (
    prior.sampleSize !== null &&
    (
      !Number.isInteger(
        prior.sampleSize,
      ) ||
      prior.sampleSize <= 0
    )
  ) {
    throw new Error(
      "Competition prior sample size must be null or a positive integer.",
    );
  }
}

function higherRatedOutcome(
  ratingGap: number,
): "home" | "away" {
  if (
    ratingGap > 0
  ) {
    return "home";
  }

  return "away";
}

/*
 * Universal Outcome v0.1
 *
 * PURPOSE
 * -------
 * Produce a 1X2 forecast for every fixture that
 * reaches the prediction layer.
 *
 * This model must NOT be confused with the
 * recommendation engine.
 *
 * Missing evidence reduces evidence grade and
 * confidence; it does not suppress the forecast.
 *
 * No numeric probabilities are generated because
 * this model has not yet been historically calibrated.
 *
 * IMPORTANT
 * ---------
 * The 5-49 rating band has changed meaning here.
 *
 * Frozen rating-gap v0.2:
 *   5-49 = context required / no standalone pick.
 *
 * Universal Outcome v0.1:
 *   5-49 = current-strength parity, but the engine
 *   still forecasts toward the higher-rated team
 *   at LOW confidence.
 *
 * The frozen model remains unchanged.
 */
export function evaluateUniversalOutcomeV01(
  input:
    UniversalOutcomeInputV01,
): UniversalOutcomeResultV01 {
  assertOptionalRating(
    input.home.rating,
    "Home",
  );

  assertOptionalRating(
    input.away.rating,
    "Away",
  );

  validateCompetitionPrior(
    input.competitionPrior,
  );

  const homeRating =
    input.home.rating;

  const awayRating =
    input.away.rating;

  /*
   * LEVEL 1:
   * Comparable dynamic rating pair available.
   */
  if (
    homeRating !== null &&
    awayRating !== null
  ) {
    const ratingGap =
      homeRating -
      awayRating;

    const absoluteGap =
      Math.abs(
        ratingGap,
      );

    /*
     * Exact equality remains a draw forecast.
     */
    if (
      ratingGap === 0
    ) {
      return {
        modelVersion:
          UNIVERSAL_OUTCOME_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        forecast:
          "draw",

        basis:
          "dynamic_rating_pair",

        evidenceGrade:
          "C",

        confidence:
          "low",

        homeRating,
        awayRating,

        ratingGap,
        absoluteGap,

        ratingBand:
          "micro_gap",

        reason:
          "The teams have identical current dynamic ratings. Universal v0.1 therefore uses the legacy parity draw direction, but confidence remains low until league behaviour and team identity are incorporated.",

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,
      };
    }

    /*
     * |D| = 1-4
     *
     * Preserve the experienced micro-gap draw
     * hypothesis as a forecast, but deliberately
     * keep confidence LOW because the user has
     * observed that league behaviour matters.
     *
     * Egypt may strengthen this signal later;
     * swing leagues may weaken it.
     */
    if (
      absoluteGap <= 4
    ) {
      return {
        modelVersion:
          UNIVERSAL_OUTCOME_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        forecast:
          "draw",

        basis:
          "dynamic_rating_pair",

        evidenceGrade:
          "C",

        confidence:
          "low",

        homeRating,
        awayRating,

        ratingGap,
        absoluteGap,

        ratingBand:
          "micro_gap",

        reason:
          "The dynamic rating difference is within the 1-4 micro-gap band. Universal v0.1 forecasts a draw while awaiting league-behaviour calibration.",

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,
      };
    }

    /*
     * |D| = 5-49
     *
     * Important change:
     *
     * This is NOT interpreted as "no forecast".
     * It represents current-strength parity.
     *
     * The higher-rated side receives the directional
     * forecast, but only at LOW confidence.
     *
     * Structural Team Strength, matchup class,
     * league behaviour and fixture context will
     * become additional layers in later versions.
     */
    if (
      absoluteGap <= 49
    ) {
      return {
        modelVersion:
          UNIVERSAL_OUTCOME_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        forecast:
          higherRatedOutcome(
            ratingGap,
          ),

        basis:
          "dynamic_rating_pair",

        evidenceGrade:
          "C",

        confidence:
          "low",

        homeRating,
        awayRating,

        ratingGap,
        absoluteGap,

        ratingBand:
          "small_gap",

        reason:
          "The teams are in the 5-49 current-strength parity band. Universal v0.1 still forecasts toward the higher-rated side, but the signal is weak and requires structural, league and match-context support before recommendation.",

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,
      };
    }

    /*
     * |D| = 50-149
     */
    if (
      absoluteGap <= 149
    ) {
      return {
        modelVersion:
          UNIVERSAL_OUTCOME_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        forecast:
          higherRatedOutcome(
            ratingGap,
          ),

        basis:
          "dynamic_rating_pair",

        evidenceGrade:
          "C",

        confidence:
          "medium",

        homeRating,
        awayRating,

        ratingGap,
        absoluteGap,

        ratingBand:
          "cautious_gap",

        reason:
          "The dynamic rating difference is within the 50-149 advantage band. The higher-rated side receives the result forecast, while recommendation remains a separate decision.",

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,
      };
    }

    /*
     * |D| >= 150
     */
    return {
      modelVersion:
        UNIVERSAL_OUTCOME_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      forecast:
        higherRatedOutcome(
          ratingGap,
        ),

      basis:
        "dynamic_rating_pair",

      evidenceGrade:
        "C",

      confidence:
        "high",

      homeRating,
      awayRating,

      ratingGap,
      absoluteGap,

      ratingBand:
        "strong_gap",

      reason:
        "The dynamic rating difference is at least 150 points. Universal v0.1 treats this as a strong directional 1X2 signal for the higher-rated team. It does not imply any Goals or BTTS selection.",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,
    };
  }

  /*
   * LEVEL 2:
   * No comparable pair.
   *
   * A single isolated rating cannot safely determine
   * relative strength because there is no opponent
   * reference value.
   *
   * Use an empirical competition prior when one is
   * supplied.
   */
  if (
    input.competitionPrior
  ) {
    return {
      modelVersion:
        UNIVERSAL_OUTCOME_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      forecast:
        input
          .competitionPrior
          .outcome,

      basis:
        "competition_prior",

      evidenceGrade:
        "D",

      confidence:
        "very_low",

      homeRating,
      awayRating,

      ratingGap:
        null,

      absoluteGap:
        null,

      ratingBand:
        null,

      reason:
        `A comparable two-team rating pair is unavailable. Universal v0.1 falls back to the supplied competition prior from ${input.competitionPrior.source}.`,

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,
    };
  }

  /*
   * LEVEL 3:
   * Minimal-information fallback.
   *
   * Requirement:
   * every fixture receives a forecast.
   *
   * Until DictazIQ has calibrated competition and
   * global priors, the final fallback is a generic
   * home-direction prior.
   *
   * It MUST remain VERY LOW confidence and MUST NOT
   * automatically become a betting recommendation.
   */
  return {
    modelVersion:
      UNIVERSAL_OUTCOME_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    forecast:
      "home",

    basis:
      "generic_home_prior",

    evidenceGrade:
      "E",

    confidence:
      "very_low",

    homeRating,
    awayRating,

    ratingGap:
      null,

    absoluteGap:
      null,

    ratingBand:
      null,

    reason:
      "No comparable rating pair or empirical competition prior is available. Universal v0.1 therefore uses the temporary generic home-direction fallback. This is forecast-only and must not be treated as a qualified recommendation.",

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,
  };
}
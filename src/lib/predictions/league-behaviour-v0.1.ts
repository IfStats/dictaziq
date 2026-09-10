export const LEAGUE_BEHAVIOUR_MODEL_VERSION_V01 =
  "dictaziq-league-behaviour-v0.1" as const;

export type LeagueBehaviourProfileV01 =
  | "egypt_micro_gap"
  | "swing_league"
  | "neutral";

export type LeagueGapReliabilityV01 =
  | "normal"
  | "reduced";

export type LeagueResultSignalV01 =
  | "draw_support"
  | "none";

export type LeagueGoalsSignalV01 =
  | "under_2_5_support"
  | "none";

export type LeagueBehaviourInputV01 = {
  country:
    string | null;

  competitionName:
    string | null;

  ratingGap:
    number | null;
};

export type LeagueBehaviourResultV01 = {
  modelVersion:
    typeof LEAGUE_BEHAVIOUR_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  profile:
    LeagueBehaviourProfileV01;

  normalizedCountry:
    string | null;

  ratingGap:
    number | null;

  absoluteGap:
    number | null;

  gapReliability:
    LeagueGapReliabilityV01;

  resultSignal:
    LeagueResultSignalV01;

  goalsSignal:
    LeagueGoalsSignalV01;

  /*
   * BTTS remains independent.
   *
   * Under 2.5 does not automatically imply
   * BTTS No.
   */
  bttsSignal:
    "none";

  /*
   * League behaviour supplies evidence to
   * downstream engines.
   *
   * It does not itself create a qualified
   * betting recommendation.
   */
  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

function normalizeText(
  value:
    string | null,
): string | null {
  if (
    value === null
  ) {
    return null;
  }

  const normalized =
    value
      .normalize("NFKD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .trim()
      .toLowerCase();

  return normalized ||
    null;
}

function validateRatingGap(
  value:
    number | null,
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
    )
  ) {
    throw new Error(
      "Rating gap must be null or a finite integer.",
    );
  }
}

function resolveCountry(
  country:
    string | null,
): string | null {
  const normalized =
    normalizeText(
      country,
    );

  if (
    normalized ===
    null
  ) {
    return null;
  }

  /*
   * Conservative aliases only.
   *
   * Do not attempt fuzzy country matching.
   */
  const aliases =
    new Map<
      string,
      string
    >([
      [
        "egypt",
        "egypt",
      ],

      [
        "egyptian",
        "egypt",
      ],

      [
        "slovenia",
        "slovenia",
      ],

      [
        "slovenian",
        "slovenia",
      ],

      [
        "slovakia",
        "slovakia",
      ],

      [
        "slovak",
        "slovakia",
      ],
    ]);

  return (
    aliases.get(
      normalized,
    ) ??
    normalized
  );
}

/*
 * League Behaviour v0.1
 *
 * PURPOSE
 * -------
 * Represent competition-specific behaviour that
 * changes how DictazIQ interprets a rating gap.
 *
 * This is intentionally an EXPERIMENTAL PRIOR
 * layer.
 *
 * The rules below originate from accumulated
 * manual experience with the rating model and
 * have NOT yet been statistically calibrated.
 *
 * Therefore:
 *
 * - no probabilities
 * - no automatic recommendation
 * - no hidden weighting
 * - no modification of frozen Core v0.2
 *
 * Future versions should replace or validate
 * these priors with historical league-level
 * outcome frequencies.
 */
export function evaluateLeagueBehaviourV01(
  input:
    LeagueBehaviourInputV01,
): LeagueBehaviourResultV01 {
  validateRatingGap(
    input.ratingGap,
  );

  const country =
    resolveCountry(
      input.country,
    );

  const ratingGap =
    input.ratingGap;

  const absoluteGap =
    ratingGap === null
      ? null
      : Math.abs(
          ratingGap,
        );

  /*
   * EGYPT
   *
   * Experienced observation:
   *
   * rating difference 1-4
   *     ↓
   * elevated draw tendency
   *     +
   * elevated Under 2.5 tendency
   *
   * Important:
   * zero is NOT included here because the
   * stated league-specific observation was
   * specifically difference 1-4.
   */
  if (
    country ===
      "egypt" &&
    absoluteGap !==
      null &&
    absoluteGap >= 1 &&
    absoluteGap <= 4
  ) {
    return {
      modelVersion:
        LEAGUE_BEHAVIOUR_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      profile:
        "egypt_micro_gap",

      normalizedCountry:
        country,

      ratingGap,
      absoluteGap,

      gapReliability:
        "normal",

      resultSignal:
        "draw_support",

      goalsSignal:
        "under_2_5_support",

      bttsSignal:
        "none",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "Egyptian fixture with a 1-4 absolute rating gap. Experimental league prior supports Draw and Under 2.5, but does not itself qualify either market.",
    };
  }

  /*
   * SLOVENIA / SLOVAKIA
   *
   * Experienced observation:
   *
   * these competitions can behave inconsistently
   * relative to the rating-gap direction.
   *
   * We therefore classify them as SWING leagues.
   *
   * This does not predict the opposite result.
   * It simply tells downstream models to place
   * less standalone trust in the rating gap.
   */
  if (
    country ===
      "slovenia" ||
    country ===
      "slovakia"
  ) {
    return {
      modelVersion:
        LEAGUE_BEHAVIOUR_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      profile:
        "swing_league",

      normalizedCountry:
        country,

      ratingGap,
      absoluteGap,

      gapReliability:
        "reduced",

      resultSignal:
        "none",

      goalsSignal:
        "none",

      bttsSignal:
        "none",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `${country === "slovenia" ? "Slovenia" : "Slovakia"} is provisionally classified as a swing league. Rating-gap evidence should receive reduced standalone reliance until league-specific behaviour is historically calibrated.`,
    };
  }

  /*
   * Everything else remains neutral.
   *
   * We deliberately do NOT invent league
   * characteristics for competitions we have
   * not yet studied.
   */
  return {
    modelVersion:
      LEAGUE_BEHAVIOUR_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    profile:
      "neutral",

    normalizedCountry:
      country,

    ratingGap,
    absoluteGap,

    gapReliability:
      "normal",

    resultSignal:
      "none",

    goalsSignal:
      "none",

    bttsSignal:
      "none",

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason:
      "No validated DictazIQ league-behaviour prior currently applies. The fixture remains neutral at the league-behaviour layer.",
  };
}
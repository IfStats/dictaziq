import {
  evaluateUniversalOutcomeV01,
  type UniversalOutcomeConfidenceV01,
  type UniversalOutcomeInputV01,
  type UniversalOutcomeResultV01,
} from "./universal-outcome-v0.1";

import {
  evaluateLeagueBehaviourV01,
  type LeagueBehaviourResultV01,
} from "./league-behaviour-v0.1";

export const UNIVERSAL_OUTCOME_LEAGUE_MODEL_VERSION_V01 =
  "dictaziq-universal-outcome-league-v0.1" as const;

export type LeagueAgreementV01 =
  | "reinforces"
  | "reduced_reliability"
  | "neutral";

export type UniversalOutcomeLeagueInputV01 =
  UniversalOutcomeInputV01 & {
    country:
      string | null;

    competitionName:
      string | null;
  };

export type UniversalOutcomeLeagueResultV01 = {
  modelVersion:
    typeof UNIVERSAL_OUTCOME_LEAGUE_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  forecast:
    UniversalOutcomeResultV01["forecast"];

  confidence:
    UniversalOutcomeConfidenceV01;

  evidenceGrade:
    UniversalOutcomeResultV01["evidenceGrade"];

  basis:
    UniversalOutcomeResultV01["basis"];

  ratingGap:
    number | null;

  absoluteGap:
    number | null;

  ratingBand:
    UniversalOutcomeResultV01["ratingBand"];

  leagueAgreement:
    LeagueAgreementV01;

  leagueProfile:
    LeagueBehaviourResultV01["profile"];

  gapReliability:
    LeagueBehaviourResultV01["gapReliability"];

  marketSignals: {
    result:
      LeagueBehaviourResultV01["resultSignal"];

    goals:
      LeagueBehaviourResultV01["goalsSignal"];

    btts:
      LeagueBehaviourResultV01["bttsSignal"];
  };

  components: {
    universalOutcome:
      UniversalOutcomeResultV01;

    leagueBehaviour:
      LeagueBehaviourResultV01;
  };

  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

function downgradeConfidence(
  confidence:
    UniversalOutcomeConfidenceV01,
): UniversalOutcomeConfidenceV01 {
  switch (
    confidence
  ) {
    case "high":
      return "medium";

    case "medium":
      return "low";

    case "low":
      return "very_low";

    case "very_low":
      return "very_low";
  }
}

/*
 * Universal Outcome + League Behaviour v0.1
 *
 * PURPOSE
 * -------
 * Compose:
 *
 *   Universal Outcome v0.1
 *          +
 *   League Behaviour v0.1
 *
 * without changing either component model.
 *
 * Rules:
 *
 * 1. Universal Outcome always supplies the
 *    HOME / DRAW / AWAY forecast.
 *
 * 2. League Behaviour can:
 *
 *    - reinforce an existing result interpretation
 *    - reduce confidence in swing leagues
 *    - surface a Goals-market hint
 *
 * 3. League Behaviour does NOT automatically
 *    reverse a forecast.
 *
 * 4. League Behaviour does NOT create a betting
 *    recommendation.
 *
 * 5. League Behaviour does NOT create a
 *    calibrated probability.
 *
 * IMPORTANT
 * ---------
 * Egypt micro-gap support is currently an
 * experienced experimental prior.
 *
 * Therefore it does not increase numeric
 * probability and does not promote confidence
 * until historically validated.
 *
 * Slovenia and Slovakia are treated more
 * conservatively: their swing classification
 * downgrades confidence by one class.
 */
export function evaluateUniversalOutcomeLeagueV01(
  input:
    UniversalOutcomeLeagueInputV01,
): UniversalOutcomeLeagueResultV01 {
  const universalOutcome =
    evaluateUniversalOutcomeV01({
      home:
        input.home,

      away:
        input.away,

      competitionPrior:
        input.competitionPrior,
    });

  const leagueBehaviour =
    evaluateLeagueBehaviourV01({
      country:
        input.country,

      competitionName:
        input.competitionName,

      ratingGap:
        universalOutcome.ratingGap,
    });

  let confidence =
    universalOutcome.confidence;

  let leagueAgreement:
    LeagueAgreementV01 =
      "neutral";

  /*
   * Swing leagues:
   *
   * Keep the directional forecast but reduce
   * standalone trust in the rating-derived signal.
   */
  if (
    leagueBehaviour.profile ===
    "swing_league"
  ) {
    confidence =
      downgradeConfidence(
        universalOutcome.confidence,
      );

    leagueAgreement =
      "reduced_reliability";
  }

  /*
   * Egypt micro-gap:
   *
   * Universal Outcome v0.1 already forecasts
   * Draw for |D| = 1-4.
   *
   * The Egypt prior therefore reinforces the
   * direction rather than replacing it.
   *
   * We deliberately do NOT upgrade confidence
   * because this prior has not yet been
   * statistically calibrated.
   */
  else if (
    leagueBehaviour.resultSignal ===
      "draw_support" &&
    universalOutcome.forecast ===
      "draw"
  ) {
    leagueAgreement =
      "reinforces";
  }

  let reason =
    universalOutcome.reason;

  if (
    leagueAgreement ===
    "reinforces"
  ) {
    reason =
      `${universalOutcome.reason} League Behaviour v0.1 independently flags this Egyptian 1-4 micro-gap as experimental Draw support and also supplies Under 2.5 support. Confidence is not upgraded until that league prior is historically validated.`;
  }

  if (
    leagueAgreement ===
    "reduced_reliability"
  ) {
    reason =
      `${universalOutcome.reason} League Behaviour v0.1 classifies this competition country as a swing environment, so the forecast direction is retained but confidence is reduced by one class.`;
  }

  if (
    leagueAgreement ===
    "neutral"
  ) {
    reason =
      `${universalOutcome.reason} No active league-behaviour adjustment applies.`;
  }

  return {
    modelVersion:
      UNIVERSAL_OUTCOME_LEAGUE_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    forecast:
      universalOutcome.forecast,

    confidence,

    evidenceGrade:
      universalOutcome.evidenceGrade,

    basis:
      universalOutcome.basis,

    ratingGap:
      universalOutcome.ratingGap,

    absoluteGap:
      universalOutcome.absoluteGap,

    ratingBand:
      universalOutcome.ratingBand,

    leagueAgreement,

    leagueProfile:
      leagueBehaviour.profile,

    gapReliability:
      leagueBehaviour.gapReliability,

    marketSignals: {
      result:
        leagueBehaviour.resultSignal,

      goals:
        leagueBehaviour.goalsSignal,

      btts:
        leagueBehaviour.bttsSignal,
    },

    components: {
      universalOutcome,
      leagueBehaviour,
    },

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason,
  };
}
import {
  evaluateUniversalOutcomeLeagueV01,
  type UniversalOutcomeLeagueResultV01,
} from "./universal-outcome-league-v0.1";

import type {
  CompetitionOutcomePriorV01,
} from "./universal-outcome-v0.1";

import {
  evaluateRatingInteractionV01,
  type RatingInteractionInputV01,
  type RatingInteractionResultV01,
} from "./rating-interaction-v0.1";

export const MATCH_PROFILE_MODEL_VERSION_V01 =
  "dictaziq-match-profile-v0.1" as const;

export type MatchGapClassV01 =
  | "micro_parity"
  | "small_parity"
  | "moderate_advantage"
  | "major_advantage"
  | "unavailable";

export type MatchProfileStateV01 =
  | "true_parity"
  | "directional_parity"
  | "unstable_parity"
  | "stable_advantage"
  | "reinforced_advantage"
  | "challenged_advantage"
  | "dominant_advantage"
  | "prior_only";

export type MatchProfileEvidenceV01 =
  | "rating_only"
  | "rating_and_trajectory"
  | "rating_and_league"
  | "rating_trajectory_and_league"
  | "prior_only";

export type MatchProfileInputV01 = {
  country:
    string | null;

  competitionName:
    string | null;

  home:
    RatingInteractionInputV01["home"];

  away:
    RatingInteractionInputV01["away"];

  competitionPrior?:
    CompetitionOutcomePriorV01 | null;
};

export type MatchProfileResultV01 = {
  modelVersion:
    typeof MATCH_PROFILE_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  forecast:
    UniversalOutcomeLeagueResultV01["forecast"];

  confidence:
    UniversalOutcomeLeagueResultV01["confidence"];

  evidenceGrade:
    UniversalOutcomeLeagueResultV01["evidenceGrade"];

  currentRatingGap:
    number | null;

  absoluteCurrentRatingGap:
    number | null;

  higherRatedSide:
    RatingInteractionResultV01["higherRatedSide"];

  gapClass:
    MatchGapClassV01;

  profile:
    MatchProfileStateV01;

  profileEvidence:
    MatchProfileEvidenceV01;

  trajectoryInteraction:
    RatingInteractionResultV01["interaction"];

  gapMovement:
    RatingInteractionResultV01["gapMovement"];

  trajectoryLeader:
    RatingInteractionResultV01["trajectoryLeader"];

  leagueProfile:
    UniversalOutcomeLeagueResultV01["leagueProfile"];

  leagueAgreement:
    UniversalOutcomeLeagueResultV01["leagueAgreement"];

  gapReliability:
    UniversalOutcomeLeagueResultV01["gapReliability"];

  marketSignals:
    UniversalOutcomeLeagueResultV01["marketSignals"];

  components: {
    outcome:
      UniversalOutcomeLeagueResultV01;

    ratingInteraction:
      RatingInteractionResultV01;
  };

  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

function gapClassFromDifference(
  gap:
    number | null,
): MatchGapClassV01 {
  if (
    gap === null
  ) {
    return "unavailable";
  }

  const absoluteGap =
    Math.abs(
      gap,
    );

  if (
    absoluteGap <= 4
  ) {
    return "micro_parity";
  }

  if (
    absoluteGap <= 49
  ) {
    return "small_parity";
  }

  if (
    absoluteGap <= 149
  ) {
    return "moderate_advantage";
  }

  return "major_advantage";
}

function determineProfileEvidence(
  interaction:
    RatingInteractionResultV01,

  outcome:
    UniversalOutcomeLeagueResultV01,
): MatchProfileEvidenceV01 {
  if (
    interaction.currentRatingGap ===
    null
  ) {
    return "prior_only";
  }

  const hasTrajectory =
    interaction
      .trajectoryEvidence !==
    "unavailable";

  const hasLeagueAdjustment =
    outcome.leagueAgreement !==
    "neutral";

  if (
    hasTrajectory &&
    hasLeagueAdjustment
  ) {
    return "rating_trajectory_and_league";
  }

  if (
    hasTrajectory
  ) {
    return "rating_and_trajectory";
  }

  if (
    hasLeagueAdjustment
  ) {
    return "rating_and_league";
  }

  return "rating_only";
}

/*
 * Match Profile v0.1
 *
 * PURPOSE
 * -------
 *
 * Convert the mathematical state of a fixture
 * into a deterministic descriptive profile.
 *
 * Primary hierarchy:
 *
 * 1. Current FootballDatabase ratings
 * 2. Current rating difference D
 * 3. Rating trajectory interaction
 * 4. League behaviour
 *
 * The current ratings are NEVER altered.
 *
 * This engine does NOT:
 *
 * - create another team-strength score
 * - generate probabilities
 * - choose BTTS
 * - choose Over/Under
 * - create a betting recommendation
 *
 * It describes the mathematical match condition
 * that downstream market engines can consume.
 */
export function evaluateMatchProfileV01(
  input:
    MatchProfileInputV01,
): MatchProfileResultV01 {
  const ratingInteraction =
    evaluateRatingInteractionV01({
      home:
        input.home,

      away:
        input.away,
    });

  /*
   * Use exactly the current ratings determined
   * from the rating-history inputs.
   *
   * No trajectory adjustment is applied.
   */
  const outcome =
    evaluateUniversalOutcomeLeagueV01({
      country:
        input.country,

      competitionName:
        input.competitionName,

      home: {
        rating:
          ratingInteraction
            .home
            .currentRating,
      },

      away: {
        rating:
          ratingInteraction
            .away
            .currentRating,
      },

      competitionPrior:
        input.competitionPrior,
    });

  const currentRatingGap =
    ratingInteraction
      .currentRatingGap;

  const absoluteCurrentRatingGap =
    ratingInteraction
      .absoluteCurrentRatingGap;

  const gapClass =
    gapClassFromDifference(
      currentRatingGap,
    );

  const profileEvidence =
    determineProfileEvidence(
      ratingInteraction,
      outcome,
    );

  /*
   * PRIOR-ONLY
   *
   * Universal forecasting may still return an
   * outcome through its competition/global
   * fallback, but Match Profile does not pretend
   * that a mathematical rating relationship exists.
   */
  if (
    currentRatingGap ===
      null
  ) {
    return {
      modelVersion:
        MATCH_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      forecast:
        outcome.forecast,

      confidence:
        outcome.confidence,

      evidenceGrade:
        outcome.evidenceGrade,

      currentRatingGap:
        null,

      absoluteCurrentRatingGap:
        null,

      higherRatedSide:
        ratingInteraction
          .higherRatedSide,

      gapClass:
        "unavailable",

      profile:
        "prior_only",

      profileEvidence,

      trajectoryInteraction:
        ratingInteraction
          .interaction,

      gapMovement:
        ratingInteraction
          .gapMovement,

      trajectoryLeader:
        ratingInteraction
          .trajectoryLeader,

      leagueProfile:
        outcome.leagueProfile,

      leagueAgreement:
        outcome.leagueAgreement,

      gapReliability:
        outcome.gapReliability,

      marketSignals:
        outcome.marketSignals,

      components: {
        outcome,
        ratingInteraction,
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "No comparable current rating pair is available. Universal forecasting may use a fallback prior, but the mathematical match profile remains prior-only.",
    };
  }

  /*
   * MICRO PARITY
   *
   * |D| = 0-4
   *
   * This remains the strongest mathematical
   * parity band in the current DictazIQ model.
   */
  if (
    gapClass ===
    "micro_parity"
  ) {
    const unstableTrajectory =
      ratingInteraction.interaction ===
        "conflicting" ||
      ratingInteraction.interaction ===
        "converging" ||
      ratingInteraction.interaction ===
        "diverging";

    const unstableLeague =
      outcome.gapReliability ===
      "reduced";

    if (
      unstableTrajectory ||
      unstableLeague
    ) {
      return {
        modelVersion:
          MATCH_PROFILE_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        forecast:
          outcome.forecast,

        confidence:
          outcome.confidence,

        evidenceGrade:
          outcome.evidenceGrade,

        currentRatingGap,

        absoluteCurrentRatingGap,

        higherRatedSide:
          ratingInteraction
            .higherRatedSide,

        gapClass,

        profile:
          "unstable_parity",

        profileEvidence,

        trajectoryInteraction:
          ratingInteraction
            .interaction,

        gapMovement:
          ratingInteraction
            .gapMovement,

        trajectoryLeader:
          ratingInteraction
            .trajectoryLeader,

        leagueProfile:
          outcome.leagueProfile,

        leagueAgreement:
          outcome.leagueAgreement,

        gapReliability:
          outcome.gapReliability,

        marketSignals:
          outcome.marketSignals,

        components: {
          outcome,
          ratingInteraction,
        },

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,

        reason:
          `Current rating difference is ${currentRatingGap}, placing the fixture inside the 0-4 micro-parity band. Trajectory or league behaviour introduces instability, so this is classified as unstable parity.`,
      };
    }

    return {
      modelVersion:
        MATCH_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      forecast:
        outcome.forecast,

      confidence:
        outcome.confidence,

      evidenceGrade:
        outcome.evidenceGrade,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide:
        ratingInteraction
          .higherRatedSide,

      gapClass,

      profile:
        "true_parity",

      profileEvidence,

      trajectoryInteraction:
        ratingInteraction
          .interaction,

      gapMovement:
        ratingInteraction
          .gapMovement,

      trajectoryLeader:
        ratingInteraction
          .trajectoryLeader,

      leagueProfile:
        outcome.leagueProfile,

      leagueAgreement:
        outcome.leagueAgreement,

      gapReliability:
        outcome.gapReliability,

      marketSignals:
        outcome.marketSignals,

      components: {
        outcome,
        ratingInteraction,
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating difference is ${currentRatingGap}, placing the fixture inside the 0-4 micro-parity band without a mathematical signal strong enough to move the fixture out of parity.`,
    };
  }

  /*
   * SMALL PARITY
   *
   * |D| = 5-49
   *
   * There is a direction in the ratings, but the
   * teams remain close on the current strength scale.
   */
  if (
    gapClass ===
    "small_parity"
  ) {
    const challenged =
      ratingInteraction
        .currentAdvantageInterpretation ===
        "challenged" ||
      outcome.gapReliability ===
        "reduced";

    if (
      challenged
    ) {
      return {
        modelVersion:
          MATCH_PROFILE_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        forecast:
          outcome.forecast,

        confidence:
          outcome.confidence,

        evidenceGrade:
          outcome.evidenceGrade,

        currentRatingGap,

        absoluteCurrentRatingGap,

        higherRatedSide:
          ratingInteraction
            .higherRatedSide,

        gapClass,

        profile:
          "unstable_parity",

        profileEvidence,

        trajectoryInteraction:
          ratingInteraction
            .interaction,

        gapMovement:
          ratingInteraction
            .gapMovement,

        trajectoryLeader:
          ratingInteraction
            .trajectoryLeader,

        leagueProfile:
          outcome.leagueProfile,

        leagueAgreement:
          outcome.leagueAgreement,

        gapReliability:
          outcome.gapReliability,

        marketSignals:
          outcome.marketSignals,

        components: {
          outcome,
          ratingInteraction,
        },

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,

        reason:
          `Current rating difference is ${currentRatingGap}, inside the 5-49 parity band. A trajectory or league-reliability signal challenges the small current advantage, producing unstable parity.`,
      };
    }

    return {
      modelVersion:
        MATCH_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      forecast:
        outcome.forecast,

      confidence:
        outcome.confidence,

      evidenceGrade:
        outcome.evidenceGrade,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide:
        ratingInteraction
          .higherRatedSide,

      gapClass,

      profile:
        "directional_parity",

      profileEvidence,

      trajectoryInteraction:
        ratingInteraction
          .interaction,

      gapMovement:
        ratingInteraction
          .gapMovement,

      trajectoryLeader:
        ratingInteraction
          .trajectoryLeader,

      leagueProfile:
        outcome.leagueProfile,

      leagueAgreement:
        outcome.leagueAgreement,

      gapReliability:
        outcome.gapReliability,

      marketSignals:
        outcome.marketSignals,

      components: {
        outcome,
        ratingInteraction,
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating difference is ${currentRatingGap}. The teams are mathematically close in the 5-49 band, but the current ratings retain a directional advantage toward ${ratingInteraction.higherRatedSide}.`,
    };
  }

  /*
   * MODERATE / MAJOR ADVANTAGE
   *
   * |D| >= 50
   */
  const challenged =
    ratingInteraction
      .currentAdvantageInterpretation ===
      "challenged" ||
    outcome.gapReliability ===
      "reduced";

  if (
    challenged
  ) {
    return {
      modelVersion:
        MATCH_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      forecast:
        outcome.forecast,

      confidence:
        outcome.confidence,

      evidenceGrade:
        outcome.evidenceGrade,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide:
        ratingInteraction
          .higherRatedSide,

      gapClass,

      profile:
        "challenged_advantage",

      profileEvidence,

      trajectoryInteraction:
        ratingInteraction
          .interaction,

      gapMovement:
        ratingInteraction
          .gapMovement,

      trajectoryLeader:
        ratingInteraction
          .trajectoryLeader,

      leagueProfile:
        outcome.leagueProfile,

      leagueAgreement:
        outcome.leagueAgreement,

      gapReliability:
        outcome.gapReliability,

      marketSignals:
        outcome.marketSignals,

      components: {
        outcome,
        ratingInteraction,
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating difference is ${currentRatingGap}, giving ${ratingInteraction.higherRatedSide} a measurable rating advantage. The current advantage is challenged by trajectory or league-behaviour evidence, but the ratings themselves remain unchanged.`,
    };
  }

  const reinforced =
    ratingInteraction
      .currentAdvantageInterpretation ===
    "reinforced";

  /*
   * A major 150+ rating difference remains
   * a dominant mathematical separation when
   * it is not actively challenged.
   */
  if (
    gapClass ===
    "major_advantage"
  ) {
    return {
      modelVersion:
        MATCH_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      forecast:
        outcome.forecast,

      confidence:
        outcome.confidence,

      evidenceGrade:
        outcome.evidenceGrade,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide:
        ratingInteraction
          .higherRatedSide,

      gapClass,

      profile:
        "dominant_advantage",

      profileEvidence,

      trajectoryInteraction:
        ratingInteraction
          .interaction,

      gapMovement:
        ratingInteraction
          .gapMovement,

      trajectoryLeader:
        ratingInteraction
          .trajectoryLeader,

      leagueProfile:
        outcome.leagueProfile,

      leagueAgreement:
        outcome.leagueAgreement,

      gapReliability:
        outcome.gapReliability,

      marketSignals:
        outcome.marketSignals,

      components: {
        outcome,
        ratingInteraction,
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        reinforced
          ? `Current rating difference is ${currentRatingGap}, a 150+ major strength separation. Rating trajectory also reinforces the ${ratingInteraction.higherRatedSide} advantage, so the fixture is classified as dominant advantage.`
          : `Current rating difference is ${currentRatingGap}, a 150+ major strength separation. No active mathematical signal currently challenges the ${ratingInteraction.higherRatedSide} advantage.`,
    };
  }

  if (
    reinforced
  ) {
    return {
      modelVersion:
        MATCH_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      forecast:
        outcome.forecast,

      confidence:
        outcome.confidence,

      evidenceGrade:
        outcome.evidenceGrade,

      currentRatingGap,

      absoluteCurrentRatingGap,

      higherRatedSide:
        ratingInteraction
          .higherRatedSide,

      gapClass,

      profile:
        "reinforced_advantage",

      profileEvidence,

      trajectoryInteraction:
        ratingInteraction
          .interaction,

      gapMovement:
        ratingInteraction
          .gapMovement,

      trajectoryLeader:
        ratingInteraction
          .trajectoryLeader,

      leagueProfile:
        outcome.leagueProfile,

      leagueAgreement:
        outcome.leagueAgreement,

      gapReliability:
        outcome.gapReliability,

      marketSignals:
        outcome.marketSignals,

      components: {
        outcome,
        ratingInteraction,
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Current rating difference is ${currentRatingGap}. The 50-149 rating advantage is mathematically reinforced by the relative rating trajectory.`,
    };
  }

  return {
    modelVersion:
      MATCH_PROFILE_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    forecast:
      outcome.forecast,

    confidence:
      outcome.confidence,

    evidenceGrade:
      outcome.evidenceGrade,

    currentRatingGap,

    absoluteCurrentRatingGap,

    higherRatedSide:
      ratingInteraction
        .higherRatedSide,

    gapClass,

    profile:
      "stable_advantage",

    profileEvidence,

    trajectoryInteraction:
      ratingInteraction
        .interaction,

    gapMovement:
      ratingInteraction
        .gapMovement,

    trajectoryLeader:
      ratingInteraction
        .trajectoryLeader,

    leagueProfile:
      outcome.leagueProfile,

    leagueAgreement:
      outcome.leagueAgreement,

    gapReliability:
      outcome.gapReliability,

    marketSignals:
      outcome.marketSignals,

    components: {
      outcome,
      ratingInteraction,
    },

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason:
      `Current rating difference is ${currentRatingGap}, giving ${ratingInteraction.higherRatedSide} a 50-149 mathematical advantage. No active trajectory or league signal currently reinforces or challenges that relationship.`,
  };
}
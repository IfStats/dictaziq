export const SCORING_PROFILE_MODEL_VERSION_V01 =
  "dictaziq-scoring-profile-v0.1" as const;

export const SCORING_PROFILE_MIN_MATCHES_V01 =
  5 as const;

export type TeamScoringProfileStatusV01 =
  | "available"
  | "unavailable";

export type AttackClassV01 =
  | "high"
  | "moderate"
  | "low"
  | "unknown";

export type DefenceClassV01 =
  | "resistant"
  | "balanced"
  | "vulnerable"
  | "unknown";

export type GoalEnvironmentV01 =
  | "open"
  | "mixed"
  | "closed"
  | "unknown";

export type MatchScoringArchetypeV01 =
  | "open_parity"
  | "closed_parity"
  | "mixed_parity"
  | "open_mismatch"
  | "closed_mismatch"
  | "mixed_mismatch"
  | "insufficient";

export type GoalsSupportSignalV01 =
  | "over_2_5_support"
  | "under_2_5_support"
  | "none";

export type BttsSupportSignalV01 =
  | "yes_support"
  | "no_support"
  | "none";

export type TeamScoringSampleV01 = {
  matches: number;

  goalsFor: number;

  goalsAgainst: number;

  scoredMatches: number;

  concededMatches: number;

  bttsMatches: number;

  over15Matches: number;

  over25Matches: number;

  over35Matches: number;
};

export type TeamScoringProfileInputV01 = {
  teamId: string;

  teamName: string;

  source: string;

  cutoffAt: string;

  sample:
    TeamScoringSampleV01;
};

export type TeamScoringProfileResultV01 = {
  modelVersion:
    typeof SCORING_PROFILE_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  teamId: string;

  teamName: string;

  source: string;

  cutoffAt: string;

  status:
    TeamScoringProfileStatusV01;

  matches: number;

  averageGoalsFor:
    number | null;

  averageGoalsAgainst:
    number | null;

  scoringRate:
    number | null;

  concedingRate:
    number | null;

  bttsRate:
    number | null;

  over15Rate:
    number | null;

  over25Rate:
    number | null;

  over35Rate:
    number | null;

  attackClass:
    AttackClassV01;

  defenceClass:
    DefenceClassV01;

  goalEnvironment:
    GoalEnvironmentV01;

  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

export type MatchScoringProfileInputV01 = {
  ratingGap:
    number | null;

  home:
    TeamScoringProfileInputV01;

  away:
    TeamScoringProfileInputV01;
};

export type MatchScoringProfileResultV01 = {
  modelVersion:
    typeof SCORING_PROFILE_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  ratingGap:
    number | null;

  absoluteRatingGap:
    number | null;

  ratingRelationship:
    | "parity"
    | "mismatch"
    | "unavailable";

  higherRatedSide:
    | "home"
    | "away"
    | "level"
    | "unavailable";

  archetype:
    MatchScoringArchetypeV01;

  home:
    TeamScoringProfileResultV01;

  away:
    TeamScoringProfileResultV01;

  marketSignals: {
    goals:
      GoalsSupportSignalV01;

    btts:
      BttsSupportSignalV01;
  };

  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

function assertInteger(
  value: number,
  label: string,
): void {
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
      `${label} must be a non-negative finite integer.`,
    );
  }
}

function assertCutoff(
  value: string,
): void {
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
      "Scoring-profile cutoff timestamp is invalid.",
    );
  }
}

function roundMetric(
  value: number,
): number {
  return Number(
    value.toFixed(
      4,
    ),
  );
}

function rate(
  count: number,
  matches: number,
): number {
  return roundMetric(
    count /
      matches,
  );
}

function validateTeamInput(
  input:
    TeamScoringProfileInputV01,
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

  if (
    !input.source.trim()
  ) {
    throw new Error(
      "Scoring-profile source must not be empty.",
    );
  }

  assertCutoff(
    input.cutoffAt,
  );

  const sample =
    input.sample;

  assertInteger(
    sample.matches,
    "Matches",
  );

  assertInteger(
    sample.goalsFor,
    "Goals for",
  );

  assertInteger(
    sample.goalsAgainst,
    "Goals against",
  );

  assertInteger(
    sample.scoredMatches,
    "Scored matches",
  );

  assertInteger(
    sample.concededMatches,
    "Conceded matches",
  );

  assertInteger(
    sample.bttsMatches,
    "BTTS matches",
  );

  assertInteger(
    sample.over15Matches,
    "Over 1.5 matches",
  );

  assertInteger(
    sample.over25Matches,
    "Over 2.5 matches",
  );

  assertInteger(
    sample.over35Matches,
    "Over 3.5 matches",
  );

  const boundedCounts = [
    [
      sample.scoredMatches,
      "Scored matches",
    ],

    [
      sample.concededMatches,
      "Conceded matches",
    ],

    [
      sample.bttsMatches,
      "BTTS matches",
    ],

    [
      sample.over15Matches,
      "Over 1.5 matches",
    ],

    [
      sample.over25Matches,
      "Over 2.5 matches",
    ],

    [
      sample.over35Matches,
      "Over 3.5 matches",
    ],
  ] as const;

  for (
    const [
      value,
      label,
    ]
    of boundedCounts
  ) {
    if (
      value >
      sample.matches
    ) {
      throw new Error(
        `${label} cannot exceed total matches.`,
      );
    }
  }
}

function classifyAttack(
  averageGoalsFor: number,
  scoringRate: number,
): AttackClassV01 {
  /*
   * Experimental deterministic boundaries.
   *
   * These are model v0.1 classification
   * thresholds, not calibrated probabilities.
   */
  if (
    averageGoalsFor >=
      1.6 &&
    scoringRate >=
      0.75
  ) {
    return "high";
  }

  if (
    averageGoalsFor <=
      0.9 &&
    scoringRate <=
      0.55
  ) {
    return "low";
  }

  return "moderate";
}

function classifyDefence(
  averageGoalsAgainst:
    number,

  concedingRate:
    number,
): DefenceClassV01 {
  if (
    averageGoalsAgainst <=
      0.9 &&
    concedingRate <=
      0.55
  ) {
    return "resistant";
  }

  if (
    averageGoalsAgainst >=
      1.5 &&
    concedingRate >=
      0.7
  ) {
    return "vulnerable";
  }

  return "balanced";
}

function classifyEnvironment(
  bttsRate: number,
  over25Rate: number,
): GoalEnvironmentV01 {
  if (
    bttsRate >=
      0.6 &&
    over25Rate >=
      0.6
  ) {
    return "open";
  }

  if (
    bttsRate <=
      0.4 &&
    over25Rate <=
      0.4
  ) {
    return "closed";
  }

  return "mixed";
}

/*
 * TEAM SCORING PROFILE
 *
 * This is built entirely from observed
 * football results.
 *
 * No club-name reputation.
 * No subjective attacking label.
 * No fabricated xG.
 */
export function evaluateTeamScoringProfileV01(
  input:
    TeamScoringProfileInputV01,
): TeamScoringProfileResultV01 {
  validateTeamInput(
    input,
  );

  const sample =
    input.sample;

  if (
    sample.matches <
    SCORING_PROFILE_MIN_MATCHES_V01
  ) {
    return {
      modelVersion:
        SCORING_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      teamId:
        input.teamId,

      teamName:
        input.teamName,

      source:
        input.source.trim(),

      cutoffAt:
        new Date(
          input.cutoffAt,
        ).toISOString(),

      status:
        "unavailable",

      matches:
        sample.matches,

      averageGoalsFor:
        null,

      averageGoalsAgainst:
        null,

      scoringRate:
        null,

      concedingRate:
        null,

      bttsRate:
        null,

      over15Rate:
        null,

      over25Rate:
        null,

      over35Rate:
        null,

      attackClass:
        "unknown",

      defenceClass:
        "unknown",

      goalEnvironment:
        "unknown",

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `Only ${sample.matches} completed matches are available. Scoring Profile v0.1 requires at least ${SCORING_PROFILE_MIN_MATCHES_V01}.`,
    };
  }

  const averageGoalsFor =
    roundMetric(
      sample.goalsFor /
        sample.matches,
    );

  const averageGoalsAgainst =
    roundMetric(
      sample.goalsAgainst /
        sample.matches,
    );

  const scoringRate =
    rate(
      sample.scoredMatches,
      sample.matches,
    );

  const concedingRate =
    rate(
      sample.concededMatches,
      sample.matches,
    );

  const bttsRate =
    rate(
      sample.bttsMatches,
      sample.matches,
    );

  const over15Rate =
    rate(
      sample.over15Matches,
      sample.matches,
    );

  const over25Rate =
    rate(
      sample.over25Matches,
      sample.matches,
    );

  const over35Rate =
    rate(
      sample.over35Matches,
      sample.matches,
    );

  const attackClass =
    classifyAttack(
      averageGoalsFor,
      scoringRate,
    );

  const defenceClass =
    classifyDefence(
      averageGoalsAgainst,
      concedingRate,
    );

  const goalEnvironment =
    classifyEnvironment(
      bttsRate,
      over25Rate,
    );

  return {
    modelVersion:
      SCORING_PROFILE_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    teamId:
      input.teamId,

    teamName:
      input.teamName,

    source:
      input.source.trim(),

    cutoffAt:
      new Date(
        input.cutoffAt,
      ).toISOString(),

    status:
      "available",

    matches:
      sample.matches,

    averageGoalsFor,
    averageGoalsAgainst,

    scoringRate,
    concedingRate,

    bttsRate,
    over15Rate,
    over25Rate,
    over35Rate,

    attackClass,
    defenceClass,
    goalEnvironment,

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason:
      `Scoring profile uses ${sample.matches} completed matches. Attack, defence and goal-environment classes are derived from observed goal totals and match occurrence rates.`,
  };
}

function higherRatedSide(
  ratingGap:
    number | null,
):
  | "home"
  | "away"
  | "level"
  | "unavailable" {
  if (
    ratingGap === null
  ) {
    return "unavailable";
  }

  if (
    ratingGap > 0
  ) {
    return "home";
  }

  if (
    ratingGap < 0
  ) {
    return "away";
  }

  return "level";
}

/*
 * MATCH SCORING ARCHETYPE
 *
 * Rating gap is used only to identify whether
 * this is a close-strength matchup or a
 * separated-strength matchup.
 *
 * It does NOT determine the goals market.
 *
 * Goals and BTTS signals are generated from
 * actual scoring/conceding behaviour.
 */
export function evaluateMatchScoringProfileV01(
  input:
    MatchScoringProfileInputV01,
): MatchScoringProfileResultV01 {
  if (
    input.ratingGap !==
      null &&
    (
      !Number.isFinite(
        input.ratingGap,
      ) ||
      !Number.isInteger(
        input.ratingGap,
      )
    )
  ) {
    throw new Error(
      "Rating gap must be null or a finite integer.",
    );
  }

  const home =
    evaluateTeamScoringProfileV01(
      input.home,
    );

  const away =
    evaluateTeamScoringProfileV01(
      input.away,
    );

  const ratingGap =
    input.ratingGap;

  const absoluteRatingGap =
    ratingGap === null
      ? null
      : Math.abs(
          ratingGap,
        );

  const ratedSide =
    higherRatedSide(
      ratingGap,
    );

  if (
    home.status !==
      "available" ||
    away.status !==
      "available"
  ) {
    return {
      modelVersion:
        SCORING_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      ratingGap,

      absoluteRatingGap,

      ratingRelationship:
        ratingGap === null
          ? "unavailable"
          : absoluteRatingGap !==
                null &&
              absoluteRatingGap <=
                49
            ? "parity"
            : "mismatch",

      higherRatedSide:
        ratedSide,

      archetype:
        "insufficient",

      home,
      away,

      marketSignals: {
        goals:
          "none",

        btts:
          "none",
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "At least one team lacks the minimum completed-match sample. No scoring archetype is manufactured.",
    };
  }

  if (
    ratingGap === null ||
    absoluteRatingGap ===
      null
  ) {
    return {
      modelVersion:
        SCORING_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      ratingGap:
        null,

      absoluteRatingGap:
        null,

      ratingRelationship:
        "unavailable",

      higherRatedSide:
        "unavailable",

      archetype:
        "insufficient",

      home,
      away,

      marketSignals: {
        goals:
          "none",

        btts:
          "none",
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "Scoring profiles are available, but no current rating gap is available to classify the matchup relationship.",
    };
  }

  const parity =
    absoluteRatingGap <=
    49;

  const bothOpen =
    (
      home.goalEnvironment ===
        "open" &&
      away.goalEnvironment ===
        "open"
    ) ||
    (
      home.attackClass ===
        "high" &&
      away.attackClass ===
        "high"
    );

  const bothClosed =
    (
      home.goalEnvironment ===
        "closed" &&
      away.goalEnvironment ===
        "closed"
    ) ||
    (
      home.attackClass ===
        "low" &&
      away.attackClass ===
        "low"
    );

  if (
    parity
  ) {
    if (
      bothOpen
    ) {
      return {
        modelVersion:
          SCORING_PROFILE_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        ratingGap,

        absoluteRatingGap,

        ratingRelationship:
          "parity",

        higherRatedSide:
          ratedSide,

        archetype:
          "open_parity",

        home,
        away,

        marketSignals: {
          goals:
            "over_2_5_support",

          btts:
            "yes_support",
        },

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,

        reason:
          `The teams are within the 0-49 rating-parity range and both carry quantitatively open scoring profiles. This supports an open-parity interpretation for Goals and BTTS analysis.`,
      };
    }

    if (
      bothClosed
    ) {
      return {
        modelVersion:
          SCORING_PROFILE_MODEL_VERSION_V01,

        validationStatus:
          "experimental",

        ratingGap,

        absoluteRatingGap,

        ratingRelationship:
          "parity",

        higherRatedSide:
          ratedSide,

        archetype:
          "closed_parity",

        home,
        away,

        marketSignals: {
          goals:
            "under_2_5_support",

          btts:
            "no_support",
        },

        recommendationStatus:
          "not_evaluated",

        calibratedProbability:
          null,

        reason:
          `The teams are within the 0-49 rating-parity range and both carry quantitatively closed scoring profiles. This supports a closed-parity interpretation.`,
      };
    }

    return {
      modelVersion:
        SCORING_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      ratingGap,

      absoluteRatingGap,

      ratingRelationship:
        "parity",

      higherRatedSide:
        ratedSide,

      archetype:
        "mixed_parity",

      home,
      away,

      marketSignals: {
        goals:
          "none",

        btts:
          "none",
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "The current ratings indicate parity, but the two measured scoring profiles do not jointly support either a clearly open or clearly closed goal environment.",
    };
  }

  /*
   * MISMATCH
   *
   * For separated teams, check whether the
   * higher-rated team's attack aligns with a
   * vulnerable defence on the lower-rated side.
   */
  const stronger =
    ratedSide ===
    "home"
      ? home
      : away;

  const weaker =
    ratedSide ===
    "home"
      ? away
      : home;

  const attackingMismatch =
    stronger.attackClass ===
      "high" &&
    weaker.defenceClass ===
      "vulnerable";

  if (
    attackingMismatch
  ) {
    return {
      modelVersion:
        SCORING_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      ratingGap,

      absoluteRatingGap,

      ratingRelationship:
        "mismatch",

      higherRatedSide:
        ratedSide,

      archetype:
        "open_mismatch",

      home,
      away,

      marketSignals: {
        goals:
          "over_2_5_support",

        /*
         * A one-sided scoring mismatch does not
         * prove that both teams will score.
         */
        btts:
          "none",
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        `The rating relationship favours ${ratedSide}, whose measured attack is high while the lower-rated opponent's defence is vulnerable. This supports an open-mismatch Goals interpretation but does not automatically support BTTS.`,
    };
  }

  if (
    bothClosed
  ) {
    return {
      modelVersion:
        SCORING_PROFILE_MODEL_VERSION_V01,

      validationStatus:
        "experimental",

      ratingGap,

      absoluteRatingGap,

      ratingRelationship:
        "mismatch",

      higherRatedSide:
        ratedSide,

      archetype:
        "closed_mismatch",

      home,
      away,

      marketSignals: {
        goals:
          "under_2_5_support",

        btts:
          "no_support",
      },

      recommendationStatus:
        "not_evaluated",

      calibratedProbability:
        null,

      reason:
        "The teams are separated on current rating but both measured scoring profiles are closed. This supports Under 2.5 and BTTS-No investigation.",
    };
  }

  return {
    modelVersion:
      SCORING_PROFILE_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    ratingGap,

    absoluteRatingGap,

    ratingRelationship:
      "mismatch",

    higherRatedSide:
      ratedSide,

    archetype:
      "mixed_mismatch",

    home,
    away,

    marketSignals: {
      goals:
        "none",

      btts:
        "none",
    },

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason:
      "The teams have a measurable rating separation, but the observed scoring profiles do not form a sufficiently clear open or closed matchup archetype.",
  };
}
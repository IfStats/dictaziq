import {
  evaluateMatchProfileV01,
  type MatchProfileInputV01,
  type MatchProfileResultV01,
} from "./match-profile-v0.1";

import {
  evaluateMatchScoringProfileV01,
  type MatchScoringProfileResultV01,
  type TeamScoringProfileInputV01,
} from "./scoring-profile-v0.1";

export const UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01 =
  "dictaziq-unified-match-analysis-v0.1" as const;

export type UnifiedAnalysisCoverageV01 =
  | "full"
  | "result_only"
  | "prior_result_only";

export type UnifiedMarketAgreementV01 =
  | "agreement"
  | "conflict"
  | "single_source"
  | "none";

export type UnifiedGoalsSignalV01 =
  | "over_2_5_support"
  | "under_2_5_support"
  | "conflict"
  | "none";

export type UnifiedBttsSignalV01 =
  | "yes_support"
  | "no_support"
  | "none";

export type UnifiedMatchAnalysisInputV01 = {
  kickoffAt: string;

  inputCutoffAt: string;

  country:
    MatchProfileInputV01["country"];

  competitionName:
    MatchProfileInputV01["competitionName"];

  competitionPrior?:
    MatchProfileInputV01["competitionPrior"];

  home:
    MatchProfileInputV01["home"];

  away:
    MatchProfileInputV01["away"];

  scoring: {
    home:
      TeamScoringProfileInputV01;

    away:
      TeamScoringProfileInputV01;
  };
};

export type UnifiedMatchAnalysisResultV01 = {
  modelVersion:
    typeof UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01;

  validationStatus:
    "experimental";

  timing: {
    kickoffAt: string;

    inputCutoffAt: string;

    leakageGuard:
      "passed";
  };

  forecast:
    MatchProfileResultV01["forecast"];

  confidence:
    MatchProfileResultV01["confidence"];

  evidenceGrade:
    MatchProfileResultV01["evidenceGrade"];

  ratingGap:
    number | null;

  absoluteRatingGap:
    number | null;

  matchProfile:
    MatchProfileResultV01["profile"];

  scoringArchetype:
    MatchScoringProfileResultV01["archetype"];

  coverage:
    UnifiedAnalysisCoverageV01;

  marketEvidence: {
    goals: {
      signal:
        UnifiedGoalsSignalV01;

      agreement:
        UnifiedMarketAgreementV01;

      leagueSignal:
        MatchProfileResultV01["marketSignals"]["goals"];

      scoringSignal:
        MatchScoringProfileResultV01["marketSignals"]["goals"];
    };

    btts: {
      signal:
        UnifiedBttsSignalV01;

      agreement:
        UnifiedMarketAgreementV01;

      scoringSignal:
        MatchScoringProfileResultV01["marketSignals"]["btts"];
    };
  };

  components: {
    matchProfile:
      MatchProfileResultV01;

    scoringProfile:
      MatchScoringProfileResultV01;
  };

  recommendationStatus:
    "not_evaluated";

  calibratedProbability:
    null;

  reason:
    string;
};

function parseTimestamp(
  value: string,
  label: string,
): number {
  const timestamp =
    new Date(
      value,
    ).getTime();

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return timestamp;
}

function normalizeTimestamp(
  value: string,
): string {
  return new Date(
    value,
  ).toISOString();
}

function validateTiming(
  input:
    UnifiedMatchAnalysisInputV01,
): {
  kickoffMs: number;
  cutoffMs: number;
} {
  const kickoffMs =
    parseTimestamp(
      input.kickoffAt,
      "Kickoff timestamp",
    );

  const cutoffMs =
    parseTimestamp(
      input.inputCutoffAt,
      "Input cutoff timestamp",
    );

  /*
   * Strict pre-kickoff requirement.
   *
   * Evidence generated exactly at or after
   * kickoff is not valid pre-match evidence.
   */
  if (
    cutoffMs >=
    kickoffMs
  ) {
    throw new Error(
      "Input cutoff must be strictly before kickoff.",
    );
  }

  const homeScoringCutoff =
    parseTimestamp(
      input.scoring.home.cutoffAt,
      "Home scoring cutoff",
    );

  const awayScoringCutoff =
    parseTimestamp(
      input.scoring.away.cutoffAt,
      "Away scoring cutoff",
    );

  if (
    homeScoringCutoff >
    cutoffMs
  ) {
    throw new Error(
      "Home scoring evidence cutoff cannot be after the unified input cutoff.",
    );
  }

  if (
    awayScoringCutoff >
    cutoffMs
  ) {
    throw new Error(
      "Away scoring evidence cutoff cannot be after the unified input cutoff.",
    );
  }

  /*
   * Rating dynamics currently use date-level
   * FootballDatabase snapshots rather than
   * fabricated intra-day timestamps.
   *
   * Therefore we verify only that their as-of
   * date is not later than the unified cutoff's
   * UTC calendar date.
   */
  const cutoffDate =
    normalizeTimestamp(
      input.inputCutoffAt,
    ).slice(
      0,
      10,
    );

  if (
    input.home.asOfDate >
    cutoffDate
  ) {
    throw new Error(
      "Home rating as-of date cannot be after the unified input cutoff date.",
    );
  }

  if (
    input.away.asOfDate >
    cutoffDate
  ) {
    throw new Error(
      "Away rating as-of date cannot be after the unified input cutoff date.",
    );
  }

  return {
    kickoffMs,
    cutoffMs,
  };
}

function validateTeamIdentity(
  input:
    UnifiedMatchAnalysisInputV01,
): void {
  if (
    input.home.teamId !==
    input.scoring.home.teamId
  ) {
    throw new Error(
      "Home rating and scoring evidence refer to different team IDs.",
    );
  }

  if (
    input.away.teamId !==
    input.scoring.away.teamId
  ) {
    throw new Error(
      "Away rating and scoring evidence refer to different team IDs.",
    );
  }
}

function combineGoalsEvidence(
  leagueSignal:
    MatchProfileResultV01["marketSignals"]["goals"],

  scoringSignal:
    MatchScoringProfileResultV01["marketSignals"]["goals"],
): {
  signal:
    UnifiedGoalsSignalV01;

  agreement:
    UnifiedMarketAgreementV01;
} {
  if (
    leagueSignal ===
      "none" &&
    scoringSignal ===
      "none"
  ) {
    return {
      signal:
        "none",

      agreement:
        "none",
    };
  }

  if (
    leagueSignal ===
    "none"
  ) {
    return {
      signal:
        scoringSignal,

      agreement:
        "single_source",
    };
  }

  if (
    scoringSignal ===
    "none"
  ) {
    return {
      signal:
        leagueSignal,

      agreement:
        "single_source",
    };
  }

  if (
    leagueSignal ===
    scoringSignal
  ) {
    return {
      signal:
        leagueSignal,

      agreement:
        "agreement",
    };
  }

  /*
   * Example:
   *
   * Egypt micro-gap league prior:
   * UNDER 2.5 support
   *
   * Measured team scoring behaviour:
   * OVER 2.5 support
   *
   * We preserve the disagreement.
   * We do not arbitrarily choose one.
   */
  return {
    signal:
      "conflict",

    agreement:
      "conflict",
  };
}

function combineBttsEvidence(
  scoringSignal:
    MatchScoringProfileResultV01["marketSignals"]["btts"],
): {
  signal:
    UnifiedBttsSignalV01;

  agreement:
    UnifiedMarketAgreementV01;
} {
  if (
    scoringSignal ===
    "none"
  ) {
    return {
      signal:
        "none",

      agreement:
        "none",
    };
  }

  /*
   * League Behaviour v0.1 intentionally has
   * no BTTS prior.
   *
   * Therefore scoring evidence is currently
   * the only source at this composition level.
   */
  return {
    signal:
      scoringSignal,

    agreement:
      "single_source",
  };
}

function determineCoverage(
  matchProfile:
    MatchProfileResultV01,

  scoringProfile:
    MatchScoringProfileResultV01,
): UnifiedAnalysisCoverageV01 {
  if (
    matchProfile.currentRatingGap ===
    null
  ) {
    return "prior_result_only";
  }

  if (
    scoringProfile.archetype ===
    "insufficient"
  ) {
    return "result_only";
  }

  return "full";
}

/*
 * Unified Match Analysis v0.1
 *
 * PURPOSE
 * -------
 *
 * Produce one deterministic pre-market analysis
 * object from:
 *
 *   Current Rating Mathematics
 *          +
 *   Rating Dynamics
 *          +
 *   Rating Interaction
 *          +
 *   League Behaviour
 *          +
 *   Scoring Profile
 *
 * The mathematical hierarchy remains intact:
 *
 *   current FootballDatabase rating
 *          ↓
 *   D = home rating - away rating
 *
 * All other layers interpret that relationship.
 *
 * This engine does NOT:
 *
 * - modify current ratings
 * - fabricate missing evidence
 * - fabricate probabilities
 * - select a betting market
 * - produce a qualified recommendation
 *
 * It also enforces a strict pre-kickoff evidence
 * boundary before composing the analysis.
 */
export function evaluateUnifiedMatchAnalysisV01(
  input:
    UnifiedMatchAnalysisInputV01,
): UnifiedMatchAnalysisResultV01 {
  validateTiming(
    input,
  );

  validateTeamIdentity(
    input,
  );

  const matchProfile =
    evaluateMatchProfileV01({
      country:
        input.country,

      competitionName:
        input.competitionName,

      competitionPrior:
        input.competitionPrior,

      home:
        input.home,

      away:
        input.away,
    });

  /*
   * The scoring engine receives D directly
   * from Match Profile.
   *
   * There is only one current rating difference
   * in the unified analysis.
   */
  const scoringProfile =
    evaluateMatchScoringProfileV01({
      ratingGap:
        matchProfile
          .currentRatingGap,

      home:
        input.scoring.home,

      away:
        input.scoring.away,
    });

  const goals =
    combineGoalsEvidence(
      matchProfile
        .marketSignals
        .goals,

      scoringProfile
        .marketSignals
        .goals,
    );

  const btts =
    combineBttsEvidence(
      scoringProfile
        .marketSignals
        .btts,
    );

  const coverage =
    determineCoverage(
      matchProfile,
      scoringProfile,
    );

  let reason:
    string;

  if (
    coverage ===
    "full"
  ) {
    if (
      goals.agreement ===
      "conflict"
    ) {
      reason =
        `Full rating and scoring analysis is available. Result profile is ${matchProfile.profile} and scoring archetype is ${scoringProfile.archetype}. Goals evidence conflicts across analytical sources, so no unified Goals direction should be promoted without further evidence.`;
    } else {
      reason =
        `Full rating and scoring analysis is available. Result profile is ${matchProfile.profile} and scoring archetype is ${scoringProfile.archetype}. Market signals remain analytical evidence rather than betting recommendations.`;
    }
  } else if (
    coverage ===
    "result_only"
  ) {
    reason =
      `Current rating mathematics produced a ${matchProfile.profile} result profile, but sufficient scoring evidence is unavailable. The result forecast remains usable at its stated evidence level while Goals and BTTS remain unresolved.`;
  } else {
    reason =
      "No comparable current rating pair is available. Universal Outcome still supplies a fallback result forecast, but the unified analysis explicitly remains prior-result-only.";
  }

  return {
    modelVersion:
      UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,

    validationStatus:
      "experimental",

    timing: {
      kickoffAt:
        normalizeTimestamp(
          input.kickoffAt,
        ),

      inputCutoffAt:
        normalizeTimestamp(
          input.inputCutoffAt,
        ),

      leakageGuard:
        "passed",
    },

    forecast:
      matchProfile.forecast,

    confidence:
      matchProfile.confidence,

    evidenceGrade:
      matchProfile.evidenceGrade,

    ratingGap:
      matchProfile
        .currentRatingGap,

    absoluteRatingGap:
      matchProfile
        .absoluteCurrentRatingGap,

    matchProfile:
      matchProfile.profile,

    scoringArchetype:
      scoringProfile.archetype,

    coverage,

    marketEvidence: {
      goals: {
        signal:
          goals.signal,

        agreement:
          goals.agreement,

        leagueSignal:
          matchProfile
            .marketSignals
            .goals,

        scoringSignal:
          scoringProfile
            .marketSignals
            .goals,
      },

      btts: {
        signal:
          btts.signal,

        agreement:
          btts.agreement,

        scoringSignal:
          scoringProfile
            .marketSignals
            .btts,
      },
    },

    components: {
      matchProfile,
      scoringProfile,
    },

    recommendationStatus:
      "not_evaluated",

    calibratedProbability:
      null,

    reason,
  };
}
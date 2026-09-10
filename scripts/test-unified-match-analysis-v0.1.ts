import assert from "node:assert/strict";

import {
  evaluateUnifiedMatchAnalysisV01,
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

const SOURCE =
  "footballdatabase.com";

const SCORING_SOURCE =
  "historical-match-results";

const INPUT_CUTOFF =
  "2026-09-10T10:00:00.000Z";

const SCORING_CUTOFF =
  "2026-09-10T09:30:00.000Z";

const KICKOFF =
  "2026-09-10T16:45:00.000Z";

const DATES = [
  "2026-08-16",
  "2026-08-23",
  "2026-08-30",
  "2026-09-06",
];

function ratingTeam(
  teamId: string,
  teamName: string,
  ratings: number[],
) {
  return {
    teamId,
    teamName,

    asOfDate:
      "2026-09-10",

    snapshots:
      ratings.map(
        (
          rating,
          index,
        ) => ({
          rating,

          snapshotDate:
            DATES[index],

          source:
            SOURCE,
        }),
      ),
  };
}

function currentOnly(
  teamId: string,
  teamName: string,
  rating: number,
) {
  return {
    teamId,
    teamName,

    asOfDate:
      "2026-09-10",

    snapshots: [
      {
        rating,

        snapshotDate:
          "2026-09-06",

        source:
          SOURCE,
      },
    ],
  };
}

function scoringTeam(
  teamId: string,
  teamName: string,
  profile:
    | "open"
    | "closed"
    | "vulnerable"
    | "short",
) {
  if (
    profile ===
    "open"
  ) {
    return {
      teamId,
      teamName,

      source:
        SCORING_SOURCE,

      cutoffAt:
        SCORING_CUTOFF,

      sample: {
        matches: 10,
        goalsFor: 20,
        goalsAgainst: 15,
        scoredMatches: 9,
        concededMatches: 8,
        bttsMatches: 7,
        over15Matches: 9,
        over25Matches: 7,
        over35Matches: 5,
      },
    };
  }

  if (
    profile ===
    "closed"
  ) {
    return {
      teamId,
      teamName,

      source:
        SCORING_SOURCE,

      cutoffAt:
        SCORING_CUTOFF,

      sample: {
        matches: 10,
        goalsFor: 7,
        goalsAgainst: 6,
        scoredMatches: 5,
        concededMatches: 4,
        bttsMatches: 2,
        over15Matches: 4,
        over25Matches: 2,
        over35Matches: 1,
      },
    };
  }

  if (
    profile ===
    "vulnerable"
  ) {
    return {
      teamId,
      teamName,

      source:
        SCORING_SOURCE,

      cutoffAt:
        SCORING_CUTOFF,

      sample: {
        matches: 10,
        goalsFor: 11,
        goalsAgainst: 21,
        scoredMatches: 7,
        concededMatches: 9,
        bttsMatches: 6,
        over15Matches: 9,
        over25Matches: 7,
        over35Matches: 5,
      },
    };
  }

  return {
    teamId,
    teamName,

    source:
      SCORING_SOURCE,

    cutoffAt:
      SCORING_CUTOFF,

    sample: {
      matches: 4,
      goalsFor: 6,
      goalsAgainst: 5,
      scoredMatches: 3,
      concededMatches: 3,
      bttsMatches: 2,
      over15Matches: 3,
      over25Matches: 2,
      over35Matches: 1,
    },
  };
}

function main() {
  /*
   * OPEN PARITY
   *
   * D = +20.
   *
   * Result:
   * directional parity / HOME
   *
   * Scoring:
   * open parity
   *
   * Market evidence:
   * O2.5 support + BTTS support
   */
  const openParity =
    evaluateUnifiedMatchAnalysisV01({
      kickoffAt:
        KICKOFF,

      inputCutoffAt:
        INPUT_CUTOFF,

      country:
        "England",

      competitionName:
        "Premier League",

      home:
        currentOnly(
          "open-home",
          "Open Home",
          1820,
        ),

      away:
        currentOnly(
          "open-away",
          "Open Away",
          1800,
        ),

      scoring: {
        home:
          scoringTeam(
            "open-home",
            "Open Home",
            "open",
          ),

        away:
          scoringTeam(
            "open-away",
            "Open Away",
            "open",
          ),
      },
    });

  assert.equal(
    openParity.ratingGap,
    20,
  );

  assert.equal(
    openParity.matchProfile,
    "directional_parity",
  );

  assert.equal(
    openParity.scoringArchetype,
    "open_parity",
  );

  assert.equal(
    openParity.forecast,
    "home",
  );

  assert.equal(
    openParity.coverage,
    "full",
  );

  assert.equal(
    openParity.marketEvidence
      .goals
      .signal,
    "over_2_5_support",
  );

  assert.equal(
    openParity.marketEvidence
      .goals
      .agreement,
    "single_source",
  );

  assert.equal(
    openParity.marketEvidence
      .btts
      .signal,
    "yes_support",
  );

  /*
   * EGYPT CLOSED MICRO-GAP
   *
   * D = +3.
   *
   * League:
   * Under 2.5 support
   *
   * Scoring:
   * Under 2.5 support
   *
   * Therefore goals evidence agrees.
   */
  const egyptClosed =
    evaluateUnifiedMatchAnalysisV01({
      kickoffAt:
        KICKOFF,

      inputCutoffAt:
        INPUT_CUTOFF,

      country:
        "Egypt",

      competitionName:
        "Premier League",

      home:
        currentOnly(
          "egypt-home",
          "Egypt Home",
          1503,
        ),

      away:
        currentOnly(
          "egypt-away",
          "Egypt Away",
          1500,
        ),

      scoring: {
        home:
          scoringTeam(
            "egypt-home",
            "Egypt Home",
            "closed",
          ),

        away:
          scoringTeam(
            "egypt-away",
            "Egypt Away",
            "closed",
          ),
      },
    });

  assert.equal(
    egyptClosed.ratingGap,
    3,
  );

  assert.equal(
    egyptClosed.forecast,
    "draw",
  );

  assert.equal(
    egyptClosed.matchProfile,
    "true_parity",
  );

  assert.equal(
    egyptClosed.scoringArchetype,
    "closed_parity",
  );

  assert.equal(
    egyptClosed.marketEvidence
      .goals
      .signal,
    "under_2_5_support",
  );

  assert.equal(
    egyptClosed.marketEvidence
      .goals
      .agreement,
    "agreement",
  );

  assert.equal(
    egyptClosed.marketEvidence
      .btts
      .signal,
    "no_support",
  );

  /*
   * EGYPT CONFLICT CASE
   *
   * League prior:
   * UNDER 2.5
   *
   * Actual measured scoring profile:
   * OVER 2.5
   *
   * Unified engine must preserve conflict.
   */
  const egyptOpenConflict =
    evaluateUnifiedMatchAnalysisV01({
      kickoffAt:
        KICKOFF,

      inputCutoffAt:
        INPUT_CUTOFF,

      country:
        "Egypt",

      competitionName:
        "Premier League",

      home:
        currentOnly(
          "egypt-open-home",
          "Egypt Open Home",
          1602,
        ),

      away:
        currentOnly(
          "egypt-open-away",
          "Egypt Open Away",
          1600,
        ),

      scoring: {
        home:
          scoringTeam(
            "egypt-open-home",
            "Egypt Open Home",
            "open",
          ),

        away:
          scoringTeam(
            "egypt-open-away",
            "Egypt Open Away",
            "open",
          ),
      },
    });

  assert.equal(
    egyptOpenConflict.forecast,
    "draw",
  );

  assert.equal(
    egyptOpenConflict.scoringArchetype,
    "open_parity",
  );

  assert.equal(
    egyptOpenConflict.marketEvidence
      .goals
      .leagueSignal,
    "under_2_5_support",
  );

  assert.equal(
    egyptOpenConflict.marketEvidence
      .goals
      .scoringSignal,
    "over_2_5_support",
  );

  assert.equal(
    egyptOpenConflict.marketEvidence
      .goals
      .signal,
    "conflict",
  );

  assert.equal(
    egyptOpenConflict.marketEvidence
      .goals
      .agreement,
    "conflict",
  );

  /*
   * REINFORCED RESULT ADVANTAGE.
   *
   * Current home rating advantage = +100.
   * Home rising.
   * Away falling.
   */
  const reinforced =
    evaluateUnifiedMatchAnalysisV01({
      kickoffAt:
        KICKOFF,

      inputCutoffAt:
        INPUT_CUTOFF,

      country:
        "England",

      competitionName:
        "Premier League",

      home:
        ratingTeam(
          "reinforced-home",
          "Reinforced Home",
          [
            1740,
            1760,
            1780,
            1800,
          ],
        ),

      away:
        ratingTeam(
          "reinforced-away",
          "Reinforced Away",
          [
            1760,
            1740,
            1720,
            1700,
          ],
        ),

      scoring: {
        home:
          scoringTeam(
            "reinforced-home",
            "Reinforced Home",
            "open",
          ),

        away:
          scoringTeam(
            "reinforced-away",
            "Reinforced Away",
            "closed",
          ),
      },
    });

  assert.equal(
    reinforced.ratingGap,
    100,
  );

  assert.equal(
    reinforced.matchProfile,
    "reinforced_advantage",
  );

  assert.equal(
    reinforced.forecast,
    "home",
  );

  /*
   * DOMINANT OPEN MISMATCH
   *
   * D = +180.
   * Higher-rated side has high attack.
   * Lower-rated side is vulnerable.
   */
  const dominantOpen =
    evaluateUnifiedMatchAnalysisV01({
      kickoffAt:
        KICKOFF,

      inputCutoffAt:
        INPUT_CUTOFF,

      country:
        "World",

      competitionName:
        "International Competition",

      home:
        currentOnly(
          "dominant-home",
          "Dominant Home",
          1880,
        ),

      away:
        currentOnly(
          "weak-away",
          "Weak Away",
          1700,
        ),

      scoring: {
        home:
          scoringTeam(
            "dominant-home",
            "Dominant Home",
            "open",
          ),

        away:
          scoringTeam(
            "weak-away",
            "Weak Away",
            "vulnerable",
          ),
      },
    });

  assert.equal(
    dominantOpen.ratingGap,
    180,
  );

  assert.equal(
    dominantOpen.matchProfile,
    "dominant_advantage",
  );

  assert.equal(
    dominantOpen.scoringArchetype,
    "open_mismatch",
  );

  assert.equal(
    dominantOpen.forecast,
    "home",
  );

  assert.equal(
    dominantOpen.marketEvidence
      .goals
      .signal,
    "over_2_5_support",
  );

  /*
   * Crucially:
   *
   * dominant one-sided scoring environment
   * does NOT manufacture BTTS Yes.
   */
  assert.equal(
    dominantOpen.marketEvidence
      .btts
      .signal,
    "none",
  );

  /*
   * RESULT-ONLY COVERAGE
   *
   * Rating pair available.
   * Scoring sample insufficient.
   */
  const resultOnly =
    evaluateUnifiedMatchAnalysisV01({
      kickoffAt:
        KICKOFF,

      inputCutoffAt:
        INPUT_CUTOFF,

      country:
        "England",

      competitionName:
        "Premier League",

      home:
        currentOnly(
          "result-home",
          "Result Home",
          1800,
        ),

      away:
        currentOnly(
          "result-away",
          "Result Away",
          1700,
        ),

      scoring: {
        home:
          scoringTeam(
            "result-home",
            "Result Home",
            "short",
          ),

        away:
          scoringTeam(
            "result-away",
            "Result Away",
            "open",
          ),
      },
    });

  assert.equal(
    resultOnly.coverage,
    "result_only",
  );

  assert.equal(
    resultOnly.forecast,
    "home",
  );

  assert.equal(
    resultOnly.scoringArchetype,
    "insufficient",
  );

  assert.equal(
    resultOnly.marketEvidence
      .goals
      .signal,
    "none",
  );

  /*
   * PRIOR RESULT ONLY
   *
   * No ratings.
   *
   * Universal forecast still exists,
   * but rating/scoring matchup classification
   * must not be fabricated.
   */
  const priorOnly =
    evaluateUnifiedMatchAnalysisV01({
      kickoffAt:
        KICKOFF,

      inputCutoffAt:
        INPUT_CUTOFF,

      country:
        null,

      competitionName:
        null,

      home: {
        teamId:
          "prior-home",

        teamName:
          "Prior Home",

        asOfDate:
          "2026-09-10",

        snapshots: [],
      },

      away: {
        teamId:
          "prior-away",

        teamName:
          "Prior Away",

        asOfDate:
          "2026-09-10",

        snapshots: [],
      },

      scoring: {
        home:
          scoringTeam(
            "prior-home",
            "Prior Home",
            "open",
          ),

        away:
          scoringTeam(
            "prior-away",
            "Prior Away",
            "open",
          ),
      },
    });

  assert.equal(
    priorOnly.coverage,
    "prior_result_only",
  );

  assert.equal(
    priorOnly.ratingGap,
    null,
  );

  assert.equal(
    priorOnly.matchProfile,
    "prior_only",
  );

  assert.equal(
    priorOnly.scoringArchetype,
    "insufficient",
  );

  assert.equal(
    priorOnly.evidenceGrade,
    "E",
  );

  /*
   * TEAM IDENTITY INTEGRITY
   */
  assert.throws(
    () =>
      evaluateUnifiedMatchAnalysisV01({
        kickoffAt:
          KICKOFF,

        inputCutoffAt:
          INPUT_CUTOFF,

        country:
          "England",

        competitionName:
          "Premier League",

        home:
          currentOnly(
            "correct-home",
            "Correct Home",
            1800,
          ),

        away:
          currentOnly(
            "correct-away",
            "Correct Away",
            1700,
          ),

        scoring: {
          home:
            scoringTeam(
              "wrong-home",
              "Wrong Home",
              "open",
            ),

          away:
            scoringTeam(
              "correct-away",
              "Correct Away",
              "open",
            ),
        },
      }),
    /different team IDs/,
  );

  /*
   * POST-KICKOFF LEAKAGE REJECTED.
   */
  assert.throws(
    () =>
      evaluateUnifiedMatchAnalysisV01({
        kickoffAt:
          "2026-09-10T16:45:00.000Z",

        inputCutoffAt:
          "2026-09-10T16:45:00.000Z",

        country:
          "England",

        competitionName:
          "Premier League",

        home:
          currentOnly(
            "late-home",
            "Late Home",
            1800,
          ),

        away:
          currentOnly(
            "late-away",
            "Late Away",
            1700,
          ),

        scoring: {
          home:
            scoringTeam(
              "late-home",
              "Late Home",
              "open",
            ),

          away:
            scoringTeam(
              "late-away",
              "Late Away",
              "open",
            ),
        },
      }),
    /strictly before kickoff/,
  );

  /*
   * SCORING EVIDENCE AFTER UNIFIED CUTOFF
   * REJECTED.
   */
  const futureScoring =
    scoringTeam(
      "future-scoring-home",
      "Future Scoring Home",
      "open",
    );

  futureScoring.cutoffAt =
    "2026-09-10T10:30:00.000Z";

  assert.throws(
    () =>
      evaluateUnifiedMatchAnalysisV01({
        kickoffAt:
          KICKOFF,

        inputCutoffAt:
          INPUT_CUTOFF,

        country:
          "England",

        competitionName:
          "Premier League",

        home:
          currentOnly(
            "future-scoring-home",
            "Future Scoring Home",
            1800,
          ),

        away:
          currentOnly(
            "future-scoring-away",
            "Future Scoring Away",
            1700,
          ),

        scoring: {
          home:
            futureScoring,

          away:
            scoringTeam(
              "future-scoring-away",
              "Future Scoring Away",
              "open",
            ),
        },
      }),
    /cannot be after the unified input cutoff/,
  );

  /*
   * INTEGRITY ACROSS ALL OUTPUTS
   */
  const outputs = [
    openParity,
    egyptClosed,
    egyptOpenConflict,
    reinforced,
    dominantOpen,
    resultOnly,
    priorOnly,
  ];

  for (
    const output
    of outputs
  ) {
    assert.equal(
      output.modelVersion,
      UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
    );

    assert.equal(
      output.timing
        .leakageGuard,
      "passed",
    );

    assert.equal(
      output.calibratedProbability,
      null,
    );

    assert.equal(
      output.recommendationStatus,
      "not_evaluated",
    );

    assert.equal(
      output.components
        .matchProfile
        .calibratedProbability,
      null,
    );

    assert.equal(
      output.components
        .scoringProfile
        .calibratedProbability,
      null,
    );
  }

  /*
   * Current ratings remain untouched.
   */
  assert.equal(
    reinforced
      .components
      .matchProfile
      .components
      .ratingInteraction
      .home
      .currentRating,
    1800,
  );

  assert.equal(
    reinforced
      .components
      .matchProfile
      .components
      .ratingInteraction
      .away
      .currentRating,
    1700,
  );

  console.log(
    `PASS: ${UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01}`,
  );

  console.log(
    "PASS: result mathematics and scoring archetype compose into one deterministic analysis.",
  );

  console.log(
    "PASS: current FootballDatabase rating remains untouched.",
  );

  console.log(
    "PASS: open parity preserves HOME/DRAW/AWAY forecast while independently supporting Goals and BTTS.",
  );

  console.log(
    "PASS: Egyptian closed micro-gap produces agreement between league and scoring Under 2.5 evidence.",
  );

  console.log(
    "PASS: conflicting league and measured scoring evidence is preserved as conflict.",
  );

  console.log(
    "PASS: dominant result advantage does not automatically manufacture BTTS.",
  );

  console.log(
    "PASS: insufficient scoring history leaves the result forecast intact.",
  );

  console.log(
    "PASS: rating-less fixtures remain explicitly prior-result-only.",
  );

  console.log(
    "PASS: rating and scoring team identities must match.",
  );

  console.log(
    "PASS: unified input cutoff must be strictly pre-kickoff.",
  );

  console.log(
    "PASS: scoring evidence after the unified cutoff is rejected.",
  );

  console.log(
    "PASS: no calibrated probabilities are fabricated.",
  );

  console.log(
    "PASS: no betting recommendation is generated.",
  );

  console.log("");

  console.log(
    `OPEN PARITY: forecast=${openParity.forecast.toUpperCase()} | D=${openParity.ratingGap} | profile=${openParity.matchProfile} | scoring=${openParity.scoringArchetype} | goals=${openParity.marketEvidence.goals.signal} | BTTS=${openParity.marketEvidence.btts.signal}`,
  );

  console.log(
    `EGYPT CLOSED: forecast=${egyptClosed.forecast.toUpperCase()} | D=${egyptClosed.ratingGap} | goals=${egyptClosed.marketEvidence.goals.signal} | agreement=${egyptClosed.marketEvidence.goals.agreement}`,
  );

  console.log(
    `EGYPT CONFLICT: forecast=${egyptOpenConflict.forecast.toUpperCase()} | league=${egyptOpenConflict.marketEvidence.goals.leagueSignal} | scoring=${egyptOpenConflict.marketEvidence.goals.scoringSignal} | unified=${egyptOpenConflict.marketEvidence.goals.signal}`,
  );

  console.log(
    `DOMINANT OPEN: forecast=${dominantOpen.forecast.toUpperCase()} | D=${dominantOpen.ratingGap} | profile=${dominantOpen.matchProfile} | scoring=${dominantOpen.scoringArchetype}`,
  );
}

main();
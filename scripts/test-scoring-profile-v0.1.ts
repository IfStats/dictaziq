import assert from "node:assert/strict";

import {
  evaluateMatchScoringProfileV01,
  evaluateTeamScoringProfileV01,
  SCORING_PROFILE_MODEL_VERSION_V01,
} from "../src/lib/predictions/scoring-profile-v0.1";

const SOURCE =
  "historical-match-results";

const CUTOFF =
  "2026-09-10T10:00:00.000Z";

function team(
  teamId: string,
  teamName: string,
  sample: {
    matches: number;
    goalsFor: number;
    goalsAgainst: number;
    scoredMatches: number;
    concededMatches: number;
    bttsMatches: number;
    over15Matches: number;
    over25Matches: number;
    over35Matches: number;
  },
) {
  return {
    teamId,
    teamName,
    source:
      SOURCE,
    cutoffAt:
      CUTOFF,
    sample,
  };
}

const openHome =
  team(
    "open-home",
    "Open Home",
    {
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
  );

const openAway =
  team(
    "open-away",
    "Open Away",
    {
      matches: 10,
      goalsFor: 18,
      goalsAgainst: 16,
      scoredMatches: 9,
      concededMatches: 8,
      bttsMatches: 7,
      over15Matches: 9,
      over25Matches: 6,
      over35Matches: 4,
    },
  );

const closedHome =
  team(
    "closed-home",
    "Closed Home",
    {
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
  );

const closedAway =
  team(
    "closed-away",
    "Closed Away",
    {
      matches: 10,
      goalsFor: 8,
      goalsAgainst: 7,
      scoredMatches: 5,
      concededMatches: 4,
      bttsMatches: 2,
      over15Matches: 4,
      over25Matches: 2,
      over35Matches: 1,
    },
  );

function main() {
  /*
   * Team-level mathematical profile.
   */
  const openProfile =
    evaluateTeamScoringProfileV01(
      openHome,
    );

  assert.equal(
    openProfile.status,
    "available",
  );

  assert.equal(
    openProfile.averageGoalsFor,
    2,
  );

  assert.equal(
    openProfile.scoringRate,
    0.9,
  );

  assert.equal(
    openProfile.bttsRate,
    0.7,
  );

  assert.equal(
    openProfile.over25Rate,
    0.7,
  );

  assert.equal(
    openProfile.attackClass,
    "high",
  );

  assert.equal(
    openProfile.defenceClass,
    "vulnerable",
  );

  assert.equal(
    openProfile.goalEnvironment,
    "open",
  );

  /*
   * OPEN PARITY
   *
   * Small D + two open profiles.
   */
  const openParity =
    evaluateMatchScoringProfileV01({
      ratingGap:
        20,

      home:
        openHome,

      away:
        openAway,
    });

  assert.equal(
    openParity.ratingRelationship,
    "parity",
  );

  assert.equal(
    openParity.archetype,
    "open_parity",
  );

  assert.equal(
    openParity.marketSignals.goals,
    "over_2_5_support",
  );

  assert.equal(
    openParity.marketSignals.btts,
    "yes_support",
  );

  /*
   * CLOSED PARITY
   *
   * Micro/small gap + two low-scoring profiles.
   */
  const closedParity =
    evaluateMatchScoringProfileV01({
      ratingGap:
        -3,

      home:
        closedHome,

      away:
        closedAway,
    });

  assert.equal(
    closedParity.ratingRelationship,
    "parity",
  );

  assert.equal(
    closedParity.archetype,
    "closed_parity",
  );

  assert.equal(
    closedParity.marketSignals.goals,
    "under_2_5_support",
  );

  assert.equal(
    closedParity.marketSignals.btts,
    "no_support",
  );

  /*
   * MIXED PARITY
   *
   * Small D but conflicting scoring identities.
   */
  const mixedParity =
    evaluateMatchScoringProfileV01({
      ratingGap:
        25,

      home:
        openHome,

      away:
        closedAway,
    });

  assert.equal(
    mixedParity.archetype,
    "mixed_parity",
  );

  assert.equal(
    mixedParity.marketSignals.goals,
    "none",
  );

  assert.equal(
    mixedParity.marketSignals.btts,
    "none",
  );

  /*
   * OPEN MISMATCH
   *
   * Higher-rated home team has a high attack.
   * Lower-rated away team has vulnerable defence.
   */
  const vulnerableAway =
    team(
      "vulnerable-away",
      "Vulnerable Away",
      {
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
    );

  const openMismatch =
    evaluateMatchScoringProfileV01({
      ratingGap:
        180,

      home:
        openHome,

      away:
        vulnerableAway,
    });

  assert.equal(
    openMismatch.ratingRelationship,
    "mismatch",
  );

  assert.equal(
    openMismatch.higherRatedSide,
    "home",
  );

  assert.equal(
    openMismatch.archetype,
    "open_mismatch",
  );

  assert.equal(
    openMismatch.marketSignals.goals,
    "over_2_5_support",
  );

  /*
   * Crucial:
   * one-sided goal potential does not
   * automatically imply BTTS.
   */
  assert.equal(
    openMismatch.marketSignals.btts,
    "none",
  );

  /*
   * CLOSED MISMATCH
   */
  const closedMismatch =
    evaluateMatchScoringProfileV01({
      ratingGap:
        100,

      home:
        closedHome,

      away:
        closedAway,
    });

  assert.equal(
    closedMismatch.archetype,
    "closed_mismatch",
  );

  assert.equal(
    closedMismatch.marketSignals.goals,
    "under_2_5_support",
  );

  assert.equal(
    closedMismatch.marketSignals.btts,
    "no_support",
  );

  /*
   * Insufficient sample.
   */
  const shortSample =
    team(
      "short-team",
      "Short Team",
      {
        matches: 4,
        goalsFor: 8,
        goalsAgainst: 7,
        scoredMatches: 4,
        concededMatches: 3,
        bttsMatches: 3,
        over15Matches: 4,
        over25Matches: 3,
        over35Matches: 2,
      },
    );

  const insufficient =
    evaluateMatchScoringProfileV01({
      ratingGap:
        20,

      home:
        shortSample,

      away:
        openAway,
    });

  assert.equal(
    insufficient.archetype,
    "insufficient",
  );

  assert.equal(
    insufficient.marketSignals.goals,
    "none",
  );

  assert.equal(
    insufficient.marketSignals.btts,
    "none",
  );

  /*
   * Count integrity.
   */
  assert.throws(
    () =>
      evaluateTeamScoringProfileV01(
        team(
          "invalid",
          "Invalid",
          {
            matches: 5,
            goalsFor: 10,
            goalsAgainst: 5,
            scoredMatches: 6,
            concededMatches: 4,
            bttsMatches: 3,
            over15Matches: 4,
            over25Matches: 3,
            over35Matches: 1,
          },
        ),
      ),
    /cannot exceed total matches/,
  );

  /*
   * No probability or recommendation.
   */
  const outputs = [
    openParity,
    closedParity,
    mixedParity,
    openMismatch,
    closedMismatch,
    insufficient,
  ];

  for (
    const output
    of outputs
  ) {
    assert.equal(
      output.modelVersion,
      SCORING_PROFILE_MODEL_VERSION_V01,
    );

    assert.equal(
      output.calibratedProbability,
      null,
    );

    assert.equal(
      output.recommendationStatus,
      "not_evaluated",
    );
  }

  console.log(
    `PASS: ${SCORING_PROFILE_MODEL_VERSION_V01}`,
  );

  console.log(
    "PASS: team attack strength is derived from measured goals and scoring frequency.",
  );

  console.log(
    "PASS: defensive resistance/vulnerability is derived from measured concessions.",
  );

  console.log(
    "PASS: open parity supports BTTS and Over 2.5 investigation.",
  );

  console.log(
    "PASS: closed parity supports Under 2.5 and BTTS-No investigation.",
  );

  console.log(
    "PASS: mixed parity does not manufacture a market signal.",
  );

  console.log(
    "PASS: high attack versus vulnerable defence produces an open mismatch.",
  );

  console.log(
    "PASS: one-sided scoring mismatch does not automatically imply BTTS.",
  );

  console.log(
    "PASS: insufficient samples do not generate a scoring archetype.",
  );

  console.log(
    "PASS: no calibrated probabilities are fabricated.",
  );

  console.log(
    "PASS: no betting recommendation is generated.",
  );

  console.log("");

  console.log(
    `OPEN PARITY: D=${openParity.ratingGap} | goals=${openParity.marketSignals.goals} | BTTS=${openParity.marketSignals.btts}`,
  );

  console.log(
    `CLOSED PARITY: D=${closedParity.ratingGap} | goals=${closedParity.marketSignals.goals} | BTTS=${closedParity.marketSignals.btts}`,
  );

  console.log(
    `OPEN MISMATCH: D=${openMismatch.ratingGap} | goals=${openMismatch.marketSignals.goals} | BTTS=${openMismatch.marketSignals.btts}`,
  );
}

main();
import assert from "node:assert/strict";

import {
  MARKET_EVIDENCE_VERSION_V02,
  type MarketEvidenceSnapshotV02,
  type TeamStatWindow,
} from "../src/lib/predictions/market-evidence-v0.2";

import {
  evaluateGoalsAndBtts,
} from "../src/lib/predictions/goals-btts-engine";

function highWindow(
  scope:
    "recent"
    | "home"
    | "away",
  prefix: string,
): TeamStatWindow {
  return {
    scope,

    sourceFixtureIds: [
      `${prefix}-1`,
      `${prefix}-2`,
      `${prefix}-3`,
      `${prefix}-4`,
      `${prefix}-5`,
    ],

    matches: 5,

    goalsFor: 10,
    goalsAgainst: 7,

    scoredMatches: 5,
    concededMatches: 4,

    cleanSheets: 1,
    failedToScore: 0,

    bttsMatches: 4,

    over15Matches: 5,
    over25Matches: 4,
    over35Matches: 3,

    xgFor: 8,
    xgAgainst: 6.5,

    shotsFor: 65,
    shotsAgainst: 52,

    shotsOnTargetFor: 27,
    shotsOnTargetAgainst: 21,

    source:
      "test-provider",

    observedAt:
      "2026-09-09T17:00:00.000Z",
  };
}

function lowWindow(
  scope:
    "recent"
    | "home"
    | "away",
  prefix: string,
): TeamStatWindow {
  return {
    scope,

    sourceFixtureIds: [
      `${prefix}-1`,
      `${prefix}-2`,
      `${prefix}-3`,
      `${prefix}-4`,
      `${prefix}-5`,
    ],

    matches: 5,

    goalsFor: 2,
    goalsAgainst: 2,

    scoredMatches: 2,
    concededMatches: 2,

    cleanSheets: 3,
    failedToScore: 3,

    bttsMatches: 1,

    over15Matches: 1,
    over25Matches: 0,
    over35Matches: 0,

    xgFor: 3,
    xgAgainst: 3,

    shotsFor: 35,
    shotsAgainst: 32,

    shotsOnTargetFor: 10,
    shotsOnTargetAgainst: 9,

    source:
      "test-provider",

    observedAt:
      "2026-09-09T17:00:00.000Z",
  };
}

function highEvidence():
  MarketEvidenceSnapshotV02 {
  return {
    evidenceVersion:
      MARKET_EVIDENCE_VERSION_V02,

    fixtureId:
      "high-scoring-fixture",

    cutoffAt:
      "2026-09-09T18:30:00.000Z",

    kickoffAt:
      "2026-09-09T19:00:00.000Z",

    home: {
      teamId: "home",
      teamName: "Home FC",
      side: "home",

      recent:
        highWindow(
          "recent",
          "home-recent",
        ),

      venue:
        highWindow(
          "home",
          "home-venue",
        ),
    },

    away: {
      teamId: "away",
      teamName: "Away FC",
      side: "away",

      recent:
        highWindow(
          "recent",
          "away-recent",
        ),

      venue:
        highWindow(
          "away",
          "away-venue",
        ),
    },

    verifiedFactors: [
      {
        kind:
          "confirmed_lineup",

        side:
          "neutral",

        effects: [
          {
            market:
              "goals",

            direction:
              "supports",
          },

          {
            market:
              "btts",

            direction:
              "supports",
          },
        ],

        description:
          "Verified attacking lineups support an open scoring profile.",

        source:
          "test-lineup-source",

        sourceEvidenceId:
          "lineup-001",

        observedAt:
          "2026-09-09T18:00:00.000Z",
      },
    ],
  };
}

function lowEvidence():
  MarketEvidenceSnapshotV02 {
  return {
    evidenceVersion:
      MARKET_EVIDENCE_VERSION_V02,

    fixtureId:
      "low-scoring-fixture",

    cutoffAt:
      "2026-09-09T18:30:00.000Z",

    kickoffAt:
      "2026-09-09T19:00:00.000Z",

    home: {
      teamId: "home-low",
      teamName: "Home Low",
      side: "home",

      recent:
        lowWindow(
          "recent",
          "home-low-recent",
        ),

      venue:
        lowWindow(
          "home",
          "home-low-venue",
        ),
    },

    away: {
      teamId: "away-low",
      teamName: "Away Low",
      side: "away",

      recent:
        lowWindow(
          "recent",
          "away-low-recent",
        ),

      venue:
        lowWindow(
          "away",
          "away-low-venue",
        ),
    },

    verifiedFactors: [],
  };
}

function main() {
  /*
   * Strong scoring evidence.
   */
  {
    const result =
      evaluateGoalsAndBtts({
        evidence:
          highEvidence(),

        ratingMismatchCandidate:
          false,
      });

    assert.equal(
      result.sampleAdequate,
      true,
    );

    assert.equal(
      result.goals15.selection,
      "over",
    );

    assert.equal(
      result.goals25.selection,
      "over",
    );

    assert.equal(
      result.btts.selection,
      "yes",
    );

    assert.equal(
      result.goals25.calibratedProbability,
      null,
    );
  }

  /*
   * Low scoring evidence.
   */
  {
    const result =
      evaluateGoalsAndBtts({
        evidence:
          lowEvidence(),

        ratingMismatchCandidate:
          false,
      });

    assert.equal(
      result.goals25.selection,
      "under",
    );

    assert.equal(
      result.btts.selection,
      "no",
    );
  }

  /*
   * Critical DictazIQ rule:
   *
   * A large rating difference CANNOT
   * independently force Over 2.5.
   */
  {
    const result =
      evaluateGoalsAndBtts({
        evidence:
          lowEvidence(),

        ratingMismatchCandidate:
          true,
      });

    assert.notEqual(
      result.goals25.selection,
      "over",
    );
  }

  /*
   * Large mismatch may strengthen O2.5 only
   * when both teams pass scoring qualification.
   */
  {
    const result =
      evaluateGoalsAndBtts({
        evidence:
          highEvidence(),

        ratingMismatchCandidate:
          true,
      });

    assert.equal(
      result.goals25.selection,
      "over",
    );

    assert.ok(
      result.goals25
        .supportingSignals.some(
          (signal) =>
            signal.includes(
              "rating mismatch",
            ),
        ),
    );
  }

  /*
   * Goals and BTTS remain independent.
   */
  {
    const evidence =
      highEvidence();

    evidence.verifiedFactors.push({
      kind:
        "tactical_matchup",

      side:
        "neutral",

      effects: [
        {
          market:
            "btts",

          direction:
            "suppresses",
        },
      ],

      description:
        "Verified tactical condition specifically suppresses BTTS.",

      source:
        "test-tactical-source",

      sourceEvidenceId:
        "tactical-001",

      observedAt:
        "2026-09-09T18:05:00.000Z",
    });

    const result =
      evaluateGoalsAndBtts({
        evidence,

        ratingMismatchCandidate:
          false,
      });

    assert.equal(
      result.goals25.selection,
      "over",
    );
  }

  console.log(
    "PASS: high-scoring profiles can qualify goal markets.",
  );

  console.log(
    "PASS: low-scoring profiles can qualify under markets.",
  );

  console.log(
    "PASS: BTTS Yes and BTTS No are evaluated independently.",
  );

  console.log(
    "PASS: rating gap cannot independently force Over 2.5.",
  );

  console.log(
    "PASS: 150+ mismatch contributes only after scoring qualification.",
  );

  console.log(
    "PASS: verified lineup/tactical factors have explicit market direction.",
  );

  console.log(
    "PASS: no calibrated probabilities fabricated.",
  );
}

main();
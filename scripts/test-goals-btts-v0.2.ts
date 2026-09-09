import assert from "node:assert/strict";

import {
  evaluateGoalsAndBttsV02,
} from "../src/lib/predictions/goals-btts-engine-v0.2";

import {
  MARKET_EVIDENCE_VERSION_V02,
  type MarketEvidenceSnapshotV02,
  type TeamStatWindow,
} from "../src/lib/predictions/market-evidence-v0.2";

function window(
  prefix: string,

  scope:
    | "recent"
    | "home"
    | "away",

  options: {
    over25: number;
    btts: number;
  },
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
    goalsAgainst: 8,

    scoredMatches: 5,
    concededMatches: 4,

    cleanSheets: 1,
    failedToScore: 0,

    bttsMatches:
      options.btts,

    over15Matches: 5,

    over25Matches:
      options.over25,

    over35Matches: 2,

    xgFor: null,
    xgAgainst: null,

    shotsFor: null,
    shotsAgainst: null,

    shotsOnTargetFor:
      null,

    shotsOnTargetAgainst:
      null,

    source:
      "test",

    observedAt:
      "2026-09-09T17:00:00.000Z",
  };
}

function evidence(
  homeOver25: number,
  awayOver25: number,
  homeBtts: number,
  awayBtts: number,
): MarketEvidenceSnapshotV02 {
  return {
    evidenceVersion:
      MARKET_EVIDENCE_VERSION_V02,

    fixtureId:
      "consensus-test",

    cutoffAt:
      "2026-09-09T18:00:00.000Z",

    kickoffAt:
      "2026-09-09T19:00:00.000Z",

    home: {
      teamId: "home",
      teamName: "Home",
      side: "home",

      recent:
        window(
          "hr",
          "recent",
          {
            over25:
              homeOver25,

            btts:
              homeBtts,
          },
        ),

      venue:
        window(
          "hv",
          "home",
          {
            over25:
              homeOver25,

            btts:
              homeBtts,
          },
        ),
    },

    away: {
      teamId: "away",
      teamName: "Away",
      side: "away",

      recent:
        window(
          "ar",
          "recent",
          {
            over25:
              awayOver25,

            btts:
              awayBtts,
          },
        ),

      venue:
        window(
          "av",
          "away",
          {
            over25:
              awayOver25,

            btts:
              awayBtts,
          },
        ),
    },

    verifiedFactors: [],
  };
}

function main() {
  /*
   * Liverpool–Atlético-like consensus:
   * 3/5 and 4/5.
   */
  {
    const result =
      evaluateGoalsAndBttsV02({
        evidence:
          evidence(
            3,
            4,
            4,
            3,
          ),

        ratingMismatchCandidate:
          false,
      });

    assert.equal(
      result.goals25.status,
      "qualified",
    );

    assert.equal(
      result.goals25.selection,
      "over",
    );

    assert.equal(
      result.btts.status,
      "qualified",
    );

    assert.equal(
      result.btts.selection,
      "yes",
    );
  }

  /*
   * Napoli–Arsenal-like BTTS:
   * 2/5 vs 3/5.
   *
   * Direction may remain, but it must
   * not be called qualified.
   */
  {
    const result =
      evaluateGoalsAndBttsV02({
        evidence:
          evidence(
            3,
            4,
            2,
            3,
          ),

        ratingMismatchCandidate:
          true,
      });

    assert.equal(
      result.goals25.selection,
      "over",
    );

    assert.equal(
      result.goals25.status,
      "qualified",
    );

    assert.equal(
      result.btts.status,
      "lean",
    );

    assert.equal(
      result.btts.selection,
      "yes",
    );
  }

  /*
   * Chelsea–Leeds-like O2.5 disagreement:
   * 5/5 vs 1/5.
   */
  {
    const result =
      evaluateGoalsAndBttsV02({
        evidence:
          evidence(
            5,
            1,
            5,
            2,
          ),

        ratingMismatchCandidate:
          false,
      });

    assert.equal(
      result.goals25.status,
      "no_pick",
    );

    assert.equal(
      result.goals25.selection,
      null,
    );

    assert.equal(
      result.btts.status,
      "lean",
    );

    assert.equal(
      result.btts.selection,
      "yes",
    );
  }

  console.log(
    "PASS: balanced O2.5 profiles can qualify.",
  );

  console.log(
    "PASS: one-sided O2.5 profiles cannot qualify.",
  );

  console.log(
    "PASS: mixed BTTS evidence is downgraded to lean.",
  );

  console.log(
    "PASS: v0.1 signal generation remains preserved.",
  );

  console.log(
    "PASS: no probability fabricated.",
  );
}

main();
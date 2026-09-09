import assert from "node:assert/strict";

import {
  evaluatePrematchMarketsV02,
} from "../src/lib/predictions/prematch-markets-v0.2";

import type {
  MarketEvidenceSnapshotV02,
} from "../src/lib/predictions/market-evidence-v0.2";

const observedAt =
  "2026-09-09T12:00:00.000Z";

const kickoffAt =
  "2026-09-09T19:00:00.000Z";

function window(
  scope:
    | "recent"
    | "home"
    | "away",

  prefix: string,
) {
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

    goalsFor: 8,
    goalsAgainst: 6,

    scoredMatches: 4,
    concededMatches: 4,

    cleanSheets: 1,
    failedToScore: 1,

    bttsMatches: 3,

    over15Matches: 4,
    over25Matches: 3,
    over35Matches: 1,

    xgFor: null,
    xgAgainst: null,

    shotsFor: null,
    shotsAgainst: null,

    shotsOnTargetFor: null,
    shotsOnTargetAgainst: null,

    source:
      "test-source",

    observedAt,
  };
}

const evidence:
  MarketEvidenceSnapshotV02 = {
    evidenceVersion:
      "dictaziq-market-evidence-v0.2",

    fixtureId:
      "fixture-test",

    cutoffAt:
      observedAt,

    kickoffAt,

    home: {
      teamId:
        "home-team",

      teamName:
        "Home",

      side:
        "home",

      recent:
        window(
          "recent",
          "hr",
        ),

      venue:
        window(
          "home",
          "hv",
        ),
    },

    away: {
      teamId:
        "away-team",

      teamName:
        "Away",

      side:
        "away",

      recent:
        window(
          "recent",
          "ar",
        ),

      venue:
        window(
          "away",
          "av",
        ),
    },

    verifiedFactors: [],
  };

const unresolved =
  evaluatePrematchMarketsV02({
    rating: {
      home: {
        rating: 1821,
        source:
          "footballdatabase.com",
        snapshotDate:
          "2026-09-07",
      },

      away: {
        rating: 1782,
        source:
          "footballdatabase.com",
        snapshotDate:
          "2026-09-07",
      },
    },

    evidence,

    resultContext: {
      home: {
        recent: {
          matches: 5,
          wins: 2,
          draws: 0,
          losses: 3,
        },

        venue: {
          matches: 5,
          wins: 2,
          draws: 0,
          losses: 3,
        },

        restDays: 5,
      },

      away: {
        recent: {
          matches: 5,
          wins: 2,
          draws: 1,
          losses: 2,
        },

        venue: {
          matches: 5,
          wins: 2,
          draws: 0,
          losses: 3,
        },

        restDays: 4,
      },
    },
  });

assert.equal(
  unresolved.result.ratingGap,
  39,
);

assert.equal(
  unresolved.result.requiresContext,
  true,
);

assert.equal(
  unresolved.result.contextStatus,
  "no_pick",
);

assert.equal(
  unresolved.result.selection,
  null,
);

console.log(
  "PASS: neutral 5-49 context remains NO PICK.",
);

const resolved =
  evaluatePrematchMarketsV02({
    rating: {
      home: {
        rating: 1821,
        source:
          "footballdatabase.com",
        snapshotDate:
          "2026-09-07",
      },

      away: {
        rating: 1782,
        source:
          "footballdatabase.com",
        snapshotDate:
          "2026-09-07",
      },
    },

    evidence,

    resultContext: {
      home: {
        recent: {
          matches: 5,
          wins: 4,
          draws: 1,
          losses: 0,
        },

        venue: {
          matches: 5,
          wins: 4,
          draws: 0,
          losses: 1,
        },

        restDays: 6,
      },

      away: {
        recent: {
          matches: 5,
          wins: 1,
          draws: 1,
          losses: 3,
        },

        venue: {
          matches: 5,
          wins: 1,
          draws: 1,
          losses: 3,
        },

        restDays: 5,
      },
    },
  });

assert.equal(
  resolved.result.contextStatus,
  "context_lean",
);

assert.equal(
  resolved.result.selection,
  "home",
);

assert.equal(
  resolved.result.recommended,
  false,
);

console.log(
  "PASS: strong agreeing context can resolve selection without becoming a qualified recommendation.",
);

const structural =
  evaluatePrematchMarketsV02({
    rating: {
      home: {
        rating: 1780,
        source:
          "footballdatabase.com",
        snapshotDate:
          "2026-09-07",
      },

      away: {
        rating: 2069,
        source:
          "footballdatabase.com",
        snapshotDate:
          "2026-09-07",
      },
    },

    evidence,

    resultContext:
      null,
  });

assert.equal(
  structural.result.ratingGap,
  -289,
);

assert.equal(
  structural.result.requiresContext,
  false,
);

assert.equal(
  structural.result.selection,
  "away",
);

assert.equal(
  structural.result.contextStatus,
  "not_required",
);

console.log(
  "PASS: structural rating-gap result remains intact outside 5-49.",
);

let forbiddenContext =
  false;

try {
  evaluatePrematchMarketsV02({
    rating: {
      home: {
        rating: 1780,
        source:
          "footballdatabase.com",
        snapshotDate:
          "2026-09-07",
      },

      away: {
        rating: 2069,
        source:
          "footballdatabase.com",
        snapshotDate:
          "2026-09-07",
      },
    },

    evidence,

    resultContext: {
      home: {
        recent: {
          matches: 5,
          wins: 5,
          draws: 0,
          losses: 0,
        },

        venue: null,
        restDays: 5,
      },

      away: {
        recent: {
          matches: 5,
          wins: 0,
          draws: 0,
          losses: 5,
        },

        venue: null,
        restDays: 5,
      },
    },
  });
} catch {
  forbiddenContext =
    true;
}

assert.equal(
  forbiddenContext,
  true,
);

console.log(
  "PASS: result context cannot override structural rating bands.",
);

assert.equal(
  unresolved.calibratedProbability,
  null,
);

console.log(
  "PASS: no probability fabricated.",
);

console.log("");
console.log(
  "PASS: prematch-markets v0.2 verified.",
);
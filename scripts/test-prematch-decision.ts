import assert from "node:assert/strict";

import {
  PREMATCH_ENGINE_VERSION,
  evaluatePreMatchDecision,
} from "../src/lib/predictions/prematch-decision";

import type {
  ContextFactor,
} from "../src/lib/predictions/context-analysis";

const SOURCE = "footballdatabase";
const DATE = "2026-09-07";

const CUTOFF =
  "2026-09-08T14:00:00.000Z";

const KICKOFF =
  "2026-09-08T19:00:00.000Z";

function ratings(
  home: number,
  away: number,
) {
  return {
    home: {
      rating: home,
      source: SOURCE,
      snapshotDate: DATE,
    },

    away: {
      rating: away,
      source: SOURCE,
      snapshotDate: DATE,
    },
  };
}

function factor(
  kind: ContextFactor["kind"],
  side: ContextFactor["side"],
  description: string,
): ContextFactor {
  return {
    kind,
    side,
    description,
    source: "verified-demo-source",
    observedAt:
      "2026-09-08T12:00:00.000Z",
  };
}

/*
 * Strong draw band.
 */
const strongDraw =
  evaluatePreMatchDecision({
    ratings: ratings(
      1498,
      1500,
    ),
  });

assert.equal(
  strongDraw.ratingGap.ratingGap,
  -2,
);

assert.equal(
  strongDraw.ratingGap.signal,
  "strong_draw",
);

assert.equal(
  strongDraw.finalSelection,
  "draw",
);

assert.equal(
  strongDraw.route,
  "rating_gap_only",
);

/*
 * Normal draw band.
 */
const draw =
  evaluatePreMatchDecision({
    ratings: ratings(
      1502,
      1500,
    ),
  });

assert.equal(
  draw.finalSelection,
  "draw",
);

/*
 * 5-49 without context.
 */
const unresolved =
  evaluatePreMatchDecision({
    ratings: ratings(
      1525,
      1500,
    ),
  });

assert.equal(
  unresolved.ratingGap.ratingGap,
  25,
);

assert.equal(
  unresolved.route,
  "context_required",
);

assert.equal(
  unresolved.finalSelection,
  null,
);

assert.equal(
  unresolved.contextRequired,
  true,
);

assert.equal(
  unresolved.contextResolved,
  false,
);

/*
 * 5-49 resolved by verified home context.
 */
const contextualHome =
  evaluatePreMatchDecision({
    ratings: ratings(
      1525,
      1500,
    ),

    context: {
      cutoffAt: CUTOFF,
      kickoffAt: KICKOFF,

      factors: [
        factor(
          "recent_form",
          "home",
          "Verified recent form favours home.",
        ),

        factor(
          "home_away_form",
          "home",
          "Verified venue form favours home.",
        ),

        factor(
          "squad_availability",
          "home",
          "Verified squad availability favours home.",
        ),

        factor(
          "rest_schedule",
          "neutral",
          "Rest periods are comparable.",
        ),
      ],
    },
  });

assert.equal(
  contextualHome.route,
  "rating_gap_plus_context",
);

assert.equal(
  contextualHome.finalSelection,
  "home",
);

assert.equal(
  contextualHome.contextResolved,
  true,
);

/*
 * 5-49 resolved by verified away context.
 */
const contextualAway =
  evaluatePreMatchDecision({
    ratings: ratings(
      1465,
      1500,
    ),

    context: {
      cutoffAt: CUTOFF,
      kickoffAt: KICKOFF,

      factors: [
        factor(
          "recent_form",
          "away",
          "Verified recent form favours away.",
        ),

        factor(
          "squad_availability",
          "away",
          "Verified squad availability favours away.",
        ),

        factor(
          "competition_position",
          "away",
          "Verified competition position favours away.",
        ),
      ],
    },
  });

assert.equal(
  contextualAway.ratingGap.ratingGap,
  -35,
);

assert.equal(
  contextualAway.finalSelection,
  "away",
);

/*
 * 50-149 stays mathematical.
 */
const cautious =
  evaluatePreMatchDecision({
    ratings: ratings(
      1570,
      1500,
    ),
  });

assert.equal(
  cautious.ratingGap.ratingGap,
  70,
);

assert.equal(
  cautious.ratingGap.signal,
  "cautious_win",
);

assert.equal(
  cautious.finalSelection,
  "home",
);

assert.equal(
  cautious.route,
  "rating_gap_only",
);

/*
 * User's original example.
 */
const strongAway =
  evaluatePreMatchDecision({
    ratings: ratings(
      1550,
      1750,
    ),
  });

assert.equal(
  strongAway.ratingGap.ratingGap,
  -200,
);

assert.equal(
  strongAway.finalSelection,
  "away",
);

assert.equal(
  strongAway.over25Signal,
  true,
);

assert.equal(
  strongAway.route,
  "rating_gap_only",
);

/*
 * Context must not override a mathematical
 * band outside 5-49.
 */
assert.throws(
  () =>
    evaluatePreMatchDecision({
      ratings: ratings(
        1700,
        1500,
      ),

      context: {
        cutoffAt: CUTOFF,
        kickoffAt: KICKOFF,

        factors: [
          factor(
            "recent_form",
            "away",
            "Away context.",
          ),
        ],
      },
    }),
  /Context may only be supplied/,
);

/*
 * No fake probabilities.
 */
assert.equal(
  strongAway.calibratedProbability,
  null,
);

assert.equal(
  strongAway.engineVersion,
  PREMATCH_ENGINE_VERSION,
);

console.log(
  "PASS: draw bands route directly through rating-gap.",
);

console.log(
  "PASS: 5-49 correctly requires verified context.",
);

console.log(
  "PASS: verified context can resolve a home lean.",
);

console.log(
  "PASS: verified context can resolve an away lean.",
);

console.log(
  "PASS: 50-149 remains a mathematical cautious-win signal.",
);

console.log(
  "PASS: 1550 vs 1750 remains away + O2.5.",
);

console.log(
  "PASS: context cannot override non-context rating bands.",
);

console.log(
  "PASS: no calibrated probability is fabricated.",
);

console.log(
  `PASS: pre-match engine provenance = ${PREMATCH_ENGINE_VERSION}.`,
);
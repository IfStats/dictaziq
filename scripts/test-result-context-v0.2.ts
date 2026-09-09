import assert from "node:assert/strict";

import {
  evaluateResultContextV02,
} from "../src/lib/predictions/result-context-v0.2";

const result =
  evaluateResultContextV02({
    ratingGap:
      39,

    home: {
      recent: {
        matches: 5,
        wins: 4,
        draws: 0,
        losses: 1,
      },

      venue: {
        matches: 5,
        wins: 4,
        draws: 1,
        losses: 0,
      },

      restDays:
        6,
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
        wins: 1,
        draws: 2,
        losses: 2,
      },

      restDays:
        5,
    },
  });

assert.equal(
  result.selection,
  "home",
);

assert.equal(
  result.status,
  "context_lean",
);

console.log(
  "PASS: agreeing recent and venue form can produce a contextual lean.",
);

const conflicting =
  evaluateResultContextV02({
    ratingGap:
      26,

    home: {
      recent: {
        matches: 5,
        wins: 4,
        draws: 0,
        losses: 1,
      },

      venue: {
        matches: 5,
        wins: 1,
        draws: 1,
        losses: 3,
      },

      restDays:
        5,
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
        wins: 4,
        draws: 0,
        losses: 1,
      },

      restDays:
        5,
    },
  });

assert.equal(
  conflicting.selection,
  null,
);

console.log(
  "PASS: conflicting recent and venue form produces NO PICK.",
);

const restOpposition =
  evaluateResultContextV02({
    ratingGap:
      -20,

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

      restDays:
        3,
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

      restDays:
        7,
    },
  });

assert.equal(
  restOpposition.selection,
  null,
);

console.log(
  "PASS: material opposing rest advantage blocks contextual selection.",
);

assert.equal(
  result.calibratedProbability,
  null,
);

console.log(
  "PASS: no probability fabricated.",
);

console.log("");
console.log(
  "PASS: result-context v0.2 verified.",
);
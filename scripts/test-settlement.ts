import assert from "node:assert/strict";

import {
  SETTLEMENT_RULES_VERSION,
  settleFootballSelection,
} from "../src/lib/predictions/settlement";

function settle(
  market:
    | "1x2"
    | "btts"
    | "goals_1.5"
    | "goals_2.5"
    | "goals_3.5",
  selection: string,
  home: number,
  away: number,
) {
  return settleFootballSelection({
    market,
    selection,
    regulationHomeScore: home,
    regulationAwayScore: away,
  });
}

// Synthetic pipeline result: 1-2.
assert.equal(
  settle(
    "1x2",
    "away",
    1,
    2,
  ).outcome,
  "won",
);

assert.equal(
  settle(
    "1x2",
    "home",
    1,
    2,
  ).outcome,
  "lost",
);

assert.equal(
  settle(
    "1x2",
    "draw",
    1,
    2,
  ).outcome,
  "lost",
);

// User's |D| >= 150 rating-gap signals:
// away + Over 2.5 both win for 1-2.
assert.equal(
  settle(
    "goals_2.5",
    "over",
    1,
    2,
  ).outcome,
  "won",
);

// BTTS.
assert.equal(
  settle(
    "btts",
    "yes",
    1,
    2,
  ).outcome,
  "won",
);

assert.equal(
  settle(
    "btts",
    "no",
    1,
    2,
  ).outcome,
  "lost",
);

// Draw.
assert.equal(
  settle(
    "1x2",
    "draw",
    1,
    1,
  ).outcome,
  "won",
);

// Clean sheet means BTTS No.
assert.equal(
  settle(
    "btts",
    "no",
    2,
    0,
  ).outcome,
  "won",
);

// Goal-line boundaries.
assert.equal(
  settle(
    "goals_1.5",
    "over",
    1,
    1,
  ).outcome,
  "won",
);

assert.equal(
  settle(
    "goals_2.5",
    "under",
    1,
    1,
  ).outcome,
  "won",
);

assert.equal(
  settle(
    "goals_2.5",
    "over",
    1,
    1,
  ).outcome,
  "lost",
);

assert.equal(
  settle(
    "goals_3.5",
    "under",
    2,
    1,
  ).outcome,
  "won",
);

assert.equal(
  settle(
    "goals_3.5",
    "over",
    2,
    2,
  ).outcome,
  "won",
);

// Rules provenance.
assert.equal(
  settle(
    "1x2",
    "home",
    2,
    0,
  ).rulesVersion,
  SETTLEMENT_RULES_VERSION,
);

// Invalid inputs.
assert.throws(
  () =>
    settleFootballSelection({
      market: "1x2",
      selection: "home",
      regulationHomeScore: -1,
      regulationAwayScore: 0,
    }),
  /Home score/,
);

assert.throws(
  () =>
    settle(
      "1x2",
      "double_chance",
      1,
      0,
    ),
  /Unsupported 1x2 selection/,
);

assert.throws(
  () =>
    settle(
      "btts",
      "maybe",
      1,
      1,
    ),
  /Unsupported BTTS selection/,
);

assert.throws(
  () =>
    settle(
      "goals_2.5",
      "exactly",
      2,
      1,
    ),
  /Unsupported goals selection/,
);

console.log(
  "PASS: 1X2 settlement verified.",
);

console.log(
  "PASS: BTTS settlement verified.",
);

console.log(
  "PASS: O/U 1.5, 2.5 and 3.5 settlement verified.",
);

console.log(
  "PASS: synthetic 1-2 result gives rating-gap away = won.",
);

console.log(
  "PASS: synthetic 1-2 result gives rating-gap O2.5 = won.",
);

console.log(
  "PASS: invalid scores and selections rejected.",
);

console.log(
  `PASS: settlement rules provenance = ${SETTLEMENT_RULES_VERSION}.`,
);
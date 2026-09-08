import assert from "node:assert/strict";
import {
  evaluateRatingGap,
  type RatingGapInput,
} from "../src/lib/predictions/rating-gap";

const SOURCE = "footballdatabase";
const DATE = "2026-09-07";

function input(
  homeRating: number,
  awayRating: number,
): RatingGapInput {
  return {
    home: {
      rating: homeRating,
      source: SOURCE,
      snapshotDate: DATE,
    },
    away: {
      rating: awayRating,
      source: SOURCE,
      snapshotDate: DATE,
    },
  };
}

function expectSignal(
  home: number,
  away: number,
  expected: {
    gap: number;
    signal: string;
    selection: string | null;
    over25: boolean;
    context: boolean;
  },
) {
  const result = evaluateRatingGap(input(home, away));

  assert.equal(result.ratingGap, expected.gap);
  assert.equal(result.absoluteGap, Math.abs(expected.gap));
  assert.equal(result.signal, expected.signal);
  assert.equal(result.standaloneSelection, expected.selection);
  assert.equal(result.over25Signal, expected.over25);
  assert.equal(result.requiresContext, expected.context);

  return result;
}

// -4 to -1: strong draw.
expectSignal(1496, 1500, {
  gap: -4,
  signal: "strong_draw",
  selection: "draw",
  over25: false,
  context: false,
});

expectSignal(1499, 1500, {
  gap: -1,
  signal: "strong_draw",
  selection: "draw",
  over25: false,
  context: false,
});

// 0 to +4: draw.
expectSignal(1500, 1500, {
  gap: 0,
  signal: "draw",
  selection: "draw",
  over25: false,
  context: false,
});

expectSignal(1504, 1500, {
  gap: 4,
  signal: "draw",
  selection: "draw",
  over25: false,
  context: false,
});

// Absolute gap 5-49: contextual analysis required.
for (const gap of [5, 49, -5, -49]) {
  expectSignal(1600 + gap, 1600, {
    gap,
    signal: "context_required",
    selection: null,
    over25: false,
    context: true,
  });
}

// Absolute gap 50-149: cautious win.
expectSignal(1550, 1500, {
  gap: 50,
  signal: "cautious_win",
  selection: "home",
  over25: false,
  context: false,
});

expectSignal(1649, 1500, {
  gap: 149,
  signal: "cautious_win",
  selection: "home",
  over25: false,
  context: false,
});

expectSignal(1450, 1500, {
  gap: -50,
  signal: "cautious_win",
  selection: "away",
  over25: false,
  context: false,
});

expectSignal(1351, 1500, {
  gap: -149,
  signal: "cautious_win",
  selection: "away",
  over25: false,
  context: false,
});

// Absolute gap 150+: stronger side + O2.5 signal.
expectSignal(1650, 1500, {
  gap: 150,
  signal: "strong_win_over_2_5",
  selection: "home",
  over25: true,
  context: false,
});

expectSignal(1350, 1500, {
  gap: -150,
  signal: "strong_win_over_2_5",
  selection: "away",
  over25: true,
  context: false,
});

// Original user example.
const userExample = expectSignal(1550, 1750, {
  gap: -200,
  signal: "strong_win_over_2_5",
  selection: "away",
  over25: true,
  context: false,
});

assert.equal(userExample.higherRatedTeam, "away");

// Same source is mandatory.
assert.throws(
  () =>
    evaluateRatingGap({
      home: {
        rating: 1500,
        source: "source-a",
        snapshotDate: DATE,
      },
      away: {
        rating: 1510,
        source: "source-b",
        snapshotDate: DATE,
      },
    }),
  /same source/,
);

// Same weekly snapshot date is mandatory.
assert.throws(
  () =>
    evaluateRatingGap({
      home: {
        rating: 1500,
        source: SOURCE,
        snapshotDate: "2026-09-07",
      },
      away: {
        rating: 1510,
        source: SOURCE,
        snapshotDate: "2026-09-08",
      },
    }),
  /same weekly snapshot date/,
);

// Invalid ratings rejected.
assert.throws(
  () => evaluateRatingGap(input(Number.NaN, 1500)),
  /Home rating/,
);

assert.throws(
  () => evaluateRatingGap(input(-1, 1500)),
  /Home rating/,
);

console.log("PASS: strong draw boundaries -4 through -1.");
console.log("PASS: draw boundaries 0 through +4.");
console.log("PASS: context-required boundaries ±5 through ±49.");
console.log("PASS: cautious-win boundaries ±50 through ±149.");
console.log("PASS: strong-win + O2.5 boundaries from ±150.");
console.log("PASS: 1550 vs 1750 resolves to away + O2.5.");
console.log("PASS: source/date consistency guards verified.");
console.log("PASS: invalid ratings rejected.");
console.log("PASS: DictazIQ rating-gap-v0.1 tests complete.");
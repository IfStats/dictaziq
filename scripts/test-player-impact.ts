import assert from "node:assert/strict";

import {
  classifyPlayerImpact,
} from "../src/lib/predictions/player-impact";

const cutoffAt =
  "2026-09-09T14:00:00.000Z";

const kickoffAt =
  "2026-09-09T19:00:00.000Z";

const base = {
  playerId:
    1,

  playerName:
    "Test Player",

  teamSide:
    "home" as const,

  positionGroup:
    "midfielder" as const,

  source:
    "verified-test-source",

  sourceEvidenceId:
    "player-test-001",

  observedAt:
    "2026-09-09T13:30:00.000Z",

  cutoffAt,

  kickoffAt,
};

const unassessed =
  classifyPlayerImpact({
    ...base,

    squadRole:
      "unknown",

    recentStartRate:
      null,

    recentMinutesShare:
      null,
  });

assert.equal(
  unassessed.impactTier,
  "unassessed",
);

assert.equal(
  unassessed.impactScore,
  0,
);

console.log(
  "PASS: unknown player importance remains unassessed.",
);

const critical =
  classifyPlayerImpact({
    ...base,

    squadRole:
      "core",

    recentStartRate:
      0.9,

    recentMinutesShare:
      0.85,
  });

assert.equal(
  critical.impactTier,
  "critical",
);

assert.equal(
  critical.impactScore,
  4,
);

console.log(
  "PASS: verified high-participation core player classified critical.",
);

const high =
  classifyPlayerImpact({
    ...base,

    squadRole:
      "core",

    recentStartRate:
      0.65,

    recentMinutesShare:
      0.55,
  });

assert.equal(
  high.impactTier,
  "high",
);

console.log(
  "PASS: regular core player classified high impact.",
);

const medium =
  classifyPlayerImpact({
    ...base,

    squadRole:
      "rotation",

    recentStartRate:
      0.3,

    recentMinutesShare:
      0.3,
  });

assert.equal(
  medium.impactTier,
  "medium",
);

console.log(
  "PASS: rotation player classified medium impact.",
);

const low =
  classifyPlayerImpact({
    ...base,

    squadRole:
      "fringe",

    recentStartRate:
      0.1,

    recentMinutesShare:
      0.08,
  });

assert.equal(
  low.impactTier,
  "low",
);

console.log(
  "PASS: verified low-participation player classified low impact.",
);

assert.equal(
  critical.calibratedProbability,
  null,
);

console.log(
  "PASS: no probability fabricated.",
);

let badRateRejected =
  false;

try {
  classifyPlayerImpact({
    ...base,

    squadRole:
      "core",

    recentStartRate:
      1.2,

    recentMinutesShare:
      0.8,
  });
} catch {
  badRateRejected =
    true;
}

assert.equal(
  badRateRejected,
  true,
);

console.log(
  "PASS: invalid participation rates rejected.",
);

let leakageRejected =
  false;

try {
  classifyPlayerImpact({
    ...base,

    squadRole:
      "core",

    recentStartRate:
      0.9,

    recentMinutesShare:
      0.8,

    observedAt:
      "2026-09-09T14:30:00.000Z",
  });
} catch {
  leakageRejected =
    true;
}

assert.equal(
  leakageRejected,
  true,
);

console.log(
  "PASS: post-cutoff evidence rejected.",
);

console.log("");
console.log(
  "PASS: player-impact v0.1 contract verified.",
);
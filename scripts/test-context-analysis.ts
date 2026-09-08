import assert from "node:assert/strict";

import {
  CONTEXT_MODEL_VERSION,
  evaluateMatchContext,
  type ContextFactor,
} from "../src/lib/predictions/context-analysis";

const CUTOFF =
  "2026-09-08T14:00:00.000Z";

const KICKOFF =
  "2026-09-08T19:00:00.000Z";

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

// Home contextual lean.
const home = evaluateMatchContext({
  ratingGap: 25,
  cutoffAt: CUTOFF,
  kickoffAt: KICKOFF,

  factors: [
    factor(
      "recent_form",
      "home",
      "Home side has stronger verified recent form.",
    ),
    factor(
      "home_away_form",
      "home",
      "Home side has stronger verified home performance.",
    ),
    factor(
      "squad_availability",
      "home",
      "Home side has better verified squad availability.",
    ),
    factor(
      "rest_schedule",
      "neutral",
      "Rest periods are comparable.",
    ),
  ],
});

assert.equal(
  home.decision,
  "home_lean",
);

assert.equal(
  home.selection,
  "home",
);

assert.equal(
  home.homeSupport,
  3,
);

assert.equal(
  home.awaySupport,
  0,
);

assert.equal(
  home.neutralFactors,
  1,
);

// Away contextual lean.
const away = evaluateMatchContext({
  ratingGap: -35,
  cutoffAt: CUTOFF,
  kickoffAt: KICKOFF,

  factors: [
    factor(
      "recent_form",
      "away",
      "Away side has stronger verified recent form.",
    ),
    factor(
      "squad_availability",
      "away",
      "Away side has better verified squad availability.",
    ),
    factor(
      "competition_position",
      "away",
      "Away side has the stronger verified league position.",
    ),
  ],
});

assert.equal(
  away.decision,
  "away_lean",
);

assert.equal(
  away.selection,
  "away",
);

// Mixed evidence must not force a pick.
const mixed = evaluateMatchContext({
  ratingGap: 10,
  cutoffAt: CUTOFF,
  kickoffAt: KICKOFF,

  factors: [
    factor(
      "recent_form",
      "home",
      "Recent form favours home.",
    ),
    factor(
      "squad_availability",
      "away",
      "Squad availability favours away.",
    ),
    factor(
      "rest_schedule",
      "neutral",
      "Rest schedule is balanced.",
    ),
  ],
});

assert.equal(
  mixed.decision,
  "insufficient_context",
);

assert.equal(
  mixed.selection,
  null,
);

// Too little evidence must not produce a pick.
const sparse = evaluateMatchContext({
  ratingGap: 49,
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
  ],
});

assert.equal(
  sparse.decision,
  "insufficient_context",
);

// Exact model scope boundaries.
for (const gap of [
  5,
  49,
  -5,
  -49,
]) {
  const result =
    evaluateMatchContext({
      ratingGap: gap,
      cutoffAt: CUTOFF,
      kickoffAt: KICKOFF,
      factors: [],
    });

  assert.equal(
    result.absoluteGap,
    Math.abs(gap),
  );
}

for (const gap of [
  0,
  4,
  -4,
  50,
  -50,
  150,
  -150,
]) {
  assert.throws(
    () =>
      evaluateMatchContext({
        ratingGap: gap,
        cutoffAt: CUTOFF,
        kickoffAt: KICKOFF,
        factors: [],
      }),
    /applies only/,
  );
}

// Post-cutoff evidence rejected.
assert.throws(
  () =>
    evaluateMatchContext({
      ratingGap: 20,
      cutoffAt: CUTOFF,
      kickoffAt: KICKOFF,

      factors: [
        {
          ...factor(
            "recent_form",
            "home",
            "Late information.",
          ),
          observedAt:
            "2026-09-08T15:00:00.000Z",
        },
      ],
    }),
  /after the prediction cutoff/,
);

// Post-kickoff evidence rejected.
assert.throws(
  () =>
    evaluateMatchContext({
      ratingGap: 20,
      cutoffAt:
        "2026-09-08T20:00:00.000Z",
      kickoffAt: KICKOFF,
      factors: [],
    }),
  /cutoff must be before kickoff/,
);

// Duplicate evidence rejected.
const duplicate = factor(
  "recent_form",
  "home",
  "Same evidence.",
);

assert.throws(
  () =>
    evaluateMatchContext({
      ratingGap: 20,
      cutoffAt: CUTOFF,
      kickoffAt: KICKOFF,
      factors: [
        duplicate,
        duplicate,
        factor(
          "rest_schedule",
          "neutral",
          "Balanced rest.",
        ),
      ],
    }),
  /Duplicate context evidence/,
);

assert.equal(
  home.modelVersion,
  CONTEXT_MODEL_VERSION,
);

assert.equal(
  home.requiresHumanOrLLMExplanation,
  true,
);

console.log(
  "PASS: context model applies only to rating gaps ±5 through ±49.",
);

console.log(
  "PASS: strong verified context can produce a home lean.",
);

console.log(
  "PASS: strong verified context can produce an away lean.",
);

console.log(
  "PASS: mixed or sparse context does not force a prediction.",
);

console.log(
  "PASS: evidence after cutoff/kickoff is rejected.",
);

console.log(
  "PASS: duplicate context evidence is rejected.",
);

console.log(
  `PASS: context provenance = ${CONTEXT_MODEL_VERSION}.`,
);
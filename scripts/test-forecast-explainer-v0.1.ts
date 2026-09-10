import assert from "node:assert/strict";

import {
  explainForecastV01,
  FORECAST_EXPLAINER_VERSION_V01,
  type ForecastExplainerInputV01,
} from "../src/lib/predictions/forecast-explainer-v0.1";

function baseInput():
  ForecastExplainerInputV01 {
  return {
    homeTeamName:
      "Home FC",

    awayTeamName:
      "Away FC",

    forecast:
      "home",

    confidence:
      "high",

    matchProfile:
      "dominant_advantage",

    coverage:
      "result_only",

    scoringArchetype:
      "insufficient",

    goalsSignal:
      "none",

    bttsSignal:
      "none",
  };
}

function fullText(
  value:
    ReturnType<
      typeof explainForecastV01
    >,
): string {
  return [
    value.forecastLabel,
    value.summary,
    ...value.reasons,
    value.evidenceNote,
    ...value.marketContext,
  ].join(
    " ",
  );
}

const dominantHome =
  explainForecastV01({
    ...baseInput(),

    homeTeamName:
      "PSV Eindhoven",

    awayTeamName:
      "Shakhtar Donetsk",
  });

assert.equal(
  dominantHome.version,
  FORECAST_EXPLAINER_VERSION_V01,
);

assert.equal(
  dominantHome.forecastLabel,
  "PSV Eindhoven",
);

assert.match(
  dominantHome.summary,
  /dominant advantage/i,
);

assert.match(
  dominantHome.evidenceNote,
  /scoring evidence was insufficient/i,
);

assert.equal(
  dominantHome.marketContext.length,
  0,
);

assert.equal(
  dominantHome.calibratedProbability,
  null,
);

console.log(
  "PASS: dominant HOME forecast receives a deterministic explanation.",
);

const dominantAway =
  explainForecastV01({
    ...baseInput(),

    homeTeamName:
      "Fenerbahçe",

    awayTeamName:
      "AS Roma",

    forecast:
      "away",
  });

assert.equal(
  dominantAway.forecastLabel,
  "AS Roma",
);

assert.match(
  dominantAway.summary,
  /AS Roma is the model forecast/i,
);

console.log(
  "PASS: dominant AWAY forecast explains the selected team without exposing raw mechanics.",
);

const draw =
  explainForecastV01({
    ...baseInput(),

    forecast:
      "draw",

    confidence:
      "low",

    matchProfile:
      "true_parity",
  });

assert.equal(
  draw.forecastLabel,
  "Draw",
);

assert.match(
  draw.summary,
  /closely balanced/i,
);

console.log(
  "PASS: mathematical parity produces a readable Draw explanation.",
);

const directionalParity =
  explainForecastV01({
    ...baseInput(),

    confidence:
      "low",

    matchProfile:
      "directional_parity",
  });

assert.match(
  fullText(
    directionalParity,
  ),
  /relatively close/i,
);

assert.match(
  fullText(
    directionalParity,
  ),
  /measurable overall edge/i,
);

console.log(
  "PASS: directional parity preserves both closeness and directional edge.",
);

const challenged =
  explainForecastV01({
    ...baseInput(),

    confidence:
      "medium",

    matchProfile:
      "challenged_advantage",
  });

assert.match(
  fullText(
    challenged,
  ),
  /introduces caution/i,
);

console.log(
  "PASS: challenged advantages are explained without reversing the model forecast.",
);

const openParity =
  explainForecastV01({
    ...baseInput(),

    confidence:
      "medium",

    matchProfile:
      "directional_parity",

    coverage:
      "full",

    scoringArchetype:
      "open_parity",

    goalsSignal:
      "over_2_5_support",

    bttsSignal:
      "yes_support",
  });

assert.match(
  fullText(
    openParity,
  ),
  /open and competitive/i,
);

assert.match(
  fullText(
    openParity,
  ),
  /higher-scoring/i,
);

assert.match(
  fullText(
    openParity,
  ),
  /both teams finding the net/i,
);

console.log(
  "PASS: open parity can explain scoring context independently of the result forecast.",
);

const closedParity =
  explainForecastV01({
    ...baseInput(),

    forecast:
      "draw",

    confidence:
      "medium",

    matchProfile:
      "true_parity",

    coverage:
      "full",

    scoringArchetype:
      "closed_parity",

    goalsSignal:
      "under_2_5_support",

    bttsSignal:
      "no_support",
  });

assert.match(
  fullText(
    closedParity,
  ),
  /controlled environment/i,
);

assert.match(
  fullText(
    closedParity,
  ),
  /lower-scoring/i,
);

assert.match(
  fullText(
    closedParity,
  ),
  /leans against both teams/i,
);

console.log(
  "PASS: closed parity explains lower-scoring evidence without changing the result forecast.",
);

const conflict =
  explainForecastV01({
    ...baseInput(),

    coverage:
      "full",

    scoringArchetype:
      "mixed_parity",

    goalsSignal:
      "conflict",

    bttsSignal:
      "conflict",
  });

assert.match(
  fullText(
    conflict,
  ),
  /conflict/i,
);

console.log(
  "PASS: conflicting market evidence is disclosed rather than resolved artificially.",
);

const priorOnly =
  explainForecastV01({
    ...baseInput(),

    confidence:
      "very_low",

    matchProfile:
      "prior_only",

    coverage:
      "prior_result_only",
  });

assert.match(
  fullText(
    priorOnly,
  ),
  /limited/i,
);

assert.match(
  fullText(
    priorOnly,
  ),
  /broader baseline/i,
);

console.log(
  "PASS: sparse-evidence forecasts explicitly disclose limited coverage.",
);

/*
 * Proprietary-method leakage guard.
 *
 * Public explanations must not expose:
 * - raw ratings
 * - subtraction mechanics
 * - D values
 * - odds language
 * - probability claims
 * - certainty/guarantee language
 */
const publicOutputs = [
  dominantHome,
  dominantAway,
  draw,
  directionalParity,
  challenged,
  openParity,
  closedParity,
  conflict,
  priorOnly,
];

for (
  const output
  of publicOutputs
) {
  const text =
    fullText(
      output,
    );

  assert.doesNotMatch(
    text,
    /\brating\b/i,
  );

  assert.doesNotMatch(
    text,
    /\bsubtraction\b/i,
  );

  assert.doesNotMatch(
    text,
    /\bD\s*=/i,
  );

  assert.doesNotMatch(
    text,
    /\bodds?\b/i,
  );

  assert.doesNotMatch(
    text,
    /\bbet(?:ting)?\b/i,
  );

  assert.doesNotMatch(
    text,
    /\bguaranteed?\b/i,
  );

  assert.doesNotMatch(
    text,
    /\bsafe\b/i,
  );

  assert.doesNotMatch(
    text,
    /\bprobabilit(?:y|ies)\b/i,
  );

  assert.equal(
    output.calibratedProbability,
    null,
  );
}

console.log(
  "PASS: public explanations do not expose proprietary rating mechanics.",
);

console.log(
  "PASS: public explanations do not manufacture probability, odds or betting claims.",
);

assert.throws(
  () =>
    explainForecastV01({
      ...baseInput(),

      homeTeamName:
        "Same FC",

      awayTeamName:
        "Same FC",
    }),
  /must be different/i,
);

console.log(
  "PASS: invalid team identity is rejected.",
);

console.log("");
console.log(
  `PASS: ${FORECAST_EXPLAINER_VERSION_V01}`,
);
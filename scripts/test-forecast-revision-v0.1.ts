import assert from "node:assert/strict";

import {
  FORECAST_REVISION_VERSION_V01,
  resolveActiveForecastV01,
  validateForecastRevisionV01,
  type BaselineForecastV01,
  type ForecastRevisionInputV01,
} from "../src/lib/predictions/forecast-revision-v0.1";

const baseline:
  BaselineForecastV01 = {
    predictionId:
      "prediction-001",

    fixtureId:
      "fixture-001",

    kickoffAt:
      "2026-09-10T18:00:00.000Z",

    inputCutoffAt:
      "2026-09-10T10:00:00.000Z",

    generatedAt:
      "2026-09-10T10:05:00.000Z",

    publishedAt:
      "2026-09-10T10:06:00.000Z",

    selection:
      "home",

    confidence:
      "medium",

    evidenceGrade:
      "C",

    engine:
      "mathematical",

    engineVersion:
      "dictaziq-unified-match-analysis-v0.1",

    probability:
      null,
  };

const newsRevision:
  ForecastRevisionInputV01 = {
    baselinePredictionId:
      baseline.predictionId,

    fixtureId:
      baseline.fixtureId,

    revisionNumber:
      1,

    reason:
      "developing_news",

    engine:
      "gpt_research",

    engineVersion:
      "dictaziq-llm-analysis-v0.2",

    lineupState:
      "unconfirmed",

    kickoffAt:
      baseline.kickoffAt,

    inputCutoffAt:
      "2026-09-10T14:00:00.000Z",

    generatedAt:
      "2026-09-10T14:02:00.000Z",

    publishedAt:
      "2026-09-10T14:03:00.000Z",

    selection:
      "home",

    confidence:
      "low",

    evidenceGrade:
      "C",

    materialChanges: [
      "New verified squad-availability information became available.",
    ],

    probability:
      null,
  };

const lineupRevision:
  ForecastRevisionInputV01 = {
    baselinePredictionId:
      baseline.predictionId,

    fixtureId:
      baseline.fixtureId,

    revisionNumber:
      2,

    reason:
      "confirmed_lineup",

    engine:
      "fusion",

    engineVersion:
      "dictaziq-fusion-v0.1",

    lineupState:
      "confirmed",

    kickoffAt:
      baseline.kickoffAt,

    inputCutoffAt:
      "2026-09-10T17:02:00.000Z",

    generatedAt:
      "2026-09-10T17:04:00.000Z",

    publishedAt:
      "2026-09-10T17:05:00.000Z",

    selection:
      "draw",

    confidence:
      "medium",

    evidenceGrade:
      "A",

    materialChanges: [
      "Both confirmed starting lineups became available.",
      "The confirmed team sheets materially changed the pre-match assessment.",
    ],

    probability:
      null,
  };

const baselineBeforeNews =
  resolveActiveForecastV01(
    baseline,
    [
      newsRevision,
      lineupRevision,
    ],
    "2026-09-10T13:00:00.000Z",
  );

assert.equal(
  baselineBeforeNews.source,
  "baseline",
);

assert.equal(
  baselineBeforeNews.selection,
  "home",
);

console.log(
  "PASS: baseline remains active before any revision publication.",
);

const afterNews =
  resolveActiveForecastV01(
    baseline,
    [
      newsRevision,
      lineupRevision,
    ],
    "2026-09-10T15:00:00.000Z",
  );

assert.equal(
  afterNews.source,
  "revision",
);

assert.equal(
  afterNews.revisionNumber,
  1,
);

assert.equal(
  afterNews.selection,
  "home",
);

console.log(
  "PASS: developing-news revision becomes active after publication.",
);

const afterLineup =
  resolveActiveForecastV01(
    baseline,
    [
      newsRevision,
      lineupRevision,
    ],
    "2026-09-10T17:30:00.000Z",
  );

assert.equal(
  afterLineup.source,
  "revision",
);

assert.equal(
  afterLineup.revisionNumber,
  2,
);

assert.equal(
  afterLineup.selection,
  "draw",
);

assert.equal(
  afterLineup.evidenceGrade,
  "A",
);

console.log(
  "PASS: confirmed-lineup revision supersedes the earlier public forecast.",
);

/*
 * The baseline itself was never mutated.
 */
assert.equal(
  baseline.selection,
  "home",
);

assert.equal(
  baseline.confidence,
  "medium",
);

console.log(
  "PASS: original published baseline remains unchanged.",
);

assert.throws(
  () =>
    validateForecastRevisionV01(
      baseline,
      {
        ...lineupRevision,

        lineupState:
          "unconfirmed",
      },
    ),
  /requires confirmed lineups/,
);

console.log(
  "PASS: confirmed-lineup revision rejected without confirmed lineup state.",
);

assert.throws(
  () =>
    validateForecastRevisionV01(
      baseline,
      {
        ...lineupRevision,

        generatedAt:
          "2026-09-10T18:01:00.000Z",

        publishedAt:
          "2026-09-10T18:02:00.000Z",
      },
    ),
  /cannot be generated at or after kickoff/,
);

console.log(
  "PASS: post-kickoff revision generation rejected.",
);

assert.throws(
  () =>
    validateForecastRevisionV01(
      baseline,
      {
        ...newsRevision,

        inputCutoffAt:
          baseline.inputCutoffAt,
      },
    ),
  /newer than the baseline input cutoff/,
);

console.log(
  "PASS: revision requires newer evidence than baseline.",
);

assert.throws(
  () =>
    validateForecastRevisionV01(
      baseline,
      {
        ...newsRevision,

        probability:
          0.76 as never,
      },
    ),
  /probability must remain null/,
);

console.log(
  "PASS: fabricated revision probability rejected.",
);

assert.throws(
  () =>
    validateForecastRevisionV01(
      baseline,
      {
        ...newsRevision,

        materialChanges: [],
      },
    ),
  /at least one material change/,
);

console.log(
  "PASS: meaningless revision without material change rejected.",
);

assert.throws(
  () =>
    resolveActiveForecastV01(
      baseline,
      [
        newsRevision,
        {
          ...lineupRevision,

          revisionNumber:
            1,
        },
      ],
      "2026-09-10T17:30:00.000Z",
    ),
  /Duplicate forecast revision number/,
);

console.log(
  "PASS: duplicate revision sequence rejected.",
);

const unpublished:
  ForecastRevisionInputV01 = {
    ...lineupRevision,

    publishedAt:
      null,
  };

const withUnpublished =
  resolveActiveForecastV01(
    baseline,
    [
      newsRevision,
      unpublished,
    ],
    "2026-09-10T17:30:00.000Z",
  );

assert.equal(
  withUnpublished.revisionNumber,
  1,
);

console.log(
  "PASS: unpublished revision cannot replace the active public forecast.",
);

assert.throws(
  () =>
    resolveActiveForecastV01(
      baseline,
      [
        newsRevision,
        lineupRevision,
      ],
      "2026-09-10T18:00:00.000Z",
    ),
  /cannot be resolved at or after kickoff/,
);

console.log(
  "PASS: pre-match active forecast locks at kickoff.",
);

console.log("");
console.log(
  `PASS: ${FORECAST_REVISION_VERSION_V01}`,
);

console.log(
  "PASS: immutable baseline + append-only pre-match revision semantics verified.",
);
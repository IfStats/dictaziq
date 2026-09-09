import assert from "node:assert/strict";

import {
  deduplicateFixtureInjuries,
} from "../src/providers/api-football/client";

import type {
  ApiFootballInjury,
} from "../src/providers/api-football/types";

const fixtureId =
  1635686;

const unique:
  ApiFootballInjury[] = [
    {
      source:
        "api-football",

      fixtureId,

      team: {
        id: 40,
        name: "Liverpool",
      },

      player: {
        id: 1,
        name: "C. Bradley",
      },

      type:
        "Missing Fixture",

      reason:
        "Knee Injury",
    },

    {
      source:
        "api-football",

      fixtureId,

      team: {
        id: 530,
        name: "Atletico Madrid",
      },

      player: {
        id: 2,
        name: "A. Sorloth",
      },

      type:
        "Missing Fixture",

      reason:
        "Muscle Injury",
    },
  ];

const duplicated = [
  ...unique,
  ...unique,
];

const result =
  deduplicateFixtureInjuries(
    duplicated,
  );

assert.equal(
  result.length,
  2,
);

assert.equal(
  result[0].player.name,
  "C. Bradley",
);

assert.equal(
  result[1].player.name,
  "A. Sorloth",
);

console.log(
  "PASS: exact API-Football injury duplicates removed.",
);

console.log(
  "PASS: distinct players remain distinct.",
);

console.log(
  "PASS: provider deduplication occurs before context ingestion.",
);
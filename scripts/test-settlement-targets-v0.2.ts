import assert from "node:assert/strict";

import {
  extractSettlementTargetsV02,
  SETTLEMENT_TARGETS_VERSION_V02,
} from "../src/lib/predictions/settlement-targets-v0.2";

const napoliArsenal =
  extractSettlementTargetsV02({
    result: {
      selection:
        "away",

      recommended:
        true,
    },

    markets: {
      /*
       * Deliberately irrelevant to extraction.
       * Settlement uses qualifiedRecommendations.
       */
      goals25: {
        status:
          "qualified",

        selection:
          "over",
      },
    },

    qualifiedRecommendations: [
      {
        market:
          "goals_1.5",

        selection:
          "over",

        status:
          "qualified",
      },

      {
        market:
          "goals_2.5",

        selection:
          "over",

        status:
          "qualified",
      },
    ],
  });

assert.deepEqual(
  napoliArsenal,
  [
    {
      market:
        "1x2",

      selection:
        "away",
    },

    {
      market:
        "goals_1.5",

      selection:
        "over",
    },

    {
      market:
        "goals_2.5",

      selection:
        "over",
    },
  ],
);

console.log(
  "PASS: structural result plus qualified markets extracted.",
);

const liverpoolAtletico =
  extractSettlementTargetsV02({
    result: {
      selection:
        null,

      recommended:
        false,
    },

    qualifiedRecommendations: [
      {
        market:
          "goals_1.5",

        selection:
          "over",

        status:
          "qualified",
      },

      {
        market:
          "goals_2.5",

        selection:
          "over",

        status:
          "qualified",
      },

      {
        market:
          "btts",

        selection:
          "yes",

        status:
          "qualified",
      },
    ],
  });

assert.deepEqual(
  liverpoolAtletico,
  [
    {
      market:
        "goals_1.5",

      selection:
        "over",
    },

    {
      market:
        "goals_2.5",

      selection:
        "over",
    },

    {
      market:
        "btts",

      selection:
        "yes",
    },
  ],
);

console.log(
  "PASS: NO PICK result excluded while qualified markets remain.",
);

const contextLean =
  extractSettlementTargetsV02({
    result: {
      selection:
        "home",

      recommended:
        false,

      contextStatus:
        "context_lean",
    },

    qualifiedRecommendations:
      [],
  });

assert.deepEqual(
  contextLean,
  [],
);

console.log(
  "PASS: context lean is not scored as a recommended 1X2 pick.",
);

const marketLean =
  extractSettlementTargetsV02({
    result: {
      selection:
        null,

      recommended:
        false,
    },

    markets: {
      btts: {
        status:
          "lean",

        selection:
          "yes",
      },
    },

    qualifiedRecommendations:
      [],
  });

assert.deepEqual(
  marketLean,
  [],
);

console.log(
  "PASS: market lean excluded from settlement targets.",
);

assert.throws(
  () =>
    extractSettlementTargetsV02({
      result: {
        selection:
          null,

        recommended:
          false,
      },

      qualifiedRecommendations: [
        {
          market:
            "corners",

          selection:
            "over",

          status:
            "qualified",
        },
      ],
    }),
  /Unsupported qualified market/,
);

console.log(
  "PASS: unsupported qualified market rejected.",
);

console.log("");
console.log(
  `PASS: ${SETTLEMENT_TARGETS_VERSION_V02} verified.`,
);
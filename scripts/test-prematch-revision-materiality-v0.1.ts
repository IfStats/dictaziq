import assert from "node:assert/strict";

import {
  evaluatePrematchRevisionMaterialityV01,
  PREMATCH_REVISION_MATERIALITY_VERSION_V01,
  type MaterialityForecastV01,
} from "../src/lib/predictions/prematch-revision-materiality-v0.1";

const previous:
  MaterialityForecastV01 = {
    selection:
      "away",

    confidence:
      "low",

    evidenceGrade:
      "C",

    goalsView:
      "over_2_5",

    bttsView:
      "yes",

    lineupState:
      "unconfirmed",
  };

const same =
  evaluatePrematchRevisionMaterialityV01(
    previous,

    {
      ...previous,

      confidence:
        "medium",
    },

    {
      publishedAt:
        "2026-09-10T15:26:00.000Z",

      structuredFacts: [
        {
          kind:
            "squad_availability",

          side:
            "away",

          description:
            "Same injury evidence.",

          source:
            "api-football",

          observedAt:
            "2026-09-10T15:20:00.000Z",
        },
      ],

      webSources: [],
    },

    {
      evaluatedAt:
        "2026-09-10T15:30:00.000Z",

      purpose:
        "scheduled_refresh",

      confirmedLineups:
        false,

      structuredFacts: [
        {
          kind:
            "squad_availability",

          side:
            "away",

          description:
            "Same injury evidence.",

          source:
            "api-football",

          /*
           * New polling timestamp must not count
           * as new football information.
           */
          observedAt:
            "2026-09-10T15:29:00.000Z",
        },
      ],

      webSources: [],
    },
  );

assert.equal(
  same.shouldRevise,
  false,
);

console.log(
  "PASS: confidence-only web/model drift suppressed.",
);

const changedSelection =
  evaluatePrematchRevisionMaterialityV01(
    previous,

    {
      ...previous,

      selection:
        "draw",
    },

    {
      publishedAt:
        "2026-09-10T15:26:00.000Z",

      structuredFacts: [],

      webSources: [],
    },

    {
      evaluatedAt:
        "2026-09-10T15:28:00.000Z",

      purpose:
        "scheduled_refresh",

      confirmedLineups:
        false,

      structuredFacts: [],

      webSources: [],
    },
  );

assert.equal(
  changedSelection.shouldRevise,
  true,
);

assert.equal(
  changedSelection.hardTrigger,
  true,
);

console.log(
  "PASS: 1X2 change bypasses cooldown.",
);

const lineup =
  evaluatePrematchRevisionMaterialityV01(
    previous,

    previous,

    {
      publishedAt:
        "2026-09-10T15:26:00.000Z",

      structuredFacts: [],

      webSources: [],
    },

    {
      evaluatedAt:
        "2026-09-10T15:27:00.000Z",

      purpose:
        "confirmed_lineup",

      confirmedLineups:
        true,

      structuredFacts: [
        {
          kind:
            "confirmed_lineup",

          side:
            "home",

          description:
            "Confirmed starting XI.",

          source:
            "api-football",

          observedAt:
            "2026-09-10T15:27:00.000Z",
        },
      ],

      webSources: [],
    },
  );

assert.equal(
  lineup.shouldRevise,
  true,
);

assert.equal(
  lineup.hardTrigger,
  true,
);

console.log(
  "PASS: newly confirmed lineups always create a revision.",
);

const newOfficialEvidence =
  evaluatePrematchRevisionMaterialityV01(
    previous,

    {
      ...previous,

      evidenceGrade:
        "B",
    },

    {
      publishedAt:
        "2026-09-10T15:00:00.000Z",

      structuredFacts: [],

      webSources: [],
    },

    {
      evaluatedAt:
        "2026-09-10T15:30:00.000Z",

      purpose:
        "scheduled_refresh",

      confirmedLineups:
        false,

      structuredFacts: [],

      webSources: [
        {
          url:
            "https://www.uefa.com/example-team-news",

          title:
            "Official team news",

          hostname:
            "uefa.com",

          tier:
            "official_primary",

          mayDriveForecast:
            true,
        },
      ],
    },
  );

assert.equal(
  newOfficialEvidence.shouldRevise,
  true,
);

assert.equal(
  newOfficialEvidence.softTrigger,
  true,
);

console.log(
  "PASS: soft change accepted when authoritative evidence advances after cooldown.",
);

const tipsterOnly =
  evaluatePrematchRevisionMaterialityV01(
    previous,

    {
      ...previous,

      confidence:
        "medium",
    },

    {
      publishedAt:
        "2026-09-10T15:00:00.000Z",

      structuredFacts: [],

      webSources: [],
    },

    {
      evaluatedAt:
        "2026-09-10T15:30:00.000Z",

      purpose:
        "scheduled_refresh",

      confirmedLineups:
        false,

      structuredFacts: [],

      webSources: [
        {
          url:
            "https://betmines.com/example",

          title:
            "Prediction",

          hostname:
            "betmines.com",

          tier:
            "prediction_tipster",

          mayDriveForecast:
            false,
        },
      ],
    },
  );

assert.equal(
  tipsterOnly.shouldRevise,
  false,
);

console.log(
  "PASS: tipster-only evidence cannot trigger a soft revision.",
);

console.log("");

console.log(
  `PASS: ${PREMATCH_REVISION_MATERIALITY_VERSION_V01}`,
);
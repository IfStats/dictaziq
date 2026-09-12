import "./load-env";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  GPT_RESEARCH_PREDICTION_VERSION_V02,
  type GptResearchPredictionOutputV02,
  type GptResearchSelectionV02,
  type GptResearchConfidenceV02,
  type GptResearchEvidenceGradeV02,
  type GptResearchGoalsV02,
  type GptResearchBttsV02,
} from "../src/lib/ai/gpt-research-prediction-v0.2";

import {
  fuseResearchPredictionsV01,
  RESEARCH_FUSION_VERSION_V01,
  type MathematicalStrengthV01,
} from "../src/lib/ai/research-fusion-v0.1";

const MATHEMATICAL_MODEL =
  "dictaziq-unified-match-analysis-v0.1";

const OPENAI_MODEL =
  "dictaziq-gpt-research-prediction-v0.2";

const DEEPSEEK_MODEL =
  "dictaziq-deepseek-research-prediction-v0.1";

type JsonObject =
  Record<string, unknown>;

type ShadowRow = {
  fixture_id: unknown;
  kickoff_at: unknown;
  home_name: unknown;
  away_name: unknown;
  competition_name: unknown;
  mathematical_output: unknown;
  openai_output: unknown;
  deepseek_output: unknown;
};

function requestedDate():
string {
  const argument =
    process.argv
      .slice(2)
      .find(
        (value) =>
          !value.startsWith("--"),
      );

  const value =
    argument ??
    new Date()
      .toISOString()
      .slice(0, 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  return value;
}

function requestedLimit():
number | null {
  const argument =
    process.argv.find(
      (value) =>
        value.startsWith(
          "--limit=",
        ),
    );

  if (!argument) {
    return null;
  }

  const value =
    Number(
      argument.slice(
        "--limit=".length,
      ),
    );

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      "--limit must be a positive integer.",
    );
  }

  return value;
}

function isRecord(
  value: unknown,
): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function text(
  value: unknown,
): string | null {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  )
    ? value.trim()
    : null;
}

function numberValue(
  value: unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function stringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item,
    ): item is string =>
      typeof item === "string",
  );
}

function selection(
  value: unknown,
): GptResearchSelectionV02 | null {
  return (
    value === "home" ||
    value === "draw" ||
    value === "away"
  )
    ? value
    : null;
}

function confidence(
  value: unknown,
): GptResearchConfidenceV02 | null {
  return (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "very_low"
  )
    ? value
    : null;
}

function evidenceGrade(
  value: unknown,
): GptResearchEvidenceGradeV02 | null {
  return (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D" ||
    value === "E"
  )
    ? value
    : null;
}

function goalsView(
  value: unknown,
): GptResearchGoalsV02 | null {
  return (
    value === "over_2_5" ||
    value === "under_2_5" ||
    value === "neutral"
  )
    ? value
    : null;
}

function bttsView(
  value: unknown,
): GptResearchBttsV02 | null {
  return (
    value === "yes" ||
    value === "no" ||
    value === "neutral"
  )
    ? value
    : null;
}

function storedResearchPrediction(
  value: unknown,
):
GptResearchPredictionOutputV02 | null {
  if (!isRecord(value)) {
    return null;
  }

  const storedSelection =
    selection(
      value.forecast,
    );

  const storedConfidence =
    confidence(
      value.confidence,
    );

  const storedEvidenceGrade =
    evidenceGrade(
      value.evidenceGrade,
    );

  const storedGoalsView =
    goalsView(
      value.goalsView,
    );

  const storedBttsView =
    bttsView(
      value.bttsView,
    );

  if (
    storedSelection === null ||
    storedConfidence === null ||
    storedEvidenceGrade === null ||
    storedGoalsView === null ||
    storedBttsView === null
  ) {
    return null;
  }

  return {
    version:
      GPT_RESEARCH_PREDICTION_VERSION_V02,

    selection:
      storedSelection,

    confidence:
      storedConfidence,

    evidenceGrade:
      storedEvidenceGrade,

    goalsView:
      storedGoalsView,

    bttsView:
      storedBttsView,

    materialFactors:
      stringArray(
        value.materialFactors,
      ),

    reasoningSummary:
      stringArray(
        value.reasoningSummary,
      ),

    contradictions:
      stringArray(
        value.contradictions,
      ),

    missingInformation:
      stringArray(
        value.missingInformation,
      ),

    probability:
      null,

    modelOverride:
      false,
  };
}

function mathematicalSignal(
  value: unknown,
): {
  selection:
    GptResearchSelectionV02 |
    "no_pick";

  strength:
    MathematicalStrengthV01;

  provenance:
    string;
} {
  if (!isRecord(value)) {
    return {
      selection:
        "no_pick",

      strength:
        "none",

      provenance:
        MATHEMATICAL_MODEL,
    };
  }

  const storedSelection =
    selection(
      value.forecast,
    );

  const gap =
    numberValue(
      value.ratingGap,
    );

  const absoluteGap =
    numberValue(
      value.absoluteRatingGap,
    ) ??
    (
      gap === null
        ? null
        : Math.abs(gap)
    );

  if (
    storedSelection === null ||
    absoluteGap === null
  ) {
    return {
      selection:
        "no_pick",

      strength:
        "none",

      provenance:
        MATHEMATICAL_MODEL,
    };
  }

  let strength:
    MathematicalStrengthV01 =
    "weak";

  /*
   * DictazIQ rating-gap policy:
   * - 0..4: draw band
   * - 5..49: contextual / weak
   * - 50..149: cautious / moderate
   * - >=150: strong
   *
   * A valid mathematical draw inside the
   * 0..4 band is treated as strong support.
   */
  if (
    storedSelection === "draw" &&
    absoluteGap <= 4
  ) {
    strength =
      "strong";
  } else if (
    absoluteGap >= 150
  ) {
    strength =
      "strong";
  } else if (
    absoluteGap >= 50
  ) {
    strength =
      "moderate";
  } else {
    strength =
      "weak";
  }

  return {
    selection:
      storedSelection,

    strength,

    provenance:
      MATHEMATICAL_MODEL,
  };
}

function formatSource(
  prediction:
    GptResearchPredictionOutputV02 |
    null,
): string {
  if (prediction === null) {
    return "NONE";
  }

  return [
    prediction.selection.toUpperCase(),
    prediction.confidence,
    prediction.evidenceGrade,
  ].join("/");
}

async function main() {
  const date =
    requestedDate();

  const limit =
    requestedLimit();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  const rows =
    await sql`
      SELECT
        fixture.id
          AS fixture_id,

        fixture.kickoff_at,

        home.name
          AS home_name,

        away_team.name
          AS away_name,

        competition.name
          AS competition_name,

        mathematical.output
          AS mathematical_output,

        openai.output
          AS openai_output,

        deepseek.output
          AS deepseek_output

      FROM public.fixtures
        AS fixture

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      JOIN public.seasons
        AS season
        ON season.id =
          fixture.season_id

      JOIN public.competitions
        AS competition
        ON competition.id =
          season.competition_id

      LEFT JOIN LATERAL (
        SELECT
          prediction.output

        FROM public.predictions
          AS prediction

        JOIN public.model_versions
          AS model
          ON model.id =
            prediction.model_version_id

        WHERE
          prediction.fixture_id =
            fixture.id

          AND prediction.is_demo =
            false

          AND prediction.published_at
            IS NOT NULL

          AND model.version =
            ${MATHEMATICAL_MODEL}

          AND (
            prediction.input_snapshot
              -> 'ratingEvidence'
              ->> 'commonSnapshotDate'
          ) IS NOT NULL

        ORDER BY
          prediction.published_at DESC,
          prediction.generated_at DESC,
          prediction.id DESC

        LIMIT 1
      ) AS mathematical
        ON true

      LEFT JOIN LATERAL (
        SELECT
          prediction.output

        FROM public.predictions
          AS prediction

        JOIN public.model_versions
          AS model
          ON model.id =
            prediction.model_version_id

        WHERE
          prediction.fixture_id =
            fixture.id

          AND prediction.is_demo =
            false

          AND prediction.published_at
            IS NOT NULL

          AND model.version =
            ${OPENAI_MODEL}

        ORDER BY
          prediction.published_at DESC,
          prediction.generated_at DESC,
          prediction.id DESC

        LIMIT 1
      ) AS openai
        ON true

      LEFT JOIN LATERAL (
        SELECT
          prediction.output

        FROM public.predictions
          AS prediction

        JOIN public.model_versions
          AS model
          ON model.id =
            prediction.model_version_id

        WHERE
          prediction.fixture_id =
            fixture.id

          AND prediction.is_demo =
            false

          AND prediction.published_at
            IS NOT NULL

          AND model.version =
            ${DEEPSEEK_MODEL}

        ORDER BY
          prediction.published_at DESC,
          prediction.generated_at DESC,
          prediction.id DESC

        LIMIT 1
      ) AS deepseek
        ON true

      WHERE
        fixture.is_demo =
          false

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

        AND fixture.kickoff_at >
          clock_timestamp()

        AND (
          mathematical.output
            IS NOT NULL

          OR openai.output
            IS NOT NULL

          OR deepseek.output
            IS NOT NULL
        )

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  const fixtures =
    (
      rows as ShadowRow[]
    ).slice(
      0,
      limit ?? undefined,
    );

  console.log(
    "DictazIQ Research Fusion Shadow",
  );

  console.log(
    `Fusion: ${RESEARCH_FUSION_VERSION_V01}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Mode: SHADOW / READ ONLY`,
  );

  console.log(
    `Fixtures with at least one source: ${rows.length}`,
  );

  console.log(
    `Analysing: ${fixtures.length}`,
  );

  let withMath = 0;
  let withOpenAi = 0;
  let withDeepSeek = 0;
  let threeSource = 0;
  let fusedSelections = 0;
  let noPicks = 0;

  for (
    const row
    of fixtures
  ) {
    const math =
      mathematicalSignal(
        row.mathematical_output,
      );

    const openai =
      storedResearchPrediction(
        row.openai_output,
      );

    const deepseek =
      storedResearchPrediction(
        row.deepseek_output,
      );

    if (
      math.selection !==
      "no_pick"
    ) {
      withMath += 1;
    }

    if (
      openai !==
      null
    ) {
      withOpenAi += 1;
    }

    if (
      deepseek !==
      null
    ) {
      withDeepSeek += 1;
    }

    if (
      math.selection !==
        "no_pick" &&
      openai !==
        null &&
      deepseek !==
        null
    ) {
      threeSource += 1;
    }

    const result =
      fuseResearchPredictionsV01({
        mathematical:
          math,

        openai,

        deepseek,
      });

    if (
      result.selection ===
      "no_pick"
    ) {
      noPicks += 1;
    } else {
      fusedSelections += 1;
    }

    const kickoff =
      new Date(
        String(
          row.kickoff_at,
        ),
      ).toISOString();

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${String(row.home_name)} vs ${String(row.away_name)}`,
    );

    console.log(
      `Competition: ${String(row.competition_name)}`,
    );

    console.log(
      `Kickoff: ${kickoff}`,
    );

    console.log(
      `Mathematical: ${
        math.selection ===
        "no_pick"
          ? "NONE"
          : `${math.selection.toUpperCase()}/${math.strength}`
      }`,
    );

    console.log(
      `OpenAI: ${formatSource(openai)}`,
    );

    console.log(
      `DeepSeek: ${formatSource(deepseek)}`,
    );

    console.log(
      `FUSION: ${result.selection.toUpperCase()}`,
    );

    console.log(
      `Confidence: ${result.confidence}`,
    );

    console.log(
      `Scores: home=${result.scores.home} draw=${result.scores.draw} away=${result.scores.away}`,
    );

    console.log(
      `Support: math=${result.support.mathematical ? "YES" : "NO"} openai=${result.support.openai ? "YES" : "NO"} deepseek=${result.support.deepseek ? "YES" : "NO"}`,
    );

    console.log(
      `Reasons: ${
        result.reasons.length > 0
          ? result.reasons.join(", ")
          : "none"
      }`,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "SHADOW FUSION SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Fixtures analysed: ${fixtures.length}`,
  );

  console.log(
    `Mathematical available: ${withMath}`,
  );

  console.log(
    `OpenAI v0.2 available: ${withOpenAi}`,
  );

  console.log(
    `DeepSeek v0.1 available: ${withDeepSeek}`,
  );

  console.log(
    `Three-source fixtures: ${threeSource}`,
  );

  console.log(
    `Directional fusion selections: ${fusedSelections}`,
  );

  console.log(
    `NO_PICK: ${noPicks}`,
  );

  console.log(
    "READ ONLY COMPLETE: no database predictions were modified.",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error.";

    console.error(
      `Shadow fusion failed: ${message}`,
    );

    process.exitCode =
      1;
  },
);

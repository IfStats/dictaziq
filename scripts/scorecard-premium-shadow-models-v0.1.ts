import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const SCORECARD_VERSION =
  "dictaziq-premium-shadow-scorecard-v0.1";

const MODEL_VERSIONS = [
  "dictaziq-gpt-research-prediction-v0.2",
  "dictaziq-deepseek-research-prediction-v0.2",
  "dictaziq-astra-research-prediction-v0.1",
] as const;

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type ModelVersion =
  (typeof MODEL_VERSIONS)[number];

type MarketSummary = {
  graded: number;
  won: number;
  lost: number;
};

type ModelSummary = {
  fixtures: number;
  settledFixtures: number;
  oneXTwo: MarketSummary;
  over25: MarketSummary;
  btts: MarketSummary;
};

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (argument) =>
          !argument.startsWith("--"),
      ) ??
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

function createMarketSummary():
  MarketSummary {
  return {
    graded: 0,
    won: 0,
    lost: 0,
  };
}

function createModelSummary():
  ModelSummary {
  return {
    fixtures: 0,
    settledFixtures: 0,
    oneXTwo:
      createMarketSummary(),
    over25:
      createMarketSummary(),
    btts:
      createMarketSummary(),
  };
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

function integer(
  value: unknown,
  label: string,
): number {
  const result =
    Number(value);

  assert.ok(
    Number.isInteger(result) &&
      result >= 0,
    `${label} must be a non-negative integer.`,
  );

  return result;
}

function resultSelection(
  homeScore: number,
  awayScore: number,
):
  | "home"
  | "draw"
  | "away" {
  if (
    homeScore >
    awayScore
  ) {
    return "home";
  }

  if (
    awayScore >
    homeScore
  ) {
    return "away";
  }

  return "draw";
}

function over25Result(
  homeScore: number,
  awayScore: number,
):
  | "over_2_5"
  | "under_2_5" {
  return (
    homeScore +
    awayScore
  ) > 2.5
    ? "over_2_5"
    : "under_2_5";
}

function bttsResult(
  homeScore: number,
  awayScore: number,
):
  | "yes"
  | "no" {
  return (
    homeScore > 0 &&
    awayScore > 0
  )
    ? "yes"
    : "no";
}

function grade(
  summary: MarketSummary,
  prediction: string | null,
  actual: string,
): void {
  if (
    prediction === null ||
    prediction === "neutral"
  ) {
    return;
  }

  summary.graded +=
    1;

  if (
    prediction === actual
  ) {
    summary.won +=
      1;
  } else {
    summary.lost +=
      1;
  }
}

function accuracy(
  summary: MarketSummary,
): number | null {
  if (
    summary.graded === 0
  ) {
    return null;
  }

  return (
    summary.won /
    summary.graded
  ) * 100;
}

function printMarket(
  label: string,
  summary: MarketSummary,
): void {
  const value =
    accuracy(summary);

  console.log(
    `${label}: ${summary.won}/${summary.graded} correct${
      value === null
        ? ""
        : ` (${value.toFixed(1)}%)`
    }`,
  );
}

function modelLabel(
  version: string,
): string {
  if (
    version ===
    "dictaziq-gpt-research-prediction-v0.2"
  ) {
    return "LUNA";
  }

  if (
    version ===
    "dictaziq-deepseek-research-prediction-v0.2"
  ) {
    return "DEEPSEEK";
  }

  if (
    version ===
    "dictaziq-astra-research-prediction-v0.1"
  ) {
    return "ASTRA";
  }

  return version;
}

async function main() {
  const date =
    requestedDate();

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Premium Shadow Model Scorecard",
  );

  console.log(
    `Version: ${SCORECARD_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    "Premium competitions: UCL, EPL, Serie A, La Liga, Bundesliga",
  );

  console.log(
    "Models: Luna, DeepSeek, Astra",
  );

  console.log(
    "Shadow predictions do not need to be published.",
  );

  const rows =
    await sql`
      SELECT DISTINCT ON (
        prediction.fixture_id,
        model.version
      )
        prediction.id
          AS prediction_id,

        model.version
          AS model_version,

        prediction.generated_at,

        prediction.output ->> 'forecast'
          AS forecast,

        prediction.output ->> 'goalsView'
          AS goals_view,

        prediction.output ->> 'bttsView'
          AS btts_view,

        fixture.id
          AS fixture_id,

        fixture.kickoff_at,

        competition.name
          AS competition_name,

        competition.country
          AS competition_country,

        home.name
          AS home_team,

        away.name
          AS away_team,

        result.regulation_home_score,

        result.regulation_away_score

      FROM public.predictions
        AS prediction

      JOIN public.model_versions
        AS model
        ON model.id =
          prediction.model_version_id

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          prediction.fixture_id

      JOIN public.seasons
        AS season
        ON season.id =
          fixture.season_id

      JOIN public.competitions
        AS competition
        ON competition.id =
          season.competition_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away
        ON away.id =
          fixture.away_team_id

      LEFT JOIN LATERAL (
        SELECT
          snapshot.regulation_home_score,
          snapshot.regulation_away_score

        FROM public.result_snapshots
          AS snapshot

        WHERE snapshot.fixture_id =
          fixture.id

          AND snapshot.is_demo =
            false

          AND snapshot.status =
            'finished'

          AND snapshot.regulation_confirmed =
            true

        ORDER BY
          snapshot.observed_at DESC,
          snapshot.id DESC

        LIMIT 1
      )
        AS result
        ON true

      WHERE model.version IN (
        ${MODEL_VERSIONS[0]},
        ${MODEL_VERSIONS[1]},
        ${MODEL_VERSIONS[2]}
      )

        AND prediction.is_demo =
          false

        AND prediction.generated_at <
          fixture.kickoff_at

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

        AND (
          lower(
            competition.name
          ) IN (
            'uefa champions league',
            'champions league'
          )

          OR (
            lower(
              competition.name
            ) =
              'premier league'

            AND lower(
              coalesce(
                competition.country,
                ''
              )
            ) =
              'england'
          )

          OR (
            lower(
              competition.name
            ) =
              'serie a'

            AND lower(
              coalesce(
                competition.country,
                ''
              )
            ) =
              'italy'
          )

          OR (
            lower(
              competition.name
            ) =
              'la liga'

            AND lower(
              coalesce(
                competition.country,
                ''
              )
            ) =
              'spain'
          )

          OR (
            lower(
              competition.name
            ) =
              'bundesliga'

            AND lower(
              coalesce(
                competition.country,
                ''
              )
            ) =
              'germany'
          )
        )

      ORDER BY
        prediction.fixture_id,
        model.version,
        prediction.generated_at
    `;

  console.log(
    `Prediction records: ${rows.length}`,
  );

  const summaries =
    new Map<
      ModelVersion,
      ModelSummary
    >();

  for (
    const version
    of MODEL_VERSIONS
  ) {
    summaries.set(
      version,
      createModelSummary(),
    );
  }

  for (
    const row
    of rows
  ) {
    const version =
      String(
        row.model_version,
      ) as ModelVersion;

    const summary =
      summaries.get(
        version,
      );

    assert.ok(
      summary,
      `Unexpected model version: ${version}`,
    );

    summary.fixtures +=
      1;

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${modelLabel(version)} | ${String(row.home_team)} vs ${String(row.away_team)}`,
    );

    console.log(
      `${String(row.competition_name)} | ${String(row.competition_country ?? "")}`,
    );

    console.log(
      `1X2: ${text(row.forecast) ?? "NONE"} | O2.5: ${text(row.goals_view) ?? "NONE"} | BTTS: ${text(row.btts_view) ?? "NONE"}`,
    );

    if (
      row.regulation_home_score === null ||
      row.regulation_home_score === undefined ||
      row.regulation_away_score === null ||
      row.regulation_away_score === undefined
    ) {
      console.log(
        "Result: PENDING",
      );

      continue;
    }

    const homeScore =
      integer(
        row.regulation_home_score,
        "Home score",
      );

    const awayScore =
      integer(
        row.regulation_away_score,
        "Away score",
      );

    summary.settledFixtures +=
      1;

    const oneXTwoActual =
      resultSelection(
        homeScore,
        awayScore,
      );

    const over25Actual =
      over25Result(
        homeScore,
        awayScore,
      );

    const bttsActual =
      bttsResult(
        homeScore,
        awayScore,
      );

    grade(
      summary.oneXTwo,
      text(
        row.forecast,
      ),
      oneXTwoActual,
    );

    grade(
      summary.over25,
      text(
        row.goals_view,
      ),
      over25Actual,
    );

    grade(
      summary.btts,
      text(
        row.btts_view,
      ),
      bttsActual,
    );

    console.log(
      `Result: ${homeScore}-${awayScore}`,
    );

    console.log(
      `Actual: ${oneXTwoActual} | ${over25Actual} | BTTS ${bttsActual}`,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "MODEL COMPARISON",
  );

  console.log(
    "========================================",
  );

  for (
    const version
    of MODEL_VERSIONS
  ) {
    const summary =
      summaries.get(
        version,
      );

    assert.ok(summary);

    console.log("");
    console.log(
      modelLabel(version),
    );

    console.log(
      "-".repeat(
        modelLabel(version).length,
      ),
    );

    console.log(
      `Prediction fixtures: ${summary.fixtures}`,
    );

    console.log(
      `Finished fixtures: ${summary.settledFixtures}`,
    );

    printMarket(
      "1X2",
      summary.oneXTwo,
    );

    printMarket(
      "O2.5",
      summary.over25,
    );

    printMarket(
      "BTTS",
      summary.btts,
    );
  }

  console.log("");
  console.log(
    "NOTE: ROI and closing-line value are intentionally excluded from v0.1 until DictazIQ has a canonical pre-kickoff bookmaker-price snapshot.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Premium shadow scorecard failed: ${error.message}`
        : "Premium shadow scorecard failed.",
    );

    process.exitCode =
      1;
  },
);
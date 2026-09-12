import "./load-env";

import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  canonicalJson,
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

import {
  GPT_RESEARCH_PREDICTION_VERSION_V02,
  type GptResearchFactV02,
} from "../src/lib/ai/gpt-research-prediction-v0.2";

import {
  DEFAULT_GPT_RESEARCH_MODEL_V02,
  generateOpenAiResearchPredictionV02,
} from "../src/lib/ai/openai-research-prediction-v0.2";

import {
  fetchFixtureInjuries,
  fetchFixtureLineups,
} from "../src/providers/api-football/client";

const API_SOURCE =
  "api-football";

const RATING_SOURCE =
  "footballdatabase.com";

const RUNNER_VERSION =
  "dictaziq-gpt-fallback-runner-v0.2";

const MODEL_DESCRIPTION =
  "DictazIQ GPT research fallback prediction engine using sourced pre-match football information and OpenAI web research when a common FootballDatabase rating pair is unavailable; probabilities remain uncalibrated.";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type JsonObject =
  Record<
    string,
    unknown
  >;

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (
          argument,
        ) =>
          !argument.startsWith(
            "--",
          ),
      ) ??
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

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

function persistRequested():
  boolean {
  return process.argv.includes(
    "--persist",
  );
}

function publishRequested():
  boolean {
  return process.argv.includes(
    "--publish",
  );
}

function includeMathCovered():
  boolean {
  return process.argv.includes(
    "--include-math-covered",
  );
}

function requestedLimit():
  number |
  null {
  const argument =
    process.argv.find(
      (
        value,
      ) =>
        value.startsWith(
          "--limit=",
        ),
    );

  if (
    !argument
  ) {
    return null;
  }

  const value =
    Number(
      argument.slice(
        "--limit=".length,
      ),
    );

  if (
    !Number.isInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      "--limit must be a positive integer.",
    );
  }

  return value;
}

function isRecord(
  value:
    unknown,
): value is JsonObject {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
}

function toRecord(
  value:
    unknown,
):
  JsonObject |
  null {
  return isRecord(
    value,
  )
    ? value
    : null;
}

function text(
  value:
    unknown,
  label:
    string,
): string {
  assert.ok(
    typeof value ===
      "string" &&
    value.trim().length >
      0,
    `${label} must be a non-empty string.`,
  );

  return value.trim();
}

function timestamp(
  value:
    unknown,
  label:
    string,
): Date {
  const date =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(
            value,
          ),
        );

  assert.ok(
    Number.isFinite(
      date.getTime(),
    ),
    `${label} is invalid.`,
  );

  return date;
}

function nullablePositiveInteger(
  value:
    unknown,
):
  number |
  null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const result =
    Number(
      value,
    );

  return (
    Number.isInteger(
      result,
    ) &&
    result >
      0
  )
    ? result
    : null;
}

function finiteNumber(
  value:
    unknown,
):
  number |
  null {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value,
    )
  ) {
    return null;
  }

  return value;
}

function sourceFile(
  path:
    string,
): string {
  return readFileSync(
    resolve(
      path,
    ),
    "utf8",
  ).replace(
    /\r\n/g,
    "\n",
  );
}

function configuredModel():
  string {
  return (
    process.env
      .OPENAI_LLM_MODEL
      ?.trim() ||
    DEFAULT_GPT_RESEARCH_MODEL_V02
  );
}

function modelCodeSha256():
  string {
  return canonicalSha256({
    contract:
      sourceFile(
        "src/lib/ai/gpt-research-prediction-v0.2.ts",
      ),

    openAiAdapter:
      sourceFile(
        "src/lib/ai/openai-research-prediction-v0.2.ts",
      ),
  });
}

function modelConfiguration() {
  return {
    provider:
      "openai",

    model:
      configuredModel(),

    route:
      "gpt_research_fallback",

    mathematicalCoverageGate:
      "latest-common-pre-kickoff-footballdatabase-rating-pair",

    mandatoryResultForecast:
      true,

    selections: [
      "home",
      "draw",
      "away",
    ],

    webResearch:
      true,

    webSearchTool:
      "web_search_preview",

    webSearchRequired:
      true,

    webSourceProvenance:
      true,

    apiFootballContext:
      [
        "injuries",
        "confirmed_lineups_when_available",
      ],

    storedContextEvidence:
      true,

    storedMarketEvidence:
      true,

    calibratedProbabilities:
      false,

    probability:
      null,
  } as const;
}

async function databaseNow(
  sql:
    SqlClient,
): Promise<string> {
  const rows =
    await sql`
      SELECT
        clock_timestamp()
          AS now
    `;

  assert.equal(
    rows.length,
    1,
    "Could not read database clock.",
  );

  return timestamp(
    rows[0].now,
    "Database clock",
  ).toISOString();
}

async function hasCommonRatingPair(
  sql:
    SqlClient,

  homeTeamId:
    string,

  awayTeamId:
    string,

  availableAt:
    string,

  kickoffAt:
    string,
): Promise<boolean> {
  const rows =
    await sql`
      SELECT EXISTS (
        SELECT 1

        FROM public.team_rating_snapshots
          AS home_rating

        JOIN public.team_rating_snapshots
          AS away_rating
          ON away_rating.source =
            home_rating.source

          AND away_rating.snapshot_date =
            home_rating.snapshot_date

        WHERE home_rating.team_id =
          ${homeTeamId}::uuid

          AND away_rating.team_id =
            ${awayTeamId}::uuid

          AND home_rating.source =
            ${RATING_SOURCE}

          AND home_rating.is_demo =
            false

          AND away_rating.is_demo =
            false

          AND home_rating.observed_at <=
            ${availableAt}::timestamptz

          AND away_rating.observed_at <=
            ${availableAt}::timestamptz

          AND home_rating.observed_at <
            ${kickoffAt}::timestamptz

          AND away_rating.observed_at <
            ${kickoffAt}::timestamptz

          AND home_rating.snapshot_date <=
            (
              ${availableAt}::timestamptz
              AT TIME ZONE 'UTC'
            )::date
      ) AS has_pair
    `;

  assert.equal(
    rows.length,
    1,
  );

  return rows[0]
    .has_pair ===
    true;
}

function normalizeSide(
  value:
    unknown,
):
  "home" |
  "away" |
  "neutral" {
  if (
    value ===
      "home" ||
    value ===
      "away" ||
    value ===
      "neutral"
  ) {
    return value;
  }

  return "neutral";
}

async function storedContextFacts(
  sql:
    SqlClient,

  fixtureId:
    string,

  cutoffAt:
    string,

  kickoffAt:
    string,
): Promise<
  GptResearchFactV02[]
> {
  const rows =
    await sql`
      SELECT
        kind,
        side,
        description,
        source,
        observed_at

      FROM public.context_evidence_snapshots

      WHERE fixture_id =
        ${fixtureId}::uuid

        AND is_demo =
          false

        AND observed_at <=
          ${cutoffAt}::timestamptz

        AND observed_at <
          ${kickoffAt}::timestamptz

      ORDER BY
        observed_at,
        id

      LIMIT 30
    `;

  return rows.map(
    (
      row,
    ) => ({
      kind:
        text(
          row.kind,
          "Context kind",
        ),

      side:
        normalizeSide(
          row.side,
        ),

      description:
        text(
          row.description,
          "Context description",
        ),

      source:
        text(
          row.source,
          "Context source",
        ),

      observedAt:
        timestamp(
          row.observed_at,
          "Context observation",
        ).toISOString(),
    }),
  );
}

function scoringFact(
  side:
    "home" |
    "away",

  teamName:
    string,

  recent:
    JsonObject,

  source:
    string,

  observedAt:
    string,
):
  GptResearchFactV02 |
  null {
  const matches =
    finiteNumber(
      recent.matches,
    );

  if (
    matches ===
      null ||
    matches <=
      0
  ) {
    return null;
  }

  const metrics = {
    goalsFor:
      finiteNumber(
        recent.goalsFor,
      ),

    goalsAgainst:
      finiteNumber(
        recent.goalsAgainst,
      ),

    scoredMatches:
      finiteNumber(
        recent.scoredMatches,
      ),

    concededMatches:
      finiteNumber(
        recent.concededMatches,
      ),

    bttsMatches:
      finiteNumber(
        recent.bttsMatches,
      ),

    over25Matches:
      finiteNumber(
        recent.over25Matches,
      ),
  };

  const parts = [
    `${teamName}: ${matches} verified recent matches.`,
  ];

  if (
    metrics.goalsFor !==
    null
  ) {
    parts.push(
      `Goals scored: ${metrics.goalsFor}.`,
    );
  }

  if (
    metrics.goalsAgainst !==
    null
  ) {
    parts.push(
      `Goals conceded: ${metrics.goalsAgainst}.`,
    );
  }

  if (
    metrics.scoredMatches !==
    null
  ) {
    parts.push(
      `Scored in ${metrics.scoredMatches} matches.`,
    );
  }

  if (
    metrics.concededMatches !==
    null
  ) {
    parts.push(
      `Conceded in ${metrics.concededMatches} matches.`,
    );
  }

  if (
    metrics.bttsMatches !==
    null
  ) {
    parts.push(
      `BTTS occurred in ${metrics.bttsMatches}.`,
    );
  }

  if (
    metrics.over25Matches !==
    null
  ) {
    parts.push(
      `Over 2.5 occurred in ${metrics.over25Matches}.`,
    );
  }

  return {
    kind:
      "recent_scoring_statistics",

    side,

    description:
      parts.join(
        " ",
      ),

    source,

    observedAt,
  };
}

async function storedMarketFacts(
  sql:
    SqlClient,

  fixtureId:
    string,

  homeTeam:
    string,

  awayTeam:
    string,

  cutoffAt:
    string,

  kickoffAt:
    string,
): Promise<
  GptResearchFactV02[]
> {
  const rows =
    await sql`
      SELECT
        source,
        captured_at,
        evidence

      FROM public.market_evidence_snapshots

      WHERE fixture_id =
        ${fixtureId}::uuid

        AND is_demo =
          false

        AND captured_at <=
          ${cutoffAt}::timestamptz

        AND captured_at <
          ${kickoffAt}::timestamptz

        AND cutoff_at <
          ${kickoffAt}::timestamptz

      ORDER BY
        cutoff_at DESC,
        captured_at DESC

      LIMIT 1
    `;

  if (
    rows.length ===
    0
  ) {
    return [];
  }

  const evidence =
    toRecord(
      rows[0].evidence,
    );

  if (
    !evidence
  ) {
    return [];
  }

  const home =
    toRecord(
      evidence.home,
    );

  const away =
    toRecord(
      evidence.away,
    );

  const homeRecent =
    toRecord(
      home?.recent,
    );

  const awayRecent =
    toRecord(
      away?.recent,
    );

  const source =
    text(
      rows[0].source,
      "Market evidence source",
    );

  const observedAt =
    timestamp(
      rows[0].captured_at,
      "Market evidence capture",
    ).toISOString();

  const facts:
    GptResearchFactV02[] = [];

  if (
    homeRecent
  ) {
    const fact =
      scoringFact(
        "home",
        homeTeam,
        homeRecent,
        source,
        observedAt,
      );

    if (
      fact
    ) {
      facts.push(
        fact,
      );
    }
  }

  if (
    awayRecent
  ) {
    const fact =
      scoringFact(
        "away",
        awayTeam,
        awayRecent,
        source,
        observedAt,
      );

    if (
      fact
    ) {
      facts.push(
        fact,
      );
    }
  }

  return facts;
}

function injuryFacts(
  injuries:
    Awaited<
      ReturnType<
        typeof fetchFixtureInjuries
      >
    >,

  homeApiTeamId:
    number,

  awayApiTeamId:
    number,

  homeTeam:
    string,

  awayTeam:
    string,

  observedAt:
    string,
):
  GptResearchFactV02[] {
  const groups =
    new Map<
      number,
      typeof injuries
    >();

  for (
    const injury
    of injuries
  ) {
    if (
      injury.team.id !==
        homeApiTeamId &&
      injury.team.id !==
        awayApiTeamId
    ) {
      continue;
    }

    const existing =
      groups.get(
        injury.team.id,
      ) ??
      [];

    existing.push(
      injury,
    );

    groups.set(
      injury.team.id,
      existing,
    );
  }

  const facts:
    GptResearchFactV02[] = [];

  for (
    const [
      teamId,
      teamInjuries,
    ]
    of groups
  ) {
    const home =
      teamId ===
      homeApiTeamId;

    const teamName =
      home
        ? homeTeam
        : awayTeam;

    const unique =
      new Map<
        string,
        typeof teamInjuries[number]
      >();

    for (
      const injury
      of teamInjuries
    ) {
      const identity =
        injury.player.id !==
        null
          ? `id:${injury.player.id}`
          : `name:${injury.player.name.toLowerCase()}`;

      if (
        !unique.has(
          identity,
        )
      ) {
        unique.set(
          identity,
          injury,
        );
      }
    }

    const players =
      [...unique.values()];

    const playerText =
      players
        .slice(
          0,
          15,
        )
        .map(
          (
            injury,
          ) => {
            const detail =
              [
                injury.type,
                injury.reason,
              ]
                .filter(
                  (
                    item,
                  ) =>
                    typeof item ===
                      "string" &&
                    item.trim(),
                )
                .join(
                  ": ",
                );

            return detail
              ? `${injury.player.name} (${detail})`
              : injury.player.name;
          },
        )
        .join(
          ", ",
        );

    facts.push({
      kind:
        "squad_availability",

      side:
        home
          ? "home"
          : "away",

      description:
        [
          `${teamName}: API-Football reports ${players.length} unavailable player(s).`,
          playerText
            ? `Reported players: ${playerText}.`
            : "",
          "Absence count alone must not be treated as a directional vote.",
        ]
          .filter(
            Boolean,
          )
          .join(
            " ",
          ),

      source:
        API_SOURCE,

      observedAt,
    });
  }

  return facts;
}

function lineupFacts(
  lineups:
    Awaited<
      ReturnType<
        typeof fetchFixtureLineups
      >
    >,

  homeApiTeamId:
    number,

  awayApiTeamId:
    number,

  homeTeam:
    string,

  awayTeam:
    string,

  observedAt:
    string,
):
  GptResearchFactV02[] {
  const facts:
    GptResearchFactV02[] = [];

  for (
    const lineup
    of lineups
  ) {
    if (
      lineup.team.id !==
        homeApiTeamId &&
      lineup.team.id !==
        awayApiTeamId
    ) {
      continue;
    }

    if (
      lineup.startXI.length ===
      0
    ) {
      continue;
    }

    const home =
      lineup.team.id ===
      homeApiTeamId;

    const teamName =
      home
        ? homeTeam
        : awayTeam;

    const starters =
      lineup.startXI
        .map(
          (
            player,
          ) =>
            player.position
              ? `${player.name} (${player.position})`
              : player.name,
        )
        .join(
          ", ",
        );

    facts.push({
      kind:
        "confirmed_or_provider_lineup",

      side:
        home
          ? "home"
          : "away",

      description: [
        `API-Football returned a starting XI for ${teamName}.`,
        `Formation: ${lineup.formation ?? "not supplied"}.`,
        `Starting XI: ${starters}.`,
      ].join(
        " ",
      ),

      source:
        API_SOURCE,

      observedAt,
    });
  }

  return facts;
}

function dedupeFacts(
  facts:
    GptResearchFactV02[],
):
  GptResearchFactV02[] {
  const unique =
    new Map<
      string,
      GptResearchFactV02
    >();

  for (
    const fact
    of facts
  ) {
    const key =
      [
        fact.kind,
        fact.side,
        fact.source,
        fact.description,
      ].join(
        "|",
      );

    if (
      !unique.has(
        key,
      )
    ) {
      unique.set(
        key,
        fact,
      );
    }
  }

  return [
    ...unique.values(),
  ].slice(
    0,
    50,
  );
}

async function main() {
  const date =
    requestedDate();

  const persist =
    persistRequested();

  const publish =
    publishRequested();

  const includeCovered =
    includeMathCovered();

  const limit =
    requestedLimit();

  if (
    publish &&
    !persist
  ) {
    throw new Error(
      "--publish requires --persist.",
    );
  }

  /*
   * This switch exists only so we can smoke-test
   * GPT against known mathematically covered
   * fixtures.
   *
   * It must never create duplicate production
   * baselines.
   */
  if (
    includeCovered &&
    persist
  ) {
    throw new Error(
      "--include-math-covered is read-only and cannot be combined with --persist.",
    );
  }

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const startedAt =
    await databaseNow(
      sql,
    );

  const modelSha =
    modelCodeSha256();

  const configuration =
    modelConfiguration();

  console.log(
    "DictazIQ GPT Research Fallback",
  );

  console.log(
    `Runner: ${RUNNER_VERSION}`,
  );

  console.log(
    `Model contract: ${GPT_RESEARCH_PREDICTION_VERSION_V02}`,
  );

  console.log(
    `OpenAI model: ${configuration.model}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Database time: ${startedAt}`,
  );

  console.log(
    `Mode: ${persist ? "PERSIST" : "READ ONLY"}`,
  );

  console.log(
    `Publication: ${publish ? "YES" : "NO"}`,
  );

  console.log(
    `Include math-covered test fixtures: ${includeCovered ? "YES" : "NO"}`,
  );

  console.log(
    `Limit: ${limit ?? "NONE"}`,
  );

  const fixtures =
    await sql`
      SELECT
        fixture.id,
        fixture.provider_id,
        fixture.kickoff_at,
        fixture.is_demo,

        competition.sport_id,
        competition.name
          AS competition_name,

        competition.country
          AS competition_country,

        home.id
          AS home_team_id,

        home.name
          AS home_team_name,

        away_team.id
          AS away_team_id,

        away_team.name
          AS away_team_name,

        home_api.source_team_id
          AS home_api_team_id,

        away_api.source_team_id
          AS away_api_team_id

      FROM public.fixtures
        AS fixture

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
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      LEFT JOIN public.team_source_mappings
        AS home_api
        ON home_api.team_id =
          fixture.home_team_id

        AND home_api.source =
          ${API_SOURCE}

        AND home_api.is_verified =
          true

      LEFT JOIN public.team_source_mappings
        AS away_api
        ON away_api.team_id =
          fixture.away_team_id

        AND away_api.source =
          ${API_SOURCE}

        AND away_api.is_verified =
          true

      WHERE fixture.provider =
        ${API_SOURCE}

        AND fixture.is_demo =
          false

        AND fixture.status =
          'scheduled'

        AND fixture.kickoff_at >
          ${startedAt}::timestamptz

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  console.log(
    `Future persisted fixtures: ${fixtures.length}`,
  );

  if (
    fixtures.length ===
    0
  ) {
    return;
  }

  const sportIds =
    new Set(
      fixtures.map(
        (
          fixture,
        ) =>
          String(
            fixture.sport_id,
          ),
      ),
    );

  assert.equal(
    sportIds.size,
    1,
    "GPT research fixture set contains multiple sports.",
  );

  const sportId =
    [...sportIds][0];

  if (
    persist
  ) {
    await sql`
      INSERT INTO public.model_versions (
        sport_id,
        version,
        description,
        code_sha256,
        configuration
      )
      VALUES (
        ${sportId}::uuid,
        ${GPT_RESEARCH_PREDICTION_VERSION_V02},
        ${MODEL_DESCRIPTION},
        ${modelSha},
        ${JSON.stringify(
          configuration,
        )}::jsonb
      )

      ON CONFLICT (
        version
      )
      DO NOTHING
    `;
  }

  const modelRows =
    await sql`
      SELECT
        id,
        sport_id,
        code_sha256,
        configuration

      FROM public.model_versions

      WHERE version =
        ${GPT_RESEARCH_PREDICTION_VERSION_V02}

      LIMIT 1
    `;

  if (
    persist
  ) {
    assert.equal(
      modelRows.length,
      1,
      "GPT research model registration failed.",
    );
  }

  if (
    modelRows.length ===
    1
  ) {
    assert.equal(
      String(
        modelRows[0].sport_id,
      ),
      sportId,
      "GPT model belongs to wrong sport.",
    );

    assert.equal(
      String(
        modelRows[0].code_sha256,
      ),
      modelSha,
      "GPT research source changed under an existing model version.",
    );

    assert.equal(
      canonicalJson(
        modelRows[0].configuration,
      ),
      canonicalJson(
        configuration,
      ),
      "GPT research configuration changed under an existing model version.",
    );
  }

  let candidates =
    0;

  let analysed =
    0;

  let inserted =
    0;

  let published =
    0;

  let existing =
    0;

  let mathCovered =
    0;

  let skipped =
    0;

  for (
    const fixture
    of fixtures
  ) {
    if (
      limit !==
        null &&
      analysed >=
        limit
    ) {
      break;
    }

    const fixtureId =
      String(
        fixture.id,
      );

    const homeTeamId =
      String(
        fixture.home_team_id,
      );

    const awayTeamId =
      String(
        fixture.away_team_id,
      );

    const homeTeam =
      text(
        fixture.home_team_name,
        "Home team",
      );

    const awayTeam =
      text(
        fixture.away_team_name,
        "Away team",
      );

    const competition =
      text(
        fixture.competition_name,
        "Competition",
      );

    const country =
      fixture.competition_country ===
        null
        ? null
        : String(
            fixture.competition_country,
          );

    const kickoffAt =
      timestamp(
        fixture.kickoff_at,
        "Kickoff",
      ).toISOString();

    const currentTime =
      await databaseNow(
        sql,
      );

    if (
      Date.parse(
        currentTime,
      ) >=
      Date.parse(
        kickoffAt,
      )
    ) {
      skipped +=
        1;

      continue;
    }

    const covered =
      await hasCommonRatingPair(
        sql,
        homeTeamId,
        awayTeamId,
        currentTime,
        kickoffAt,
      );

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${homeTeam} vs ${awayTeam}`,
    );

    console.log(
      `Kickoff: ${kickoffAt}`,
    );

    console.log(
      `Common mathematical rating pair: ${covered ? "YES" : "NO"}`,
    );

    if (
      covered
    ) {
      mathCovered +=
        1;

      if (
        !includeCovered
      ) {
        console.log(
          "ROUTE: mathematical engine — GPT fallback not required.",
        );

        continue;
      }

      console.log(
        "TEST ROUTE: GPT research enabled read-only despite mathematical coverage.",
      );
    }

    candidates +=
      1;

    /*
     * Production idempotency:
     *
     * once a GPT fallback baseline exists for this
     * fixture/model, subsequent information belongs
     * in forecast_revisions rather than predictions.
     */
    const existingRows =
      await sql`
        SELECT
          prediction.id,
          prediction.published_at,
          prediction.output

        FROM public.predictions
          AS prediction

        JOIN public.model_versions
          AS model
          ON model.id =
            prediction.model_version_id

        WHERE prediction.fixture_id =
          ${fixtureId}::uuid

          AND model.version =
            ${GPT_RESEARCH_PREDICTION_VERSION_V02}

          AND prediction.is_demo =
            false

        ORDER BY
          prediction.generated_at

        LIMIT 1
      `;

    if (
      existingRows.length ===
      1
    ) {
      existing +=
        1;

      console.log(
        `GPT BASELINE EXISTING: ${existingRows[0].id}`,
      );

      if (
        persist &&
        publish &&
        existingRows[0].published_at ===
          null
      ) {
        const publication =
          await sql`
            UPDATE public.predictions

            SET published_at =
              clock_timestamp()

            WHERE id =
              ${String(
                existingRows[0].id,
              )}::uuid

              AND published_at
                IS NULL

            RETURNING
              published_at
          `;

        if (
          publication.length ===
          1
        ) {
          published +=
            1;

          console.log(
            `PUBLISHED: ${timestamp(
              publication[0].published_at,
              "Publication",
            ).toISOString()}`,
          );
        }
      }

      continue;
    }

    const facts:
      GptResearchFactV02[] = [];

    facts.push(
      ...await storedContextFacts(
        sql,
        fixtureId,
        currentTime,
        kickoffAt,
      ),
    );

    facts.push(
      ...await storedMarketFacts(
        sql,
        fixtureId,
        homeTeam,
        awayTeam,
        currentTime,
        kickoffAt,
      ),
    );

    const providerFixtureId =
      nullablePositiveInteger(
        fixture.provider_id,
      );

    const homeApiTeamId =
      nullablePositiveInteger(
        fixture.home_api_team_id,
      );

    const awayApiTeamId =
      nullablePositiveInteger(
        fixture.away_api_team_id,
      );

    let injuries:
      Awaited<
        ReturnType<
          typeof fetchFixtureInjuries
        >
      > = [];

    let lineups:
      Awaited<
        ReturnType<
          typeof fetchFixtureLineups
        >
      > = [];

    /*
     * Structured API-Football context is optional.
     *
     * GPT web research remains available even when
     * mappings or a provider endpoint are missing.
     */
    if (
      providerFixtureId !==
        null &&
      homeApiTeamId !==
        null &&
      awayApiTeamId !==
        null
    ) {
      const results =
        await Promise.allSettled([
          fetchFixtureInjuries(
            providerFixtureId,
          ),

          fetchFixtureLineups(
            providerFixtureId,
          ),
        ]);

      if (
        results[0].status ===
        "fulfilled"
      ) {
        injuries =
          results[0].value;
      } else {
        console.log(
          "API-Football injuries unavailable.",
        );
      }

      if (
        results[1].status ===
        "fulfilled"
      ) {
        lineups =
          results[1].value;
      } else {
        console.log(
          "API-Football lineups unavailable.",
        );
      }

      const evidenceObservedAt =
        await databaseNow(
          sql,
        );

      if (
        Date.parse(
          evidenceObservedAt,
        ) >=
        Date.parse(
          kickoffAt,
        )
      ) {
        console.log(
          "SKIP: structured evidence collection crossed kickoff.",
        );

        skipped +=
          1;

        continue;
      }

      facts.push(
        ...injuryFacts(
          injuries,
          homeApiTeamId,
          awayApiTeamId,
          homeTeam,
          awayTeam,
          evidenceObservedAt,
        ),
      );

      facts.push(
        ...lineupFacts(
          lineups,
          homeApiTeamId,
          awayApiTeamId,
          homeTeam,
          awayTeam,
          evidenceObservedAt,
        ),
      );
    }

    const researchStartedAt =
      await databaseNow(
        sql,
      );

    if (
      Date.parse(
        researchStartedAt,
      ) >=
      Date.parse(
        kickoffAt,
      )
    ) {
      skipped +=
        1;

      continue;
    }

    const finalFacts =
      dedupeFacts(
        facts,
      );

    console.log(
      `Structured facts: ${finalFacts.length}`,
    );

    console.log(
      `API injuries: ${injuries.length}`,
    );

    console.log(
      `API lineup teams: ${lineups.length}`,
    );

    console.log(
      "GPT web research: START",
    );

    const research =
      await generateOpenAiResearchPredictionV02({
        purpose:
          "fallback",

        fixture: {
          fixtureId,

          homeTeam,

          awayTeam,

          competition,

          country,

          kickoffAt,
        },

        evidence: {
          /*
           * This is the structured-evidence
           * observation boundary supplied to GPT.
           *
           * Web-search observation is frozen below
           * after the Responses API call completes.
           */
          cutoffAt:
            researchStartedAt,

          structuredFacts:
            finalFacts,
        },
      });

    const researchCompletedAt =
      await databaseNow(
        sql,
      );

    /*
     * Absolute anti-leakage gate.
     *
     * A GPT response completing at/after kickoff
     * cannot become a DictazIQ pre-match forecast.
     */
    if (
      Date.parse(
        researchCompletedAt,
      ) >=
      Date.parse(
        kickoffAt,
      )
    ) {
      console.log(
        "DISCARD: GPT research completed at or after kickoff.",
      );

      skipped +=
        1;

      continue;
    }

    analysed +=
      1;

    console.log("");
    console.log(
      `GPT FORECAST: ${research.prediction.selection.toUpperCase()}`,
    );

    console.log(
      `Confidence: ${research.prediction.confidence}`,
    );

    console.log(
      `Evidence grade: ${research.prediction.evidenceGrade}`,
    );

    console.log(
      `Goals: ${research.prediction.goalsView}`,
    );

    console.log(
      `BTTS: ${research.prediction.bttsView}`,
    );

    console.log(
      `Web search used: ${research.webSearchUsed ? "YES" : "NO"}`,
    );

    console.log(
      `Web sources: ${research.webSources.length}`,
    );

    for (
      const factor
      of research.prediction.materialFactors
    ) {
      console.log(
        `- ${factor}`,
      );
    }

    /*
     * Web evidence was observed during the OpenAI
     * call, so the immutable input cutoff is the
     * database time immediately after that call.
     */
    const inputSnapshot = {
      route:
        "gpt_research_fallback",

      fixture: {
        id:
          fixtureId,

        provider:
          API_SOURCE,

        providerId:
          String(
            fixture.provider_id,
          ),

        homeTeam: {
          id:
            homeTeamId,

          name:
            homeTeam,
        },

        awayTeam: {
          id:
            awayTeamId,

          name:
            awayTeam,
        },

        competition,

        country,

        kickoffAt,
      },

      mathematicalCoverage: {
        ratingSource:
          RATING_SOURCE,

        commonRatingPair:
          covered,

        fallbackRequired:
          !covered,
      },

      structuredEvidence: {
        observationCutoffAt:
          researchStartedAt,

        facts:
          finalFacts,
      },

      webResearch: {
        provider:
          research.provider,

        model:
          research.model,

        required:
          true,

        used:
          research.webSearchUsed,

        sources:
          research.webSources,

        startedAt:
          researchStartedAt,

        completedAt:
          researchCompletedAt,
      },

      model: {
        version:
          GPT_RESEARCH_PREDICTION_VERSION_V02,

        codeSha256:
          modelSha,

        configuration,
      },
    };

    const inputSha256 =
      canonicalSha256(
        inputSnapshot,
      );

    const output = {
      engine:
        "gpt_research",

      engineVersion:
        GPT_RESEARCH_PREDICTION_VERSION_V02,

      provider:
        research.provider,

      providerModel:
        research.model,

      providerResponseId:
        research.responseId,

      forecast:
        research.prediction.selection,

      confidence:
        research.prediction.confidence,

      evidenceGrade:
        research.prediction.evidenceGrade,

      goalsView:
        research.prediction.goalsView,

      bttsView:
        research.prediction.bttsView,

      materialFactors:
        research.prediction.materialFactors,

      reasoningSummary:
        research.prediction.reasoningSummary,

      contradictions:
        research.prediction.contradictions,

      missingInformation:
        research.prediction.missingInformation,

      probability:
        null,

      calibratedProbability:
        null,

      modelOverride:
        false,

      webSearchUsed:
        research.webSearchUsed,

      webSourceCount:
        research.webSources.length,

      usage:
        research.usage,
    };

    console.log(
      `Input SHA: ${inputSha256}`,
    );

    console.log(
      `OpenAI response: ${research.responseId}`,
    );

    if (
      !persist
    ) {
      console.log(
        "READ ONLY: no prediction persisted.",
      );

      continue;
    }

    assert.equal(
      modelRows.length,
      1,
      "GPT research model is not registered.",
    );

    /*
     * Recheck for a concurrently created GPT
     * baseline before inserting.
     */
    const concurrentCheck =
      await sql`
        SELECT
          prediction.id

        FROM public.predictions
          AS prediction

        WHERE prediction.fixture_id =
          ${fixtureId}::uuid

          AND prediction.model_version_id =
            ${String(
              modelRows[0].id,
            )}::uuid

        ORDER BY
          prediction.generated_at

        LIMIT 1
      `;

    if (
      concurrentCheck.length >
      0
    ) {
      existing +=
        1;

      console.log(
        `GPT BASELINE ALREADY CREATED: ${concurrentCheck[0].id}`,
      );

      continue;
    }

    const insertedRows =
      await sql`
        INSERT INTO public.predictions (
          fixture_id,
          model_version_id,
          is_demo,
          kickoff_at_generation,
          input_cutoff_at,
          generated_at,
          published_at,
          input_sha256,
          input_snapshot,
          output
        )
        VALUES (
          ${fixtureId}::uuid,

          ${String(
            modelRows[0].id,
          )}::uuid,

          false,

          ${kickoffAt}::timestamptz,

          ${researchCompletedAt}::timestamptz,

          ${researchCompletedAt}::timestamptz,

          NULL,

          ${inputSha256},

          ${JSON.stringify(
            inputSnapshot,
          )}::jsonb,

          ${JSON.stringify(
            output,
          )}::jsonb
        )

        RETURNING
          id,
          generated_at
      `;

    assert.equal(
      insertedRows.length,
      1,
      "GPT fallback baseline insertion failed.",
    );

    inserted +=
      1;

    const predictionId =
      String(
        insertedRows[0].id,
      );

    console.log(
      `GPT BASELINE INSERTED: ${predictionId}`,
    );

    if (
      publish
    ) {
      const publication =
        await sql`
          UPDATE public.predictions

          SET published_at =
            clock_timestamp()

          WHERE id =
            ${predictionId}::uuid

            AND published_at
              IS NULL

          RETURNING
            published_at
        `;

      assert.equal(
        publication.length,
        1,
        "GPT fallback publication failed.",
      );

      published +=
        1;

      console.log(
        `GPT BASELINE PUBLISHED: ${timestamp(
          publication[0].published_at,
          "Publication",
        ).toISOString()}`,
      );
    }
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "GPT FALLBACK SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Persisted future fixtures: ${fixtures.length}`,
  );

  console.log(
    `Math-covered fixtures: ${mathCovered}`,
  );

  console.log(
    `GPT candidates: ${candidates}`,
  );

  console.log(
    `GPT analysed: ${analysed}`,
  );

  console.log(
    `GPT baselines inserted: ${inserted}`,
  );

  console.log(
    `GPT baselines published: ${published}`,
  );

  console.log(
    `GPT baselines existing: ${existing}`,
  );

  console.log(
    `Skipped: ${skipped}`,
  );

  if (
    !persist
  ) {
    console.log(
      "READ ONLY COMPLETE: database predictions were not modified.",
    );
  }
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `GPT fallback failed: ${error.message}`
        : "GPT fallback failed.",
    );

    process.exitCode =
      1;
  },
);

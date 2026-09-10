import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

import {
  FORECAST_REVISION_VERSION_V01,
  type ForecastConfidenceV01,
  type ForecastEvidenceGradeV01,
  type ForecastLineupStateV01,
  type ForecastSelectionV01,
} from "../src/lib/predictions/forecast-revision-v0.1";

import {
  GPT_RESEARCH_PREDICTION_VERSION_V01,
  type GptResearchBttsV01,
  type GptResearchFactV01,
  type GptResearchGoalsV01,
  type GptResearchPurposeV01,
} from "../src/lib/ai/gpt-research-prediction-v0.1";

import {
  generateOpenAiResearchPredictionV01,
} from "../src/lib/ai/openai-research-prediction-v0.1";

import {
  applyResearchSourcePolicyV01,
} from "../src/lib/ai/research-source-policy-v0.1";

import {
  fetchFixtureInjuries,
  fetchFixtureLineups,
} from "../src/providers/api-football/client";

const RUNNER_VERSION =
  "dictaziq-prematch-gpt-monitor-v0.1";

const API_SOURCE =
  "api-football";

const UNIFIED_MODEL =
  "dictaziq-unified-match-analysis-v0.1";

const GPT_MODEL =
  GPT_RESEARCH_PREDICTION_VERSION_V01;

/*
 * We do not start an expensive GPT/web operation
 * when kickoff is effectively upon us.
 */
const MIN_SECONDS_BEFORE_KICKOFF =
  120;

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

type ActiveForecast = {
  selection:
    ForecastSelectionV01;

  confidence:
    ForecastConfidenceV01;

  evidenceGrade:
    ForecastEvidenceGradeV01;

  goalsView:
    GptResearchGoalsV01;

  bttsView:
    GptResearchBttsV01;

  lineupState:
    ForecastLineupStateV01;

  revisionNumber:
    number;

  inputCutoffAt:
    string;

  materialFactors:
    string[];
};

function requestedDate():
  string {
  const argument =
    process.argv
      .slice(
        2,
      )
      .find(
        (
          value,
        ) =>
          !value.startsWith(
            "--",
          ),
      );

  const value =
    argument ??
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

  const result =
    Number(
      argument.slice(
        "--limit=".length,
      ),
    );

  if (
    !Number.isInteger(
      result,
    ) ||
    result <=
      0
  ) {
    throw new Error(
      "--limit must be a positive integer.",
    );
  }

  return result;
}

function requestedWindowMinutes():
  number {
  const argument =
    process.argv.find(
      (
        value,
      ) =>
        value.startsWith(
          "--window-minutes=",
        ),
    );

  if (
    !argument
  ) {
    return 1440;
  }

  const result =
    Number(
      argument.slice(
        "--window-minutes=".length,
      ),
    );

  if (
    !Number.isInteger(
      result,
    ) ||
    result <
      1 ||
    result >
      2880
  ) {
    throw new Error(
      "--window-minutes must be between 1 and 2880.",
    );
  }

  return result;
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

function timestamp(
  value:
    unknown,
  label:
    string,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(
          String(
            value,
          ),
        );

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return date.toISOString();
}

function positiveInteger(
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

function selection(
  value:
    unknown,
):
  ForecastSelectionV01 |
  null {
  return (
    value === "home" ||
    value === "draw" ||
    value === "away"
  )
    ? value
    : null;
}

function confidence(
  value:
    unknown,
):
  ForecastConfidenceV01 {
  return (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "very_low"
  )
    ? value
    : "low";
}

function evidenceGrade(
  value:
    unknown,
):
  ForecastEvidenceGradeV01 {
  return (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D" ||
    value === "E"
  )
    ? value
    : "C";
}

function goalsView(
  value:
    unknown,
):
  GptResearchGoalsV01 {
  return (
    value ===
      "over_2_5" ||
    value ===
      "under_2_5" ||
    value ===
      "neutral"
  )
    ? value
    : "neutral";
}

function bttsView(
  value:
    unknown,
):
  GptResearchBttsV01 {
  return (
    value === "yes" ||
    value === "no" ||
    value === "neutral"
  )
    ? value
    : "neutral";
}

function stringArray(
  value:
    unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is string =>
        typeof item ===
          "string" &&
        item.trim().length >
          0,
    )
    .map(
      (
        item,
      ) =>
        item.trim(),
    );
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
  );

  return timestamp(
    rows[0].now,
    "Database clock",
  );
}

function baselineActiveForecast(
  output:
    unknown,

  inputCutoffAt:
    string,
):
  ActiveForecast {
  if (
    !isRecord(
      output,
    )
  ) {
    throw new Error(
      "Baseline output is not a JSON object.",
    );
  }

  const forecast =
    selection(
      output.forecast,
    );

  if (
    forecast ===
    null
  ) {
    throw new Error(
      "Baseline forecast is missing HOME/DRAW/AWAY.",
    );
  }

  return {
    selection:
      forecast,

    confidence:
      confidence(
        output.confidence,
      ),

    evidenceGrade:
      evidenceGrade(
        output.evidenceGrade,
      ),

    goalsView:
      goalsView(
        output.goalsView,
      ),

    bttsView:
      bttsView(
        output.bttsView,
      ),

    lineupState:
      "unconfirmed",

    revisionNumber:
      0,

    inputCutoffAt,

    materialFactors:
      stringArray(
        output.materialFactors,
      ),
  };
}

function activeForecastFromRow(
  row:
    JsonObject,
):
  ActiveForecast {
  const baselineCutoff =
    timestamp(
      row.baseline_input_cutoff_at,
      "Baseline cutoff",
    );

  if (
    row.revision_id ===
      null ||
    row.revision_id ===
      undefined
  ) {
    return baselineActiveForecast(
      row.baseline_output,
      baselineCutoff,
    );
  }

  const revisionSelection =
    selection(
      row.revision_selection,
    );

  if (
    revisionSelection ===
      null
  ) {
    throw new Error(
      "Active revision has invalid selection.",
    );
  }

  const revisionOutput =
    isRecord(
      row.revision_output,
    )
      ? row.revision_output
      : {};

  return {
    selection:
      revisionSelection,

    confidence:
      confidence(
        row.revision_confidence,
      ),

    evidenceGrade:
      evidenceGrade(
        row.revision_evidence_grade,
      ),

    goalsView:
      goalsView(
        revisionOutput.goalsView,
      ),

    bttsView:
      bttsView(
        revisionOutput.bttsView,
      ),

    lineupState:
      row.revision_lineup_state ===
        "confirmed"
        ? "confirmed"
        : row.revision_lineup_state ===
            "unavailable"
          ? "unavailable"
          : "unconfirmed",

    revisionNumber:
      Number(
        row.revision_number,
      ),

    inputCutoffAt:
      timestamp(
        row.revision_input_cutoff_at,
        "Revision cutoff",
      ),

    materialFactors:
      stringArray(
        revisionOutput.materialFactors,
      ),
  };
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
  GptResearchFactV01[]
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
        observed_at DESC,
        id

      LIMIT 30
    `;

  return rows.map(
    (
      row,
    ) => ({
      kind:
        String(
          row.kind,
        ),

      side:
        row.side ===
          "home" ||
        row.side ===
          "away"
          ? row.side
          : "neutral",

      description:
        String(
          row.description,
        ),

      source:
        String(
          row.source,
        ),

      observedAt:
        timestamp(
          row.observed_at,
          "Context observation",
        ),
    }),
  );
}

function injuryFacts(
  injuries:
    Awaited<
      ReturnType<
        typeof fetchFixtureInjuries
      >
    >,

  homeApiId:
    number,

  awayApiId:
    number,

  observedAt:
    string,
):
  GptResearchFactV01[] {
  const facts:
    GptResearchFactV01[] = [];

  for (
    const [
      side,
      teamId,
    ]
    of [
      [
        "home",
        homeApiId,
      ],
      [
        "away",
        awayApiId,
      ],
    ] as const
  ) {
    const teamInjuries =
      injuries.filter(
        (
          injury,
        ) =>
          injury.team.id ===
          teamId,
      );

    if (
      teamInjuries.length ===
      0
    ) {
      continue;
    }

    const unique =
      new Map<
        string,
        typeof teamInjuries[number]
      >();

    for (
      const injury
      of teamInjuries
    ) {
      const key =
        injury.player.id !==
          null
          ? String(
              injury.player.id,
            )
          : injury.player.name
              .trim()
              .toLowerCase();

      if (
        !unique.has(
          key,
        )
      ) {
        unique.set(
          key,
          injury,
        );
      }
    }

    const players =
      [...unique.values()];

    facts.push({
      kind:
        "squad_availability",

      side,

      description:
        [
          `API-Football currently reports ${players.length} unavailable player(s).`,

          players
            .slice(
              0,
              15,
            )
            .map(
              (
                injury,
              ) =>
                [
                  injury.player.name,

                  injury.type
                    ? `(${injury.type}${
                        injury.reason
                          ? `: ${injury.reason}`
                          : ""
                      })`
                    : "",
                ]
                  .filter(
                    Boolean,
                  )
                  .join(
                    " ",
                  ),
            )
            .join(
              ", ",
            ),

          "The number of absences alone is not a directional vote.",
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

  homeApiId:
    number,

  awayApiId:
    number,

  observedAt:
    string,
): {
  facts:
    GptResearchFactV01[];

  confirmed:
    boolean;
} {
  const facts:
    GptResearchFactV01[] = [];

  let homeConfirmed =
    false;

  let awayConfirmed =
    false;

  for (
    const lineup
    of lineups
  ) {
    if (
      lineup.team.id !==
        homeApiId &&
      lineup.team.id !==
        awayApiId
    ) {
      continue;
    }

    if (
      lineup.startXI.length <
      11
    ) {
      continue;
    }

    const side =
      lineup.team.id ===
        homeApiId
        ? "home"
        : "away";

    if (
      side ===
      "home"
    ) {
      homeConfirmed =
        true;
    } else {
      awayConfirmed =
        true;
    }

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
        "confirmed_lineup",

      side,

      description:
        [
          `Confirmed/provider starting XI returned for ${lineup.team.name}.`,
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

  return {
    facts,

    confirmed:
      homeConfirmed &&
      awayConfirmed,
  };
}

function dedupeFacts(
  values:
    GptResearchFactV01[],
):
  GptResearchFactV01[] {
  const map =
    new Map<
      string,
      GptResearchFactV01
    >();

  for (
    const fact
    of values
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

    map.set(
      key,
      fact,
    );
  }

  return [
    ...map.values(),
  ].slice(
    0,
    50,
  );
}

function determinePurpose(
  confirmedLineups:
    boolean,

  minutesToKickoff:
    number,
): GptResearchPurposeV01 {
  if (
    confirmedLineups
  ) {
    return "confirmed_lineup";
  }

  if (
    minutesToKickoff <=
    15
  ) {
    return "final_prematch";
  }

  return "scheduled_refresh";
}

function materialChanges(
  previous:
    ActiveForecast,

  next: {
    selection:
      ForecastSelectionV01;

    confidence:
      ForecastConfidenceV01;

    evidenceGrade:
      ForecastEvidenceGradeV01;

    goalsView:
      GptResearchGoalsV01;

    bttsView:
      GptResearchBttsV01;
  },

  confirmedLineups:
    boolean,
): string[] {
  const changes:
    string[] = [];

  if (
    previous.selection !==
    next.selection
  ) {
    changes.push(
      `1X2 forecast changed from ${previous.selection} to ${next.selection}.`,
    );
  }

  if (
    previous.confidence !==
    next.confidence
  ) {
    changes.push(
      `Confidence changed from ${previous.confidence} to ${next.confidence}.`,
    );
  }

  if (
    previous.evidenceGrade !==
    next.evidenceGrade
  ) {
    changes.push(
      `Evidence grade changed from ${previous.evidenceGrade} to ${next.evidenceGrade}.`,
    );
  }

  if (
    previous.goalsView !==
    next.goalsView
  ) {
    changes.push(
      `Goals view changed from ${previous.goalsView} to ${next.goalsView}.`,
    );
  }

  if (
    previous.bttsView !==
    next.bttsView
  ) {
    changes.push(
      `BTTS view changed from ${previous.bttsView} to ${next.bttsView}.`,
    );
  }

  if (
    confirmedLineups &&
    previous.lineupState !==
      "confirmed"
  ) {
    changes.push(
      "Both confirmed starting lineups became available.",
    );
  }

  return changes;
}

async function main() {
  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const date =
    requestedDate();

  const persist =
    persistRequested();

  const limit =
    requestedLimit();

  const windowMinutes =
    requestedWindowMinutes();

  const now =
    await databaseNow(
      sql,
    );

  console.log(
    "DictazIQ GPT Pre-Match Monitor",
  );

  console.log(
    `Runner: ${RUNNER_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Mode: ${persist ? "PERSIST + PUBLISH" : "READ ONLY"}`,
  );

  console.log(
    `Window: ${windowMinutes} minutes`,
  );

  const rows =
    await sql`
      SELECT
        prediction.id
          AS baseline_prediction_id,

        prediction.input_cutoff_at
          AS baseline_input_cutoff_at,

        prediction.output
          AS baseline_output,

        prediction.published_at
          AS baseline_published_at,

        model.version
          AS baseline_model_version,

        fixture.id
          AS fixture_id,

        fixture.provider_id,

        fixture.kickoff_at,

        competition.name
          AS competition_name,

        competition.country
          AS competition_country,

        home_team.id
          AS home_team_id,

        home_team.name
          AS home_team_name,

        away_team.id
          AS away_team_id,

        away_team.name
          AS away_team_name,

        home_api.source_team_id
          AS home_api_team_id,

        away_api.source_team_id
          AS away_api_team_id,

        latest_revision.id
          AS revision_id,

        latest_revision.revision_number,

        latest_revision.selection
          AS revision_selection,

        latest_revision.confidence
          AS revision_confidence,

        latest_revision.evidence_grade
          AS revision_evidence_grade,

        latest_revision.lineup_state
          AS revision_lineup_state,

        latest_revision.input_cutoff_at
          AS revision_input_cutoff_at,

        latest_revision.output
          AS revision_output

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
        AS home_team
        ON home_team.id =
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

      LEFT JOIN LATERAL (
        SELECT
          revision.*

        FROM public.forecast_revisions
          AS revision

        WHERE revision.baseline_prediction_id =
          prediction.id

          AND revision.published_at
            IS NOT NULL

        ORDER BY
          revision.revision_number
            DESC

        LIMIT 1
      )
        AS latest_revision
        ON true

      WHERE prediction.is_demo =
        false

        AND prediction.published_at
          IS NOT NULL

        AND model.version
          IN (
            ${UNIFIED_MODEL},
            ${GPT_MODEL}
          )

        AND fixture.status =
          'scheduled'

        AND fixture.kickoff_at >
          ${now}::timestamptz

        AND fixture.kickoff_at <=
          ${now}::timestamptz
          + (
            ${windowMinutes}
            || ' minutes'
          )::interval

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.id
    `;

  console.log(
    `Published fixtures in monitoring window: ${rows.length}`,
  );

  let scanned =
    0;

  let gptCalls =
    0;

  let material =
    0;

  let inserted =
    0;

  let published =
    0;

  let unchanged =
    0;

  let skipped =
    0;

  for (
    const rawRow
    of rows
  ) {
    if (
      limit !==
        null &&
      scanned >=
        limit
    ) {
      break;
    }

    const row =
      rawRow as
        JsonObject;

    scanned +=
      1;

    const fixtureId =
      String(
        row.fixture_id,
      );

    const baselinePredictionId =
      String(
        row.baseline_prediction_id,
      );

    const homeTeam =
      String(
        row.home_team_name,
      );

    const awayTeam =
      String(
        row.away_team_name,
      );

    const competition =
      String(
        row.competition_name,
      );

    const country =
      row.competition_country ===
        null
        ? null
        : String(
            row.competition_country,
          );

    const kickoffAt =
      timestamp(
        row.kickoff_at,
        "Kickoff",
      );

    const iterationNow =
      await databaseNow(
        sql,
      );

    const secondsToKickoff =
      (
        Date.parse(
          kickoffAt,
        ) -
        Date.parse(
          iterationNow,
        )
      ) /
      1000;

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${homeTeam} vs ${awayTeam}`,
    );

    console.log(
      `Baseline model: ${String(
        row.baseline_model_version,
      )}`,
    );

    console.log(
      `Kickoff: ${kickoffAt}`,
    );

    console.log(
      `Seconds to kickoff: ${Math.floor(
        secondsToKickoff,
      )}`,
    );

    if (
      secondsToKickoff <=
      MIN_SECONDS_BEFORE_KICKOFF
    ) {
      console.log(
        "SKIP: inside final two-minute safety lock.",
      );

      skipped +=
        1;

      continue;
    }

    const previous =
      activeForecastFromRow(
        row,
      );

    console.log(
      `ACTIVE: ${previous.selection.toUpperCase()} / ${previous.confidence} / ${previous.evidenceGrade}`,
    );

    console.log(
      `Active revision: ${previous.revisionNumber}`,
    );

    /*
     * A historical draft should not be silently
     * bypassed by creating another revision.
     */
    const draftRows =
      await sql`
        SELECT
          id,
          revision_number

        FROM public.forecast_revisions

        WHERE baseline_prediction_id =
          ${baselinePredictionId}::uuid

          AND published_at
            IS NULL

        ORDER BY
          revision_number DESC

        LIMIT 1
      `;

    if (
      persist &&
      draftRows.length >
        0
    ) {
      console.log(
        `SKIP: unpublished revision ${draftRows[0].revision_number} already exists.`,
      );

      skipped +=
        1;

      continue;
    }

    const facts =
      await storedContextFacts(
        sql,
        fixtureId,
        iterationNow,
        kickoffAt,
      );

    const providerFixtureId =
      positiveInteger(
        row.provider_id,
      );

    const homeApiId =
      positiveInteger(
        row.home_api_team_id,
      );

    const awayApiId =
      positiveInteger(
        row.away_api_team_id,
      );

    let confirmedLineups =
      false;

    let injuryCount =
      0;

    let lineupCount =
      0;

    if (
      providerFixtureId !==
        null &&
      homeApiId !==
        null &&
      awayApiId !==
        null
    ) {
      const providerResults =
        await Promise.allSettled([
          fetchFixtureInjuries(
            providerFixtureId,
          ),

          fetchFixtureLineups(
            providerFixtureId,
          ),
        ]);

      const observedAt =
        await databaseNow(
          sql,
        );

      if (
        Date.parse(
          observedAt,
        ) >=
        Date.parse(
          kickoffAt,
        )
      ) {
        console.log(
          "SKIP: provider collection crossed kickoff.",
        );

        skipped +=
          1;

        continue;
      }

      if (
        providerResults[0].status ===
        "fulfilled"
      ) {
        injuryCount =
          providerResults[0]
            .value
            .length;

        facts.push(
          ...injuryFacts(
            providerResults[0]
              .value,
            homeApiId,
            awayApiId,
            observedAt,
          ),
        );
      }

      if (
        providerResults[1].status ===
        "fulfilled"
      ) {
        lineupCount =
          providerResults[1]
            .value
            .length;

        const lineupResult =
          lineupFacts(
            providerResults[1]
              .value,
            homeApiId,
            awayApiId,
            observedAt,
          );

        confirmedLineups =
          lineupResult.confirmed;

        facts.push(
          ...lineupResult.facts,
        );
      }
    }

    const finalFacts =
      dedupeFacts(
        facts,
      );

    const researchStartedAt =
      await databaseNow(
        sql,
      );

    const minutesToKickoff =
      (
        Date.parse(
          kickoffAt,
        ) -
        Date.parse(
          researchStartedAt,
        )
      ) /
      60_000;

    if (
      minutesToKickoff <=
      MIN_SECONDS_BEFORE_KICKOFF /
        60
    ) {
      skipped +=
        1;

      continue;
    }

    const purpose =
      determinePurpose(
        confirmedLineups,
        minutesToKickoff,
      );

    console.log(
      `Purpose: ${purpose}`,
    );

    console.log(
      `Structured facts: ${finalFacts.length}`,
    );

    console.log(
      `API injuries: ${injuryCount}`,
    );

    console.log(
      `API lineup records: ${lineupCount}`,
    );

    console.log(
      `Confirmed both XI: ${confirmedLineups ? "YES" : "NO"}`,
    );

    console.log(
      "GPT research: START",
    );

    const research =
      await generateOpenAiResearchPredictionV01({
        purpose,

        fixture: {
          fixtureId,

          homeTeam,

          awayTeam,

          competition,

          country,

          kickoffAt,
        },

        evidence: {
          cutoffAt:
            researchStartedAt,

          structuredFacts:
            finalFacts,
        },
      });

    gptCalls +=
      1;

    const researchCompletedAt =
      await databaseNow(
        sql,
      );

    if (
      Date.parse(
        researchCompletedAt,
      ) >=
      Date.parse(
        kickoffAt,
      )
    ) {
      console.log(
        "DISCARD: GPT response completed at or after kickoff.",
      );

      skipped +=
        1;

      continue;
    }

    const policy =
      applyResearchSourcePolicyV01(
        research.prediction,
        research.webSources,
        finalFacts.length,
      );

    const next =
      policy.prediction;

    console.log(
      `GPT RAW: ${research.prediction.selection.toUpperCase()} / ${research.prediction.confidence} / ${research.prediction.evidenceGrade}`,
    );

    console.log(
      `POLICY: ${next.selection.toUpperCase()} / ${next.confidence} / ${next.evidenceGrade}`,
    );

    console.log(
      `Web sources: ${research.webSources.length}`,
    );

    console.log(
      `Tipster sources: ${policy.counts.predictionTipster}`,
    );

    if (
      policy.downgraded
    ) {
      console.log(
        "Source policy downgraded confidence/evidence strength.",
      );
    }

    const changes =
      materialChanges(
        previous,
        {
          selection:
            next.selection,

          confidence:
            next.confidence,

          evidenceGrade:
            next.evidenceGrade,

          goalsView:
            next.goalsView,

          bttsView:
            next.bttsView,
        },
        confirmedLineups,
      );

    if (
      changes.length ===
      0
    ) {
      unchanged +=
        1;

      console.log(
        "NO REVISION: active forecast remains materially unchanged.",
      );

      continue;
    }

    material +=
      1;

    console.log(
      "MATERIAL CHANGE:",
    );

    for (
      const change
      of changes
    ) {
      console.log(
        `- ${change}`,
      );
    }

    if (
      !persist
    ) {
      console.log(
        "READ ONLY: revision not persisted.",
      );

      continue;
    }

    const maxRows =
      await sql`
        SELECT
          COALESCE(
            MAX(
              revision_number
            ),
            0
          ) AS maximum_revision

        FROM public.forecast_revisions

        WHERE baseline_prediction_id =
          ${baselinePredictionId}::uuid
      `;

    const nextRevisionNumber =
      Number(
        maxRows[0]
          .maximum_revision,
      ) +
      1;

    const lineupState:
      ForecastLineupStateV01 =
        confirmedLineups
          ? "confirmed"
          : "unconfirmed";

    const reason =
      confirmedLineups
        ? "confirmed_lineup"
        : purpose ===
            "final_prematch"
          ? "final_prematch"
          : "developing_news";

    const inputSnapshot = {
      revisionVersion:
        FORECAST_REVISION_VERSION_V01,

      runnerVersion:
        RUNNER_VERSION,

      baselinePredictionId,

      fixture: {
        fixtureId,

        homeTeam,

        awayTeam,

        competition,

        country,

        kickoffAt,
      },

      previousActiveForecast:
        previous,

      purpose,

      lineupState,

      structuredEvidence: {
        facts:
          finalFacts,

        count:
          finalFacts.length,
      },

      apiFootball: {
        fixtureId:
          providerFixtureId,

        injuryRecords:
          injuryCount,

        lineupRecords:
          lineupCount,

        bothStartingXisConfirmed:
          confirmedLineups,
      },

      webResearch: {
        provider:
          research.provider,

        model:
          research.model,

        responseId:
          research.responseId,

        startedAt:
          researchStartedAt,

        completedAt:
          researchCompletedAt,

        sources:
          policy.sources,
      },

      sourcePolicy: {
        version:
          policy.version,

        counts:
          policy.counts,

        confidenceCap:
          policy.confidenceCap,

        evidenceGradeCap:
          policy.evidenceGradeCap,

        downgraded:
          policy.downgraded,

        notes:
          policy.notes,
      },

      rawGptPrediction:
        research.prediction,

      effectivePrediction:
        next,

      materialChanges:
        changes,
    };

    const output = {
      engine:
        "gpt_research",

      engineVersion:
        GPT_RESEARCH_PREDICTION_VERSION_V01,

      revisionVersion:
        FORECAST_REVISION_VERSION_V01,

      forecast:
        next.selection,

      confidence:
        next.confidence,

      evidenceGrade:
        next.evidenceGrade,

      goalsView:
        next.goalsView,

      bttsView:
        next.bttsView,

      lineupState,

      materialFactors:
        next.materialFactors,

      reasoningSummary:
        next.reasoningSummary,

      contradictions:
        next.contradictions,

      missingInformation:
        next.missingInformation,

      sourcePolicy:
        {
          version:
            policy.version,

          counts:
            policy.counts,

          downgraded:
            policy.downgraded,
        },

      probability:
        null,

      calibratedProbability:
        null,

      modelOverride:
        false,
    };

    const inputSha =
      canonicalSha256(
        inputSnapshot,
      );

    const outputSha =
      canonicalSha256(
        output,
      );

    const insertedRows =
      await sql`
        INSERT INTO public.forecast_revisions (
          baseline_prediction_id,
          fixture_id,
          is_demo,
          revision_number,
          revision_version,
          reason,
          engine,
          engine_version,
          lineup_state,
          kickoff_at,
          input_cutoff_at,
          generated_at,
          published_at,
          selection,
          confidence,
          evidence_grade,
          material_changes,
          input_sha256,
          output_sha256,
          input_snapshot,
          output
        )
        VALUES (
          ${baselinePredictionId}::uuid,
          ${fixtureId}::uuid,
          false,
          ${nextRevisionNumber},
          ${FORECAST_REVISION_VERSION_V01},
          ${reason},
          'gpt_research',
          ${GPT_RESEARCH_PREDICTION_VERSION_V01},
          ${lineupState},
          ${kickoffAt}::timestamptz,
          ${researchCompletedAt}::timestamptz,

          /*
           * DB trigger replaces this with
           * clock_timestamp().
           */
          ${researchCompletedAt}::timestamptz,

          NULL,
          ${next.selection},
          ${next.confidence},
          ${next.evidenceGrade},

          ${JSON.stringify(
            changes,
          )}::jsonb,

          ${inputSha},
          ${outputSha},

          ${JSON.stringify(
            inputSnapshot,
          )}::jsonb,

          ${JSON.stringify(
            output,
          )}::jsonb
        )

        RETURNING
          id,
          revision_number,
          generated_at
      `;

    assert.equal(
      insertedRows.length,
      1,
      "Forecast revision insert failed.",
    );

    inserted +=
      1;

    const revisionId =
      String(
        insertedRows[0].id,
      );

    console.log(
      `REVISION INSERTED: ${revisionId}`,
    );

    /*
     * Monitor persistence means immediately
     * publishing the validated revision.
     *
     * The DB trigger replaces caller time with
     * its own authoritative clock.
     */
    const publication =
      await sql`
        UPDATE public.forecast_revisions

        SET published_at =
          clock_timestamp()

        WHERE id =
          ${revisionId}::uuid

          AND published_at
            IS NULL

        RETURNING
          published_at
      `;

    assert.equal(
      publication.length,
      1,
      "Forecast revision publication failed.",
    );

    published +=
      1;

    console.log(
      `REVISION PUBLISHED: ${timestamp(
        publication[0]
          .published_at,
        "Revision publication",
      )}`,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "PRE-MATCH MONITOR SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Fixtures scanned: ${scanned}`,
  );

  console.log(
    `GPT research calls: ${gptCalls}`,
  );

  console.log(
    `Material changes: ${material}`,
  );

  console.log(
    `Unchanged: ${unchanged}`,
  );

  console.log(
    `Revisions inserted: ${inserted}`,
  );

  console.log(
    `Revisions published: ${published}`,
  );

  console.log(
    `Skipped: ${skipped}`,
  );

  if (
    !persist
  ) {
    console.log(
      "READ ONLY COMPLETE: no revisions were written.",
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
        ? `Pre-match monitor failed: ${error.message}`
        : "Pre-match monitor failed.",
    );

    process.exitCode =
      1;
  },
);
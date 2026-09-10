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
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

import {
  generateOpenAiAnalysisV02,
} from "../src/lib/ai/openai-analysis-v0.2";

import type {
  LlmAnalysisInputV02,
  LlmEvidenceFactV02,
} from "../src/lib/ai/llm-analysis-v0.2";

import {
  fetchFixtureInjuries,
  fetchFixtureLineups,
} from "../src/providers/api-football/client";

const API_SOURCE =
  "api-football";

const RUNNER_VERSION =
  "dictaziq-real-llm-analysis-runner-v0.2";

const MATH_MODEL_VERSION =
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01;

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
    process.argv[2]?.trim() ??
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

  const parsed =
    new Date(
      `${value}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(
        0,
        10,
      ) !==
      value
  ) {
    throw new Error(
      "Invalid analysis date.",
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

function recordOrNull(
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

function nonEmptyString(
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
  const result =
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
      result.getTime(),
    ),
    `${label} is invalid.`,
  );

  return result;
}

function positiveInteger(
  value:
    unknown,
  label:
    string,
): number {
  const result =
    Number(
      value,
    );

  assert.ok(
    Number.isInteger(
      result,
    ) &&
      result >
        0,
    `${label} must be a positive integer.`,
  );

  return result;
}

function finiteNumber(
  value:
    unknown,
):
  number |
  null {
  const result =
    Number(
      value,
    );

  return Number.isFinite(
    result,
  )
    ? result
    : null;
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
    "Database clock could not be read.",
  );

  return timestamp(
    rows[0].now,
    "Database clock",
  ).toISOString();
}

function validSide(
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

  throw new Error(
    `Unsupported context side: ${String(
      value,
    )}.`,
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
  LlmEvidenceFactV02 |
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

  const goalsFor =
    finiteNumber(
      recent.goalsFor,
    ) ??
    0;

  const goalsAgainst =
    finiteNumber(
      recent.goalsAgainst,
    ) ??
    0;

  const bttsMatches =
    finiteNumber(
      recent.bttsMatches,
    ) ??
    0;

  const over25Matches =
    finiteNumber(
      recent.over25Matches,
    ) ??
    0;

  const scoredMatches =
    finiteNumber(
      recent.scoredMatches,
    ) ??
    0;

  const concededMatches =
    finiteNumber(
      recent.concededMatches,
    ) ??
    0;

  return {
    kind:
      "recent_scoring_statistics",

    side,

    source,

    observedAt,

    description: [
      `${teamName} recent verified sample:`,
      `${matches} matches;`,
      `${goalsFor} goals scored;`,
      `${goalsAgainst} goals conceded;`,
      `scored in ${scoredMatches};`,
      `conceded in ${concededMatches};`,
      `BTTS occurred in ${bttsMatches};`,
      `over 2.5 goals occurred in ${over25Matches}.`,
    ].join(
      " ",
    ),
  };
}

function marketEvidenceFacts(
  inputSnapshot:
    JsonObject,
  fallbackObservedAt:
    string,
): LlmEvidenceFactV02[] {
  const market =
    recordOrNull(
      inputSnapshot.marketEvidence,
    );

  if (
    !market ||
    market.available !==
      true
  ) {
    return [];
  }

  const evidence =
    recordOrNull(
      market.evidence,
    );

  if (
    !evidence
  ) {
    return [];
  }

  const home =
    recordOrNull(
      evidence.home,
    );

  const away =
    recordOrNull(
      evidence.away,
    );

  const homeRecent =
    recordOrNull(
      home?.recent,
    );

  const awayRecent =
    recordOrNull(
      away?.recent,
    );

  const fixture =
    recordOrNull(
      inputSnapshot.fixture,
    );

  const fixtureHome =
    recordOrNull(
      fixture?.home,
    );

  const fixtureAway =
    recordOrNull(
      fixture?.away,
    );

  const homeName =
    typeof fixtureHome
      ?.name ===
      "string"
      ? fixtureHome.name
      : "Home team";

  const awayName =
    typeof fixtureAway
      ?.name ===
      "string"
      ? fixtureAway.name
      : "Away team";

  const source =
    typeof market.source ===
      "string" &&
    market.source.trim()
      ? market.source.trim()
      : "immutable-market-evidence";

  const capturedAt =
    typeof market.capturedAt ===
      "string"
      ? timestamp(
          market.capturedAt,
          "Market evidence capturedAt",
        ).toISOString()
      : fallbackObservedAt;

  const facts:
    LlmEvidenceFactV02[] = [];

  if (
    homeRecent
  ) {
    const fact =
      scoringFact(
        "home",
        homeName,
        homeRecent,
        source,
        capturedAt,
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
        awayName,
        awayRecent,
        source,
        capturedAt,
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
  homeName:
    string,
  awayName:
    string,
  observedAt:
    string,
): LlmEvidenceFactV02[] {
  const grouped =
    new Map<
      number,
      typeof injuries
    >();

  for (
    const injury
    of injuries
  ) {
    assert.ok(
      injury.team.id ===
        homeApiTeamId ||
      injury.team.id ===
        awayApiTeamId,
      `Unexpected API-Football injury team ${injury.team.id}.`,
    );

    const current =
      grouped.get(
        injury.team.id,
      ) ??
      [];

    current.push(
      injury,
    );

    grouped.set(
      injury.team.id,
      current,
    );
  }

  const facts:
    LlmEvidenceFactV02[] = [];

  for (
    const [
      teamId,
      teamInjuries,
    ]
    of grouped
  ) {
    const isHome =
      teamId ===
      homeApiTeamId;

    const side =
      isHome
        ? "home"
        : "away";

    const teamName =
      isHome
        ? homeName
        : awayName;

    /*
     * Deduplicate players again defensively.
     */
    const unique =
      new Map<
        string,
        typeof teamInjuries[number]
      >();

    for (
      const item
      of teamInjuries
    ) {
      const key =
        item.player.id !==
        null
          ? `id:${item.player.id}`
          : `name:${item.player.name.toLowerCase()}`;

      if (
        !unique.has(
          key,
        )
      ) {
        unique.set(
          key,
          item,
        );
      }
    }

    const values =
      [...unique.values()];

    const displayed =
      values
        .slice(
          0,
          15,
        )
        .map(
          (
            item,
          ) => {
            const detail =
              [
                item.type,
                item.reason,
              ]
                .filter(
                  (
                    value,
                  ) =>
                    typeof value ===
                      "string" &&
                    value.trim().length >
                      0,
                )
                .join(
                  ": ",
                );

            return detail
              ? `${item.player.name} (${detail})`
              : item.player.name;
          },
        );

    const remaining =
      values.length -
      displayed.length;

    const suffix =
      remaining >
        0
        ? `; plus ${remaining} additional reported absences`
        : "";

    facts.push({
      kind:
        "squad_availability",

      side,

      source:
        API_SOURCE,

      observedAt,

      /*
       * Raw availability evidence.
       *
       * The description deliberately makes no
       * winner inference from absence count.
       */
      description:
        `${teamName}: API-Football reports ${values.length} unavailable player(s): ${displayed.join(
          ", ",
        )}${suffix}. No directional impact is assumed from count alone.`,
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
  homeName:
    string,
  awayName:
    string,
  observedAt:
    string,
): LlmEvidenceFactV02[] {
  const facts:
    LlmEvidenceFactV02[] = [];

  for (
    const lineup
    of lineups
  ) {
    assert.ok(
      lineup.team.id ===
        homeApiTeamId ||
      lineup.team.id ===
        awayApiTeamId,
      `Unexpected API-Football lineup team ${lineup.team.id}.`,
    );

    const isHome =
      lineup.team.id ===
      homeApiTeamId;

    const side =
      isHome
        ? "home"
        : "away";

    const canonicalName =
      isHome
        ? homeName
        : awayName;

    if (
      lineup.startXI.length ===
      0
    ) {
      continue;
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
        "provider_starting_lineup",

      side,

      source:
        API_SOURCE,

      observedAt,

      description: [
        `API-Football returned the starting lineup for ${canonicalName}.`,
        `Formation: ${lineup.formation ?? "not supplied"}.`,
        `Starting XI: ${starters}.`,
      ].join(
        " ",
      ),
    });
  }

  return facts;
}

function mathematicalForecast(
  output:
    JsonObject,
):
  "home" |
  "draw" |
  "away" {
  const value =
    output.forecast;

  if (
    value !==
      "home" &&
    value !==
      "draw" &&
    value !==
      "away"
  ) {
    throw new Error(
      `Unexpected Unified mathematical forecast: ${String(
        value,
      )}.`,
    );
  }

  return value;
}

function comparison(
  math:
    "home" |
    "draw" |
    "away",
  gpt:
    "home" |
    "draw" |
    "away" |
    "no_pick",
):
  "AGREEMENT" |
  "CONFLICT" |
  "GPT_ABSTENTION" {
  if (
    gpt ===
    "no_pick"
  ) {
    return "GPT_ABSTENTION";
  }

  return gpt ===
    math
    ? "AGREEMENT"
    : "CONFLICT";
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
    "DictazIQ Live GPT Analysis",
  );

  console.log(
    `Runner: ${RUNNER_VERSION}`,
  );

  console.log(
    `LLM mode: READ ONLY`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Math model: ${MATH_MODEL_VERSION}`,
  );

  /*
   * Select only official published Unified
   * forecasts.
   *
   * GPT does NOT receive prediction.output.
   */
  const predictions =
    await sql`
      SELECT DISTINCT ON (
        prediction.fixture_id
      )
        prediction.id,
        prediction.fixture_id,
        prediction.input_sha256,
        prediction.input_snapshot,
        prediction.output,
        prediction.input_cutoff_at,
        prediction.generated_at,
        prediction.published_at,
        prediction.kickoff_at_generation,

        fixture.provider_id,

        competition.name
          AS competition_name,

        home.name
          AS home_team_name,

        away_team.name
          AS away_team_name,

        home_api.source_team_id
          AS home_api_team_id,

        away_api.source_team_id
          AS away_api_team_id

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
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      JOIN public.team_source_mappings
        AS home_api
        ON home_api.team_id =
          home.id

        AND home_api.source =
          ${API_SOURCE}

        AND home_api.is_verified =
          true

      JOIN public.team_source_mappings
        AS away_api
        ON away_api.team_id =
          away_team.id

        AND away_api.source =
          ${API_SOURCE}

        AND away_api.is_verified =
          true

      WHERE model.version =
        ${MATH_MODEL_VERSION}

        AND prediction.is_demo =
          false

        AND prediction.published_at
          IS NOT NULL

        AND (
          prediction.kickoff_at_generation
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        prediction.fixture_id,
        prediction.published_at DESC
    `;

  if (
    predictions.length ===
    0
  ) {
    console.log(
      "No published Unified forecasts found.",
    );

    return;
  }

  console.log(
    `Published fixtures: ${predictions.length}`,
  );

  let analysed =
    0;

  let agreements =
    0;

  let conflicts =
    0;

  let abstentions =
    0;

  let skipped =
    0;

  for (
    const prediction
    of predictions
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    const homeTeam =
      nonEmptyString(
        prediction.home_team_name,
        "Home team",
      );

    const awayTeam =
      nonEmptyString(
        prediction.away_team_name,
        "Away team",
      );

    const competition =
      nonEmptyString(
        prediction.competition_name,
        "Competition",
      );

    const kickoffAt =
      timestamp(
        prediction.kickoff_at_generation,
        "Frozen kickoff",
      );

    console.log(
      `${homeTeam} vs ${awayTeam}`,
    );

    console.log(
      `Competition: ${competition}`,
    );

    console.log(
      `Kickoff: ${kickoffAt.toISOString()}`,
    );

    /*
     * Verify frozen mathematical input before
     * using any fixture identity from it.
     */
    const inputSnapshot =
      recordOrNull(
        prediction.input_snapshot,
      );

    assert.ok(
      inputSnapshot,
      "Unified input snapshot must be an object.",
    );

    const calculatedInputSha =
      canonicalSha256(
        inputSnapshot,
      );

    assert.equal(
      calculatedInputSha,
      String(
        prediction.input_sha256,
      ),
      "Frozen Unified input SHA verification failed.",
    );

    const output =
      recordOrNull(
        prediction.output,
      );

    assert.ok(
      output,
      "Unified mathematical output must be an object.",
    );

    /*
     * Math output is retained locally ONLY for
     * comparison after GPT returns.
     *
     * It is never inserted into the GPT prompt.
     */
    const mathForecast =
      mathematicalForecast(
        output,
      );

    const beforeFetch =
      timestamp(
        await databaseNow(
          sql,
        ),
        "Pre-fetch database time",
      );

    if (
      beforeFetch.getTime() >=
      kickoffAt.getTime()
    ) {
      console.log(
        "SKIP: kickoff has already been reached.",
      );

      skipped +=
        1;

      continue;
    }

    const providerFixtureId =
      positiveInteger(
        prediction.provider_id,
        "API-Football fixture ID",
      );

    const homeApiTeamId =
      positiveInteger(
        prediction.home_api_team_id,
        "Home API-Football team ID",
      );

    const awayApiTeamId =
      positiveInteger(
        prediction.away_api_team_id,
        "Away API-Football team ID",
      );

    console.log(
      `API fixture: ${providerFixtureId}`,
    );

    /*
     * Fetch independent live football context.
     *
     * Failures from one endpoint do not erase
     * evidence from the other endpoint.
     */
    const [
      injuryResult,
      lineupResult,
    ] =
      await Promise.allSettled([
        fetchFixtureInjuries(
          providerFixtureId,
        ),

        fetchFixtureLineups(
          providerFixtureId,
        ),
      ]);

    const observedAt =
      timestamp(
        await databaseNow(
          sql,
        ),
        "GPT evidence observation time",
      );

    /*
     * Critical anti-leakage boundary:
     *
     * If the provider calls completed after
     * kickoff, discard everything and do not
     * invoke GPT.
     */
    if (
      observedAt.getTime() >=
      kickoffAt.getTime()
    ) {
      console.log(
        "SKIP: provider evidence collection crossed kickoff.",
      );

      skipped +=
        1;

      continue;
    }

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

    if (
      injuryResult.status ===
      "fulfilled"
    ) {
      injuries =
        injuryResult.value;

      console.log(
        `API injuries: ${injuries.length}`,
      );
    } else {
      console.log(
        `API injuries unavailable: ${injuryResult.reason instanceof Error ? injuryResult.reason.message : String(
          injuryResult.reason,
        )}`,
      );
    }

    if (
      lineupResult.status ===
      "fulfilled"
    ) {
      lineups =
        lineupResult.value;

      console.log(
        `API lineup teams: ${lineups.length}`,
      );
    } else {
      console.log(
        `API lineups unavailable: ${lineupResult.reason instanceof Error ? lineupResult.reason.message : String(
          lineupResult.reason,
        )}`,
      );
    }

    const facts:
      LlmEvidenceFactV02[] = [];

    /*
     * Use immutable scoring statistics frozen
     * inside the original mathematical input,
     * but deliberately exclude:
     *
     * - ratings
     * - rating gap
     * - math forecast
     * - confidence
     * - match profile
     */
    facts.push(
      ...marketEvidenceFacts(
        inputSnapshot,
        String(
          prediction.input_cutoff_at,
        ),
      ),
    );

    /*
     * Include previously captured immutable
     * context evidence that existed before this
     * GPT observation cutoff.
     */
    const storedContext =
      await sql`
        SELECT
          kind,
          side,
          description,
          source,
          observed_at

        FROM public.context_evidence_snapshots

        WHERE fixture_id =
          ${String(
            prediction.fixture_id,
          )}::uuid

          AND is_demo =
            false

          AND observed_at <=
            ${observedAt.toISOString()}::timestamptz

          AND observed_at <
            ${kickoffAt.toISOString()}::timestamptz

        ORDER BY
          observed_at ASC,
          id ASC

        LIMIT 20
      `;

    for (
      const row
      of storedContext
    ) {
      facts.push({
        kind:
          nonEmptyString(
            row.kind,
            "Context kind",
          ),

        side:
          validSide(
            row.side,
          ),

        description:
          nonEmptyString(
            row.description,
            "Context description",
          ),

        source:
          nonEmptyString(
            row.source,
            "Context source",
          ),

        observedAt:
          timestamp(
            row.observed_at,
            "Context observedAt",
          ).toISOString(),
      });
    }

    /*
     * Fresh API-Football evidence collected in
     * this execution.
     *
     * Injuries remain factual/aggregated rather
     * than independent winner votes.
     */
    facts.push(
      ...injuryFacts(
        injuries,
        homeApiTeamId,
        awayApiTeamId,
        homeTeam,
        awayTeam,
        observedAt.toISOString(),
      ),
    );

    facts.push(
      ...lineupFacts(
        lineups,
        homeApiTeamId,
        awayApiTeamId,
        homeTeam,
        awayTeam,
        observedAt.toISOString(),
      ),
    );

    /*
     * Deduplicate facts that may be present in
     * both stored context and today's live API
     * response.
     */
    const uniqueFacts =
      new Map<
        string,
        LlmEvidenceFactV02
      >();

    for (
      const fact
      of facts
    ) {
      const identity =
        [
          fact.kind,
          fact.side,
          fact.source,
          fact.description,
        ].join(
          "|",
        );

      if (
        !uniqueFacts.has(
          identity,
        )
      ) {
        uniqueFacts.set(
          identity,
          fact,
        );
      }
    }

    const finalFacts =
      [...uniqueFacts.values()]
        .slice(
          0,
          40,
        );

    console.log(
      `GPT evidence facts: ${finalFacts.length}`,
    );

    const llmInput:
      LlmAnalysisInputV02 = {
        fixture: {
          fixtureId:
            String(
              prediction.fixture_id,
            ),

          homeTeam,

          awayTeam,

          competition,

          kickoffAt:
            kickoffAt.toISOString(),
        },

        evidence: {
          cutoffAt:
            observedAt.toISOString(),

          facts:
            finalFacts,
        },
      };

    console.log(
      `GPT evidence cutoff: ${observedAt.toISOString()}`,
    );

    console.log(
      "Calling OpenAI...",
    );

    /*
     * IMPORTANT:
     *
     * llmInput does not contain mathForecast.
     *
     * GPT must finish its independent assessment
     * before we perform comparison.
     */
    const gpt =
      await generateOpenAiAnalysisV02(
        llmInput,
      );

    const relation =
      comparison(
        mathForecast,
        gpt.analysis.assessment,
      );

    analysed +=
      1;

    switch (
      relation
    ) {
      case "AGREEMENT":
        agreements +=
          1;
        break;

      case "CONFLICT":
        conflicts +=
          1;
        break;

      case "GPT_ABSTENTION":
        abstentions +=
          1;
        break;
    }

    console.log("");
    console.log(
      `MATH: ${mathForecast.toUpperCase()}`,
    );

    console.log(
      `GPT: ${gpt.analysis.assessment.toUpperCase()}`,
    );

    console.log(
      `GPT confidence: ${gpt.analysis.confidence}`,
    );

    console.log(
      `GPT result strength: ${gpt.analysis.resultSignalStrength}`,
    );

    console.log(
      `GPT goals: ${gpt.analysis.goalsView}`,
    );

    console.log(
      `GPT BTTS: ${gpt.analysis.bttsView}`,
    );

    console.log(
      `GPT evidence quality: ${gpt.analysis.evidenceQuality}`,
    );

    console.log(
      `RELATION: ${relation}`,
    );

    console.log("");
    console.log(
      "GPT reasoning summary:",
    );

    for (
      const reason
      of gpt.analysis.reasoningSummary
    ) {
      console.log(
        `- ${reason}`,
      );
    }

    if (
      gpt.analysis.contradictions.length >
      0
    ) {
      console.log("");
      console.log(
        "Contradictions:",
      );

      for (
        const contradiction
        of gpt.analysis.contradictions
      ) {
        console.log(
          `- ${contradiction}`,
        );
      }
    }

    if (
      gpt.analysis.missingInformation.length >
      0
    ) {
      console.log("");
      console.log(
        "Missing information:",
      );

      for (
        const missing
        of gpt.analysis.missingInformation
      ) {
        console.log(
          `- ${missing}`,
        );
      }
    }

    console.log("");
    console.log(
      `OpenAI model: ${gpt.model}`,
    );

    console.log(
      `Response ID: ${gpt.responseId}`,
    );

    console.log(
      [
        "Tokens:",
        `input=${gpt.usage.inputTokens ?? "N/A"}`,
        `output=${gpt.usage.outputTokens ?? "N/A"}`,
        `total=${gpt.usage.totalTokens ?? "N/A"}`,
      ].join(
        " ",
      ),
    );

    console.log(
      "Database writes: NONE",
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "LIVE GPT ANALYSIS SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Fixtures analysed by GPT: ${analysed}`,
  );

  console.log(
    `Math/GPT agreements: ${agreements}`,
  );

  console.log(
    `Math/GPT conflicts: ${conflicts}`,
  );

  console.log(
    `GPT abstentions: ${abstentions}`,
  );

  console.log(
    `Skipped: ${skipped}`,
  );

  console.log("");
  console.log(
    "READ ONLY COMPLETE: no LLM analysis was persisted and no mathematical prediction was modified.",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Live GPT analysis failed: ${error.message}`
        : "Live GPT analysis failed.",
    );

    process.exitCode =
      1;
  },
);
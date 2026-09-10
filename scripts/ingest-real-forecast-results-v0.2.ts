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
  fetchFixturesByDate,
} from "../src/providers/api-football/client";

const INGESTION_VERSION =
  "dictaziq-production-forecast-result-ingestion-v0.2";

const API_SOURCE =
  "api-football";

const FINAL_STATUSES =
  new Set<string>([
    "FT",
    "AET",
    "PEN",
  ]);

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

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

function persistenceRequested():
  boolean {
  return process.argv.includes(
    "--persist",
  );
}

function validScore(
  value:
    number |
    null,
): value is number {
  return (
    value !== null &&
    Number.isInteger(value) &&
    value >= 0
  );
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
          String(value),
        );

  assert.ok(
    Number.isFinite(
      result.getTime(),
    ),
    `${label} is invalid.`,
  );

  return result;
}

async function main() {
  const date =
    requestedDate();

  const persist =
    persistenceRequested();

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Authoritative Production Result Ingestion",
  );

  console.log(
    `Version: ${INGESTION_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Mode: ${persist ? "PERSIST" : "DRY RUN"}`,
  );

  /*
   * production_forecast_baselines_v01 is now
   * the only authority for determining which
   * fixtures belong to production evaluation.
   *
   * Exactly one route exists per fixture:
   *
   * mathematical
   * OR
   * gpt_research
   */
  const fixtures =
    await sql`
      SELECT
        route.baseline_prediction_id,

        route.fixture_id,

        route.route,

        route.route_reason,

        route.model_version,

        route.published_at
          AS baseline_published_at,

        fixture.slug,

        fixture.provider,

        fixture.provider_id,

        fixture.kickoff_at,

        fixture.home_team_id,

        fixture.away_team_id,

        home.name
          AS home_team_name,

        away.name
          AS away_team_name

      FROM public.production_forecast_baselines_v01
        AS route

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          route.fixture_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away
        ON away.id =
          fixture.away_team_id

      WHERE fixture.provider =
        ${API_SOURCE}

        AND fixture.is_demo =
          false

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
    `Authoritative forecast fixtures: ${fixtures.length}`,
  );

  if (
    fixtures.length ===
    0
  ) {
    console.log(
      "No authoritative forecast fixtures require result ingestion.",
    );

    return;
  }

  console.log(
    `Fetching API-Football fixtures for ${date}...`,
  );

  const page =
    await fetchFixturesByDate(
      date,
    );

  console.log(
    `API-Football fixtures returned: ${page.fixtures.length}`,
  );

  const apiById =
    new Map(
      page.fixtures.map(
        (fixture) => [
          String(
            fixture.fixtureId,
          ),

          fixture,
        ],
      ),
    );

  let mathematical =
    0;

  let gptResearch =
    0;

  let ready =
    0;

  let inserted =
    0;

  let existing =
    0;

  let pending =
    0;

  let missing =
    0;

  let identitySkipped =
    0;

  for (
    const fixture
    of fixtures
  ) {
    const route =
      String(
        fixture.route,
      );

    if (
      route ===
      "mathematical"
    ) {
      mathematical += 1;
    } else if (
      route ===
      "gpt_research"
    ) {
      gptResearch += 1;
    } else {
      throw new Error(
        `Unexpected production route: ${route}.`,
      );
    }

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home_team_name} vs ${fixture.away_team_name}`,
    );

    console.log(
      `Route: ${route.toUpperCase()}`,
    );

    console.log(
      `Model: ${fixture.model_version}`,
    );

    console.log(
      `Provider fixture: ${fixture.provider_id}`,
    );

    const apiFixture =
      apiById.get(
        String(
          fixture.provider_id,
        ),
      );

    if (
      !apiFixture
    ) {
      console.log(
        "Status: API FIXTURE NOT RETURNED",
      );

      missing += 1;

      continue;
    }

    const apiHomeId =
      String(
        apiFixture.home.id,
      );

    const apiAwayId =
      String(
        apiFixture.away.id,
      );

    if (
      apiHomeId ===
      apiAwayId
    ) {
      console.log(
        "Status: INVALID PROVIDER TEAM IDENTITY",
      );

      identitySkipped += 1;

      continue;
    }

    /*
     * Result settlement must never trust names.
     *
     * Both API-Football identities must map to
     * the exact canonical fixture teams.
     */
    const mappingRows =
      await sql`
        SELECT
          mapping.team_id,

          mapping.source_team_id,

          mapping.source_name,

          mapping.match_method,

          mapping.is_verified,

          team.name
            AS canonical_name,

          team.is_demo

        FROM public.team_source_mappings
          AS mapping

        JOIN public.teams
          AS team
          ON team.id =
            mapping.team_id

        WHERE mapping.source =
          ${API_SOURCE}

          AND mapping.source_team_id
            IN (
              ${apiHomeId},
              ${apiAwayId}
            )

        ORDER BY
          mapping.source_team_id
      `;

    const homeMapping =
      mappingRows.find(
        (row) =>
          String(
            row.source_team_id,
          ) ===
          apiHomeId,
      );

    const awayMapping =
      mappingRows.find(
        (row) =>
          String(
            row.source_team_id,
          ) ===
          apiAwayId,
      );

    const identityValid =
      mappingRows.length ===
        2 &&
      homeMapping !==
        undefined &&
      awayMapping !==
        undefined &&
      homeMapping.is_verified ===
        true &&
      awayMapping.is_verified ===
        true &&
      homeMapping.is_demo ===
        false &&
      awayMapping.is_demo ===
        false &&
      String(
        homeMapping.team_id,
      ) ===
        String(
          fixture.home_team_id,
        ) &&
      String(
        awayMapping.team_id,
      ) ===
        String(
          fixture.away_team_id,
        );

    if (
      !identityValid
    ) {
      console.log(
        "Status: RESULT SKIPPED — CANONICAL TEAM IDENTITY NOT VERIFIED",
      );

      console.log(
        `API home: ${apiHomeId} ${apiFixture.home.name}`,
      );

      console.log(
        `API away: ${apiAwayId} ${apiFixture.away.name}`,
      );

      identitySkipped += 1;

      continue;
    }

    assert.ok(
      homeMapping,
    );

    assert.ok(
      awayMapping,
    );

    console.log(
      [
        "Identity: VERIFIED",
        `home=${apiHomeId}->${homeMapping.canonical_name}`,
        `away=${apiAwayId}->${awayMapping.canonical_name}`,
      ].join(
        " | ",
      ),
    );

    const frozenKickoff =
      timestamp(
        fixture.kickoff_at,
        "Canonical kickoff",
      );

    const providerKickoff =
      timestamp(
        apiFixture.kickoffAt,
        "API-Football kickoff",
      );

    const kickoffChanged =
      frozenKickoff.getTime() !==
      providerKickoff.getTime();

    if (
      kickoffChanged
    ) {
      console.log(
        [
          "NOTICE: provider kickoff differs from stored fixture kickoff.",
          `stored=${frozenKickoff.toISOString()}`,
          `provider=${providerKickoff.toISOString()}`,
        ].join(
          " ",
        ),
      );
    }

    console.log(
      `API status: ${apiFixture.status.short} | ${apiFixture.status.long}`,
    );

    if (
      !FINAL_STATUSES.has(
        apiFixture.status.short,
      )
    ) {
      console.log(
        "Status: PENDING FINAL RESULT",
      );

      pending += 1;

      continue;
    }

    const homeScore =
      apiFixture
        .score
        .fulltime
        .home;

    const awayScore =
      apiFixture
        .score
        .fulltime
        .away;

    if (
      !validScore(
        homeScore,
      ) ||
      !validScore(
        awayScore,
      )
    ) {
      console.log(
        "Status: FINAL PROVIDER STATUS BUT REGULATION SCORE NOT CONFIRMED",
      );

      pending += 1;

      continue;
    }

    ready += 1;

    console.log(
      `Regulation result: ${homeScore}-${awayScore}`,
    );

    const observationKey =
      [
        API_SOURCE,
        apiFixture.fixtureId,
        apiFixture.status.short,
        `${homeScore}-${awayScore}`,
      ].join(
        ":",
      );

    const evidence = {
      source:
        API_SOURCE,

      ingestionVersion:
        INGESTION_VERSION,

      authoritativeRoute: {
        baselinePredictionId:
          String(
            fixture.baseline_prediction_id,
          ),

        route,

        routeReason:
          String(
            fixture.route_reason,
          ),

        modelVersion:
          String(
            fixture.model_version,
          ),
      },

      fixtureId:
        apiFixture.fixtureId,

      canonicalKickoffAt:
        frozenKickoff.toISOString(),

      providerKickoffAt:
        apiFixture.kickoffAt,

      kickoffChanged,

      providerStatus: {
        long:
          apiFixture.status.long,

        short:
          apiFixture.status.short,

        elapsed:
          apiFixture.status.elapsed,
      },

      teams: {
        home: {
          apiFootballId:
            apiFixture.home.id,

          apiFootballName:
            apiFixture.home.name,

          canonicalTeamId:
            String(
              homeMapping.team_id,
            ),

          canonicalName:
            String(
              homeMapping.canonical_name,
            ),

          mappingMethod:
            String(
              homeMapping.match_method,
            ),

          mappingVerified:
            true,
        },

        away: {
          apiFootballId:
            apiFixture.away.id,

          apiFootballName:
            apiFixture.away.name,

          canonicalTeamId:
            String(
              awayMapping.team_id,
            ),

          canonicalName:
            String(
              awayMapping.canonical_name,
            ),

          mappingMethod:
            String(
              awayMapping.match_method,
            ),

          mappingVerified:
            true,
        },
      },

      regulationScore: {
        home:
          homeScore,

        away:
          awayScore,

        sourceField:
          "score.fulltime",
      },

      providerScores: {
        goals: {
          home:
            apiFixture.goals.home,

          away:
            apiFixture.goals.away,
        },

        fulltime: {
          home:
            apiFixture
              .score
              .fulltime
              .home,

          away:
            apiFixture
              .score
              .fulltime
              .away,
        },

        extratime: {
          home:
            apiFixture
              .score
              .extratime
              .home,

          away:
            apiFixture
              .score
              .extratime
              .away,
        },

        penalty: {
          home:
            apiFixture
              .score
              .penalty
              .home,

          away:
            apiFixture
              .score
              .penalty
              .away,
        },
      },

      identityVerification: {
        fixtureProviderId:
          String(
            fixture.provider_id,
          ),

        homeApiFootballId:
          apiHomeId,

        awayApiFootballId:
          apiAwayId,

        homeCanonicalTeamId:
          String(
            fixture.home_team_id,
          ),

        awayCanonicalTeamId:
          String(
            fixture.away_team_id,
          ),

        mappingSource:
          API_SOURCE,

        verified:
          true,
      },
    };

    if (
      !persist
    ) {
      console.log(
        `Observation key: ${observationKey}`,
      );

      console.log(
        "Status: READY TO PERSIST",
      );

      continue;
    }

    const insertedRows =
      await sql`
        INSERT INTO public.result_snapshots (
          fixture_id,

          observation_key,

          is_demo,

          status,

          regulation_home_score,

          regulation_away_score,

          regulation_confirmed,

          finished_at,

          provider_updated_at,

          evidence
        )
        VALUES (
          ${String(
            fixture.fixture_id,
          )}::uuid,

          ${observationKey},

          false,

          'finished',

          ${homeScore},

          ${awayScore},

          true,

          NULL,

          NULL,

          ${JSON.stringify(
            evidence,
          )}::jsonb
        )

        ON CONFLICT (
          fixture_id,
          observation_key
        )
        DO NOTHING

        RETURNING
          id,
          observed_at
      `;

    if (
      insertedRows.length ===
      1
    ) {
      inserted += 1;

      console.log(
        `RESULT INSERTED | snapshot=${insertedRows[0].id}`,
      );
    } else {
      const existingRows =
        await sql`
          SELECT
            id,

            status,

            regulation_home_score,

            regulation_away_score,

            regulation_confirmed

          FROM public.result_snapshots

          WHERE fixture_id =
            ${String(
              fixture.fixture_id,
            )}::uuid

            AND observation_key =
              ${observationKey}

          LIMIT 1
        `;

      assert.equal(
        existingRows.length,
        1,
        "Existing result snapshot could not be reloaded.",
      );

      assert.equal(
        existingRows[0].status,
        "finished",
      );

      assert.equal(
        Number(
          existingRows[0]
            .regulation_home_score,
        ),
        homeScore,
      );

      assert.equal(
        Number(
          existingRows[0]
            .regulation_away_score,
        ),
        awayScore,
      );

      assert.equal(
        existingRows[0]
          .regulation_confirmed,
        true,
      );

      existing += 1;

      console.log(
        `RESULT EXISTING | snapshot=${existingRows[0].id}`,
      );
    }

    /*
     * Mutable fixture state is updated only as
     * the current provider read model.
     *
     * Historical settlement continues to depend
     * on immutable result_snapshots.
     */
    await sql`
      UPDATE public.fixtures

      SET
        status =
          'finished',

        provider_status =
          ${apiFixture.status.short},

        home_score =
          ${apiFixture.goals.home},

        away_score =
          ${apiFixture.goals.away},

        regulation_home_score =
          ${homeScore},

        regulation_away_score =
          ${awayScore},

        regulation_confirmed =
          true,

        fetched_at =
          clock_timestamp(),

        updated_at =
          clock_timestamp()

      WHERE id =
        ${String(
          fixture.fixture_id,
        )}::uuid
    `;

    console.log(
      "Status: RESULT PERSISTED",
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "AUTHORITATIVE RESULT INGESTION SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Authoritative fixtures: ${fixtures.length}`,
  );

  console.log(
    `Mathematical routes: ${mathematical}`,
  );

  console.log(
    `GPT research routes: ${gptResearch}`,
  );

  console.log(
    `Settlement-ready results: ${ready}`,
  );

  console.log(
    `Results inserted: ${inserted}`,
  );

  console.log(
    `Results existing: ${existing}`,
  );

  console.log(
    `Pending results: ${pending}`,
  );

  console.log(
    `API fixtures missing: ${missing}`,
  );

  console.log(
    `Identity skipped: ${identitySkipped}`,
  );

  if (
    !persist
  ) {
    console.log(
      "DRY RUN COMPLETE: no result snapshots or fixtures were modified.",
    );
  } else {
    console.log(
      "Authoritative production result ingestion complete.",
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
        ? `Authoritative result ingestion failed: ${error.message}`
        : "Authoritative result ingestion failed.",
    );

    process.exitCode =
      1;
  },
);
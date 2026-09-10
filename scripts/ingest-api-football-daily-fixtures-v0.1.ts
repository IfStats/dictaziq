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

import {
  evaluatePredictionScope,
  PREDICTION_SCOPE_VERSION,
} from "../src/lib/predictions/prediction-scope";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

const API_SOURCE =
  "api-football";

const INGESTION_VERSION =
  "dictaziq-api-football-daily-fixtures-v0.1";

const PREMATCH_STATUSES =
  new Set<string>([
    "NS",
    "TBD",
  ]);

type CanonicalTeam = {
  teamId:
    string;

  canonicalName:
    string;

  origin:
    "existing_mapping" |
    "existing_native" |
    "created_native";
};

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
      "Invalid fixture date.",
    );
  }

  return value;
}

function slugify(
  value:
    string,
): string {
  const slug =
    value
      .normalize(
        "NFKD",
      )
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .replace(
        /&/g,
        " and ",
      )
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      );

  if (
    slug.length ===
    0
  ) {
    throw new Error(
      `Cannot create slug from "${value}".`,
    );
  }

  return slug;
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

async function resolveOrCreateApiTeam(
  sql:
    SqlClient,
  sportId:
    string,
  apiTeamId:
    number,
  apiTeamName:
    string,
): Promise<CanonicalTeam> {
  const sourceTeamId =
    String(
      apiTeamId,
    );

  /*
   * FIRST CHOICE
   *
   * Reuse an existing API-Football ->
   * canonical team mapping.
   */
  const mappings =
    await sql`
      SELECT
        mapping.team_id,
        mapping.is_verified,

        team.name,
        team.provider,
        team.provider_id,
        team.is_demo

      FROM public.team_source_mappings
        AS mapping

      JOIN public.teams
        AS team
        ON team.id =
          mapping.team_id

      WHERE mapping.source =
        ${API_SOURCE}

        AND mapping.source_team_id =
          ${sourceTeamId}
    `;

  assert.ok(
    mappings.length <=
      1,
    `Duplicate API-Football mapping for team ${sourceTeamId}.`,
  );

  if (
    mappings.length ===
    1
  ) {
    const mapping =
      mappings[0];

    assert.equal(
      mapping.is_demo,
      false,
      `API-Football team ${sourceTeamId} points to demo data.`,
    );

    /*
     * A reviewed cross-provider mapping must be
     * verified.
     *
     * A provider-native team is inherently an
     * exact API identity and can safely be used.
     */
    const nativeIdentity =
      String(
        mapping.provider,
      ) ===
        API_SOURCE &&
      String(
        mapping.provider_id,
      ) ===
        sourceTeamId;

    if (
      mapping.is_verified !==
        true &&
      !nativeIdentity
    ) {
      throw new Error(
        [
          "Unverified cross-provider API-Football mapping.",
          `apiTeam=${sourceTeamId}`,
          `name=${apiTeamName}`,
        ].join(
          " ",
        ),
      );
    }

    return {
      teamId:
        String(
          mapping.team_id,
        ),

      canonicalName:
        String(
          mapping.name,
        ),

      origin:
        "existing_mapping",
    };
  }

  /*
   * SECOND CHOICE
   *
   * There may already be a provider-native
   * canonical team even when the mapping row
   * has not yet been created.
   */
  const nativeRows =
    await sql`
      SELECT
        id,
        name,
        is_demo

      FROM public.teams

      WHERE provider =
        ${API_SOURCE}

        AND provider_id =
          ${sourceTeamId}

      LIMIT 1
    `;

  let teamId:
    string;

  let canonicalName:
    string;

  let origin:
    CanonicalTeam["origin"];

  if (
    nativeRows.length ===
    1
  ) {
    assert.equal(
      nativeRows[0]
        .is_demo,
      false,
      `Native API-Football team ${sourceTeamId} is demo data.`,
    );

    teamId =
      String(
        nativeRows[0].id,
      );

    canonicalName =
      String(
        nativeRows[0].name,
      );

    origin =
      "existing_native";
  } else {
    /*
     * THIRD CHOICE
     *
     * Create a provider-native canonical team.
     *
     * This is NOT fuzzy cross-provider matching.
     * The API-Football provider ID itself is the
     * identity, so no football knowledge is being
     * guessed.
     */
    const teamSlug =
      `${slugify(
        apiTeamName,
      )}-api-${sourceTeamId}`;

    const inserted =
      await sql`
        INSERT INTO public.teams (
          sport_id,
          slug,
          name,
          short_name,
          country,
          provider,
          provider_id,
          is_demo
        )
        VALUES (
          ${sportId}::uuid,
          ${teamSlug},
          ${apiTeamName},
          NULL,
          NULL,
          ${API_SOURCE},
          ${sourceTeamId},
          false
        )

        ON CONFLICT (
          provider,
          provider_id
        )
        DO NOTHING

        RETURNING
          id,
          name
      `;

    if (
      inserted.length ===
      1
    ) {
      teamId =
        String(
          inserted[0].id,
        );

      canonicalName =
        String(
          inserted[0].name,
        );

      origin =
        "created_native";
    } else {
      const reloaded =
        await sql`
          SELECT
            id,
            name,
            is_demo

          FROM public.teams

          WHERE provider =
            ${API_SOURCE}

            AND provider_id =
              ${sourceTeamId}

          LIMIT 1
        `;

      assert.equal(
        reloaded.length,
        1,
        `API-Football team ${sourceTeamId} could not be reloaded.`,
      );

      assert.equal(
        reloaded[0]
          .is_demo,
        false,
      );

      teamId =
        String(
          reloaded[0].id,
        );

      canonicalName =
        String(
          reloaded[0].name,
        );

      origin =
        "existing_native";
    }
  }

  /*
   * Record the exact provider-native identity in
   * the mapping layer.
   *
   * is_verified=true is valid here because no
   * cross-provider inference occurred.
   */
  await sql`
    INSERT INTO public.team_source_mappings (
      team_id,
      source,
      source_team_id,
      source_name,
      source_country,
      source_url,
      match_method,
      is_verified,
      evidence
    )
    VALUES (
      ${teamId}::uuid,
      ${API_SOURCE},
      ${sourceTeamId},
      ${apiTeamName},
      NULL,
      NULL,
      'seed',
      true,

      ${JSON.stringify({
        kind:
          "provider_native_identity",

        ingestionVersion:
          INGESTION_VERSION,

        provider:
          API_SOURCE,

        sourceTeamId,

        sourceName:
          apiTeamName,

        crossProviderInference:
          false,

        verified:
          true,
      })}::jsonb
    )

    ON CONFLICT (
      source,
      source_team_id
    )
    DO NOTHING
  `;

  /*
   * Verify a racing process did not map the same
   * API identity to a different canonical team.
   */
  const verification =
    await sql`
      SELECT
        team_id,
        is_verified

      FROM public.team_source_mappings

      WHERE source =
        ${API_SOURCE}

        AND source_team_id =
          ${sourceTeamId}

      LIMIT 1
    `;

  assert.equal(
    verification.length,
    1,
    `API-Football mapping ${sourceTeamId} was not persisted.`,
  );

  assert.equal(
    String(
      verification[0]
        .team_id,
    ),
    teamId,
    `API-Football team ${sourceTeamId} was concurrently mapped to another canonical team.`,
  );

  assert.equal(
    verification[0]
      .is_verified,
    true,
    `API-Football native mapping ${sourceTeamId} is not verified.`,
  );

  return {
    teamId,
    canonicalName,
    origin,
  };
}

async function main() {
  const date =
    requestedDate();

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const nowRows =
    await sql`
      SELECT
        clock_timestamp()
          AS now
    `;

  const databaseNow =
    timestamp(
      nowRows[0].now,
      "Database clock",
    );

  const sportRows =
    await sql`
      SELECT id

      FROM public.sports

      WHERE slug =
        'football'

      LIMIT 1
    `;

  assert.equal(
    sportRows.length,
    1,
    "Football sport record is missing.",
  );

  const sportId =
    String(
      sportRows[0].id,
    );

  console.log(
    "DictazIQ Universal Fixture Ingestion",
  );

  console.log(
    `Version: ${INGESTION_VERSION}`,
  );

  console.log(
    `Prediction scope: ${PREDICTION_SCOPE_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Database time: ${databaseNow.toISOString()}`,
  );

  const page =
    await fetchFixturesByDate(
      date,
    );

  console.log(
    `API-Football fixtures received: ${page.fixtures.length}`,
  );

  let prematch =
    0;

  let future =
    0;

  let eligible =
    0;

  let excludedYouth =
    0;

  let excludedWomen =
    0;

  let excludedReserve =
    0;

  let excludedAcademy =
    0;

  let teamsCreated =
    0;

  let competitionsInserted =
    0;

  let seasonsInserted =
    0;

  let fixturesInserted =
    0;

  let fixturesExisting =
    0;

  for (
    const apiFixture
    of page.fixtures
  ) {
    if (
      !PREMATCH_STATUSES.has(
        apiFixture.status.short,
      )
    ) {
      continue;
    }

    prematch +=
      1;

    const kickoff =
      timestamp(
        apiFixture.kickoffAt,
        "Fixture kickoff",
      );

    if (
      kickoff.getTime() <=
      databaseNow.getTime()
    ) {
      continue;
    }

    future +=
      1;

    const scope =
      evaluatePredictionScope(
        apiFixture,
      );

    if (
      !scope.eligible
    ) {
      switch (
        scope.reason
      ) {
        case "youth":
          excludedYouth +=
            1;
          break;

        case "women":
          excludedWomen +=
            1;
          break;

        case "reserve":
          excludedReserve +=
            1;
          break;

        case "academy":
          excludedAcademy +=
            1;
          break;
      }

      continue;
    }

    eligible +=
      1;

    const home =
      await resolveOrCreateApiTeam(
        sql,
        sportId,
        apiFixture.home.id,
        apiFixture.home.name,
      );

    const away =
      await resolveOrCreateApiTeam(
        sql,
        sportId,
        apiFixture.away.id,
        apiFixture.away.name,
      );

    if (
      home.origin ===
      "created_native"
    ) {
      teamsCreated +=
        1;
    }

    if (
      away.origin ===
      "created_native"
    ) {
      teamsCreated +=
        1;
    }

    assert.notEqual(
      home.teamId,
      away.teamId,
      `Fixture ${apiFixture.fixtureId} resolved both sides to the same canonical team.`,
    );

    /*
     * Competition identity is exact provider
     * identity. No fuzzy matching is necessary.
     */
    const competitionSlug =
      `${slugify(
        apiFixture.league.name,
      )}-api-${apiFixture.league.id}`;

    const competitionInsert =
      await sql`
        INSERT INTO public.competitions (
          sport_id,
          slug,
          name,
          country,
          provider,
          provider_id,
          is_demo
        )
        VALUES (
          ${sportId}::uuid,
          ${competitionSlug},
          ${apiFixture.league.name},
          ${apiFixture.league.country},
          ${API_SOURCE},
          ${String(
            apiFixture.league.id,
          )},
          false
        )

        ON CONFLICT (
          provider,
          provider_id
        )
        DO NOTHING

        RETURNING id
      `;

    if (
      competitionInsert.length ===
      1
    ) {
      competitionsInserted +=
        1;
    }

    const competitionRows =
      await sql`
        SELECT
          id,
          is_demo

        FROM public.competitions

        WHERE provider =
          ${API_SOURCE}

          AND provider_id =
            ${String(
              apiFixture.league.id,
            )}

        LIMIT 1
      `;

    assert.equal(
      competitionRows.length,
      1,
      `Competition ${apiFixture.league.id} could not be resolved.`,
    );

    assert.equal(
      competitionRows[0]
        .is_demo,
      false,
    );

    const competitionId =
      String(
        competitionRows[0].id,
      );

    const seasonLabel =
      String(
        apiFixture.league.season,
      );

    const seasonInsert =
      await sql`
        INSERT INTO public.seasons (
          competition_id,
          label,
          start_date,
          end_date
        )
        VALUES (
          ${competitionId}::uuid,
          ${seasonLabel},
          NULL,
          NULL
        )

        ON CONFLICT (
          competition_id,
          label
        )
        DO NOTHING

        RETURNING id
      `;

    if (
      seasonInsert.length ===
      1
    ) {
      seasonsInserted +=
        1;
    }

    const seasonRows =
      await sql`
        SELECT id

        FROM public.seasons

        WHERE competition_id =
          ${competitionId}::uuid

          AND label =
            ${seasonLabel}

        LIMIT 1
      `;

    assert.equal(
      seasonRows.length,
      1,
      `Season ${seasonLabel} could not be resolved.`,
    );

    const seasonId =
      String(
        seasonRows[0].id,
      );

    const providerFixtureId =
      String(
        apiFixture.fixtureId,
      );

    const existingFixture =
      await sql`
        SELECT
          id,
          season_id,
          home_team_id,
          away_team_id

        FROM public.fixtures

        WHERE provider =
          ${API_SOURCE}

          AND provider_id =
            ${providerFixtureId}

        LIMIT 1
      `;

    if (
      existingFixture.length ===
      1
    ) {
      assert.equal(
        String(
          existingFixture[0]
            .home_team_id,
        ),
        home.teamId,
        `Fixture ${providerFixtureId} home identity changed.`,
      );

      assert.equal(
        String(
          existingFixture[0]
            .away_team_id,
        ),
        away.teamId,
        `Fixture ${providerFixtureId} away identity changed.`,
      );

      assert.equal(
        String(
          existingFixture[0]
            .season_id,
        ),
        seasonId,
        `Fixture ${providerFixtureId} season identity changed.`,
      );

      await sql`
        UPDATE public.fixtures

        SET
          kickoff_at =
            ${apiFixture.kickoffAt}::timestamptz,

          status =
            'scheduled',

          provider_status =
            ${apiFixture.status.short},

          fetched_at =
            clock_timestamp(),

          updated_at =
            clock_timestamp()

        WHERE id =
          ${String(
            existingFixture[0].id,
          )}::uuid
      `;

      fixturesExisting +=
        1;

      continue;
    }

    const fixtureSlug =
      [
        slugify(
          home.canonicalName,
        ),

        "vs",

        slugify(
          away.canonicalName,
        ),

        date,

        providerFixtureId,
      ].join(
        "-",
      );

    await sql`
      INSERT INTO public.fixtures (
        season_id,
        home_team_id,
        away_team_id,
        slug,
        provider,
        provider_id,
        is_demo,
        kickoff_at,
        status,
        provider_status,
        home_score,
        away_score,
        regulation_home_score,
        regulation_away_score,
        regulation_confirmed,
        provider_updated_at,
        fetched_at
      )
      VALUES (
        ${seasonId}::uuid,
        ${home.teamId}::uuid,
        ${away.teamId}::uuid,
        ${fixtureSlug},
        ${API_SOURCE},
        ${providerFixtureId},
        false,
        ${apiFixture.kickoffAt}::timestamptz,
        'scheduled',
        ${apiFixture.status.short},
        NULL,
        NULL,
        NULL,
        NULL,
        false,
        NULL,
        clock_timestamp()
      )
    `;

    fixturesInserted +=
      1;
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Prematch provider fixtures: ${prematch}`,
  );

  console.log(
    `Future prematch fixtures: ${future}`,
  );

  console.log(
    `Senior scope eligible: ${eligible}`,
  );

  console.log(
    `Excluded youth: ${excludedYouth}`,
  );

  console.log(
    `Excluded women: ${excludedWomen}`,
  );

  console.log(
    `Excluded reserve: ${excludedReserve}`,
  );

  console.log(
    `Excluded academy: ${excludedAcademy}`,
  );

  console.log(
    `Provider-native teams created: ${teamsCreated}`,
  );

  console.log(
    `Competitions inserted: ${competitionsInserted}`,
  );

  console.log(
    `Seasons inserted: ${seasonsInserted}`,
  );

  console.log(
    `Fixtures inserted: ${fixturesInserted}`,
  );

  console.log(
    `Fixtures existing: ${fixturesExisting}`,
  );

  console.log("");
  console.log(
    "PASS: every eligible future senior fixture was persisted independently of rating availability.",
  );

  console.log(
    "PASS: no cross-provider team mapping was guessed.",
  );

  console.log(
    "PASS: provider-native teams can later receive FootballDatabase and football-data.org mappings.",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error instanceof Error
        ? `Universal fixture ingestion failed: ${error.message}`
        : "Universal fixture ingestion failed.",
    );

    process.exitCode =
      1;
  },
);
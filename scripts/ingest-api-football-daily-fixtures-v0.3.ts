import "./load-env";

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

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

const API_SOURCE =
  "api-football";

const INGESTION_VERSION =
  "dictaziq-api-football-daily-fixtures-v0.3";

const PREMATCH_STATUSES =
  new Set<string>([
    "NS",
    "TBD",
  ]);

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type CanonicalTeam = {
  teamId: string;
  canonicalName: string;
};

type TeamInput = {
  provider_id: string;
  name: string;
  slug: string;
};

type CompetitionInput = {
  provider_id: string;
  name: string;
  country: string;
  slug: string;
};

type SeasonInput = {
  competition_id: string;
  label: string;
};

type FixtureInput = {
  provider_id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  slug: string;
  kickoff_at: string;
  provider_status: string;
};

function requestedDate(): string {
  const value =
    process.argv[2]?.trim() ??
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
      .slice(0, 10) !==
      value
  ) {
    throw new Error(
      "Invalid fixture date.",
    );
  }

  return value;
}

function timestamp(
  value: unknown,
  label: string,
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

function slugify(
  value: string,
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
    slug.length === 0
  ) {
    throw new Error(
      `Cannot create slug from "${value}".`,
    );
  }

  return slug;
}

function elapsedSeconds(
  startedAt: number,
): string {
  return (
    (
      performance.now() -
      startedAt
    ) /
    1000
  ).toFixed(2);
}

async function main() {
  const startedAt =
    performance.now();

  const date =
    requestedDate();

  const sql: SqlClient =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Bulk Fixture Ingestion",
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

  const [
    nowRows,
    sportRows,
  ] =
    await Promise.all([
      sql`
        SELECT
          clock_timestamp()
            AS now
      `,

      sql`
        SELECT
          id

        FROM public.sports

        WHERE slug =
          'football'

        LIMIT 1
      `,
    ]);

  assert.equal(
    nowRows.length,
    1,
    "Database clock could not be read.",
  );

  assert.equal(
    sportRows.length,
    1,
    "Football sport record is missing.",
  );

  const databaseNow =
    timestamp(
      nowRows[0].now,
      "Database clock",
    );

  const sportId =
    String(
      sportRows[0].id,
    );

  console.log(
    `Database time: ${databaseNow.toISOString()}`,
  );

  console.log("");
  console.log(
    "Fetching API-Football daily fixture page...",
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

  let eligibleCount =
    0;

  let excludedYouth =
    0;

  let excludedWomen =
    0;

  let excludedReserve =
    0;

  let excludedAcademy =
    0;

  const eligibleFixtures =
    page.fixtures
      .filter(
        (
          apiFixture,
        ) => {
          if (
            !PREMATCH_STATUSES.has(
              apiFixture.status.short,
            )
          ) {
            return false;
          }

          prematch += 1;

          const kickoff =
            timestamp(
              apiFixture.kickoffAt,
              "Fixture kickoff",
            );

          if (
            kickoff.getTime() <=
            databaseNow.getTime()
          ) {
            return false;
          }

          future += 1;

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
                excludedYouth += 1;
                break;

              case "women":
                excludedWomen += 1;
                break;

              case "reserve":
                excludedReserve += 1;
                break;

              case "academy":
                excludedAcademy += 1;
                break;
            }

            return false;
          }

          eligibleCount += 1;

          return true;
        },
      )
      .sort(
        (
          left,
          right,
        ) =>
          new Date(
            left.kickoffAt,
          ).getTime() -
          new Date(
            right.kickoffAt,
          ).getTime(),
      );

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "SCOPE SUMMARY",
  );

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
    `Senior scope eligible: ${eligibleCount}`,
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

  if (
    eligibleFixtures.length ===
    0
  ) {
    console.log("");
    console.log(
      "No eligible future senior fixtures require ingestion.",
    );

    console.log(
      `Elapsed: ${elapsedSeconds(
        startedAt,
      )}s`,
    );

    return;
  }

  /*
   * Validate unique provider fixture identities.
   */
  const dailyFixtureIds =
    new Set<string>();

  for (
    const fixture
    of eligibleFixtures
  ) {
    const providerId =
      String(
        fixture.fixtureId,
      );

    assert.equal(
      dailyFixtureIds.has(
        providerId,
      ),
      false,
      `API-Football returned duplicate fixture ${providerId}.`,
    );

    dailyFixtureIds.add(
      providerId,
    );
  }

  /*
   * ================================================
   * TEAMS
   * ================================================
   */
  console.log("");
  console.log(
    "Resolving team identities in bulk...",
  );

  const teamInputMap =
    new Map<
      string,
      TeamInput
    >();

  const registerTeam = (
    providerId: number,
    name: string,
  ) => {
    const key =
      String(
        providerId,
      );

    const previous =
      teamInputMap.get(
        key,
      );

    if (
      previous
    ) {
      assert.equal(
        previous.name,
        name,
        `API-Football team ${key} has conflicting names in the daily response.`,
      );

      return;
    }

    teamInputMap.set(
      key,
      {
        provider_id:
          key,

        name,

        slug:
          `${slugify(
            name,
          )}-api-${key}`,
      },
    );
  };

  for (
    const fixture
    of eligibleFixtures
  ) {
    registerTeam(
      fixture.home.id,
      fixture.home.name,
    );

    registerTeam(
      fixture.away.id,
      fixture.away.name,
    );
  }

  const teamInputs =
    [
      ...teamInputMap.values(),
    ];

  const teamProviderIds =
    teamInputs.map(
      (
        team,
      ) =>
        team.provider_id,
    );

  const existingMappingRows =
    await sql`
      WITH wanted AS (
        SELECT
          value::text
            AS provider_id

        FROM jsonb_array_elements_text(
          ${JSON.stringify(
            teamProviderIds,
          )}::jsonb
        )
      )

      SELECT
        mapping.source_team_id,
        mapping.team_id,
        mapping.is_verified,

        team.name,
        team.provider,
        team.provider_id,
        team.is_demo

      FROM public.team_source_mappings
        AS mapping

      JOIN wanted
        ON wanted.provider_id =
          mapping.source_team_id

      JOIN public.teams
        AS team
        ON team.id =
          mapping.team_id

      WHERE mapping.source =
        ${API_SOURCE}
    `;

  const originalMappings =
    new Map<
      string,
      Record<
        string,
        unknown
      >
    >();

  for (
    const row
    of existingMappingRows
  ) {
    const sourceTeamId =
      String(
        row.source_team_id,
      );

    assert.equal(
      originalMappings.has(
        sourceTeamId,
      ),
      false,
      `Duplicate API-Football mapping for team ${sourceTeamId}.`,
    );

    assert.equal(
      row.is_demo,
      false,
      `API-Football team ${sourceTeamId} points to demo data.`,
    );

    const nativeIdentity =
      String(
        row.provider,
      ) ===
        API_SOURCE &&
      String(
        row.provider_id,
      ) ===
        sourceTeamId;

    if (
      row.is_verified !== true &&
      !nativeIdentity
    ) {
      throw new Error(
        [
          "Unverified cross-provider API-Football mapping.",
          `apiTeam=${sourceTeamId}`,
          `name=${String(
            row.name,
          )}`,
        ].join(
          " ",
        ),
      );
    }

    originalMappings.set(
      sourceTeamId,
      row as Record<
        string,
        unknown
      >,
    );
  }

  const unresolvedTeamInputs =
    teamInputs.filter(
      (
        team,
      ) =>
        !originalMappings.has(
          team.provider_id,
        ),
    );

  const unresolvedIds =
    unresolvedTeamInputs.map(
      (
        team,
      ) =>
        team.provider_id,
    );

  const nativeRows =
    unresolvedIds.length ===
    0
      ? []
      : await sql`
          WITH wanted AS (
            SELECT
              value::text
                AS provider_id

            FROM jsonb_array_elements_text(
              ${JSON.stringify(
                unresolvedIds,
              )}::jsonb
            )
          )

          SELECT
            team.id,
            team.name,
            team.provider_id,
            team.is_demo

          FROM public.teams
            AS team

          JOIN wanted
            ON wanted.provider_id =
              team.provider_id

          WHERE team.provider =
            ${API_SOURCE}
        `;

  const nativeBefore =
    new Map<
      string,
      {
        id: string;
        name: string;
      }
    >();

  for (
    const row
    of nativeRows
  ) {
    const providerId =
      String(
        row.provider_id,
      );

    assert.equal(
      row.is_demo,
      false,
      `Native API-Football team ${providerId} is demo data.`,
    );

    nativeBefore.set(
      providerId,
      {
        id:
          String(
            row.id,
          ),

        name:
          String(
            row.name,
          ),
      },
    );
  }

  const missingNativeTeams =
    unresolvedTeamInputs.filter(
      (
        team,
      ) =>
        !nativeBefore.has(
          team.provider_id,
        ),
    );

  let teamsCreated =
    0;

  if (
    missingNativeTeams.length >
    0
  ) {
    const insertedTeamRows =
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

        SELECT
          ${sportId}::uuid,
          input.slug,
          input.name,
          NULL,
          NULL,
          ${API_SOURCE},
          input.provider_id,
          false

        FROM jsonb_to_recordset(
          ${JSON.stringify(
            missingNativeTeams,
          )}::jsonb
        )
        AS input(
          provider_id text,
          name text,
          slug text
        )

        ON CONFLICT (
          provider,
          provider_id
        )
        DO NOTHING

        RETURNING
          provider_id
      `;

    teamsCreated =
      insertedTeamRows.length;
  }

  const allNativeRows =
    unresolvedIds.length ===
    0
      ? []
      : await sql`
          WITH wanted AS (
            SELECT
              value::text
                AS provider_id

            FROM jsonb_array_elements_text(
              ${JSON.stringify(
                unresolvedIds,
              )}::jsonb
            )
          )

          SELECT
            team.id,
            team.name,
            team.provider_id,
            team.is_demo

          FROM public.teams
            AS team

          JOIN wanted
            ON wanted.provider_id =
              team.provider_id

          WHERE team.provider =
            ${API_SOURCE}
        `;

  const nativeTeams =
    new Map<
      string,
      {
        id: string;
        name: string;
      }
    >();

  for (
    const row
    of allNativeRows
  ) {
    const providerId =
      String(
        row.provider_id,
      );

    assert.equal(
      row.is_demo,
      false,
      `Native API-Football team ${providerId} is demo data.`,
    );

    nativeTeams.set(
      providerId,
      {
        id:
          String(
            row.id,
          ),

        name:
          String(
            row.name,
          ),
      },
    );
  }

  assert.equal(
    nativeTeams.size,
    unresolvedIds.length,
    "Not every unresolved API-Football team received a provider-native identity.",
  );

  const mappingInsertInput =
    unresolvedTeamInputs.map(
      (
        team,
      ) => {
        const native =
          nativeTeams.get(
            team.provider_id,
          );

        assert.ok(
          native,
          `Native API-Football team ${team.provider_id} is missing.`,
        );

        return {
          team_id:
            native.id,

          source_team_id:
            team.provider_id,

          source_name:
            team.name,

          evidence: {
            kind:
              "provider_native_identity",

            ingestionVersion:
              INGESTION_VERSION,

            provider:
              API_SOURCE,

            sourceTeamId:
              team.provider_id,

            sourceName:
              team.name,

            crossProviderInference:
              false,

            verified:
              true,
          },
        };
      },
    );

  if (
    mappingInsertInput.length >
    0
  ) {
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

      SELECT
        input.team_id::uuid,
        ${API_SOURCE},
        input.source_team_id,
        input.source_name,
        NULL,
        NULL,
        'seed',
        true,
        input.evidence

      FROM jsonb_to_recordset(
        ${JSON.stringify(
          mappingInsertInput,
        )}::jsonb
      )
      AS input(
        team_id text,
        source_team_id text,
        source_name text,
        evidence jsonb
      )

      ON CONFLICT (
        source,
        source_team_id
      )
      DO NOTHING
    `;
  }

  const finalMappingRows =
    await sql`
      WITH wanted AS (
        SELECT
          value::text
            AS provider_id

        FROM jsonb_array_elements_text(
          ${JSON.stringify(
            teamProviderIds,
          )}::jsonb
        )
      )

      SELECT
        mapping.source_team_id,
        mapping.team_id,
        mapping.is_verified,

        team.name,
        team.provider,
        team.provider_id,
        team.is_demo

      FROM public.team_source_mappings
        AS mapping

      JOIN wanted
        ON wanted.provider_id =
          mapping.source_team_id

      JOIN public.teams
        AS team
        ON team.id =
          mapping.team_id

      WHERE mapping.source =
        ${API_SOURCE}
    `;

  const canonicalTeams =
    new Map<
      string,
      CanonicalTeam
    >();

  for (
    const row
    of finalMappingRows
  ) {
    const sourceTeamId =
      String(
        row.source_team_id,
      );

    assert.equal(
      row.is_demo,
      false,
      `API-Football team ${sourceTeamId} resolved to demo data.`,
    );

    const nativeIdentity =
      String(
        row.provider,
      ) ===
        API_SOURCE &&
      String(
        row.provider_id,
      ) ===
        sourceTeamId;

    assert.ok(
      row.is_verified === true ||
        nativeIdentity,
      `API-Football mapping ${sourceTeamId} is not verified.`,
    );

    if (
      !originalMappings.has(
        sourceTeamId,
      )
    ) {
      const expected =
        nativeTeams.get(
          sourceTeamId,
        );

      assert.ok(
        expected,
        `Expected provider-native team ${sourceTeamId} is missing.`,
      );

      assert.equal(
        String(
          row.team_id,
        ),
        expected.id,
        `API-Football team ${sourceTeamId} was concurrently mapped to another canonical team.`,
      );
    }

    canonicalTeams.set(
      sourceTeamId,
      {
        teamId:
          String(
            row.team_id,
          ),

        canonicalName:
          String(
            row.name,
          ),
      },
    );
  }

  assert.equal(
    canonicalTeams.size,
    teamProviderIds.length,
    "Not every API-Football team received a canonical identity.",
  );

  console.log(
    `Teams resolved: ${canonicalTeams.size}/${teamProviderIds.length}`,
  );

  console.log(
    `Provider-native teams created: ${teamsCreated}`,
  );

  /*
   * ================================================
   * COMPETITIONS
   * ================================================
   */
  console.log("");
  console.log(
    "Resolving competitions in bulk...",
  );

  const competitionInputMap =
    new Map<
      string,
      CompetitionInput
    >();

  for (
    const fixture
    of eligibleFixtures
  ) {
    const providerId =
      String(
        fixture.league.id,
      );

    const candidate:
      CompetitionInput = {
      provider_id:
        providerId,

      name:
        fixture.league.name,

      country:
        fixture.league.country,

      slug:
        `${slugify(
          fixture.league.name,
        )}-api-${providerId}`,
    };

    const previous =
      competitionInputMap.get(
        providerId,
      );

    if (
      previous
    ) {
      assert.equal(
        previous.name,
        candidate.name,
        `Competition ${providerId} has conflicting names in the provider response.`,
      );

      continue;
    }

    competitionInputMap.set(
      providerId,
      candidate,
    );
  }

  const competitionInputs =
    [
      ...competitionInputMap.values(),
    ];

  const insertedCompetitions =
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

      SELECT
        ${sportId}::uuid,
        input.slug,
        input.name,
        input.country,
        ${API_SOURCE},
        input.provider_id,
        false

      FROM jsonb_to_recordset(
        ${JSON.stringify(
          competitionInputs,
        )}::jsonb
      )
      AS input(
        provider_id text,
        name text,
        country text,
        slug text
      )

      ON CONFLICT (
        provider,
        provider_id
      )
      DO NOTHING

      RETURNING
        provider_id
    `;

  const competitionProviderIds =
    competitionInputs.map(
      (
        competition,
      ) =>
        competition.provider_id,
    );

  const competitionRows =
    await sql`
      WITH wanted AS (
        SELECT
          value::text
            AS provider_id

        FROM jsonb_array_elements_text(
          ${JSON.stringify(
            competitionProviderIds,
          )}::jsonb
        )
      )

      SELECT
        competition.id,
        competition.provider_id,
        competition.is_demo

      FROM public.competitions
        AS competition

      JOIN wanted
        ON wanted.provider_id =
          competition.provider_id

      WHERE competition.provider =
        ${API_SOURCE}
    `;

  const competitions =
    new Map<
      string,
      string
    >();

  for (
    const row
    of competitionRows
  ) {
    assert.equal(
      row.is_demo,
      false,
      `Competition ${String(
        row.provider_id,
      )} is demo data.`,
    );

    competitions.set(
      String(
        row.provider_id,
      ),
      String(
        row.id,
      ),
    );
  }

  assert.equal(
    competitions.size,
    competitionInputs.length,
    "Not every API-Football competition was resolved.",
  );

  console.log(
    `Competitions resolved: ${competitions.size}/${competitionInputs.length}`,
  );

  console.log(
    `Competitions created: ${insertedCompetitions.length}`,
  );

  /*
   * ================================================
   * SEASONS
   * ================================================
   */
  console.log("");
  console.log(
    "Resolving seasons in bulk...",
  );

  const seasonInputMap =
    new Map<
      string,
      SeasonInput
    >();

  for (
    const fixture
    of eligibleFixtures
  ) {
    const competitionId =
      competitions.get(
        String(
          fixture.league.id,
        ),
      );

    assert.ok(
      competitionId,
      `Competition ${fixture.league.id} is unresolved.`,
    );

    const label =
      String(
        fixture.league.season,
      );

    const key =
      `${competitionId}|${label}`;

    seasonInputMap.set(
      key,
      {
        competition_id:
          competitionId,

        label,
      },
    );
  }

  const seasonInputs =
    [
      ...seasonInputMap.values(),
    ];

  const insertedSeasons =
    await sql`
      INSERT INTO public.seasons (
        competition_id,
        label,
        start_date,
        end_date
      )

      SELECT
        input.competition_id::uuid,
        input.label,
        NULL,
        NULL

      FROM jsonb_to_recordset(
        ${JSON.stringify(
          seasonInputs,
        )}::jsonb
      )
      AS input(
        competition_id text,
        label text
      )

      ON CONFLICT (
        competition_id,
        label
      )
      DO NOTHING

      RETURNING
        id
    `;

  const seasonRows =
    await sql`
      WITH wanted AS (
        SELECT
          input.competition_id::uuid
            AS competition_id,

          input.label

        FROM jsonb_to_recordset(
          ${JSON.stringify(
            seasonInputs,
          )}::jsonb
        )
        AS input(
          competition_id text,
          label text
        )
      )

      SELECT
        season.id,
        season.competition_id,
        season.label

      FROM public.seasons
        AS season

      JOIN wanted
        ON wanted.competition_id =
          season.competition_id

        AND wanted.label =
          season.label
    `;

  const seasons =
    new Map<
      string,
      string
    >();

  for (
    const row
    of seasonRows
  ) {
    seasons.set(
      `${String(
        row.competition_id,
      )}|${String(
        row.label,
      )}`,
      String(
        row.id,
      ),
    );
  }

  assert.equal(
    seasons.size,
    seasonInputs.length,
    "Not every competition season was resolved.",
  );

  console.log(
    `Seasons resolved: ${seasons.size}/${seasonInputs.length}`,
  );

  console.log(
    `Seasons created: ${insertedSeasons.length}`,
  );

  /*
   * ================================================
   * FIXTURES
   * ================================================
   */
  console.log("");
  console.log(
    "Preparing fixture bulk upsert...",
  );

  const fixtureInputs:
    FixtureInput[] =
    eligibleFixtures.map(
      (
        fixture,
      ) => {
        const home =
          canonicalTeams.get(
            String(
              fixture.home.id,
            ),
          );

        const away =
          canonicalTeams.get(
            String(
              fixture.away.id,
            ),
          );

        assert.ok(
          home,
          `Home team ${fixture.home.id} is unresolved.`,
        );

        assert.ok(
          away,
          `Away team ${fixture.away.id} is unresolved.`,
        );

        assert.notEqual(
          home.teamId,
          away.teamId,
          `Fixture ${fixture.fixtureId} resolved both sides to the same canonical team.`,
        );

        const competitionId =
          competitions.get(
            String(
              fixture.league.id,
            ),
          );

        assert.ok(
          competitionId,
          `Competition ${fixture.league.id} is unresolved.`,
        );

        const seasonLabel =
          String(
            fixture.league.season,
          );

        const seasonId =
          seasons.get(
            `${competitionId}|${seasonLabel}`,
          );

        assert.ok(
          seasonId,
          `Season ${seasonLabel} could not be resolved for competition ${fixture.league.id}.`,
        );

        const providerId =
          String(
            fixture.fixtureId,
          );

        return {
          provider_id:
            providerId,

          season_id:
            seasonId,

          home_team_id:
            home.teamId,

          away_team_id:
            away.teamId,

          slug: [
            slugify(
              home.canonicalName,
            ),
            "vs",
            slugify(
              away.canonicalName,
            ),
            date,
            providerId,
          ].join(
            "-",
          ),

          kickoff_at:
            fixture.kickoffAt,

          provider_status:
            fixture.status.short,
        };
      },
    );

  const providerFixtureIds =
    fixtureInputs.map(
      (
        fixture,
      ) =>
        fixture.provider_id,
    );

  const existingFixtureRows =
    await sql`
      WITH wanted AS (
        SELECT
          value::text
            AS provider_id

        FROM jsonb_array_elements_text(
          ${JSON.stringify(
            providerFixtureIds,
          )}::jsonb
        )
      )

      SELECT
        fixture.id,
        fixture.provider_id,
        fixture.season_id,
        fixture.home_team_id,
        fixture.away_team_id,
        fixture.is_demo

      FROM public.fixtures
        AS fixture

      JOIN wanted
        ON wanted.provider_id =
          fixture.provider_id

      WHERE fixture.provider =
        ${API_SOURCE}
    `;

  const existingFixtures =
    new Map<
      string,
      Record<
        string,
        unknown
      >
    >();

  for (
    const row
    of existingFixtureRows
  ) {
    const providerId =
      String(
        row.provider_id,
      );

    assert.equal(
      row.is_demo,
      false,
      `Fixture ${providerId} points to demo data.`,
    );

    existingFixtures.set(
      providerId,
      row as Record<
        string,
        unknown
      >,
    );
  }

  for (
    const fixture
    of fixtureInputs
  ) {
    const existing =
      existingFixtures.get(
        fixture.provider_id,
      );

    if (
      !existing
    ) {
      continue;
    }

    assert.equal(
      String(
        existing.home_team_id,
      ),
      fixture.home_team_id,
      `Fixture ${fixture.provider_id} home identity changed.`,
    );

    assert.equal(
      String(
        existing.away_team_id,
      ),
      fixture.away_team_id,
      `Fixture ${fixture.provider_id} away identity changed.`,
    );

    assert.equal(
      String(
        existing.season_id,
      ),
      fixture.season_id,
      `Fixture ${fixture.provider_id} season identity changed.`,
    );
  }

  console.log(
    `Existing fixtures validated: ${existingFixtures.size}`,
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

    SELECT
      input.season_id::uuid,
      input.home_team_id::uuid,
      input.away_team_id::uuid,
      input.slug,
      ${API_SOURCE},
      input.provider_id,
      false,
      input.kickoff_at::timestamptz,
      'scheduled'::fixture_status,
      input.provider_status,
      NULL,
      NULL,
      NULL,
      NULL,
      false,
      NULL,
      clock_timestamp()

    FROM jsonb_to_recordset(
      ${JSON.stringify(
        fixtureInputs,
      )}::jsonb
    )
    AS input(
      provider_id text,
      season_id text,
      home_team_id text,
      away_team_id text,
      slug text,
      kickoff_at text,
      provider_status text
    )

    ON CONFLICT (
      provider,
      provider_id
    )
    DO UPDATE SET
      kickoff_at =
        EXCLUDED.kickoff_at,

      status =
        'scheduled'::fixture_status,

      provider_status =
        EXCLUDED.provider_status,

      fetched_at =
        clock_timestamp(),

      updated_at =
        clock_timestamp()
  `;

  const insertedCount =
    fixtureInputs.length -
    existingFixtures.size;

  const refreshedCount =
    existingFixtures.size;

  console.log(
    `Fixtures persisted: ${fixtureInputs.length}/${fixtureInputs.length}`,
  );

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "INGESTION COMPLETE",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Provider fixtures received: ${page.fixtures.length}`,
  );

  console.log(
    `Senior eligible future fixtures: ${fixtureInputs.length}`,
  );

  console.log(
    `Unique teams resolved: ${canonicalTeams.size}`,
  );

  console.log(
    `Provider-native teams created: ${teamsCreated}`,
  );

  console.log(
    `Competitions created: ${insertedCompetitions.length}`,
  );

  console.log(
    `Seasons created: ${insertedSeasons.length}`,
  );

  console.log(
    `Fixtures inserted: ${insertedCount}`,
  );

  console.log(
    `Fixtures refreshed: ${refreshedCount}`,
  );

  console.log(
    `Elapsed: ${elapsedSeconds(
      startedAt,
    )}s`,
  );

  console.log("");
  console.log(
    "PASS: eligible fixtures were processed using bulk database operations.",
  );

  console.log(
    "PASS: existing fixture team and season identities were verified before refresh.",
  );

  console.log(
    "PASS: no fuzzy cross-provider team mapping was introduced.",
  );

  console.log(
    "PASS: provider-native identities remain independently mappable to FootballDatabase and football-data.org.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Bulk fixture ingestion failed: ${error.message}`
        : "Bulk fixture ingestion failed.",
    );

    process.exitCode =
      1;
  },
);
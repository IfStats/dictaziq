import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  fetchFixturesByDate,
} from "../src/providers/api-football/client";

import {
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01,
} from "../src/lib/predictions/unified-match-analysis-v0.1";

const MODEL_VERSION =
  UNIFIED_MATCH_ANALYSIS_MODEL_VERSION_V01;

const API_SOURCE =
  "api-football";

const INGESTION_VERSION =
  "dictaziq-api-football-result-ingestion-v0.1";

const FINAL_STATUSES =
  new Set<string>([
    "FT",
    "AET",
    "PEN",
  ]);

function requestedDate():
  string {
  const args =
    process.argv
      .slice(2)
      .filter(
        (
          value,
        ) =>
          !value.startsWith(
            "--",
          ),
      );

  const value =
    args[0] ??
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
      "Date is invalid.",
    );
  }

  return value;
}

function persistenceRequested():
  boolean {
  return process.argv
    .slice(2)
    .includes(
      "--persist",
    );
}

function validScore(
  value:
    number |
    null,
): value is number {
  return (
    value !==
      null &&
    Number.isInteger(
      value,
    ) &&
    value >=
      0
  );
}

function timestamp(
  value:
    unknown,
  label:
    string,
): Date {
  const parsed =
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
      parsed.getTime(),
    ),
    `${label} is invalid.`,
  );

  return parsed;
}

async function main() {
  const date =
    requestedDate();

  const persist =
    persistenceRequested();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Model: ${MODEL_VERSION}`,
  );

  console.log(
    `Mode: ${persist ? "PERSIST" : "DRY RUN"}`,
  );

  /*
   * Only fixtures with an official published
   * Unified v0.1 forecast enter this ingestion
   * path.
   */
  const fixtures =
    await sql`
      SELECT DISTINCT
        fixture.id,
        fixture.slug,
        fixture.provider,
        fixture.provider_id,
        fixture.kickoff_at,

        fixture.home_team_id,
        fixture.away_team_id,

        prediction.kickoff_at_generation,

        home.name
          AS home_team_name,

        away_team.name
          AS away_team_name

      FROM public.fixtures
        AS fixture

      JOIN public.predictions
        AS prediction
        ON prediction.fixture_id =
          fixture.id

      JOIN public.model_versions
        AS model
        ON model.id =
          prediction.model_version_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      WHERE fixture.provider =
        ${API_SOURCE}

        AND fixture.is_demo =
          false

        AND prediction.is_demo =
          false

        AND prediction.published_at
          IS NOT NULL

        AND model.version =
          ${MODEL_VERSION}

        AND (
          prediction.kickoff_at_generation
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  if (
    fixtures.length ===
    0
  ) {
    console.log(
      `No published ${MODEL_VERSION} fixtures found for ${date}.`,
    );

    return;
  }

  console.log(
    `Published Unified fixtures: ${fixtures.length}`,
  );

  console.log(
    `Fetching API-Football fixtures/results for ${date}...`,
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
        (
          fixture,
        ) => [
          String(
            fixture.fixtureId,
          ),

          fixture,
        ],
      ),
    );

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

  for (
    const fixture
    of fixtures
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home_team_name} vs ${fixture.away_team_name}`,
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

      missing +=
        1;

      continue;
    }

    /*
     * FIXTURE IDENTITY
     *
     * fixture.provider_id identifies the
     * API-Football fixture.
     *
     * Team identity must NOT be verified
     * against teams.provider_id because the
     * canonical team table may use a different
     * source identity.
     *
     * API-Football team IDs are resolved
     * through team_source_mappings.
     */
    const apiHomeId =
      String(
        apiFixture.home.id,
      );

    const apiAwayId =
      String(
        apiFixture.away.id,
      );

    assert.notEqual(
      apiHomeId,
      apiAwayId,
      "API-Football returned identical home and away team IDs.",
    );

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

    assert.equal(
      mappingRows.length,
      2,
      [
        "Expected exactly two API-Football team mappings.",
        `fixture=${fixture.provider_id}`,
        `homeApi=${apiHomeId}`,
        `awayApi=${apiAwayId}`,
      ].join(
        " ",
      ),
    );

    const homeMapping =
      mappingRows.find(
        (
          row,
        ) =>
          String(
            row.source_team_id,
          ) ===
          apiHomeId,
      );

    const awayMapping =
      mappingRows.find(
        (
          row,
        ) =>
          String(
            row.source_team_id,
          ) ===
          apiAwayId,
      );

    assert.ok(
      homeMapping,
      `API-Football home team ${apiHomeId} has no canonical mapping.`,
    );

    assert.ok(
      awayMapping,
      `API-Football away team ${apiAwayId} has no canonical mapping.`,
    );

    assert.equal(
      homeMapping.is_verified,
      true,
      `API-Football home mapping ${apiHomeId} is not verified.`,
    );

    assert.equal(
      awayMapping.is_verified,
      true,
      `API-Football away mapping ${apiAwayId} is not verified.`,
    );

    assert.equal(
      homeMapping.is_demo,
      false,
      "Home API-Football mapping points to demo data.",
    );

    assert.equal(
      awayMapping.is_demo,
      false,
      "Away API-Football mapping points to demo data.",
    );

    assert.equal(
      String(
        homeMapping.team_id,
      ),
      String(
        fixture.home_team_id,
      ),
      [
        "API-Football home team maps to the wrong canonical team.",
        `api=${apiHomeId}`,
        `apiName=${apiFixture.home.name}`,
        `mapped=${homeMapping.canonical_name}`,
        `fixtureHome=${fixture.home_team_name}`,
      ].join(
        " ",
      ),
    );

    assert.equal(
      String(
        awayMapping.team_id,
      ),
      String(
        fixture.away_team_id,
      ),
      [
        "API-Football away team maps to the wrong canonical team.",
        `api=${apiAwayId}`,
        `apiName=${apiFixture.away.name}`,
        `mapped=${awayMapping.canonical_name}`,
        `fixtureAway=${fixture.away_team_name}`,
      ].join(
        " ",
      ),
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

    /*
     * Kickoff comparison is recorded for
     * provenance.
     *
     * We do not rewrite the frozen prediction
     * kickoff here.
     */
    const frozenKickoff =
      timestamp(
        fixture.kickoff_at_generation,
        "Frozen kickoff",
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
          "NOTICE: provider kickoff differs from frozen prediction kickoff.",
          `frozen=${frozenKickoff.toISOString()}`,
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

      pending +=
        1;

      continue;
    }

    /*
     * SETTLEMENT SCORE
     *
     * DictazIQ's current 1X2 settlement contract
     * uses the normalized score.fulltime fields.
     *
     * Extra-time and penalty scores remain
     * separately preserved in evidence.
     */
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

      pending +=
        1;

      continue;
    }

    ready +=
      1;

    console.log(
      `Regulation result: ${homeScore}-${awayScore}`,
    );

    console.log(
      `Final status: ${apiFixture.status.short}`,
    );

    /*
     * Stable immutable observation identity.
     *
     * Repeated identical runs reuse the same
     * result snapshot.
     *
     * A corrected provider score produces a
     * different observation key and therefore a
     * new immutable snapshot rather than
     * rewriting an older observation.
     */
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

      modelScope:
        MODEL_VERSION,

      fixtureId:
        apiFixture.fixtureId,

      providerKickoffAt:
        apiFixture.kickoffAt,

      frozenPredictionKickoffAt:
        frozenKickoff.toISOString(),

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

    /*
     * IMMUTABLE RESULT SNAPSHOT
     *
     * observed_at is database-generated.
     * Caller cannot backdate the observation.
     */
    const rows =
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
            fixture.id,
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

    let snapshotId:
      string;

    if (
      rows.length ===
      1
    ) {
      snapshotId =
        String(
          rows[0].id,
        );

      inserted +=
        1;

      console.log(
        `RESULT INSERTED | snapshot=${snapshotId}`,
      );
    } else {
      /*
       * Database idempotency must be verified,
       * not merely assumed.
       */
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
              fixture.id,
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
        "Existing result snapshot status differs.",
      );

      assert.equal(
        Number(
          existingRows[0]
            .regulation_home_score,
        ),
        homeScore,
        "Existing home regulation score differs.",
      );

      assert.equal(
        Number(
          existingRows[0]
            .regulation_away_score,
        ),
        awayScore,
        "Existing away regulation score differs.",
      );

      assert.equal(
        existingRows[0]
          .regulation_confirmed,
        true,
        "Existing result snapshot is not regulation-confirmed.",
      );

      snapshotId =
        String(
          existingRows[0].id,
        );

      existing +=
        1;

      console.log(
        `RESULT EXISTING | snapshot=${snapshotId}`,
      );
    }

    /*
     * MUTABLE FIXTURE READ MODEL
     *
     * This reflects the latest provider state.
     *
     * Settlement provenance does not depend on
     * these mutable columns; it depends on the
     * immutable result snapshot above.
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
          fixture.id,
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

  if (
    !persist
  ) {
    console.log(
      "DRY RUN COMPLETE: result_snapshots and fixtures were not modified.",
    );
  } else {
    console.log(
      "Unified result ingestion complete.",
    );
  }
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error instanceof Error
        ? `Unified result ingestion failed: ${error.message}`
        : "Unified result ingestion failed.",
    );

    process.exitCode =
      1;
  },
);
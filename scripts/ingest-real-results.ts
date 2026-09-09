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

const MODEL_VERSION =
  "dictaziq-prematch-markets-v0.2";

const API_SOURCE =
  "api-football";

const FINAL_STATUSES =
  new Set([
    "FT",
    "AET",
    "PEN",
  ]);

function requestedDate():
  string {
  const value =
    process.argv[2]?.trim() ??
    "2026-09-09";

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

function score(
  value: number | null,
  label: string,
): number {
  assert.ok(
    Number.isInteger(value) &&
      value !== null &&
      value >= 0,
    `${label} must be a non-negative integer.`,
  );

  return value;
}

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * Restrict result ingestion to fixtures that
   * actually belong to the frozen v1 baseline.
   */
  const fixtures =
    await sql`
      SELECT DISTINCT
        fixture.id,
        fixture.slug,
        fixture.provider_id,
        fixture.kickoff_at,

        home.name
          AS home_team_name,

        away_team.name
          AS away_team_name

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

      JOIN public.predictions
        AS prediction
        ON prediction.fixture_id =
          fixture.id

      JOIN public.model_versions
        AS model
        ON model.id =
          prediction.model_version_id

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
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  assert.ok(
    fixtures.length > 0,
    `No published ${MODEL_VERSION} fixtures found for ${date}.`,
  );

  console.log(
    `Published baseline fixtures: ${fixtures.length}`,
  );

  console.log(
    `Fetching API-Football results for ${date}...`,
  );

  const page =
    await fetchFixturesByDate(
      date,
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

  let inserted = 0;
  let existing = 0;
  let pending = 0;

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

    const apiFixture =
      apiById.get(
        String(
          fixture.provider_id,
        ),
      );

    if (!apiFixture) {
      console.log(
        "SKIP: fixture not returned by API-Football.",
      );

      pending += 1;
      continue;
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
        "SKIP: fixture is not settlement-ready.",
      );

      pending += 1;
      continue;
    }

    /*
     * Settlement must use regulation/full-time
     * score, not penalty or extra-time totals.
     */
    const homeScore =
      score(
        apiFixture
          .score
          .fulltime
          .home,
        "Full-time home score",
      );

    const awayScore =
      score(
        apiFixture
          .score
          .fulltime
          .away,
        "Full-time away score",
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

      fixtureId:
        apiFixture.fixtureId,

      kickoffAt:
        apiFixture.kickoffAt,

      providerStatus: {
        ...apiFixture.status,
      },

      teams: {
        home: {
          id:
            apiFixture.home.id,

          name:
            apiFixture.home.name,
        },

        away: {
          id:
            apiFixture.away.id,

          name:
            apiFixture.away.name,
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
        goals:
          apiFixture.goals,

        fulltime:
          apiFixture
            .score
            .fulltime,

        extratime:
          apiFixture
            .score
            .extratime,

        penalty:
          apiFixture
            .score
            .penalty,
      },
    };

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

      inserted += 1;

      console.log(
        `RESULT INSERTED | ${homeScore}-${awayScore} | snapshot=${snapshotId}`,
      );
    } else {
      const existingRows =
        await sql`
          SELECT
            id,
            regulation_home_score,
            regulation_away_score,
            regulation_confirmed,
            status

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

      snapshotId =
        String(
          existingRows[0].id,
        );

      existing += 1;

      console.log(
        `RESULT EXISTING | ${homeScore}-${awayScore} | snapshot=${snapshotId}`,
      );
    }

    /*
     * Fixture table is the mutable current-state
     * read model. Settlement provenance remains
     * the immutable result snapshot.
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
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Results inserted: ${inserted}`,
  );

  console.log(
    `Results existing: ${existing}`,
  );

  console.log(
    `Not settlement-ready: ${pending}`,
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
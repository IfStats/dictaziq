import "./load-env";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

async function main() {
  const client = neon(getDatabaseUrl());

  const source = await client`
    SELECT
      fixture.id,
      fixture.season_id,
      competition.id AS competition_id,
      competition.sport_id
    FROM public.fixtures AS fixture
    JOIN public.seasons AS season
      ON season.id = fixture.season_id
    JOIN public.competitions AS competition
      ON competition.id = season.competition_id
    WHERE fixture.provider = 'demo'
      AND fixture.provider_id = 'fixture-001'
      AND fixture.is_demo = true
      AND competition.is_demo = true
  `;

  assert.equal(
    source.length,
    1,
    "The original demo fixture and competition must exist.",
  );

  const context = source[0];

  const guards = await client`
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.result_snapshots'::regclass
      AND NOT tgisinternal
      AND tgenabled IN ('O', 'A')
      AND tgname IN (
        'result_snapshots_stamp',
        'result_snapshots_immutable',
        'result_snapshots_no_truncate'
      )
  `;

  assert.equal(
    guards.length,
    3,
    "Result-snapshot triggers are missing or disabled.",
  );

  async function seedHistory() {
    // All seed writes execute together in one atomic SQL statement.
    await client`
      WITH added_teams AS (
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
        VALUES
          (
            ${context.sport_id}::uuid,
            'demo-hillcrest',
            'Hillcrest United (Demo)',
            'HIL', NULL, 'demo', 'team-003', true
          ),
          (
            ${context.sport_id}::uuid,
            'demo-eastfield',
            'Eastfield City (Demo)',
            'EAS', NULL, 'demo', 'team-004', true
          ),
          (
            ${context.sport_id}::uuid,
            'demo-westhaven',
            'Westhaven FC (Demo)',
            'WES', NULL, 'demo', 'team-005', true
          ),
          (
            ${context.sport_id}::uuid,
            'demo-southport',
            'Southport Athletic (Demo)',
            'SOU', NULL, 'demo', 'team-006', true
          )
        ON CONFLICT (provider, provider_id) DO NOTHING
        RETURNING id, provider_id
      ),
      available_teams AS (
        SELECT id, provider_id
        FROM added_teams

        UNION ALL

        SELECT id, provider_id
        FROM public.teams
        WHERE provider = 'demo'
          AND is_demo = true
          AND sport_id = ${context.sport_id}::uuid
          AND provider_id IN (
            'team-001', 'team-002', 'team-003',
            'team-004', 'team-005', 'team-006'
          )
      ),
      schedule AS (
        SELECT
          number,
          'history-v1-' || lpad(number::text, 3, '0')
            AS provider_id,
          'team-' || lpad(((number % 6) + 1)::text, 3, '0')
            AS home_provider_id,
          'team-' || lpad(
            (
              ((number % 6 + 1 + (number / 6) % 5) % 6) + 1
            )::text,
            3,
            '0'
          ) AS away_provider_id,
          '2026-07-01T15:00:00Z'::timestamptz
            + number * interval '1 day' AS kickoff_at,
          ((number * 7 + number / 6) % 4) AS home_goals,
          ((number * 5 + number / 4) % 3) AS away_goals
        FROM generate_series(0, 59) AS series(number)
      ),
      added_fixtures AS (
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
          fetched_at
        )
        SELECT
          ${context.season_id}::uuid,
          home_team.id,
          away_team.id,
          'demo-' || schedule.provider_id,
          'demo',
          schedule.provider_id,
          true,
          schedule.kickoff_at,
          'finished',
          'DEMO_FINISHED',
          schedule.home_goals,
          schedule.away_goals,
          schedule.home_goals,
          schedule.away_goals,
          true,
          clock_timestamp()
        FROM schedule
        JOIN available_teams AS home_team
          ON home_team.provider_id = schedule.home_provider_id
        JOIN available_teams AS away_team
          ON away_team.provider_id = schedule.away_provider_id
        ON CONFLICT (provider, provider_id) DO NOTHING
        RETURNING *
      ),
      history_fixtures AS (
        SELECT * FROM added_fixtures

        UNION ALL

        SELECT fixture.*
        FROM public.fixtures AS fixture
        JOIN schedule
          ON schedule.provider_id = fixture.provider_id
        WHERE fixture.provider = 'demo'
          AND fixture.is_demo = true
          AND fixture.season_id = ${context.season_id}::uuid
      )
      INSERT INTO public.result_snapshots (
        fixture_id,
        observation_key,
        is_demo,
        status,
        regulation_home_score,
        regulation_away_score,
        regulation_confirmed,
        finished_at,
        evidence
      )
      SELECT
        fixture.id,
        'demo-history-v1-initial',
        true,
        fixture.status,
        fixture.regulation_home_score,
        fixture.regulation_away_score,
        fixture.regulation_confirmed,
        fixture.kickoff_at + interval '2 hours',
        jsonb_build_object(
          'source', 'dictaziq-synthetic-history-v1',
          'test_only', true,
          'competition_id', ${context.competition_id}::text,
          'home_team_id', fixture.home_team_id,
          'away_team_id', fixture.away_team_id,
          'kickoff_at', fixture.kickoff_at,
          'finish_time_basis', 'synthetic-test-input'
        )
      FROM history_fixtures AS fixture
      ON CONFLICT (fixture_id, observation_key) DO NOTHING
    `;
  }

  async function readSnapshots() {
    return client`
      SELECT
        snapshot.id,
        snapshot.fixture_id,
        snapshot.observed_at,
        snapshot.is_demo,
        snapshot.status,
        snapshot.regulation_home_score,
        snapshot.regulation_away_score,
        snapshot.regulation_confirmed,
        snapshot.finished_at,
        snapshot.evidence
      FROM public.result_snapshots AS snapshot
      JOIN public.fixtures AS fixture
        ON fixture.id = snapshot.fixture_id
      WHERE fixture.provider = 'demo'
        AND fixture.provider_id ~ '^history-v1-[0-9]{3}$'
        AND fixture.season_id = ${context.season_id}::uuid
        AND snapshot.observation_key = 'demo-history-v1-initial'
      ORDER BY fixture.provider_id
    `;
  }

  await seedHistory();
  const first = await readSnapshots();

  assert.equal(first.length, 60, "Expected 60 historical snapshots.");

  await seedHistory();
  const second = await readSnapshots();

  assert.deepEqual(
    second,
    first,
    "Retry changed snapshot identities, contents or observation times.",
  );

  const counts = await client`
    SELECT count(*)::integer AS total
    FROM public.fixtures
    WHERE provider = 'demo'
      AND provider_id ~ '^history-v1-[0-9]{3}$'
      AND season_id = ${context.season_id}::uuid
  `;

  assert.equal(counts[0].total, 60, "Expected exactly 60 history fixtures.");

  assert.ok(
    second.every(
      (snapshot) =>
        snapshot.is_demo === true &&
        snapshot.status === "finished" &&
        snapshot.regulation_confirmed === true,
    ),
    "Historical snapshots must be confirmed demo results.",
  );

  console.log("PASS: result-snapshot triggers are installed.");
  console.log("PASS: exactly 60 demo historical fixtures exist.");
  console.log("PASS: exactly 60 initial result snapshots exist.");
  console.log("PASS: repeated seeding preserved all snapshots.");
  console.log("PASS: observation timestamps were not rewritten.");
  console.log("PASS: all historical results are explicitly demo data.");
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(`Verification failed: ${error.message}`);
  } else {
    console.error(
      "Demo history seeding failed. Check database connectivity and migrations.",
    );

    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";

    if (/^[A-Z0-9]{5}$/.test(code)) {
      console.error(`Database error code: ${code}`);
    }
  }

  process.exitCode = 1;
});
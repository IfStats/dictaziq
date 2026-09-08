import "./load-env";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

async function main() {
  const client = neon(getDatabaseUrl());

  const tables = await client`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'sports', 'competitions', 'seasons', 'teams', 'fixtures'
      )
  `;

  assert.equal(
    tables.length,
    5,
    "Expected all five application tables. Check the migration.",
  );

  console.log("PASS: all five application tables exist.");

  async function importFixture(kickoffAt: string) {
    // One SQL statement: all related writes succeed or fail together.
    // This importer is deliberately restricted to fictional demo records.
    const rows = await client`
      WITH sport AS (
        INSERT INTO sports (slug, name)
        VALUES ('football', 'Football')
        ON CONFLICT (slug)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      ),
      competition AS (
        INSERT INTO competitions (
          sport_id, slug, name, country,
          provider, provider_id, is_demo
        )
        SELECT
          id,
          'demo-football-league',
          'Demo Football League',
          NULL,
          'demo',
          'league-001',
          true
        FROM sport
        ON CONFLICT (provider, provider_id)
        DO UPDATE SET name = EXCLUDED.name
        WHERE competitions.is_demo = true
        RETURNING id
      ),
      season AS (
        INSERT INTO seasons (
          competition_id, label, start_date, end_date
        )
        SELECT id, '2026-demo', '2026-01-01', '2026-12-31'
        FROM competition
        ON CONFLICT (competition_id, label)
        DO UPDATE SET label = EXCLUDED.label
        RETURNING id
      ),
      demo_teams AS (
        INSERT INTO teams (
          sport_id, slug, name, short_name, country,
          provider, provider_id, is_demo
        )
        SELECT
          sport.id,
          team.slug,
          team.name,
          team.short_name,
          NULL,
          'demo',
          team.provider_id,
          true
        FROM sport
        CROSS JOIN (
          VALUES
            (
              'demo-northbridge',
              'Northbridge FC (Demo)',
              'NBR',
              'team-001'
            ),
            (
              'demo-riverside',
              'Riverside Athletic (Demo)',
              'RIV',
              'team-002'
            )
        ) AS team(slug, name, short_name, provider_id)
        ON CONFLICT (provider, provider_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          short_name = EXCLUDED.short_name
        WHERE teams.is_demo = true
        RETURNING id, provider_id
      )
      INSERT INTO fixtures (
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
        fetched_at
      )
      SELECT
        season.id,
        home_team.id,
        away_team.id,
        'demo-northbridge-v-riverside',
        'demo',
        'fixture-001',
        true,
        ${kickoffAt}::timestamptz,
        'scheduled',
        'DEMO_SCHEDULED',
        now()
      FROM season
      CROSS JOIN demo_teams AS home_team
      CROSS JOIN demo_teams AS away_team
      WHERE home_team.provider_id = 'team-001'
        AND away_team.provider_id = 'team-002'
      ON CONFLICT (provider, provider_id)
      DO UPDATE SET
        kickoff_at = EXCLUDED.kickoff_at,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = now()
      WHERE fixtures.is_demo = true
        AND fixtures.status = 'scheduled'
      RETURNING id, is_demo
    `;

    assert.equal(
      rows.length,
      1,
      "Demo import was blocked. An existing record may no longer be scheduled.",
    );

    return rows[0];
  }

  // Both dates are fictional test inputs, not real match information.
  const first = await importFixture("2026-09-12T18:00:00Z");
  const second = await importFixture("2026-09-12T19:00:00Z");

  assert.equal(
    first.id,
    second.id,
    "Repeated imports must preserve the fixture ID.",
  );

  const stored = await client`
    SELECT
      id,
      is_demo,
      extract(epoch FROM kickoff_at)::double precision
        AS kickoff_epoch
    FROM fixtures
    WHERE provider = 'demo'
      AND provider_id = 'fixture-001'
  `;

  assert.equal(stored.length, 1, "Duplicate demo fixtures detected.");
  assert.equal(stored[0].id, first.id);
  assert.equal(stored[0].is_demo, true);
  assert.equal(
    Number(stored[0].kickoff_epoch),
    Date.parse("2026-09-12T19:00:00Z") / 1000,
    "The updated kickoff time was not persisted.",
  );

  console.log("PASS: repeated import preserved the fixture ID.");
  console.log("PASS: exactly one demo fixture exists.");
  console.log("PASS: kickoff update persisted.");
  console.log("PASS: fixture remains explicitly marked as demo.");
  console.log(`Demo fixture ID: ${stored[0].id}`);
}

main().catch((error: unknown) => {
  // Avoid logging raw database errors or connection details.
  if (error instanceof assert.AssertionError) {
    console.error(`Verification failed: ${error.message}`);
  } else {
    console.error(
      "Demo import failed. Check database connectivity and migration status.",
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
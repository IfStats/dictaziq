import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

const RESULT_KEY = "synthetic-demo-result-v1";
const HOME_SCORE = 1;
const AWAY_SCORE = 2;

async function main() {
  const client = neon(getDatabaseUrl());

  const fixtures = await client`
    SELECT
      fixture.id,
      fixture.slug,
      fixture.home_team_id,
      fixture.away_team_id,
      fixture.kickoff_at,
      fixture.is_demo,
      competition.id AS competition_id,
      clock_timestamp() AS checked_at
    FROM public.fixtures AS fixture
    JOIN public.seasons AS season
      ON season.id = fixture.season_id
    JOIN public.competitions AS competition
      ON competition.id = season.competition_id
    WHERE fixture.provider = 'demo'
      AND fixture.provider_id = 'fixture-001'
      AND fixture.is_demo = true
  `;

  assert.equal(
    fixtures.length,
    1,
    "Demo fixture fixture-001 is missing.",
  );

  const fixture = fixtures[0];

  assert.ok(
    fixture.kickoff_at,
    "Demo fixture kickoff is missing.",
  );

  const kickoff = new Date(String(fixture.kickoff_at));
  const checkedAt = new Date(String(fixture.checked_at));

  assert.ok(
    Number.isFinite(kickoff.getTime()),
    "Fixture kickoff timestamp is invalid.",
  );

  assert.ok(
    Number.isFinite(checkedAt.getTime()),
    "Database clock timestamp is invalid.",
  );

  /*
   * Never manufacture post-match evidence before the fixture's
   * prediction-time kickoff.
   */
  assert.ok(
    checkedAt.getTime() >= kickoff.getTime(),
    `Demo fixture has not kicked off yet. Kickoff: ${kickoff.toISOString()}`,
  );

  await client`
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
      ${fixture.id}::uuid,
      ${RESULT_KEY},
      true,
      'finished',
      ${HOME_SCORE},
      ${AWAY_SCORE},
      true,
      NULL,
      NULL,
      ${JSON.stringify({
        kind: "synthetic_demo_result",
        synthetic: true,
        fixture_id: fixture.id,
        competition_id: fixture.competition_id,
        home_team_id: fixture.home_team_id,
        away_team_id: fixture.away_team_id,
        regulation_home_score: HOME_SCORE,
        regulation_away_score: AWAY_SCORE,
        note:
          "Synthetic result used only to verify DictazIQ publication, result ingestion and settlement.",
      })}::jsonb
    )
    ON CONFLICT (
      fixture_id,
      observation_key
    )
    DO NOTHING
  `;

  const snapshots = await client`
    SELECT
      id,
      fixture_id,
      observation_key,
      status,
      regulation_home_score,
      regulation_away_score,
      regulation_confirmed,
      observed_at,
      evidence
    FROM public.result_snapshots
    WHERE fixture_id = ${fixture.id}::uuid
      AND observation_key = ${RESULT_KEY}
  `;

  assert.equal(
    snapshots.length,
    1,
    "Synthetic result snapshot was not stored.",
  );

  const snapshot = snapshots[0];

  assert.equal(snapshot.status, "finished");
  assert.equal(snapshot.regulation_home_score, HOME_SCORE);
  assert.equal(snapshot.regulation_away_score, AWAY_SCORE);
  assert.equal(snapshot.regulation_confirmed, true);

  const observedAt = new Date(String(snapshot.observed_at));

  assert.ok(
    observedAt.getTime() >= kickoff.getTime(),
    "Result snapshot was observed before fixture kickoff.",
  );

  /*
   * Fixture is the mutable current-state/read model.
   * result_snapshots remains the immutable settlement evidence.
   */
  await client`
    UPDATE public.fixtures
    SET
      status = 'finished',
      home_score = ${HOME_SCORE},
      away_score = ${AWAY_SCORE},
      regulation_home_score = ${HOME_SCORE},
      regulation_away_score = ${AWAY_SCORE},
      regulation_confirmed = true,
      updated_at = clock_timestamp()
    WHERE id = ${fixture.id}::uuid
  `;

  console.log("PASS: fixture kickoff has occurred.");
  console.log("PASS: synthetic finished result imported.");
  console.log("PASS: immutable result snapshot verified.");
  console.log("PASS: fixture current-state score updated.");

  console.log("");
  console.log(`Fixture: ${fixture.slug}`);
  console.log(`Regulation result: ${HOME_SCORE}-${AWAY_SCORE}`);
  console.log(`Result Snapshot ID: ${snapshot.id}`);
  console.log(`Observed at: ${snapshot.observed_at}`);

  console.log("");
  console.log(
    "WARNING: synthetic result for pipeline verification only; not model performance evidence.",
  );
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(`Result import blocked: ${error.message}`);
  } else {
    console.error(
      error instanceof Error
        ? `Result import failed: ${error.message}`
        : "Result import failed.",
    );
  }

  process.exitCode = 1;
});
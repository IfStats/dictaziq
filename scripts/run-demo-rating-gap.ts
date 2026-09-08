import "./load-env";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";
import { evaluateRatingGap } from "../src/lib/predictions/rating-gap";

const SOURCE = "footballdatabase";
const SNAPSHOT_DATE = "2026-09-07";

const HOME_RATING = 1550;
const AWAY_RATING = 1750;

type RatingRow = {
  id: string;
  team_id: string;
  source: string;
  snapshot_date: string;
  rating: number;
  observed_at: string | Date;
};

async function main() {
  const client = neon(getDatabaseUrl());

  const fixtures = await client`
    SELECT
      fixture.id,
      fixture.slug,

      home_team.id AS home_team_id,
      home_team.name AS home_team_name,
      home_team.provider_id AS home_team_provider_id,
      home_team.is_demo AS home_team_is_demo,

      away_team.id AS away_team_id,
      away_team.name AS away_team_name,
      away_team.provider_id AS away_team_provider_id,
      away_team.is_demo AS away_team_is_demo

    FROM public.fixtures AS fixture

    JOIN public.teams AS home_team
      ON home_team.id = fixture.home_team_id

    JOIN public.teams AS away_team
      ON away_team.id = fixture.away_team_id

    WHERE fixture.provider = 'demo'
      AND fixture.provider_id = 'fixture-001'
      AND fixture.is_demo = true
  `;

  assert.equal(
    fixtures.length,
    1,
    "Demo fixture fixture-001 was not found.",
  );

  const fixture = fixtures[0];

  assert.equal(
    fixture.home_team_is_demo,
    true,
    "Demo fixture home team must be demo data.",
  );

  assert.equal(
    fixture.away_team_is_demo,
    true,
    "Demo fixture away team must be demo data.",
  );

  async function storeRating(params: {
    teamId: string;
    sourceTeamId: string;
    rating: number;
    role: "home" | "away";
  }) {
    await client`
      INSERT INTO public.team_rating_snapshots (
        team_id,
        source,
        source_team_id,
        snapshot_date,
        rating,
        ranking_position,
        is_demo,
        evidence
      )
      VALUES (
        ${params.teamId}::uuid,
        ${SOURCE},
        ${params.sourceTeamId},
        ${SNAPSHOT_DATE}::date,
        ${params.rating},
        NULL,
        true,
        ${JSON.stringify({
          kind: "synthetic_demo_rating",
          fixture_id: fixture.id,
          role: params.role,
          source: SOURCE,
          synthetic: true,
          note:
            "Synthetic rating used only to verify the DictazIQ rating-gap pipeline.",
        })}::jsonb
      )
      ON CONFLICT (
        team_id,
        source,
        snapshot_date
      ) DO NOTHING
    `;

    const rows = await client`
      SELECT
        id,
        team_id,
        source,
        snapshot_date,
        rating,
        observed_at
      FROM public.team_rating_snapshots
      WHERE team_id = ${params.teamId}::uuid
        AND source = ${SOURCE}
        AND snapshot_date = ${SNAPSHOT_DATE}::date
    `;

    assert.equal(
      rows.length,
      1,
      `Expected exactly one ${params.role} rating snapshot.`,
    );

    const row = rows[0] as RatingRow;

    assert.equal(
      row.rating,
      params.rating,
      `${params.role} rating already exists with a different value. Historical snapshots must not be overwritten.`,
    );

    return row;
  }

  const homeSnapshot = await storeRating({
    teamId: String(fixture.home_team_id),
    sourceTeamId: String(fixture.home_team_provider_id),
    rating: HOME_RATING,
    role: "home",
  });

  const awaySnapshot = await storeRating({
    teamId: String(fixture.away_team_id),
    sourceTeamId: String(fixture.away_team_provider_id),
    rating: AWAY_RATING,
    role: "away",
  });

  const result = evaluateRatingGap({
    home: {
      rating: homeSnapshot.rating,
      source: homeSnapshot.source,
      snapshotDate: dateOnly(homeSnapshot.snapshot_date),
    },
    away: {
      rating: awaySnapshot.rating,
      source: awaySnapshot.source,
      snapshotDate: dateOnly(awaySnapshot.snapshot_date),
    },
  });

  assert.equal(result.ratingGap, -200);
  assert.equal(result.absoluteGap, 200);
  assert.equal(result.higherRatedTeam, "away");
  assert.equal(
    result.signal,
    "strong_win_over_2_5",
  );
  assert.equal(
    result.standaloneSelection,
    "away",
  );
  assert.equal(result.over25Signal, true);
  assert.equal(result.requiresContext, false);

  console.log("PASS: weekly home rating stored.");
  console.log("PASS: weekly away rating stored.");
  console.log("PASS: ratings loaded back from Neon.");
  console.log("PASS: identical source/date requirement satisfied.");
  console.log("PASS: rating-gap-v0.1 evaluated database snapshots.");

  console.log("");
  console.log(`Fixture: ${fixture.slug}`);
  console.log(
    `Home: ${fixture.home_team_name} = ${homeSnapshot.rating}`,
  );
  console.log(
    `Away: ${fixture.away_team_name} = ${awaySnapshot.rating}`,
  );
  console.log("");

  console.log(
    `D = ${homeSnapshot.rating} - ${awaySnapshot.rating} = ${result.ratingGap}`,
  );

  console.log(
    `Absolute gap: ${result.absoluteGap}`,
  );

  console.log(
    `Higher-rated team: ${result.higherRatedTeam}`,
  );

  console.log(
    `Primary signal: ${result.signal}`,
  );

  console.log(
    `Standalone selection: ${result.standaloneSelection}`,
  );

  console.log(
    `Over 2.5 signal: ${result.over25Signal}`,
  );

  console.log(
    `Requires additional context: ${result.requiresContext}`,
  );

  console.log("");
  console.log(
    "WARNING: synthetic experimental data; this is not performance evidence.",
  );
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(`Verification failed: ${error.message}`);
  } else {
    console.error(
      error instanceof Error
        ? `Rating-gap demo failed: ${error.message}`
        : "Rating-gap demo failed.",
    );
  }

  process.exitCode = 1;
});

function dateOnly(value: unknown): string {
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);

    if (match) {
      return match[1];
    }
  }

  if (value instanceof Date) {
    assert.ok(
      Number.isFinite(value.getTime()),
      "Database returned an invalid rating snapshot date.",
    );

    return value.toISOString().slice(0, 10);
  }

  const parsed = new Date(String(value));

  assert.ok(
    Number.isFinite(parsed.getTime()),
    "Database returned an invalid rating snapshot date.",
  );

  return parsed.toISOString().slice(0, 10);
}
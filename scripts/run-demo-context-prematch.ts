import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";

import {
  evaluatePreMatchDecision,
} from "../src/lib/predictions/prematch-decision";

import type {
  ContextFactor,
} from "../src/lib/predictions/context-analysis";

const SOURCE =
  "synthetic-context-demo";

const SNAPSHOT_DATE =
  "2026-09-07";

const HOME_RATING = 1525;
const AWAY_RATING = 1500;

function dateOnly(
  value: unknown,
): string {
  if (typeof value === "string") {
    const match =
      /^(\d{4}-\d{2}-\d{2})/.exec(
        value,
      );

    if (match) {
      return match[1];
    }
  }

  const parsed =
    new Date(String(value));

  assert.ok(
    Number.isFinite(
      parsed.getTime(),
    ),
    "Invalid database date.",
  );

  return parsed
    .toISOString()
    .slice(0, 10);
}

function iso(
  value: unknown,
): string {
  const parsed =
    new Date(String(value));

  assert.ok(
    Number.isFinite(
      parsed.getTime(),
    ),
    "Invalid database timestamp.",
  );

  return parsed.toISOString();
}

async function main() {
  const client =
    neon(getDatabaseUrl());

  const fixtures = await client`
    SELECT
      fixture.id,
      fixture.slug,
      fixture.home_team_id,
      fixture.away_team_id,
      fixture.kickoff_at,
      fixture.is_demo,

      home_team.name
        AS home_team_name,

      away_team.name
        AS away_team_name,

      home_team.provider_id
        AS home_provider_id,

      away_team.provider_id
        AS away_provider_id,

      clock_timestamp()
        AS checked_at

    FROM public.fixtures
      AS fixture

    JOIN public.teams
      AS home_team
      ON home_team.id =
        fixture.home_team_id

    JOIN public.teams
      AS away_team
      ON away_team.id =
        fixture.away_team_id

    WHERE fixture.provider =
      'demo'

      AND fixture.provider_id =
        'fixture-001'

      AND fixture.is_demo = true
  `;

  assert.equal(
    fixtures.length,
    1,
    "Demo fixture fixture-001 is missing.",
  );

  const fixture =
    fixtures[0];

  const kickoff =
    new Date(
      String(
        fixture.kickoff_at,
      ),
    );

  const checkedAt =
    new Date(
      String(
        fixture.checked_at,
      ),
    );

  assert.ok(
    checkedAt.getTime() <
      kickoff.getTime(),
    "5-49 demo must run before kickoff.",
  );

  async function storeRating(
    params: {
      teamId: string;
      sourceTeamId: string;
      rating: number;
      role: "home" | "away";
    },
  ) {
    await client`
      INSERT INTO
        public.team_rating_snapshots (
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
          synthetic: true,
          kind:
            "context-band-demo-rating",
          role: params.role,
          note:
            "Synthetic rating used only to verify the DictazIQ 5-49 context route.",
        })}::jsonb
      )
      ON CONFLICT (
        team_id,
        source,
        snapshot_date
      )
      DO NOTHING
    `;

    const rows =
      await client`
        SELECT
          id,
          team_id,
          source,
          snapshot_date,
          rating,
          observed_at

        FROM
          public.team_rating_snapshots

        WHERE team_id =
          ${params.teamId}::uuid

          AND source =
            ${SOURCE}

          AND snapshot_date =
            ${SNAPSHOT_DATE}::date
      `;

    assert.equal(
      rows.length,
      1,
      `Missing ${params.role} rating snapshot.`,
    );

    assert.equal(
      Number(rows[0].rating),
      params.rating,
      `${params.role} synthetic rating already exists with another value.`,
    );

    return rows[0];
  }

  const homeRating =
    await storeRating({
      teamId:
        String(
          fixture.home_team_id,
        ),

      sourceTeamId:
        String(
          fixture.home_provider_id,
        ),

      rating:
        HOME_RATING,

      role:
        "home",
    });

  const awayRating =
    await storeRating({
      teamId:
        String(
          fixture.away_team_id,
        ),

      sourceTeamId:
        String(
          fixture.away_provider_id,
        ),

      rating:
        AWAY_RATING,

      role:
        "away",
    });

  /*
   * Only evidence already captured before this
   * decision cutoff is eligible.
   */
  const contextRows =
    await client`
      SELECT
        id,
        kind,
        side,
        description,
        source,
        source_evidence_id,
        evidence_sha256,
        observed_at,
        captured_at

      FROM
        public.context_evidence_snapshots

      WHERE fixture_id =
        ${fixture.id}::uuid

        AND is_demo = true

        AND observed_at <=
          ${checkedAt.toISOString()}::timestamptz

        AND captured_at <=
          ${checkedAt.toISOString()}::timestamptz

      ORDER BY
        observed_at,
        id
    `;

  assert.equal(
    contextRows.length,
    4,
    "Expected four verified context records.",
  );

  const factors:
    ContextFactor[] =
      contextRows.map(
        (row) => ({
          kind:
            String(
              row.kind,
            ) as ContextFactor["kind"],

          side:
            String(
              row.side,
            ) as ContextFactor["side"],

          description:
            String(
              row.description,
            ),

          source:
            String(
              row.source,
            ),

          observedAt:
            iso(
              row.observed_at,
            ),
        }),
      );

  const decision =
    evaluatePreMatchDecision({
      ratings: {
        home: {
          rating:
            Number(
              homeRating.rating,
            ),

          source:
            String(
              homeRating.source,
            ),

          snapshotDate:
            dateOnly(
              homeRating.snapshot_date,
            ),
        },

        away: {
          rating:
            Number(
              awayRating.rating,
            ),

          source:
            String(
              awayRating.source,
            ),

          snapshotDate:
            dateOnly(
              awayRating.snapshot_date,
            ),
        },
      },

      context: {
        cutoffAt:
          checkedAt.toISOString(),

        kickoffAt:
          kickoff.toISOString(),

        factors,
      },
    });

  assert.equal(
    decision.ratingGap.ratingGap,
    25,
  );

  assert.equal(
    decision.ratingGap.absoluteGap,
    25,
  );

  assert.equal(
    decision.ratingGap.signal,
    "context_required",
  );

  assert.equal(
    decision.route,
    "rating_gap_plus_context",
  );

  assert.equal(
    decision.contextRequired,
    true,
  );

  assert.equal(
    decision.contextResolved,
    true,
  );

  assert.ok(
    decision.context,
    "Context result is missing.",
  );

  assert.equal(
    decision.context.homeSupport,
    3,
  );

  assert.equal(
    decision.context.awaySupport,
    0,
  );

  assert.equal(
    decision.context.neutralFactors,
    1,
  );

  assert.equal(
    decision.context.decision,
    "home_lean",
  );

  assert.equal(
    decision.finalSelection,
    "home",
  );

  assert.equal(
    decision.over25Signal,
    false,
  );

  assert.equal(
    decision.calibratedProbability,
    null,
  );

  console.log(
    "PASS: separate synthetic rating snapshots loaded.",
  );

  console.log(
    "PASS: D = +25 entered the 5-49 context band.",
  );

  console.log(
    "PASS: immutable context evidence loaded from Neon.",
  );

  console.log(
    "PASS: only evidence available before decision cutoff was used.",
  );

  console.log(
    "PASS: 3 home + 1 neutral context resolved to home_lean.",
  );

  console.log(
    "PASS: no probability was fabricated.",
  );

  console.log("");

  console.log(
    `Fixture: ${fixture.slug}`,
  );

  console.log(
    `Home: ${fixture.home_team_name} = ${HOME_RATING}`,
  );

  console.log(
    `Away: ${fixture.away_team_name} = ${AWAY_RATING}`,
  );

  console.log("");

  console.log(
    `D = ${HOME_RATING} - ${AWAY_RATING} = ${decision.ratingGap.ratingGap}`,
  );

  console.log(
    `Rating signal: ${decision.ratingGap.signal}`,
  );

  console.log(
    `Route: ${decision.route}`,
  );

  console.log(
    `Context support: home=${decision.context.homeSupport}, away=${decision.context.awaySupport}, neutral=${decision.context.neutralFactors}`,
  );

  console.log(
    `Context decision: ${decision.context.decision}`,
  );

  console.log(
    `Final selection: ${decision.finalSelection}`,
  );

  console.log("");

  console.log(
    "WARNING: entirely synthetic demo evidence; this verifies routing, not predictive performance.",
  );
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `5-49 demo verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `5-49 demo failed: ${error.message}`
          : "5-49 demo failed.",
      );
    }

    process.exitCode = 1;
  },
);
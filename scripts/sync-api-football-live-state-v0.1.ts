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
  isApiFootballRegulationFinal,
  mapApiFootballFixtureStatus,
} from "../src/providers/api-football/fixture-status";

const API_SOURCE =
  "api-football";

const WORKER_VERSION =
  "dictaziq-api-football-live-state-v0.1";

type LiveUpdate = {
  providerId: string;

  kickoffAt: string;

  status:
    | "scheduled"
    | "live"
    | "halftime"
    | "finished"
    | "postponed"
    | "cancelled"
    | "suspended"
    | "abandoned"
    | "awarded"
    | "unknown";

  providerStatus: string;

  homeScore:
    number |
    null;

  awayScore:
    number |
    null;

  regulationHomeScore:
    number |
    null;

  regulationAwayScore:
    number |
    null;

  regulationConfirmed:
    boolean;

  elapsed:
    number |
    null;

  homeName: string;

  awayName: string;
};

function requestedDate():
string {
  const argument =
    process.argv[2]
      ?.trim();

  const value =
    argument ||
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

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ API-Football Live State Sync",
  );

  console.log(
    `Version: ${WORKER_VERSION}`,
  );

  console.log(
    `Date: ${date}`,
  );

  console.log("");

  const page =
    await fetchFixturesByDate(
      date,
    );

  console.log(
    `API-Football fixtures received: ${page.fixtures.length}`,
  );

  const updates:
    LiveUpdate[] =
    page.fixtures.map(
      (
        fixture,
      ) => {
        const status =
          mapApiFootballFixtureStatus(
            fixture.status.short,
          );

        const regulationFinal =
          isApiFootballRegulationFinal(
            fixture.status.short,
          );

        const regulationHomeScore =
          regulationFinal
            ? fixture.score
                .fulltime
                .home
            : null;

        const regulationAwayScore =
          regulationFinal
            ? fixture.score
                .fulltime
                .away
            : null;

        const regulationConfirmed =
          regulationFinal &&
          regulationHomeScore !==
            null &&
          regulationAwayScore !==
            null;

        return {
          providerId:
            String(
              fixture.fixtureId,
            ),

          kickoffAt:
            fixture.kickoffAt,

          status,

          providerStatus:
            fixture.status.short,

          homeScore:
            fixture.goals.home,

          awayScore:
            fixture.goals.away,

          regulationHomeScore,

          regulationAwayScore,

          regulationConfirmed,

          elapsed:
            fixture.status.elapsed,

          homeName:
            fixture.home.name,

          awayName:
            fixture.away.name,
        };
      },
    );

  assert.equal(
    updates.length,
    page.fixtures.length,
    "Live update normalization lost fixtures.",
  );

  if (
    updates.length ===
    0
  ) {
    console.log(
      "No API-Football fixtures returned.",
    );

    return;
  }

  const payload =
    JSON.stringify(
      updates.map(
        (
          update,
        ) => ({
          provider_id:
            update.providerId,

          kickoff_at:
            update.kickoffAt,

          status:
            update.status,

          provider_status:
            update.providerStatus,

          home_score:
            update.homeScore,

          away_score:
            update.awayScore,

          regulation_home_score:
            update.regulationHomeScore,

          regulation_away_score:
            update.regulationAwayScore,

          regulation_confirmed:
            update.regulationConfirmed,
        }),
      ),
    );

  /*
   * IMPORTANT:
   *
   * This operation only mutates the current
   * fixture state.
   *
   * It does not update predictions,
   * prediction inputs, forecast revisions,
   * model versions or evidence snapshots.
   */
  const rows =
    await sql`
      WITH incoming AS (
        SELECT *

        FROM jsonb_to_recordset(
          ${payload}::jsonb
        ) AS live_row (
          provider_id text,
          kickoff_at timestamptz,
          status text,
          provider_status text,
          home_score integer,
          away_score integer,
          regulation_home_score integer,
          regulation_away_score integer,
          regulation_confirmed boolean
        )
      ),

      updated AS (
        UPDATE public.fixtures
          AS fixture

        SET
          kickoff_at =
            incoming.kickoff_at,

          status =
            incoming.status
              ::fixture_status,

          provider_status =
            incoming.provider_status,

          home_score =
            COALESCE(
              incoming.home_score,
              fixture.home_score
            ),

          away_score =
            COALESCE(
              incoming.away_score,
              fixture.away_score
            ),

          regulation_home_score =
            CASE
              WHEN
                incoming.regulation_confirmed
              THEN
                incoming.regulation_home_score

              ELSE
                fixture.regulation_home_score
            END,

          regulation_away_score =
            CASE
              WHEN
                incoming.regulation_confirmed
              THEN
                incoming.regulation_away_score

              ELSE
                fixture.regulation_away_score
            END,

          regulation_confirmed =
            (
              fixture.regulation_confirmed
              OR
              incoming.regulation_confirmed
            ),

          fetched_at =
            clock_timestamp(),

          updated_at =
            clock_timestamp()

        FROM incoming

        WHERE
          fixture.provider =
            ${API_SOURCE}

          AND fixture.provider_id =
            incoming.provider_id

          AND fixture.is_demo =
            false

          /*
           * Do not allow an already terminal
           * result to regress back into a
           * prematch/live state because of a
           * stale provider response.
           */
          AND NOT (
            fixture.status
              IN (
                'finished',
                'cancelled',
                'abandoned',
                'awarded'
              )

            AND incoming.status
              IN (
                'scheduled',
                'live',
                'halftime',
                'unknown'
              )
          )

        RETURNING
          fixture.id,
          fixture.provider_id,
          fixture.slug,
          fixture.status,
          fixture.provider_status,
          fixture.home_score,
          fixture.away_score,
          fixture.regulation_home_score,
          fixture.regulation_away_score,
          fixture.regulation_confirmed
      )

      SELECT *
      FROM updated

      ORDER BY
        provider_id::bigint
    `;

  const updatedProviderIds =
    new Set(
      rows.map(
        (
          row,
        ) =>
          String(
            row.provider_id,
          ),
      ),
    );

  const persistedUpdates =
    updates.filter(
      (
        update,
      ) =>
        updatedProviderIds.has(
          update.providerId,
        ),
    );

  const liveCount =
    persistedUpdates.filter(
      (
        update,
      ) =>
        update.status ===
          "live" ||
        update.status ===
          "halftime",
    ).length;

  const finishedCount =
    persistedUpdates.filter(
      (
        update,
      ) =>
        update.status ===
        "finished",
    ).length;

  const scheduledCount =
    persistedUpdates.filter(
      (
        update,
      ) =>
        update.status ===
        "scheduled",
    ).length;

  console.log(
    `Persisted fixtures updated: ${rows.length}`,
  );

  console.log(
    `Live / halftime: ${liveCount}`,
  );

  console.log(
    `Finished: ${finishedCount}`,
  );

  console.log(
    `Scheduled: ${scheduledCount}`,
  );

  console.log("");

  const interesting =
    persistedUpdates.filter(
      (
        update,
      ) =>
        update.status ===
          "live" ||
        update.status ===
          "halftime" ||
        update.status ===
          "finished",
    );

  if (
    interesting.length >
    0
  ) {
    console.log(
      "Current active / finished fixtures:",
    );

    console.log("");

    for (
      const update
      of interesting.slice(
        0,
        30,
      )
    ) {
      const score =
        update.homeScore !==
          null &&
        update.awayScore !==
          null
          ? `${update.homeScore}-${update.awayScore}`
          : "-";

      const minute =
        update.elapsed !==
        null
          ? `${update.elapsed}'`
          : "-";

      console.log(
        [
          update.providerId,
          update.status,
          update.providerStatus,
          minute,
          score,
          update.homeName,
          "vs",
          update.awayName,
        ].join(
          " | ",
        ),
      );
    }

    if (
      interesting.length >
      30
    ) {
      console.log(
        `... ${interesting.length - 30} additional active/finished fixtures.`,
      );
    }
  }

  console.log("");

  console.log(
    "PASS: mutable fixture state synchronized.",
  );

  console.log(
    "PASS: frozen prediction records were not modified.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? `Live-state sync failed: ${error.message}`
        : "Live-state sync failed.",
    );

    process.exitCode =
      1;
  },
);
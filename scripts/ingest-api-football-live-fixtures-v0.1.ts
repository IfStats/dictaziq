import "./load-env";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  fetchLiveFixtures,
} from "../src/providers/api-football/client";

import type {
  NormalizedApiFootballFixture,
} from "../src/providers/api-football/types";

const INGESTION_VERSION =
  "dictaziq-api-football-live-fixtures-v0.1";

const API_SOURCE =
  "api-football";

type CanonicalFixtureStatus =
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

function canonicalStatus(
  providerStatus: string,
): CanonicalFixtureStatus {
  switch (
    providerStatus
  ) {
    case "TBD":
    case "NS":
      return "scheduled";

    case "1H":
    case "2H":
    case "ET":
    case "BT":
    case "INT":
    case "LIVE":
      return "live";

    case "HT":
      return "halftime";

    case "FT":
    case "AET":
    case "PEN":
      return "finished";

    case "PST":
      return "postponed";

    case "CANC":
      return "cancelled";

    case "SUSP":
      return "suspended";

    case "ABD":
      return "abandoned";

    case "AWD":
    case "WO":
      return "awarded";

    default:
      return "unknown";
  }
}

function fixturePayload(
  fixture:
    NormalizedApiFootballFixture,
) {
  return {
    provider_id:
      String(
        fixture.fixtureId,
      ),

    status:
      canonicalStatus(
        fixture.status.short,
      ),

    provider_status:
      fixture.status.short,

    provider_status_long:
      fixture.status.long,

    elapsed:
      fixture.status.elapsed,

    home_score:
      fixture.goals.home,

    away_score:
      fixture.goals.away,
  };
}

async function main() {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Live Fixture Ingestion",
  );

  console.log(
    `Version: ${INGESTION_VERSION}`,
  );

  console.log("");
  console.log(
    "Fetching live API-Football fixtures...",
  );

  const liveFixtures =
    await fetchLiveFixtures();

  console.log(
    `Provider live fixtures: ${liveFixtures.length}`,
  );

  if (
    liveFixtures.length ===
    0
  ) {
    console.log(
      "No live fixtures returned.",
    );

    return;
  }

  const payload =
    liveFixtures.map(
      fixturePayload,
    );

  const providerIds =
    payload.map(
      (
        fixture,
      ) =>
        fixture.provider_id,
    );

  const knownRows =
    await sql`
      WITH wanted AS (
        SELECT
          value::text
            AS provider_id

        FROM jsonb_array_elements_text(
          ${JSON.stringify(
            providerIds,
          )}::jsonb
        )
      )

      SELECT
        fixture.id,
        fixture.provider_id,
        fixture.slug,
        fixture.status,
        fixture.home_score,
        fixture.away_score

      FROM public.fixtures
        AS fixture

      JOIN wanted
        ON wanted.provider_id =
          fixture.provider_id

      WHERE
        fixture.provider =
          ${API_SOURCE}

        AND fixture.is_demo =
          false
    `;

  const knownIds =
    new Set(
      knownRows.map(
        (
          row,
        ) =>
          String(
            row.provider_id,
          ),
      ),
    );

  const knownPayload =
    payload.filter(
      (
        fixture,
      ) =>
        knownIds.has(
          fixture.provider_id,
        ),
    );

  const unknownPayload =
    payload.filter(
      (
        fixture,
      ) =>
        !knownIds.has(
          fixture.provider_id,
        ),
    );

  console.log(
    `Known DictazIQ fixtures: ${knownPayload.length}`,
  );

  console.log(
    `Unknown provider fixtures skipped: ${unknownPayload.length}`,
  );

  if (
    unknownPayload.length >
    0
  ) {
    console.log("");
    console.log(
      "Skipped provider fixture IDs:",
    );

    console.log(
      unknownPayload
        .map(
          (
            fixture,
          ) =>
            fixture.provider_id,
        )
        .join(", "),
    );
  }

  if (
    knownPayload.length ===
    0
  ) {
    console.log("");
    console.log(
      "No known live fixtures require updating.",
    );

    return;
  }

  const updatedRows =
    await sql`
      WITH incoming AS (
        SELECT
          input.provider_id,
          input.status,
          input.provider_status,
          input.provider_status_long,
          input.elapsed,
          input.home_score,
          input.away_score

        FROM jsonb_to_recordset(
          ${JSON.stringify(
            knownPayload,
          )}::jsonb
        )
        AS input(
          provider_id text,
          status text,
          provider_status text,
          provider_status_long text,
          elapsed integer,
          home_score integer,
          away_score integer
        )
      )

      UPDATE public.fixtures
        AS fixture

      SET
        status =
          incoming.status
          ::fixture_status,

        provider_status =
          incoming.provider_status,

        provider_elapsed =
           incoming.elapsed,

        home_score =
          incoming.home_score,

        away_score =
          incoming.away_score,

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

      RETURNING
        fixture.id,
        fixture.provider_id,
        fixture.slug,
        fixture.status,
        fixture.home_score,
        fixture.away_score
    `;

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "LIVE INGESTION SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Provider live fixtures: ${liveFixtures.length}`,
  );

  console.log(
    `Known fixtures updated: ${updatedRows.length}`,
  );

  console.log(
    `Unknown fixtures skipped: ${unknownPayload.length}`,
  );

  console.log(
    "PASS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error("");
    console.error(
      "Live fixture ingestion failed:",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
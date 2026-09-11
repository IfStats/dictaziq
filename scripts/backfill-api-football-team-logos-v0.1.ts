import "./load-env";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const VERSION =
  "dictaziq-api-football-team-logo-backfill-v0.1";

async function main() {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ API-Football Team Logo Backfill",
  );

  console.log(
    `Version: ${VERSION}`,
  );

  const nativeRows =
    await sql`
      UPDATE public.teams
        AS team

      SET
        logo_url =
          'https://media.api-sports.io/football/teams/'
          || team.provider_id
          || '.png'

      WHERE
        team.is_demo =
          false

        AND team.provider =
          'api-football'

        AND team.provider_id ~
          '^[0-9]+$'

        AND team.logo_url IS DISTINCT FROM (
          'https://media.api-sports.io/football/teams/'
          || team.provider_id
          || '.png'
        )

      RETURNING
        team.id
    `;

  const mappedRows =
    await sql`
      UPDATE public.teams
        AS team

      SET
        logo_url =
          'https://media.api-sports.io/football/teams/'
          || mapping.source_team_id
          || '.png'

      FROM public.team_source_mappings
        AS mapping

      WHERE
        mapping.team_id =
          team.id

        AND team.is_demo =
          false

        AND mapping.source =
          'api-football'

        AND mapping.is_verified =
          true

        AND mapping.source_team_id ~
          '^[0-9]+$'

        AND team.logo_url IS DISTINCT FROM (
          'https://media.api-sports.io/football/teams/'
          || mapping.source_team_id
          || '.png'
        )

      RETURNING
        team.id
    `;

  const countRows =
    await sql`
      SELECT
        COUNT(*)::integer
          AS total,

        COUNT(*) FILTER (
          WHERE logo_url
            IS NOT NULL
        )::integer
          AS with_logo

      FROM public.teams

      WHERE is_demo =
        false
    `;

  console.log(
    `Provider-native logos written: ${nativeRows.length}`,
  );

  console.log(
    `Verified-mapping logos written: ${mappedRows.length}`,
  );

  console.log(
    `Non-demo teams: ${String(
      countRows[0]?.total ?? 0,
    )}`,
  );

  console.log(
    `Teams with logos: ${String(
      countRows[0]?.with_logo ?? 0,
    )}`,
  );

  console.log(
    "PASS: existing API-Football identities now have persisted crest URLs.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? `Team-logo backfill failed: ${error.message}`
        : "Team-logo backfill failed.",
    );

    process.exitCode =
      1;
  },
);

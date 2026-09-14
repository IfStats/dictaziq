import "./load-env";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  fetchFixtureLineups,
} from "../src/providers/api-football/client";

import {
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

const VERSION =
  "dictaziq-prematch-lineup-ingestion-v0.1";

const SOURCE =
  "api-football";

const CONTRACT_VERSION =
  "dictaziq-confirmed-lineup-v0.1";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

type QueryRow =
  Record<
    string,
    unknown
  >;

type Config = {
  batchId: string;
  missingOnly: boolean;
  dryRun: boolean;
};

function parseConfig(): Config {
  const batchArg =
    process.argv.find(
      (
        value,
      ) =>
        value.startsWith(
          "--batch-id=",
        ),
    );

  if (!batchArg) {
    throw new Error(
      "--batch-id=<uuid> is required.",
    );
  }

  const batchId =
    batchArg
      .slice(
        "--batch-id=".length,
      )
      .trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      batchId,
    )
  ) {
    throw new Error(
      "--batch-id must be a valid UUID.",
    );
  }

  return {
    batchId,
    missingOnly:
      process.argv.includes(
        "--missing-only",
      ),
    dryRun:
      process.argv.includes(
        "--dry-run",
      ),
  };
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  const result =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      result,
    ) ||
    result <= 0
  ) {
    throw new Error(
      `${label} must be a positive integer.`,
    );
  }

  return result;
}

function timestamp(
  value: unknown,
  label: string,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(
          String(
            value,
          ),
        );

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return date.toISOString();
}

async function existingConfirmedSides(
  sql: SqlClient,
  fixtureId: string,
): Promise<Set<string>> {
  const rows =
    await sql`
      SELECT DISTINCT
        side

      FROM public.context_evidence_snapshots

      WHERE
        fixture_id =
          ${fixtureId}::uuid

        AND is_demo =
          false

        AND source =
          ${SOURCE}

        AND kind =
          'squad_availability'

        AND evidence
          #>> '{evidenceType}' =
          'confirmed_lineup'
    ` as QueryRow[];

  return new Set(
    rows.map(
      (
        row,
      ) =>
        String(
          row.side,
        ),
    ),
  );
}

async function main(): Promise<void> {
  const config =
    parseConfig();

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Prematch Lineup Ingestion",
  );
  console.log(
    `Version: ${VERSION}`,
  );
  console.log(
    `Batch: ${config.batchId}`,
  );
  console.log(
    `Missing only: ${config.missingOnly ? "YES" : "NO"}`,
  );
  console.log(
    `Dry run: ${config.dryRun ? "YES" : "NO"}`,
  );

  const fixtures =
    await sql`
      SELECT
        fixture.id::text
          AS fixture_id,

        fixture.provider_id,
        fixture.kickoff_at,

        home.id::text
          AS home_team_id,

        home.name
          AS home_team_name,

        CASE
          WHEN
            home.provider =
              ${SOURCE}
          THEN home.provider_id
          ELSE home_map.source_team_id
        END
          AS home_provider_team_id,

        away_team.id::text
          AS away_team_id,

        away_team.name
          AS away_team_name,

        CASE
          WHEN
            away_team.provider =
              ${SOURCE}
          THEN away_team.provider_id
          ELSE away_map.source_team_id
        END
          AS away_provider_team_id

      FROM public.prematch_batch_fixtures
        AS batch_fixture

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          batch_fixture.fixture_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      LEFT JOIN public.team_source_mappings
        AS home_map
        ON home_map.team_id =
          home.id

        AND home_map.source =
          ${SOURCE}

        AND home_map.is_verified =
          true

      LEFT JOIN public.team_source_mappings
        AS away_map
        ON away_map.team_id =
          away_team.id

        AND away_map.source =
          ${SOURCE}

        AND away_map.is_verified =
          true

      WHERE
        batch_fixture.batch_id =
          ${config.batchId}::uuid

        AND fixture.provider =
          ${SOURCE}

        AND fixture.is_demo =
          false

      ORDER BY
        fixture.provider_id
    ` as QueryRow[];

  if (
    fixtures.length ===
    0
  ) {
    throw new Error(
      "Batch contains no API-Football fixtures.",
    );
  }

  console.log(
    `Fixtures: ${fixtures.length}`,
  );

  let providerCalls =
    0;

  let inserted =
    0;

  let existing =
    0;

  let unavailable =
    0;

  for (
    const fixture
    of fixtures
  ) {
    const fixtureId =
      String(
        fixture.fixture_id,
      );

    const kickoffAt =
      timestamp(
        fixture.kickoff_at,
        "Kickoff",
      );

    const homeName =
      String(
        fixture.home_team_name,
      );

    const awayName =
      String(
        fixture.away_team_name,
      );

    console.log("");
    console.log(
      `${homeName} vs ${awayName}`,
    );
    console.log(
      `Kickoff: ${kickoffAt}`,
    );

    if (
      Date.now() >=
      Date.parse(
        kickoffAt,
      )
    ) {
      console.log(
        "SKIP: kickoff has passed.",
      );
      continue;
    }

    const confirmedSides =
      await existingConfirmedSides(
        sql,
        fixtureId,
      );

    const bothConfirmed =
      confirmedSides.has(
        "home",
      ) &&
      confirmedSides.has(
        "away",
      );

    console.log(
      `Stored confirmed XI: ${bothConfirmed ? "BOTH" : confirmedSides.size === 0 ? "NONE" : [...confirmedSides].join(", ")}`,
    );

    if (
      config.missingOnly &&
      bothConfirmed
    ) {
      console.log(
        "SKIP: both confirmed XIs already stored.",
      );
      continue;
    }

    if (
      config.dryRun
    ) {
      console.log(
        "DRY RUN: provider request suppressed.",
      );
      continue;
    }

    const providerFixtureId =
      positiveInteger(
        fixture.provider_id,
        "Fixture provider ID",
      );

    const homeProviderTeamId =
      positiveInteger(
        fixture.home_provider_team_id,
        "Home provider team ID",
      );

    const awayProviderTeamId =
      positiveInteger(
        fixture.away_provider_team_id,
        "Away provider team ID",
      );

    const lineups =
      await fetchFixtureLineups(
        providerFixtureId,
      );

    providerCalls +=
      1;

    console.log(
      `Provider lineups returned: ${lineups.length}`,
    );

    if (
      lineups.length ===
      0
    ) {
      unavailable +=
        1;

      console.log(
        "NO CONFIRMED LINEUP AVAILABLE.",
      );

      continue;
    }

    const observedAt =
      new Date()
        .toISOString();

    if (
      Date.parse(
        observedAt,
      ) >=
      Date.parse(
        kickoffAt,
      )
    ) {
      console.log(
        "SKIP: provider response completed at/after kickoff.",
      );
      continue;
    }

    for (
      const lineup
      of lineups
    ) {
      const isHome =
        lineup.team.id ===
          homeProviderTeamId;

      const isAway =
        lineup.team.id ===
          awayProviderTeamId;

      if (
        !isHome &&
        !isAway
      ) {
        console.log(
          `SKIP unexpected lineup team: ${lineup.team.name} (${lineup.team.id})`,
        );
        continue;
      }

      const side =
        isHome
          ? "home"
          : "away";

      const canonicalTeamId =
        String(
          isHome
            ? fixture.home_team_id
            : fixture.away_team_id,
        );

      const canonicalTeamName =
        String(
          isHome
            ? fixture.home_team_name
            : fixture.away_team_name,
        );

      const startXI =
        [...lineup.startXI]
          .sort(
            (
              left,
              right,
            ) =>
              (left.id ?? Number.MAX_SAFE_INTEGER) -
                (right.id ?? Number.MAX_SAFE_INTEGER) ||
              left.name.localeCompare(
                right.name,
              ),
          );

      if (
        startXI.length <
        11
      ) {
        console.log(
          `SKIP ${canonicalTeamName}: starting XI has only ${startXI.length} players.`,
        );
        continue;
      }

      const substitutes =
        [...lineup.substitutes]
          .sort(
            (
              left,
              right,
            ) =>
              (left.id ?? Number.MAX_SAFE_INTEGER) -
                (right.id ?? Number.MAX_SAFE_INTEGER) ||
              left.name.localeCompare(
                right.name,
              ),
          );

      const evidence = {
        contractVersion:
          CONTRACT_VERSION,

        evidenceType:
          "confirmed_lineup",

        providerFixtureId,

        providerTeam: {
          id:
            lineup.team.id,

          name:
            lineup.team.name,
        },

        canonicalTeam: {
          id:
            canonicalTeamId,

          name:
            canonicalTeamName,

          fixtureSide:
            side,
        },

        formation:
          lineup.formation,

        startingXI:
          startXI,

        substitutes,

        confirmed:
          true,

        startingXICount:
          startXI.length,
      };

      const sourceEvidenceId =
        [
          SOURCE,
          "lineup",
          providerFixtureId,
          lineup.team.id,
        ].join(
          ":",
        );

      const description =
        `${canonicalTeamName}: confirmed starting XI (${startXI.length}) from API-Football.`;

      const identityPayload = {
        fixtureId,
        kind:
          "squad_availability",
        side,
        description,
        source:
          SOURCE,
        sourceEvidenceId,
        evidence,
      };

      const evidenceSha256 =
        canonicalSha256(
          identityPayload,
        );

      const rows =
        await sql`
          INSERT INTO public.context_evidence_snapshots (
            fixture_id,
            kind,
            side,
            description,
            source,
            source_evidence_id,
            evidence_sha256,
            is_demo,
            observed_at,
            evidence
          )
          VALUES (
            ${fixtureId}::uuid,
            'squad_availability',
            ${side},
            ${description},
            ${SOURCE},
            ${sourceEvidenceId},
            ${evidenceSha256},
            false,
            ${observedAt}::timestamptz,
            ${JSON.stringify(
              evidence,
            )}::jsonb
          )

          ON CONFLICT (
            fixture_id,
            evidence_sha256
          )
          DO NOTHING

          RETURNING
            id
        ` as QueryRow[];

      if (
        rows.length ===
        1
      ) {
        inserted +=
          1;

        console.log(
          `LINEUP INSERTED: ${canonicalTeamName}`,
        );
      } else {
        existing +=
          1;

        console.log(
          `LINEUP EXISTING: ${canonicalTeamName}`,
        );
      }
    }
  }

  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    `Provider calls: ${providerCalls}`,
  );
  console.log(
    `Lineup snapshots inserted: ${inserted}`,
  );
  console.log(
    `Lineup snapshots existing: ${existing}`,
  );
  console.log(
    `Fixtures with no lineup response: ${unavailable}`,
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? `Prematch lineup ingestion failed: ${error.message}`
        : "Prematch lineup ingestion failed.",
    );

    process.exitCode =
      1;
  },
);

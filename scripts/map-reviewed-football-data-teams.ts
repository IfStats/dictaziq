import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const SOURCE =
  "football-data.org";

const RATING_SOURCE =
  "footballdatabase.com";

type ReviewedMapping = {
  providerTeamId: number;

  providerName: string;

  footballDatabaseName: string;

  method:
    | "exact"
    | "alias";

  reason: string;
};

const REVIEWED_MAPPINGS:
  ReviewedMapping[] = [
  {
    providerTeamId: 57,

    providerName:
      "Arsenal FC",

    footballDatabaseName:
      "Arsenal",

    method:
      "alias",

    reason:
      "football-data.org Arsenal FC corresponds to FootballDatabase Arsenal.",
  },

  {
    providerTeamId: 61,

    providerName:
      "Chelsea FC",

    footballDatabaseName:
      "Chelsea FC",

    method:
      "exact",

    reason:
      "Exact first-team identity.",
  },

  {
    providerTeamId: 64,

    providerName:
      "Liverpool FC",

    footballDatabaseName:
      "Liverpool FC",

    method:
      "exact",

    reason:
      "Exact first-team identity.",
  },

  {
    providerTeamId: 341,

    providerName:
      "Leeds United FC",

    footballDatabaseName:
      "Leeds United",

    method:
      "alias",

    reason:
      "football-data.org Leeds United FC corresponds to FootballDatabase Leeds United.",
  },

  {
    providerTeamId: 113,

    providerName:
      "SSC Napoli",

    footballDatabaseName:
      "SSC Napoli",

    method:
      "exact",

    reason:
      "Exact first-team identity.",
  },

  {
    providerTeamId: 78,

    providerName:
      "Club Atlético de Madrid",

    footballDatabaseName:
      "Atlético Madrid",

    method:
      "alias",

    reason:
      "Same Atlético Madrid first team under provider-specific naming.",
  },

  {
    providerTeamId: 498,

    providerName:
      "Sporting Clube de Portugal",

    footballDatabaseName:
      "Sporting",

    method:
      "alias",

    reason:
      "football-data.org Sporting Clube de Portugal corresponds to FootballDatabase Sporting.",
  },

  {
    providerTeamId: 610,

    providerName:
      "Galatasaray SK",

    footballDatabaseName:
      "Galatasaray",

    method:
      "alias",

    reason:
      "football-data.org Galatasaray SK corresponds to FootballDatabase Galatasaray.",
  },
];

async function main() {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  let inserted = 0;
  let existing = 0;

  for (
    const item
    of REVIEWED_MAPPINGS
  ) {
    /*
     * Resolve the canonical team through
     * FootballDatabase identity.
     *
     * This guarantees ratings and historical
     * match evidence point at the SAME team.
     */
    const targets =
      await sql`
        SELECT
          mapping.team_id,

          mapping.source_team_id
            AS rating_source_team_id,

          mapping.source_name
            AS rating_source_name,

          team.name
            AS canonical_name,

          team.country,
          team.is_demo

        FROM public.team_source_mappings
          AS mapping

        JOIN public.teams
          AS team
          ON team.id =
            mapping.team_id

        WHERE mapping.source =
          ${RATING_SOURCE}

          AND lower(
            trim(
              mapping.source_name
            )
          ) =
            lower(
              trim(
                ${item.footballDatabaseName}
              )
            )
      `;

    assert.equal(
      targets.length,
      1,
      `Expected exactly one FootballDatabase team for ${item.footballDatabaseName}.`,
    );

    const target =
      targets[0];

    assert.equal(
      target.is_demo,
      false,
      `${item.footballDatabaseName} unexpectedly points to demo data.`,
    );

    /*
     * Guard 1:
     * provider ID cannot silently change
     * canonical identity.
     */
    const providerExisting =
      await sql`
        SELECT
          id,
          team_id,
          source_team_id,
          source_name,
          match_method,
          is_verified

        FROM public.team_source_mappings

        WHERE source =
          ${SOURCE}

          AND source_team_id =
            ${String(
              item.providerTeamId,
            )}
      `;

    if (
      providerExisting.length >
      0
    ) {
      assert.equal(
        providerExisting.length,
        1,
        `football-data.org team ${item.providerTeamId} has duplicate mappings.`,
      );

      assert.equal(
        String(
          providerExisting[0]
            .team_id,
        ),
        String(
          target.team_id,
        ),
        `football-data.org team ${item.providerTeamId} is mapped to a different canonical team.`,
      );

      existing += 1;

      console.log(
        `EXISTS | football-data ${item.providerTeamId} ${item.providerName} -> ${target.canonical_name}`,
      );

      continue;
    }

    /*
     * Guard 2:
     * one canonical team must not already
     * have some other football-data.org ID.
     */
    const canonicalExisting =
      await sql`
        SELECT
          source_team_id,
          source_name

        FROM public.team_source_mappings

        WHERE source =
          ${SOURCE}

          AND team_id =
            ${target.team_id}::uuid
      `;

    assert.equal(
      canonicalExisting.length,
      0,
      `${target.canonical_name} already has a different football-data.org identity.`,
    );

    await sql`
      INSERT INTO public.team_source_mappings (
        team_id,
        source,
        source_team_id,
        source_name,
        source_country,
        source_url,
        match_method,
        is_verified,
        evidence
      )
      VALUES (
        ${target.team_id}::uuid,

        ${SOURCE},

        ${String(
          item.providerTeamId,
        )},

        ${item.providerName},

        ${target.country},

        NULL,

        ${item.method},

        true,

        ${JSON.stringify({
          kind:
            "reviewed_football_data_mapping",

          reviewed:
            true,

          football_data_team_id:
            item.providerTeamId,

          football_data_name:
            item.providerName,

          football_database_source_team_id:
            target.rating_source_team_id,

          football_database_name:
            target.rating_source_name,

          canonical_name:
            target.canonical_name,

          match_method:
            item.method,

          reason:
            item.reason,

          review_context:
            "2026-09-09 football-data.org competition team resolver",
        })}::jsonb
      )
    `;

    inserted += 1;

    console.log(
      `INSERT | football-data ${item.providerTeamId} ${item.providerName} -> ${target.canonical_name} | ${item.method}`,
    );
  }

  /*
   * Final integrity verification.
   */
  for (
    const item
    of REVIEWED_MAPPINGS
  ) {
    const rows =
      await sql`
        SELECT
          mapping.id,
          mapping.team_id,
          mapping.source_team_id,
          mapping.source_name,
          mapping.match_method,
          mapping.is_verified,

          team.name
            AS canonical_name,

          count(
            rating.id
          )::int
            AS rating_snapshot_count

        FROM public.team_source_mappings
          AS mapping

        JOIN public.teams
          AS team
          ON team.id =
            mapping.team_id

        LEFT JOIN public.team_rating_snapshots
          AS rating
          ON rating.team_id =
            mapping.team_id

          AND rating.source =
            ${RATING_SOURCE}

          AND rating.is_demo =
            false

        WHERE mapping.source =
          ${SOURCE}

          AND mapping.source_team_id =
            ${String(
              item.providerTeamId,
            )}

        GROUP BY
          mapping.id,
          mapping.team_id,
          mapping.source_team_id,
          mapping.source_name,
          mapping.match_method,
          mapping.is_verified,
          team.name
      `;

    assert.equal(
      rows.length,
      1,
      `football-data.org mapping ${item.providerTeamId} is missing.`,
    );

    assert.equal(
      rows[0].is_verified,
      true,
      `football-data.org mapping ${item.providerTeamId} is not verified.`,
    );

    assert.ok(
      Number(
        rows[0]
          .rating_snapshot_count,
      ) > 0,
      `${rows[0].canonical_name} has no real FootballDatabase rating history.`,
    );
  }

  console.log("");

  console.log(
    "PASS: reviewed football-data.org mappings persisted.",
  );

  console.log(
    "PASS: provider identities point to canonical DictazIQ teams.",
  );

  console.log(
    "PASS: all mapped teams retain FootballDatabase rating history.",
  );

  console.log(
    "PASS: provider IDs cannot silently reassign canonical teams.",
  );

  console.log("");

  console.log(
    `Mappings inserted: ${inserted}`,
  );

  console.log(
    `Mappings already existing: ${existing}`,
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `football-data.org mapping verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `football-data.org mapping failed: ${error.message}`
          : "football-data.org mapping failed.",
      );
    }

    process.exitCode =
      1;
  },
);
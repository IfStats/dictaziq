import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";

const API_SOURCE = "api-football";
const RATING_SOURCE = "footballdatabase.com";

type ReviewedMapping = {
  apiTeamId: number;
  apiName: string;
  footballDatabaseName: string;
  method: "exact" | "alias";
  reason: string;
};

/*
 * Only mappings explicitly reviewed from the live
 * September 9 fixture scan belong here.
 *
 * Do not add youth/reserve/lookalike teams merely
 * because their names contain a rated club name.
 */
const REVIEWED_MAPPINGS: ReviewedMapping[] = [
  {
    apiTeamId: 40,
    apiName: "Liverpool",
    footballDatabaseName: "Liverpool FC",
    method: "alias",
    reason:
      "API-Football Liverpool first team corresponds to FootballDatabase Liverpool FC.",
  },

  {
    apiTeamId: 530,
    apiName: "Atletico Madrid",
    footballDatabaseName: "Atlético Madrid",
    method: "alias",
    reason:
      "Same first team; provider spelling omits the accent.",
  },

  {
    apiTeamId: 492,
    apiName: "Napoli",
    footballDatabaseName: "SSC Napoli",
    method: "alias",
    reason:
      "API-Football Napoli first team corresponds to FootballDatabase SSC Napoli.",
  },

  {
    apiTeamId: 42,
    apiName: "Arsenal",
    footballDatabaseName: "Arsenal",
    method: "exact",
    reason:
      "Exact first-team identity.",
  },

  {
    apiTeamId: 228,
    apiName: "Sporting CP",
    footballDatabaseName: "Sporting",
    method: "alias",
    reason:
      "API-Football Sporting CP corresponds to FootballDatabase Sporting.",
  },

  {
    apiTeamId: 63,
    apiName: "Leeds",
    footballDatabaseName: "Leeds United",
    method: "alias",
    reason:
      "API-Football Leeds first team corresponds to FootballDatabase Leeds United.",
  },

    {
    apiTeamId: 645,
    apiName: "Galatasaray",
    footballDatabaseName: "Galatasaray",
    method: "exact",
    reason:
      "Exact API-Football and FootballDatabase first-team identity.",
  },

  {
    apiTeamId: 49,
    apiName: "Chelsea",
    footballDatabaseName: "Chelsea FC",
    method: "alias",
    reason:
      "API-Football Chelsea first team corresponds to FootballDatabase Chelsea FC.",
  },
];

async function main() {
  const client = neon(getDatabaseUrl());

  let inserted = 0;
  let existing = 0;

  for (const item of REVIEWED_MAPPINGS) {
    /*
     * Resolve the target through the already-established
     * FootballDatabase source identity.
     *
     * This ensures API-Football maps onto the same
     * canonical team that owns the rating history.
     */
    const targets = await client`
      SELECT
        mapping.team_id,
        mapping.source_team_id
          AS football_database_team_id,
        mapping.source_name
          AS football_database_name,

        team.name
          AS canonical_name,
        team.country,
        team.is_demo

      FROM public.team_source_mappings
        AS mapping

      JOIN public.teams
        AS team
        ON team.id = mapping.team_id

      WHERE mapping.source =
        ${RATING_SOURCE}

        AND lower(
          trim(mapping.source_name)
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

    const target = targets[0];

    assert.equal(
      target.is_demo,
      false,
      `${item.footballDatabaseName} unexpectedly points to demo data.`,
    );

    /*
     * Refuse silent reassignment if this API team ID has
     * already been mapped somewhere else.
     */
    const before = await client`
      SELECT
        id,
        team_id,
        source_name,
        match_method,
        is_verified

      FROM public.team_source_mappings

      WHERE source =
        ${API_SOURCE}

        AND source_team_id =
          ${String(item.apiTeamId)}
    `;

    if (before.length > 0) {
      assert.equal(
        before.length,
        1,
        `API-Football team ${item.apiTeamId} has duplicate mappings.`,
      );

      assert.equal(
        String(before[0].team_id),
        String(target.team_id),
        `API-Football team ${item.apiTeamId} is already mapped to a different canonical team.`,
      );

      existing += 1;

      console.log(
        `EXISTS | API ${item.apiTeamId} ${item.apiName} -> ${target.canonical_name}`,
      );

      continue;
    }

    await client`
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

        ${API_SOURCE},

        ${String(item.apiTeamId)},

        ${item.apiName},

        ${target.country},

        NULL,

        ${item.method},

        true,

        ${JSON.stringify({
          kind:
            "reviewed_api_football_mapping",

          reviewed:
            true,

          api_football_team_id:
            item.apiTeamId,

          api_football_name:
            item.apiName,

          football_database_source_team_id:
            target.football_database_team_id,

          football_database_name:
            target.football_database_name,

          canonical_name:
            target.canonical_name,

          match_method:
            item.method,

          reason:
            item.reason,

          review_context:
            "2026-09-09 rated fixture dry run",
        })}::jsonb
      )
    `;

    inserted += 1;

    console.log(
      `INSERT | API ${item.apiTeamId} ${item.apiName} -> ${target.canonical_name} | ${item.method}`,
    );
  }

  /*
   * Verify every reviewed API identity now resolves
   * to a canonical team carrying FootballDatabase
   * rating history.
   */
  for (const item of REVIEWED_MAPPINGS) {
    const rows = await client`
      SELECT
        api_mapping.id,
        api_mapping.team_id,
        api_mapping.source_team_id,
        api_mapping.source_name,
        api_mapping.match_method,
        api_mapping.is_verified,

        team.name
          AS canonical_name,

        count(rating.id)::int
          AS rating_snapshot_count

      FROM public.team_source_mappings
        AS api_mapping

      JOIN public.teams
        AS team
        ON team.id =
          api_mapping.team_id

      LEFT JOIN public.team_rating_snapshots
        AS rating
        ON rating.team_id =
          api_mapping.team_id

        AND rating.source =
          ${RATING_SOURCE}

        AND rating.is_demo =
          false

      WHERE api_mapping.source =
        ${API_SOURCE}

        AND api_mapping.source_team_id =
          ${String(item.apiTeamId)}

      GROUP BY
        api_mapping.id,
        api_mapping.team_id,
        api_mapping.source_team_id,
        api_mapping.source_name,
        api_mapping.match_method,
        api_mapping.is_verified,
        team.name
    `;

    assert.equal(
      rows.length,
      1,
      `Reviewed API-Football mapping ${item.apiTeamId} is missing.`,
    );

    assert.equal(
      rows[0].is_verified,
      true,
      `API-Football mapping ${item.apiTeamId} is not verified.`,
    );

    assert.ok(
      Number(
        rows[0].rating_snapshot_count,
      ) > 0,
      `Mapped team ${rows[0].canonical_name} has no real FootballDatabase rating history.`,
    );
  }

  console.log("");
  console.log(
    "PASS: reviewed API-Football mappings persisted.",
  );

  console.log(
    "PASS: API provider identities point to canonical DictazIQ teams.",
  );

  console.log(
    "PASS: every reviewed team has real FootballDatabase rating history.",
  );

  console.log(
    "PASS: youth/reserve/lookalike teams were not mapped.",
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
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `API-Football mapping verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `API-Football mapping failed: ${error.message}`
          : "API-Football mapping failed.",
      );
    }

    process.exitCode = 1;
  },
);
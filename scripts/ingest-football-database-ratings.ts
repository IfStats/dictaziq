import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";

import {
  fetchFootballDatabaseWorldRanking,
} from "../src/providers/football-database/client";

import {
  FOOTBALL_DATABASE_SOURCE,
  type FootballDatabaseRating,
} from "../src/providers/football-database/types";

type MappingResolution = {
  teamId: string;

  method:
    | "existing"
    | "exact"
    | "seed";

  mappingId: string;

  verified: boolean;
};

type ImportStats = {
  ratingsSeen: number;

  existingMappings: number;
  exactMappingsCreated: number;
  teamsSeeded: number;

  ratingSnapshotsInserted: number;
  ratingSnapshotsExisting: number;
};

function slugify(
  value: string,
): string {
  const result = value
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /^-+|-+$/g,
      "",
    );

  if (!result) {
    throw new Error(
      `Cannot generate team slug from "${value}".`,
    );
  }

  return result;
}

async function main() {
  const client =
    neon(getDatabaseUrl());

  /*
   * Resolve the canonical Football sport.
   */
  const sports = await client`
    SELECT
      id,
      name
    FROM public.sports
    WHERE lower(trim(name)) =
      'football'
  `;

  assert.equal(
    sports.length,
    1,
    "Expected exactly one Football sport.",
  );

  const footballSportId =
    String(sports[0].id);

  /*
   * Fetch the current live FootballDatabase
   * world ranking page.
   */
  console.log(
    "Fetching FootballDatabase world ranking page 1...",
  );

  const ranking =
    await fetchFootballDatabaseWorldRanking(
      1,
    );

  assert.equal(
    ranking.source,
    FOOTBALL_DATABASE_SOURCE,
  );

  assert.ok(
    ranking.ratings.length > 0,
    "FootballDatabase returned no ratings.",
  );

  console.log(
    `Snapshot date: ${ranking.snapshotDate}`,
  );

  console.log(
    `Ratings received: ${ranking.ratings.length}`,
  );

  console.log("");

  const stats: ImportStats = {
    ratingsSeen:
      ranking.ratings.length,

    existingMappings: 0,
    exactMappingsCreated: 0,
    teamsSeeded: 0,

    ratingSnapshotsInserted: 0,
    ratingSnapshotsExisting: 0,
  };

  /*
   * Generate a canonical team slug without
   * relying on undocumented uniqueness behavior.
   */
  async function uniqueTeamSlug(
    rating: FootballDatabaseRating,
  ): Promise<string> {
    const base =
      slugify(
        `${rating.teamName}-${rating.country}`,
      );

    let candidate =
      base;

    let counter = 1;

    while (true) {
      const existing =
        await client`
          SELECT id
          FROM public.teams
          WHERE slug =
            ${candidate}
          LIMIT 1
        `;

      if (
        existing.length === 0
      ) {
        return candidate;
      }

      counter += 1;

      candidate =
        `${base}-${counter}`;
    }
  }

  /*
   * Resolve one FootballDatabase source identity
   * to exactly one canonical DictazIQ team.
   */
  async function resolveTeam(
    rating: FootballDatabaseRating,
  ): Promise<MappingResolution> {
    /*
     * Priority 1:
     *
     * Existing source mapping.
     */
    const existingMappings =
      await client`
        SELECT
          mapping.id,
          mapping.team_id,
          mapping.match_method,
          mapping.is_verified,

          team.is_demo,
          team.name,
          team.country

        FROM public.team_source_mappings
          AS mapping

        JOIN public.teams
          AS team
          ON team.id =
            mapping.team_id

        WHERE mapping.source =
          ${FOOTBALL_DATABASE_SOURCE}

          AND mapping.source_team_id =
            ${rating.sourceTeamId}
      `;

    if (
      existingMappings.length > 1
    ) {
      throw new Error(
        `Multiple mappings exist for ${rating.sourceTeamId}.`,
      );
    }

    if (
      existingMappings.length === 1
    ) {
      const mapping =
        existingMappings[0];

      assert.equal(
        mapping.is_demo,
        false,
        `Real FootballDatabase mapping ${rating.sourceTeamId} points to demo data.`,
      );

      stats.existingMappings +=
        1;

      return {
        teamId:
          String(
            mapping.team_id,
          ),

        method:
          "existing",

        mappingId:
          String(mapping.id),

        verified:
          mapping.is_verified ===
          true,
      };
    }

    /*
     * Priority 2:
     *
     * Safe canonical exact match using:
     *
     * - Football sport
     * - non-demo team
     * - normalized team name
     * - normalized country
     *
     * We deliberately do NOT perform fuzzy
     * matching automatically.
     */
    const exactTeams =
      await client`
        SELECT
          id,
          name,
          country,
          provider,
          provider_id

        FROM public.teams

        WHERE sport_id =
          ${footballSportId}::uuid

          AND is_demo = false

          AND lower(trim(name)) =
            lower(trim(${rating.teamName}))

          AND lower(
            trim(
              coalesce(
                country,
                ''
              )
            )
          ) =
            lower(
              trim(
                ${rating.country}
              )
            )
      `;

    if (
      exactTeams.length > 1
    ) {
      throw new Error(
        `Ambiguous exact canonical match for ${rating.teamName} (${rating.country}).`,
      );
    }

    let teamId: string;
    let matchMethod:
      | "exact"
      | "seed";

    if (
      exactTeams.length === 1
    ) {
      teamId =
        String(
          exactTeams[0].id,
        );

      matchMethod =
        "exact";

      stats.exactMappingsCreated +=
        1;
    } else {
      /*
       * Priority 3:
       *
       * No canonical team exists.
       *
       * Seed a new real canonical team from the
       * FootballDatabase identity.
       */
      const slug =
        await uniqueTeamSlug(
          rating,
        );

      const insertedTeams =
        await client`
          INSERT INTO public.teams (
            sport_id,
            slug,
            name,
            short_name,
            country,
            provider,
            provider_id,
            is_demo
          )
          VALUES (
            ${footballSportId}::uuid,
            ${slug},
            ${rating.teamName},
            NULL,
            ${rating.country},
            ${FOOTBALL_DATABASE_SOURCE},
            ${rating.sourceTeamId},
            false
          )
          RETURNING
            id
        `;

      assert.equal(
        insertedTeams.length,
        1,
        `Failed to create canonical team ${rating.teamName}.`,
      );

      teamId =
        String(
          insertedTeams[0].id,
        );

      matchMethod =
        "seed";

      stats.teamsSeeded +=
        1;
    }

    /*
     * Persist the source identity.
     *
     * Automatic exact/seed mappings begin
     * unverified so they remain correctable
     * until explicitly reviewed.
     */
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
        ${teamId}::uuid,

        ${FOOTBALL_DATABASE_SOURCE},

        ${rating.sourceTeamId},

        ${rating.teamName},

        ${rating.country},

        ${rating.clubUrl},

        ${matchMethod},

        false,

        ${JSON.stringify({
          kind:
            "footballdatabase_team_mapping",

          source:
            FOOTBALL_DATABASE_SOURCE,

          world_rank:
            rating.worldRank,

          rating:
            rating.rating,

          ranking_snapshot_date:
            rating.snapshotDate,

          discovered_from:
            "world-ranking-page",

          ranking_page:
            1,

          automatically_created:
            true,
        })}::jsonb
      )

      ON CONFLICT (
        source,
        source_team_id
      )
      DO NOTHING
    `;

    const mappings =
      await client`
        SELECT
          id,
          team_id,
          match_method,
          is_verified

        FROM public.team_source_mappings

        WHERE source =
          ${FOOTBALL_DATABASE_SOURCE}

          AND source_team_id =
            ${rating.sourceTeamId}
      `;

    assert.equal(
      mappings.length,
      1,
      `Source mapping was not persisted for ${rating.teamName}.`,
    );

    assert.equal(
      String(
        mappings[0].team_id,
      ),
      teamId,
      `Source mapping resolved to another canonical team for ${rating.teamName}.`,
    );

    return {
      teamId,

      method:
        matchMethod,

      mappingId:
        String(
          mappings[0].id,
        ),

      verified:
        mappings[0]
          .is_verified === true,
    };
  }

  /*
   * Store one immutable weekly rating.
   */
  async function storeRatingSnapshot(
    rating: FootballDatabaseRating,
    mapping: MappingResolution,
  ): Promise<
    "inserted" | "existing"
  > {
    const inserted =
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
          ${mapping.teamId}::uuid,

          ${FOOTBALL_DATABASE_SOURCE},

          ${rating.sourceTeamId},

          ${rating.snapshotDate}::date,

          ${rating.rating},

          ${rating.worldRank},

          false,

          ${JSON.stringify({
            kind:
              "footballdatabase_world_rating",

            source:
              FOOTBALL_DATABASE_SOURCE,

            source_team_id:
              rating.sourceTeamId,

            source_name:
              rating.teamName,

            country:
              rating.country,

            world_rank:
              rating.worldRank,

            rating:
              rating.rating,

            snapshot_date:
              rating.snapshotDate,

            club_url:
              rating.clubUrl,

            ranking_page:
              1,

            mapping_id:
              mapping.mappingId,

            mapping_method:
              mapping.method,

            mapping_verified:
              mapping.verified,

            development_adapter:
              true,
          })}::jsonb
        )

        ON CONFLICT (
          team_id,
          source,
          snapshot_date
        )
        DO NOTHING

        RETURNING id
      `;

    /*
     * Reload the canonical snapshot even if the
     * INSERT conflicted.
     *
     * Immutable-history rule:
     * an existing weekly value must exactly match
     * what FootballDatabase currently returned.
     * We never UPDATE historical snapshots.
     */
    const stored =
      await client`
        SELECT
          id,
          team_id,
          source,
          source_team_id,
          snapshot_date,
          rating,
          ranking_position,
          is_demo,
          observed_at

        FROM public.team_rating_snapshots

        WHERE team_id =
          ${mapping.teamId}::uuid

          AND source =
            ${FOOTBALL_DATABASE_SOURCE}

          AND snapshot_date =
            ${rating.snapshotDate}::date
      `;

    assert.equal(
      stored.length,
      1,
      `Rating snapshot missing for ${rating.teamName}.`,
    );

    assert.equal(
      Number(
        stored[0].rating,
      ),
      rating.rating,
      [
        `Historical rating mismatch for ${rating.teamName}.`,
        `Stored=${stored[0].rating}`,
        `Incoming=${rating.rating}`,
        "Existing snapshots must never be overwritten.",
      ].join(" "),
    );

    assert.equal(
      Number(
        stored[0]
          .ranking_position,
      ),
      rating.worldRank,
      [
        `Historical ranking-position mismatch for ${rating.teamName}.`,
        `Stored=${stored[0].ranking_position}`,
        `Incoming=${rating.worldRank}`,
      ].join(" "),
    );

    assert.equal(
      stored[0].is_demo,
      false,
      `${rating.teamName} real rating was stored as demo data.`,
    );

    return inserted.length ===
      1
      ? "inserted"
      : "existing";
  }

  /*
   * Process the page sequentially.
   *
   * This deliberately avoids hammering either
   * FootballDatabase or Neon.
   */
  for (
    const rating
    of ranking.ratings
  ) {
    const mapping =
      await resolveTeam(
        rating,
      );

    const snapshotResult =
      await storeRatingSnapshot(
        rating,
        mapping,
      );

    if (
      snapshotResult ===
      "inserted"
    ) {
      stats.ratingSnapshotsInserted +=
        1;
    } else {
      stats.ratingSnapshotsExisting +=
        1;
    }

    console.log(
      [
        String(
          rating.worldRank,
        ).padStart(
          2,
          " ",
        ),

        rating.teamName,

        `(${rating.country})`,

        `rating=${rating.rating}`,

        `mapping=${mapping.method}`,

        `snapshot=${snapshotResult}`,
      ].join(" | "),
    );
  }

  /*
   * Final integrity check for this source/date.
   */
  const importedRows =
    await client`
      SELECT
        rating.id,
        rating.rating,
        rating.ranking_position,
        rating.snapshot_date,

        team.id
          AS team_id,

        team.name
          AS team_name,

        team.country,

        mapping.source_team_id

      FROM public.team_rating_snapshots
        AS rating

      JOIN public.teams
        AS team
        ON team.id =
          rating.team_id

      JOIN public.team_source_mappings
        AS mapping
        ON mapping.team_id =
          team.id

        AND mapping.source =
          rating.source

        AND mapping.source_team_id =
          rating.source_team_id

      WHERE rating.source =
        ${FOOTBALL_DATABASE_SOURCE}

        AND rating.snapshot_date =
          ${ranking.snapshotDate}::date

        AND rating.is_demo =
          false

      ORDER BY
        rating.ranking_position
    `;

  assert.equal(
    importedRows.length,
    ranking.ratings.length,
    "Imported FootballDatabase snapshot count does not match the live ranking page.",
  );

  console.log("");
  console.log(
    "PASS: FootballDatabase ratings mapped to canonical DictazIQ teams.",
  );

  console.log(
    "PASS: real ratings stored as immutable non-demo snapshots.",
  );

  console.log(
    "PASS: ranking positions preserved.",
  );

  console.log(
    "PASS: source team identities preserved.",
  );

  console.log(
    "PASS: historical snapshot conflicts cannot silently overwrite data.",
  );

  console.log("");

  console.log(
    `Source: ${FOOTBALL_DATABASE_SOURCE}`,
  );

  console.log(
    `Snapshot date: ${ranking.snapshotDate}`,
  );

  console.log(
    `Ratings seen: ${stats.ratingsSeen}`,
  );

  console.log(
    `Existing mappings: ${stats.existingMappings}`,
  );

  console.log(
    `Exact mappings created: ${stats.exactMappingsCreated}`,
  );

  console.log(
    `Canonical teams seeded: ${stats.teamsSeeded}`,
  );

  console.log(
    `Rating snapshots inserted: ${stats.ratingSnapshotsInserted}`,
  );

  console.log(
    `Rating snapshots already existing: ${stats.ratingSnapshotsExisting}`,
  );

  console.log("");

  console.log(
    "Top 10 stored DictazIQ ratings:",
  );

  for (
    const row
    of importedRows.slice(
      0,
      10,
    )
  ) {
    console.log(
      `${row.ranking_position}. ${row.team_name} (${row.country}) = ${row.rating}`,
    );
  }

  console.log("");

  console.log(
    "NOTE: FootballDatabase public-page ingestion is currently a development adapter pending confirmed production data-access terms.",
  );
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `FootballDatabase ingestion verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `FootballDatabase ingestion failed: ${error.message}`
          : "FootballDatabase ingestion failed.",
      );
    }

    process.exitCode = 1;
  },
);
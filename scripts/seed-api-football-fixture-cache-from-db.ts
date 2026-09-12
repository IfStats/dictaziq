import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const API_SOURCE =
  "api-football";

const CACHE_RESOURCE =
  "fixtures-by-date";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

function requestedDate(): string {
  const value =
    process.argv[2]?.trim();

  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      "Usage: npx tsx scripts/seed-api-football-fixture-cache-from-db.ts YYYY-MM-DD",
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
      "Invalid date.",
    );
  }

  return value;
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  const result =
    Number(
      value,
    );

  assert.ok(
    Number.isInteger(
      result,
    ) &&
      result > 0,
    `${label} must be a positive integer.`,
  );

  return result;
}

function nonEmptyString(
  value: unknown,
  label: string,
): string {
  const result =
    String(
      value ?? "",
    ).trim();

  assert.ok(
    result.length > 0,
    `${label} must be a non-empty string.`,
  );

  return result;
}

function statusLong(
  short: string,
): string {
  switch (
    short
  ) {
    case "NS":
      return "Not Started";

    case "TBD":
      return "Time To Be Defined";

    default:
      return short;
  }
}

async function main() {
  const date =
    requestedDate();

  const force =
    process.argv.includes(
      "--force",
    );

  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const start =
    new Date(
      `${date}T00:00:00.000Z`,
    );

  const end =
    new Date(
      start.getTime() +
        24 * 60 * 60 * 1000,
    );

  console.log(
    "DictazIQ API-Football Cache Seeder",
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    "Source: persisted Neon fixtures",
  );

  console.log(
    "Provider API calls: 0",
  );

  /*
   * Never silently replace a real provider cache.
   */
  const existingCache =
    await sql`
      SELECT
        id,
        result_count,
        fetched_at

      FROM public.provider_response_cache

      WHERE provider =
        ${API_SOURCE}

        AND resource =
          ${CACHE_RESOURCE}

        AND cache_key =
          ${date}

      LIMIT 1
    `;

  if (
    existingCache.length === 1 &&
    !force
  ) {
    console.log("");
    console.log(
      "Cache already exists.",
    );

    console.log(
      `Result count: ${String(
        existingCache[0]
          .result_count,
      )}`,
    );

    console.log(
      `Fetched at: ${new Date(
        String(
          existingCache[0]
            .fetched_at,
        ),
      ).toISOString()}`,
    );

    console.log("");
    console.log(
      "No changes made.",
    );

    console.log(
      "Use --force only if you intentionally want to rebuild this cache from persisted fixtures.",
    );

    return;
  }

  /*
   * Reconstruct the normalized API-Football
   * fixture page from the exact provider-native
   * identities already persisted by ingestion
   * v0.3.
   *
   * We intentionally seed only prematch fixtures
   * that were accepted into DictazIQ's database.
   *
   * This is sufficient for safe no-API reruns of
   * the ingestion pipeline.
   */
  const rows =
    await sql`
      SELECT
        fixture.provider_id
          AS fixture_provider_id,

        fixture.kickoff_at,
        fixture.provider_status,
        fixture.fetched_at,

        competition.provider_id
          AS competition_provider_id,

        competition.name
          AS competition_name,

        competition.country
          AS competition_country,

        season.label
          AS season_label,

        home_mapping.source_team_id
          AS home_source_team_id,

        home_mapping.source_name
          AS home_source_name,

        away_mapping.source_team_id
          AS away_source_team_id,

        away_mapping.source_name
          AS away_source_name

      FROM public.fixtures
        AS fixture

      JOIN public.seasons
        AS season
        ON season.id =
          fixture.season_id

      JOIN public.competitions
        AS competition
        ON competition.id =
          season.competition_id

      JOIN public.team_source_mappings
        AS home_mapping
        ON home_mapping.team_id =
          fixture.home_team_id

        AND home_mapping.source =
          ${API_SOURCE}

      JOIN public.team_source_mappings
        AS away_mapping
        ON away_mapping.team_id =
          fixture.away_team_id

        AND away_mapping.source =
          ${API_SOURCE}

      WHERE fixture.provider =
        ${API_SOURCE}

        AND fixture.is_demo =
          false

        AND fixture.kickoff_at >=
          ${start.toISOString()}::timestamptz

        AND fixture.kickoff_at <
          ${end.toISOString()}::timestamptz

        AND fixture.provider_status
          IN (
            'NS',
            'TBD'
          )

      ORDER BY
        fixture.kickoff_at ASC,
        fixture.provider_id ASC
    `;

  assert.ok(
    rows.length > 0,
    `No persisted API-Football prematch fixtures were found for ${date}.`,
  );

  const fixtures =
    rows.map(
      (
        row,
      ) => {
        const fixtureId =
          positiveInteger(
            row.fixture_provider_id,
            "Fixture provider ID",
          );

        const leagueId =
          positiveInteger(
            row.competition_provider_id,
            "Competition provider ID",
          );

        const homeId =
          positiveInteger(
            row.home_source_team_id,
            "Home source team ID",
          );

        const awayId =
          positiveInteger(
            row.away_source_team_id,
            "Away source team ID",
          );

        const season =
          positiveInteger(
            row.season_label,
            "Season label",
          );

        const kickoff =
          new Date(
            String(
              row.kickoff_at,
            ),
          );

        assert.ok(
          Number.isFinite(
            kickoff.getTime(),
          ),
          `Fixture ${fixtureId} has an invalid kickoff.`,
        );

        const providerStatus =
          nonEmptyString(
            row.provider_status,
            "Provider status",
          );

        const competitionName =
          nonEmptyString(
            row.competition_name,
            "Competition name",
          );

        const competitionCountry =
          nonEmptyString(
            row.competition_country,
            "Competition country",
          );

        const homeName =
          nonEmptyString(
            row.home_source_name,
            "Home source name",
          );

        const awayName =
          nonEmptyString(
            row.away_source_name,
            "Away source name",
          );

        assert.notEqual(
          homeId,
          awayId,
          `Fixture ${fixtureId} has identical home and away provider identities.`,
        );

        return {
          source:
            API_SOURCE,

          fixtureId,

          kickoffAt:
            kickoff.toISOString(),

          timezone:
            "UTC",

          status: {
            long:
              statusLong(
                providerStatus,
              ),

            short:
              providerStatus,

            elapsed:
              null,
          },

          league: {
            id:
              leagueId,

            name:
              competitionName,

            country:
              competitionCountry,

            season,

            round:
              null,
          },

          home: {
            id:
              homeId,

            name:
              homeName,

            winner:
              null,
          },

          away: {
            id:
              awayId,

            name:
              awayName,

            winner:
              null,
          },

          goals: {
            home:
              null,

            away:
              null,
          },

          score: {
            fulltime: {
              home:
                null,

              away:
                null,
            },

            extratime: {
              home:
                null,

              away:
                null,
            },

            penalty: {
              home:
                null,

              away:
                null,
            },
          },

          venue: {
            id:
              null,

            name:
              null,

            city:
              null,
          },
        };
      },
    );

  /*
   * Use the latest real fixture ingestion timestamp
   * as the reconstructed snapshot's fetched_at.
   */
  const latestFetchedAt =
    rows.reduce(
      (
        latest,
        row,
      ) => {
        const value =
          new Date(
            String(
              row.fetched_at,
            ),
          );

        assert.ok(
          Number.isFinite(
            value.getTime(),
          ),
          "Fixture fetched_at is invalid.",
        );

        return (
          value.getTime() >
          latest.getTime()
            ? value
            : latest
        );
      },
      new Date(0),
    );

  const payload = {
    source:
      API_SOURCE,

    date,

    results:
      fixtures.length,

    fixtures,
  };

  await sql`
    INSERT INTO public.provider_response_cache (
      provider,
      resource,
      cache_key,
      payload,
      result_count,
      fetched_at,
      created_at,
      updated_at
    )

    VALUES (
      ${API_SOURCE},
      ${CACHE_RESOURCE},
      ${date},
      ${JSON.stringify(
        payload,
      )}::jsonb,
      ${fixtures.length},
      ${latestFetchedAt.toISOString()}::timestamptz,
      clock_timestamp(),
      clock_timestamp()
    )

    ON CONFLICT (
      provider,
      resource,
      cache_key
    )

    DO UPDATE SET
      payload =
        EXCLUDED.payload,

      result_count =
        EXCLUDED.result_count,

      fetched_at =
        EXCLUDED.fetched_at,

      updated_at =
        clock_timestamp()
  `;

  const verification =
    await sql`
      SELECT
        result_count,
        fetched_at,

        jsonb_array_length(
          payload -> 'fixtures'
        )
          AS fixture_count

      FROM public.provider_response_cache

      WHERE provider =
        ${API_SOURCE}

        AND resource =
          ${CACHE_RESOURCE}

        AND cache_key =
          ${date}

      LIMIT 1
    `;

  assert.equal(
    verification.length,
    1,
    "Provider fixture cache was not persisted.",
  );

  assert.equal(
    Number(
      verification[0]
        .result_count,
    ),
    fixtures.length,
    "Cached result count does not match the reconstructed fixture count.",
  );

  assert.equal(
    Number(
      verification[0]
        .fixture_count,
    ),
    fixtures.length,
    "Cached payload fixture count does not match the reconstructed fixture count.",
  );

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "CACHE SEED COMPLETE",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Cache key: ${date}`,
  );

  console.log(
    `Fixtures cached: ${fixtures.length}`,
  );

  console.log(
    `Snapshot fetched-at: ${latestFetchedAt.toISOString()}`,
  );

  console.log(
    "API-Football calls consumed: 0",
  );

  console.log("");
  console.log(
    "PASS: today's persisted fixtures can now be reused without another provider request.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error("");

    console.error(
      error instanceof Error
        ? `Fixture cache seeding failed: ${error.message}`
        : "Fixture cache seeding failed.",
    );

    process.exitCode =
      1;
  },
);
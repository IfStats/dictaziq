import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import {
  evaluatePredictionScope,
} from "../src/lib/predictions/prediction-scope";

import { getDatabaseUrl } from "../src/lib/env/database";

import {
  fetchFixturesByDate,
} from "../src/providers/api-football/client";

import type {
  NormalizedApiFootballFixture,
} from "../src/providers/api-football/types";

const API_SOURCE =
  "api-football";

const RATING_SOURCE =
  "footballdatabase.com";

const PREMATCH_STATUSES =
  new Set([
    "NS",
    "TBD",
  ]);

type CanonicalMappedTeam = {
  teamId: string;
  canonicalName: string;
  sourceTeamId: string;
  sourceName: string;
  country: string | null;
};

type CommonRating = {
  snapshotDate: string;

  homeSnapshotId: string;
  homeRating: number;
  homeRank: number;

  awaySnapshotId: string;
  awayRating: number;
  awayRank: number;
};

type Stats = {
  fixturesReceived: number;
  futurePrematch: number;
  missingVerifiedMapping: number;
  noCommonRating: number;

  competitionsInserted: number;
  competitionsExisting: number;

  seasonsInserted: number;
  seasonsExisting: number;

  fixturesInserted: number;
  fixturesExisting: number;
};

function requestedDate(): string {
  return (
    process.argv[2]?.trim() ||
    "2026-09-09"
  );
}

function slugify(
  value: string,
): string {
  const slug =
    value
      .normalize("NFKD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .replace(
        /&/g,
        " and ",
      )
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      );

  if (!slug) {
    throw new Error(
      `Cannot create slug from "${value}".`,
    );
  }

  return slug;
}

function dateOnly(
  value: unknown,
): string {
  if (
    typeof value === "string"
  ) {
    const match =
      /^(\d{4}-\d{2}-\d{2})/.exec(
        value,
      );

    if (match) {
      return match[1];
    }
  }

  const parsed =
    new Date(
      String(value),
    );

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

async function main() {
  const date =
    requestedDate();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * Resolve the one canonical football sport.
   */
  const sports =
    await sql`
      SELECT
        id,
        slug,
        name

      FROM public.sports

      WHERE lower(
        trim(name)
      ) = 'football'
    `;

  assert.equal(
    sports.length,
    1,
    "Expected exactly one Football sport.",
  );

  const footballSportId =
    String(
      sports[0].id,
    );

  console.log(
    `Fetching API-Football fixtures for ${date}...`,
  );

  const page =
    await fetchFixturesByDate(
      date,
    );

  const stats: Stats = {
    fixturesReceived:
      page.fixtures.length,

    futurePrematch: 0,

    missingVerifiedMapping:
      0,

    noCommonRating: 0,

    competitionsInserted:
      0,

    competitionsExisting:
      0,

    seasonsInserted: 0,
    seasonsExisting: 0,

    fixturesInserted: 0,
    fixturesExisting: 0,
  };

  async function resolveApiTeam(
    providerTeamId: number,
  ): Promise<
    CanonicalMappedTeam | null
  > {
    const rows =
      await sql`
        SELECT
          mapping.team_id,
          mapping.source_team_id,
          mapping.source_name,

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
          ${API_SOURCE}

          AND mapping.source_team_id =
            ${String(
              providerTeamId,
            )}

          AND mapping.is_verified =
            true
      `;

    if (
      rows.length === 0
    ) {
      return null;
    }

    assert.equal(
      rows.length,
      1,
      `API-Football team ${providerTeamId} has multiple verified mappings.`,
    );

    assert.equal(
      rows[0].is_demo,
      false,
      `API-Football team ${providerTeamId} maps to demo data.`,
    );

    return {
      teamId:
        String(
          rows[0].team_id,
        ),

      canonicalName:
        String(
          rows[0]
            .canonical_name,
        ),

      sourceTeamId:
        String(
          rows[0]
            .source_team_id,
        ),

      sourceName:
        String(
          rows[0]
            .source_name,
        ),

      country:
        rows[0].country ===
        null
          ? null
          : String(
              rows[0]
                .country,
            ),
    };
  }

  /*
   * Select the newest FootballDatabase snapshot
   * shared by BOTH teams and available no later
   * than fixture kickoff.
   *
   * This prevents a future weekly rating from
   * leaking into an older fixture during backfills.
   */
  async function latestCommonRating(
    homeTeamId: string,
    awayTeamId: string,
    kickoffAt: string,
  ): Promise<CommonRating | null> {
    const rows =
      await sql`
        SELECT
          home_rating.id
            AS home_snapshot_id,

          home_rating.rating
            AS home_rating,

          home_rating.ranking_position
            AS home_rank,

          home_rating.snapshot_date,

          away_rating.id
            AS away_snapshot_id,

          away_rating.rating
            AS away_rating,

          away_rating.ranking_position
            AS away_rank

        FROM public.team_rating_snapshots
          AS home_rating

        JOIN public.team_rating_snapshots
          AS away_rating

          ON away_rating.source =
            home_rating.source

          AND away_rating.snapshot_date =
            home_rating.snapshot_date

        WHERE home_rating.team_id =
          ${homeTeamId}::uuid

          AND away_rating.team_id =
            ${awayTeamId}::uuid

          AND home_rating.source =
            ${RATING_SOURCE}

          AND home_rating.is_demo =
            false

          AND away_rating.is_demo =
            false

          AND home_rating.snapshot_date <=
            (${kickoffAt}::timestamptz AT TIME ZONE 'UTC')::date

        ORDER BY
          home_rating.snapshot_date
          DESC

        LIMIT 1
      `;

    if (
      rows.length === 0
    ) {
      return null;
    }

    assert.equal(
      rows.length,
      1,
    );

    return {
      snapshotDate:
        dateOnly(
          rows[0]
            .snapshot_date,
        ),

      homeSnapshotId:
        String(
          rows[0]
            .home_snapshot_id,
        ),

      homeRating:
        Number(
          rows[0]
            .home_rating,
        ),

      homeRank:
        Number(
          rows[0]
            .home_rank,
        ),

      awaySnapshotId:
        String(
          rows[0]
            .away_snapshot_id,
        ),

      awayRating:
        Number(
          rows[0]
            .away_rating,
        ),

      awayRank:
        Number(
          rows[0]
            .away_rank,
        ),
    };
  }

  async function ensureCompetition(
    fixture:
      NormalizedApiFootballFixture,
  ): Promise<string> {
    const providerId =
      String(
        fixture.league.id,
      );

    const existing =
      await sql`
        SELECT
          id,
          sport_id,
          name,
          country,
          is_demo

        FROM public.competitions

        WHERE provider =
          ${API_SOURCE}

          AND provider_id =
            ${providerId}
      `;

    if (
      existing.length > 0
    ) {
      assert.equal(
        existing.length,
        1,
      );

      assert.equal(
        String(
          existing[0]
            .sport_id,
        ),
        footballSportId,
        `Competition ${fixture.league.name} has the wrong sport.`,
      );

      assert.equal(
        existing[0]
          .is_demo,
        false,
      );

      stats.competitionsExisting +=
        1;

      return String(
        existing[0].id,
      );
    }

    const slug =
      slugify(
        `api-football-${fixture.league.id}-${fixture.league.name}`,
      );

    const inserted =
      await sql`
        INSERT INTO public.competitions (
          sport_id,
          slug,
          name,
          country,
          provider,
          provider_id,
          is_demo
        )
        VALUES (
          ${footballSportId}::uuid,

          ${slug},

          ${fixture.league.name},

          ${fixture.league.country},

          ${API_SOURCE},

          ${providerId},

          false
        )

        ON CONFLICT (
          provider,
          provider_id
        )
        DO NOTHING

        RETURNING id
      `;

    if (
      inserted.length === 1
    ) {
      stats.competitionsInserted +=
        1;

      return String(
        inserted[0].id,
      );
    }

    const reload =
      await sql`
        SELECT id

        FROM public.competitions

        WHERE provider =
          ${API_SOURCE}

          AND provider_id =
            ${providerId}
      `;

    assert.equal(
      reload.length,
      1,
      `Competition ${fixture.league.name} was not persisted.`,
    );

    stats.competitionsExisting +=
      1;

    return String(
      reload[0].id,
    );
  }

  async function ensureSeason(
    fixture:
      NormalizedApiFootballFixture,

    competitionId: string,
  ): Promise<string> {
    const label =
      String(
        fixture.league.season,
      );

    const existing =
      await sql`
        SELECT id

        FROM public.seasons

        WHERE competition_id =
          ${competitionId}::uuid

          AND label =
            ${label}
      `;

    if (
      existing.length > 0
    ) {
      assert.equal(
        existing.length,
        1,
      );

      stats.seasonsExisting +=
        1;

      return String(
        existing[0].id,
      );
    }

    /*
     * API-Football's fixture payload gives the
     * season year but not authoritative season
     * boundaries here, so dates remain NULL
     * rather than inventing them.
     */
    const inserted =
      await sql`
        INSERT INTO public.seasons (
          competition_id,
          label,
          start_date,
          end_date
        )
        VALUES (
          ${competitionId}::uuid,
          ${label},
          NULL,
          NULL
        )

        ON CONFLICT (
          competition_id,
          label
        )
        DO NOTHING

        RETURNING id
      `;

    if (
      inserted.length === 1
    ) {
      stats.seasonsInserted +=
        1;

      return String(
        inserted[0].id,
      );
    }

    const reload =
      await sql`
        SELECT id

        FROM public.seasons

        WHERE competition_id =
          ${competitionId}::uuid

          AND label =
            ${label}
      `;

    assert.equal(
      reload.length,
      1,
      `Season ${label} was not persisted.`,
    );

    stats.seasonsExisting +=
      1;

    return String(
      reload[0].id,
    );
  }

  async function storeFixture(
    fixture:
      NormalizedApiFootballFixture,

    seasonId: string,

    home: CanonicalMappedTeam,
    away: CanonicalMappedTeam,
  ): Promise<{
    id: string;
    status:
      | "inserted"
      | "existing";
  }> {
    assert.notEqual(
      home.teamId,
      away.teamId,
      "Fixture cannot contain the same canonical team twice.",
    );

    const providerId =
      String(
        fixture.fixtureId,
      );

    const slug =
      slugify(
        `${fixture.home.name}-vs-${fixture.away.name}-${providerId}`,
      );

    const fetchedAt =
      new Date()
        .toISOString();

    const inserted =
      await sql`
        INSERT INTO public.fixtures (
          season_id,
          home_team_id,
          away_team_id,

          slug,

          provider,
          provider_id,
          is_demo,

          kickoff_at,

          status,
          provider_status,

          home_score,
          away_score,

          regulation_home_score,
          regulation_away_score,
          regulation_confirmed,

          provider_updated_at,
          fetched_at
        )
        VALUES (
          ${seasonId}::uuid,

          ${home.teamId}::uuid,

          ${away.teamId}::uuid,

          ${slug},

          ${API_SOURCE},
          ${providerId},
          false,

          ${fixture.kickoffAt}::timestamptz,

          'scheduled'::fixture_status,

          ${fixture.status.short},

          NULL,
          NULL,

          NULL,
          NULL,
          false,

          NULL,

          ${fetchedAt}::timestamptz
        )

        ON CONFLICT (
          provider,
          provider_id
        )
        DO NOTHING

        RETURNING id
      `;

    const rows =
      await sql`
        SELECT
          id,
          season_id,
          home_team_id,
          away_team_id,
          provider,
          provider_id,
          is_demo,
          kickoff_at,
          status,
          provider_status

        FROM public.fixtures

        WHERE provider =
          ${API_SOURCE}

          AND provider_id =
            ${providerId}
      `;

    assert.equal(
      rows.length,
      1,
      `Fixture ${providerId} was not persisted.`,
    );

    const stored =
      rows[0];

    /*
     * For this initial immutable pre-match import,
     * an existing fixture must still represent the
     * exact identity we previously stored.
     *
     * Rescheduling/status refresh will be handled
     * separately rather than silently rewriting
     * prediction-time fixture state here.
     */
    assert.equal(
      String(
        stored.season_id,
      ),
      seasonId,
      `Fixture ${providerId} season mismatch.`,
    );

    assert.equal(
      String(
        stored.home_team_id,
      ),
      home.teamId,
      `Fixture ${providerId} home-team mismatch.`,
    );

    assert.equal(
      String(
        stored.away_team_id,
      ),
      away.teamId,
      `Fixture ${providerId} away-team mismatch.`,
    );

    assert.equal(
      stored.is_demo,
      false,
    );

    assert.equal(
      new Date(
        String(
          stored.kickoff_at,
        ),
      ).toISOString(),
      new Date(
        fixture.kickoffAt,
      ).toISOString(),
      `Fixture ${providerId} kickoff mismatch.`,
    );

    return {
      id:
        String(
          stored.id,
        ),

      status:
        inserted.length ===
        1
          ? "inserted"
          : "existing",
    };
  }

  const persisted:
    Array<{
      fixture:
        NormalizedApiFootballFixture;

      fixtureId: string;

      home:
        CanonicalMappedTeam;

      away:
        CanonicalMappedTeam;

      rating:
        CommonRating;

      databaseStatus:
        "inserted" |
        "existing";
    }> = [];

  const now =
    Date.now();

  for (
    const fixture
    of page.fixtures
  ) {
    if (
      !PREMATCH_STATUSES.has(
        fixture.status.short,
      )
    ) {
      continue;
    }

    const scope =
  evaluatePredictionScope(
    fixture,
  );

if (
  !scope.eligible
) {
  continue;
}

    const kickoffMs =
      new Date(
        fixture.kickoffAt,
      ).getTime();

    if (
      !Number.isFinite(
        kickoffMs,
      ) ||
      kickoffMs <= now
    ) {
      continue;
    }

    stats.futurePrematch +=
      1;

    const home =
      await resolveApiTeam(
        fixture.home.id,
      );

    const away =
      await resolveApiTeam(
        fixture.away.id,
      );

    /*
     * Database writes require persisted,
     * reviewed source mappings.
     *
     * No exact/conservative name matching here.
     */
    if (
      !home ||
      !away
    ) {
      stats.missingVerifiedMapping +=
        1;

      continue;
    }

    const commonRating =
      await latestCommonRating(
        home.teamId,
        away.teamId,
        fixture.kickoffAt,
      );

    if (
      !commonRating
    ) {
      stats.noCommonRating +=
        1;

      continue;
    }

    const competitionId =
      await ensureCompetition(
        fixture,
      );

    const seasonId =
      await ensureSeason(
        fixture,
        competitionId,
      );

    const stored =
      await storeFixture(
        fixture,
        seasonId,
        home,
        away,
      );

    if (
      stored.status ===
      "inserted"
    ) {
      stats.fixturesInserted +=
        1;
    } else {
      stats.fixturesExisting +=
        1;
    }

    persisted.push({
      fixture,

      fixtureId:
        stored.id,

      home,
      away,

      rating:
        commonRating,

      databaseStatus:
        stored.status,
    });
  }

  console.log("");
  console.log(
    "PASS: only future pre-match API-Football fixtures considered.",
  );

  console.log(
    "PASS: database writes required verified API-Football team mappings.",
  );

  console.log(
    "PASS: every persisted fixture has a common pre-kickoff FootballDatabase rating snapshot.",
  );

  console.log(
    "PASS: competitions and seasons persisted idempotently.",
  );

  console.log(
    "PASS: fixture provider identity persisted idempotently.",
  );

  console.log(
    "PASS: no youth/reserve/name-fuzzy mapping was performed during writes.",
  );

  console.log("");

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `API fixtures received: ${stats.fixturesReceived}`,
  );

  console.log(
    `Future pre-match fixtures: ${stats.futurePrematch}`,
  );

  console.log(
    `Skipped without two verified mappings: ${stats.missingVerifiedMapping}`,
  );

  console.log(
    `Skipped without common rating: ${stats.noCommonRating}`,
  );

  console.log("");

  console.log(
    `Competitions inserted: ${stats.competitionsInserted}`,
  );

  console.log(
    `Competitions existing: ${stats.competitionsExisting}`,
  );

  console.log(
    `Seasons inserted: ${stats.seasonsInserted}`,
  );

  console.log(
    `Seasons existing: ${stats.seasonsExisting}`,
  );

  console.log(
    `Fixtures inserted: ${stats.fixturesInserted}`,
  );

  console.log(
    `Fixtures existing: ${stats.fixturesExisting}`,
  );

  console.log("");

  console.log(
    "PERSISTED RATED FIXTURES",
  );

  console.log(
    "========================",
  );

  console.log("");

  for (
    const item
    of persisted
  ) {
    const gap =
      item.rating.homeRating -
      item.rating.awayRating;

    console.log(
      `${item.fixture.kickoffAt.slice(
        11,
        16,
      )} UTC | ${item.fixture.home.name} vs ${item.fixture.away.name}`,
    );

    console.log(
      `${item.fixture.league.name} | ${item.fixture.league.country}`,
    );

    console.log(
      `API fixture: ${item.fixture.fixtureId}`,
    );

    console.log(
      `DictazIQ fixture: ${item.fixtureId}`,
    );

    console.log(
      `Database: ${item.databaseStatus}`,
    );

    console.log(
      `Home: API ${item.fixture.home.id} -> ${item.home.canonicalName}`,
    );

    console.log(
      `Away: API ${item.fixture.away.id} -> ${item.away.canonicalName}`,
    );

    console.log(
      `Rating snapshot: ${item.rating.snapshotDate}`,
    );

    console.log(
      `Ratings: ${item.rating.homeRating} - ${item.rating.awayRating}`,
    );

    console.log(
      `World ranks: ${item.rating.homeRank} - ${item.rating.awayRank}`,
    );

    console.log(
      `D = ${gap}`,
    );

    console.log("");
  }

  assert.ok(
    persisted.length > 0,
    "No rated fixtures were persisted.",
  );

  console.log(
    `PASS: ${persisted.length} real rated fixtures are now available in DictazIQ.`,
  );
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Rated fixture ingestion verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Rated fixture ingestion failed: ${error.message}`
          : "Rated fixture ingestion failed.",
      );
    }

    process.exitCode = 1;
  },
);
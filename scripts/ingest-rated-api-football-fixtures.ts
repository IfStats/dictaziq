import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  evaluatePredictionScope,
  PREDICTION_SCOPE_VERSION,
} from "../src/lib/predictions/prediction-scope";

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

  canonicalName:
    string;

  sourceTeamId:
    string;

  sourceName:
    string;

  country:
    string | null;
};

type CommonRating = {
  snapshotDate:
    string;

  homeSnapshotId:
    string;

  homeRating:
    number;

  homeRank:
    number;

  awaySnapshotId:
    string;

  awayRating:
    number;

  awayRank:
    number;
};

type Stats = {
  fixturesReceived:
    number;

  prematchStatus:
    number;

  futurePrematch:
    number;

  scopeEligible:
    number;

  excludedYouth:
    number;

  excludedWomen:
    number;

  excludedReserve:
    number;

  excludedAcademy:
    number;

  missingVerifiedMapping:
    number;

  noCommonRating:
    number;

  competitionsInserted:
    number;

  competitionsExisting:
    number;

  seasonsInserted:
    number;

  seasonsExisting:
    number;

  fixturesInserted:
    number;

  fixturesExisting:
    number;
};

function requestedDate():
  string {
  const value =
    process.argv[2]?.trim() ||
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

  assert.ok(
    Number.isFinite(
      parsed.getTime(),
    ) &&
      parsed
        .toISOString()
        .slice(
          0,
          10,
        ) === value,
    "Invalid fixture date.",
  );

  return value;
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
    typeof value ===
    "string"
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
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(
            value,
          ),
        );

  assert.ok(
    Number.isFinite(
      parsed.getTime(),
    ),
    "Invalid database date.",
  );

  return parsed
    .toISOString()
    .slice(
      0,
      10,
    );
}

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    `DictazIQ rated fixture persistence: ${date}`,
  );

  console.log(
    `Prediction scope: ${PREDICTION_SCOPE_VERSION}`,
  );

  /*
   * Resolve exactly one canonical football sport.
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

    prematchStatus:
      0,

    futurePrematch:
      0,

    scopeEligible:
      0,

    excludedYouth:
      0,

    excludedWomen:
      0,

    excludedReserve:
      0,

    excludedAcademy:
      0,

    missingVerifiedMapping:
      0,

    noCommonRating:
      0,

    competitionsInserted:
      0,

    competitionsExisting:
      0,

    seasonsInserted:
      0,

    seasonsExisting:
      0,

    fixturesInserted:
      0,

    fixturesExisting:
      0,
  };

  /*
   * Resolve API-Football identity ONLY through
   * reviewed and verified DB mappings.
   *
   * No fuzzy, exact-name or alias discovery is
   * permitted in the persistence stage.
   */
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
      rows.length ===
      0
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
          rows[0]
            .team_id,
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
        rows[0]
          .country ===
        null
          ? null
          : String(
              rows[0]
                .country,
            ),
    };
  }

  /*
   * Find the newest FootballDatabase rating snapshot
   * shared by BOTH canonical teams.
   *
   * Integrity requirements:
   *
   * 1. same source
   * 2. same weekly snapshot date
   * 3. non-demo
   * 4. snapshot date no later than kickoff date
   * 5. BOTH snapshots actually observed before kickoff
   *
   * Rule 5 prevents retrospective leakage where a
   * historical snapshot date could have been ingested
   * only after the fixture had already started.
   */
  async function latestCommonRating(
    homeTeamId: string,
    awayTeamId: string,
    kickoffAt: string,
  ): Promise<
    CommonRating | null
  > {
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
            (
              ${kickoffAt}::timestamptz
              AT TIME ZONE 'UTC'
            )::date

          AND home_rating.observed_at <
            ${kickoffAt}::timestamptz

          AND away_rating.observed_at <
            ${kickoffAt}::timestamptz

        ORDER BY
          home_rating.snapshot_date DESC,
          home_rating.observed_at DESC,
          away_rating.observed_at DESC

        LIMIT 1
      `;

    if (
      rows.length ===
      0
    ) {
      return null;
    }

    assert.equal(
      rows.length,
      1,
    );

    const homeRating =
      Number(
        rows[0]
          .home_rating,
      );

    const awayRating =
      Number(
        rows[0]
          .away_rating,
      );

    const homeRank =
      Number(
        rows[0]
          .home_rank,
      );

    const awayRank =
      Number(
        rows[0]
          .away_rank,
      );

    assert.ok(
      Number.isFinite(
        homeRating,
      ),
      "Home rating is invalid.",
    );

    assert.ok(
      Number.isFinite(
        awayRating,
      ),
      "Away rating is invalid.",
    );

    assert.ok(
      Number.isFinite(
        homeRank,
      ),
      "Home ranking position is invalid.",
    );

    assert.ok(
      Number.isFinite(
        awayRank,
      ),
      "Away ranking position is invalid.",
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

      homeRating,

      homeRank,

      awaySnapshotId:
        String(
          rows[0]
            .away_snapshot_id,
        ),

      awayRating,

      awayRank,
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
      existing.length >
      0
    ) {
      assert.equal(
        existing.length,
        1,
        `Competition provider identity ${providerId} is duplicated.`,
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
        `Competition ${fixture.league.name} unexpectedly points to demo data.`,
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
      inserted.length ===
      1
    ) {
      stats.competitionsInserted +=
        1;

      return String(
        inserted[0].id,
      );
    }

    const reload =
      await sql`
        SELECT
          id,
          sport_id,
          is_demo

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

    assert.equal(
      String(
        reload[0]
          .sport_id,
      ),
      footballSportId,
      `Competition ${fixture.league.name} has the wrong sport after reload.`,
    );

    assert.equal(
      reload[0]
        .is_demo,
      false,
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

    competitionId:
      string,
  ): Promise<string> {
    const label =
      String(
        fixture.league.season,
      );

    const existing =
      await sql`
        SELECT
          id

        FROM public.seasons

        WHERE competition_id =
          ${competitionId}::uuid

          AND label =
            ${label}
      `;

    if (
      existing.length >
      0
    ) {
      assert.equal(
        existing.length,
        1,
        `Season ${label} is duplicated for competition ${competitionId}.`,
      );

      stats.seasonsExisting +=
        1;

      return String(
        existing[0].id,
      );
    }

    /*
     * API-Football fixture payload gives a season
     * identifier/year, but this import does not have
     * authoritative competition season boundaries.
     *
     * Keep them NULL rather than inventing dates.
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
      inserted.length ===
      1
    ) {
      stats.seasonsInserted +=
        1;

      return String(
        inserted[0].id,
      );
    }

    const reload =
      await sql`
        SELECT
          id

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

    seasonId:
      string,

    home:
      CanonicalMappedTeam,

    away:
      CanonicalMappedTeam,
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

    const kickoff =
      new Date(
        fixture.kickoffAt,
      );

    assert.ok(
      Number.isFinite(
        kickoff.getTime(),
      ),
      `Fixture ${providerId} has invalid kickoff time.`,
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
     * Existing rows must represent the exact same
     * fixture identity.
     *
     * We do not silently mutate an existing
     * prediction-time fixture here.
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
      String(
        stored.provider,
      ),
      API_SOURCE,
    );

    assert.equal(
      String(
        stored.provider_id,
      ),
      providerId,
    );

    assert.equal(
      stored.is_demo,
      false,
      `Fixture ${providerId} unexpectedly points to demo data.`,
    );

    assert.equal(
      new Date(
        String(
          stored.kickoff_at,
        ),
      ).toISOString(),
      kickoff.toISOString(),
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

      fixtureId:
        string;

      home:
        CanonicalMappedTeam;

      away:
        CanonicalMappedTeam;

      rating:
        CommonRating;

      databaseStatus:
        | "inserted"
        | "existing";
    }> = [];

  const now =
    Date.now();

  for (
    const fixture
    of page.fixtures
  ) {
    /*
     * Only genuine pre-match provider states.
     */
    if (
      !PREMATCH_STATUSES.has(
        fixture.status.short,
      )
    ) {
      continue;
    }

    stats.prematchStatus +=
      1;

    const kickoffMs =
      Date.parse(
        fixture.kickoffAt,
      );

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

    /*
     * DictazIQ Core v1 population:
     * senior men's first-team football.
     *
     * Scope is enforced BEFORE identity resolution
     * and BEFORE any database write.
     */
    const scope =
      evaluatePredictionScope(
        fixture,
      );

    if (
      !scope.eligible
    ) {
      if (
        scope.reason ===
        "youth"
      ) {
        stats.excludedYouth +=
          1;
      }

      if (
        scope.reason ===
        "women"
      ) {
        stats.excludedWomen +=
          1;
      }

      if (
        scope.reason ===
        "reserve"
      ) {
        stats.excludedReserve +=
          1;
      }

      if (
        scope.reason ===
        "academy"
      ) {
        stats.excludedAcademy +=
          1;
      }

      continue;
    }

    stats.scopeEligible +=
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
     * A persistence write requires BOTH provider
     * identities to have already been reviewed and
     * verified.
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
    `PASS: prediction scope ${PREDICTION_SCOPE_VERSION} enforced before writes.`,
  );

  console.log(
    "PASS: database writes require two verified API-Football team mappings.",
  );

  console.log(
    "PASS: every persisted fixture uses a common FootballDatabase weekly rating snapshot.",
  );

  console.log(
    "PASS: both rating snapshots must have been observed before kickoff.",
  );

  console.log(
    "PASS: competitions and seasons persist idempotently.",
  );

  console.log(
    "PASS: fixture provider identity persists idempotently.",
  );

  console.log(
    "PASS: no fuzzy or automatic provider identity promotion occurs during persistence.",
  );

  console.log("");

  console.log(
    "========================================",
  );

  console.log(
    "PERSISTENCE SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `API fixtures received: ${stats.fixturesReceived}`,
  );

  console.log(
    `Provider pre-match status fixtures: ${stats.prematchStatus}`,
  );

  console.log(
    `Future pre-match fixtures: ${stats.futurePrematch}`,
  );

  console.log(
    `Scope-eligible senior fixtures: ${stats.scopeEligible}`,
  );

  console.log(
    `Excluded youth fixtures: ${stats.excludedYouth}`,
  );

  console.log(
    `Excluded women's fixtures: ${stats.excludedWomen}`,
  );

  console.log(
    `Excluded reserve/II fixtures: ${stats.excludedReserve}`,
  );

  console.log(
    `Excluded academy fixtures: ${stats.excludedAcademy}`,
  );

  console.log("");

  console.log(
    `Fixtures skipped without two verified API mappings: ${stats.missingVerifiedMapping}`,
  );

  console.log(
    `Fixtures skipped without common pre-kickoff rating: ${stats.noCommonRating}`,
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

  if (
    persisted.length ===
    0
  ) {
    console.log(
      "None.",
    );
  }

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

  /*
   * In the production daily pipeline, reaching this
   * stage with zero persisted fixtures is a blocking
   * coverage failure rather than a silent success.
   */
  assert.ok(
    persisted.length >
      0,
    "No rated fixtures were persisted.",
  );

  console.log(
    `PASS: ${persisted.length} real rated fixture(s) are available for downstream DictazIQ analysis.`,
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
        `Rated fixture ingestion verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof
        Error
          ? `Rated fixture ingestion failed: ${error.message}`
          : "Rated fixture ingestion failed.",
      );
    }

    process.exitCode =
      1;
  },
);
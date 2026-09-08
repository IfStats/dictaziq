import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";

export const fixtureStatus = pgEnum("fixture_status", [
  "scheduled",
  "live",
  "halftime",
  "finished",
  "postponed",
  "cancelled",
  "suspended",
  "abandoned",
  "awarded",
  "unknown",
]);

export const sports = pgTable("sports", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const competitions = pgTable(
  "competitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    country: text("country"),
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    isDemo: boolean("is_demo").notNull(),
  },
  (table) => [
    uniqueIndex("competitions_provider_identity").on(
      table.provider,
      table.providerId,
    ),
  ],
);

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
  },
  (table) => [
    uniqueIndex("seasons_competition_label").on(
      table.competitionId,
      table.label,
    ),
    check(
      "seasons_date_order",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    country: text("country"),
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    isDemo: boolean("is_demo").notNull(),
  },
  (table) => [
    uniqueIndex("teams_provider_identity").on(
      table.provider,
      table.providerId,
    ),
  ],
);

export const fixtures = pgTable(
  "fixtures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    homeTeamId: uuid("home_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    awayTeamId: uuid("away_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),

    slug: text("slug").notNull(),
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    isDemo: boolean("is_demo").notNull(),

    // Nullable when the provider has not confirmed a kickoff time.
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
    status: fixtureStatus("status").notNull().default("unknown"),
    providerStatus: text("provider_status"),

    // Display score may include extra time when the match reaches it.
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),

    // Settlement uses only confirmed regulation-time scores.
    regulationHomeScore: integer("regulation_home_score"),
    regulationAwayScore: integer("regulation_away_score"),
    regulationConfirmed: boolean("regulation_confirmed")
      .notNull()
      .default(false),

    providerUpdatedAt: timestamp("provider_updated_at", {
      withTimezone: true,
    }),
    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fixtures_provider_identity").on(
      table.provider,
      table.providerId,
    ),
    index("fixtures_kickoff").on(table.kickoffAt),
    index("fixtures_season_kickoff").on(
      table.seasonId,
      table.kickoffAt,
    ),
    index("fixtures_home_kickoff").on(
      table.homeTeamId,
      table.kickoffAt,
    ),
    index("fixtures_away_kickoff").on(
      table.awayTeamId,
      table.kickoffAt,
    ),
    check(
      "fixtures_different_teams",
      sql`${table.homeTeamId} <> ${table.awayTeamId}`,
    ),
    check(
      "fixtures_nonnegative_scores",
      sql`
        (${table.homeScore} IS NULL OR ${table.homeScore} >= 0)
        AND (${table.awayScore} IS NULL OR ${table.awayScore} >= 0)
        AND (
          ${table.regulationHomeScore} IS NULL
          OR ${table.regulationHomeScore} >= 0
        )
        AND (
          ${table.regulationAwayScore} IS NULL
          OR ${table.regulationAwayScore} >= 0
        )
      `,
    ),
    check(
      "fixtures_confirmed_regulation_scores",
      sql`
        NOT ${table.regulationConfirmed}
        OR (
          ${table.regulationHomeScore} IS NOT NULL
          AND ${table.regulationAwayScore} IS NOT NULL
        )
      `,
    ),
  ],
);

export const modelVersions = pgTable(
  "model_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),

    version: text("version").notNull().unique(),
    description: text("description").notNull(),

    // SHA-256 of the exact model source used for this version.
    codeSha256: text("code_sha256").notNull(),

    // Model settings, including history thresholds and smoothing.
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "model_versions_code_hash_format",
      sql`${table.codeSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "model_versions_configuration_object",
      sql`jsonb_typeof(${table.configuration}) = 'object'`,
    ),
  ],
);

export const predictions = pgTable(
  "predictions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    fixtureId: uuid("fixture_id")
      .notNull()
      .references(() => fixtures.id, { onDelete: "restrict" }),

    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => modelVersions.id, { onDelete: "restrict" }),

    // Explicit on every prediction, including seeded examples.
    isDemo: boolean("is_demo").notNull(),

    // Freeze the scheduled kickoff used at generation time.
    kickoffAtGeneration: timestamp("kickoff_at_generation", {
      withTimezone: true,
    }).notNull(),

    inputCutoffAt: timestamp("input_cutoff_at", {
      withTimezone: true,
    }).notNull(),

    generatedAt: timestamp("generated_at", {
      withTimezone: true,
    }).notNull(),

    // Null means generated but not published.
    publishedAt: timestamp("published_at", {
      withTimezone: true,
    }),

    // Hash of the canonical input snapshot for reproducibility.
    inputSha256: text("input_sha256").notNull(),

    // Complete fixture and historical inputs, not just their IDs.
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),

    // Complete Python output, including markets and sample sizes.
    output: jsonb("output")
      .$type<Record<string, unknown>>()
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("predictions_generation_identity").on(
      table.fixtureId,
      table.modelVersionId,
      table.inputSha256,
      table.inputCutoffAt,
    ),

    index("predictions_fixture_generated").on(
      table.fixtureId,
      table.generatedAt,
    ),

    index("predictions_publication").on(
      table.isDemo,
      table.publishedAt,
    ),

    check(
      "predictions_input_hash_format",
      sql`${table.inputSha256} ~ '^[0-9a-f]{64}$'`,
    ),

    check(
      "predictions_input_snapshot_object",
      sql`jsonb_typeof(${table.inputSnapshot}) = 'object'`,
    ),

    check(
      "predictions_output_object",
      sql`jsonb_typeof(${table.output}) = 'object'`,
    ),

    check(
      "predictions_generation_timing",
      sql`
        ${table.inputCutoffAt} <= ${table.generatedAt}
        AND ${table.generatedAt} < ${table.kickoffAtGeneration}
      `,
    ),

    check(
      "predictions_publication_timing",
      sql`
        ${table.publishedAt} IS NULL
        OR (
          ${table.publishedAt} >= ${table.generatedAt}
          AND ${table.publishedAt} < ${table.kickoffAtGeneration}
        )
      `,
    ),
  ],
);
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

export const resultSnapshots = pgTable(
  "result_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    fixtureId: uuid("fixture_id")
      .notNull()
      .references(() => fixtures.id, { onDelete: "restrict" }),

    // A stable identifier for this observation, reused on ingestion retries.
    observationKey: text("observation_key").notNull(),

    isDemo: boolean("is_demo").notNull(),

    status: fixtureStatus("status").notNull(),

    regulationHomeScore: integer("regulation_home_score"),
    regulationAwayScore: integer("regulation_away_score"),

    regulationConfirmed: boolean("regulation_confirmed")
      .notNull()
      .default(false),

    // Only populated when the source supplies a reliable finish time.
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
    }),

    // The provider's timestamp is distinct from our observation time.
    providerUpdatedAt: timestamp("provider_updated_at", {
      withTimezone: true,
    }),

    // Assigned by the database trigger, never backdated by the importer.
    observedAt: timestamp("observed_at", {
      withTimezone: true,
    }).notNull().defaultNow(),

    // Source evidence and team/competition context for this observation.
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull(),
  },
  (table) => [
    uniqueIndex("result_snapshots_observation_identity").on(
      table.fixtureId,
      table.observationKey,
    ),

    index("result_snapshots_fixture_observed").on(
      table.fixtureId,
      table.observedAt,
    ),

    check(
      "result_snapshots_observation_key_nonempty",
      sql`length(trim(${table.observationKey})) > 0`,
    ),

    check(
      "result_snapshots_evidence_object",
      sql`jsonb_typeof(${table.evidence}) = 'object'`,
    ),

    check(
      "result_snapshots_nonnegative_scores",
      sql`
        (
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
      "result_snapshots_confirmed_scores",
      sql`
        NOT ${table.regulationConfirmed}
        OR (
          ${table.regulationHomeScore} IS NOT NULL
          AND ${table.regulationAwayScore} IS NOT NULL
        )
      `,
    ),

    check(
      "result_snapshots_finish_before_observation",
      sql`
        ${table.finishedAt} IS NULL
        OR ${table.finishedAt} <= ${table.observedAt}
      `,
    ),
  ],
);

export const predictionOutcomes = pgTable(
  "prediction_outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    predictionId: uuid("prediction_id")
      .notNull()
      .references(() => predictions.id, { onDelete: "restrict" }),

    resultSnapshotId: uuid("result_snapshot_id")
      .notNull()
      .references(() => resultSnapshots.id, { onDelete: "restrict" }),

    market: text("market").notNull(),
    selection: text("selection").notNull(),

    // Pending predictions have no settlement for the current result snapshot.
    outcome: text("outcome").notNull(),

    rulesVersion: text("rules_version").notNull(),

    settledAt: timestamp("settled_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("prediction_outcomes_settlement_identity").on(
      table.predictionId,
      table.market,
      table.selection,
    ),

    check(
      "prediction_outcomes_valid_outcome",
      sql`${table.outcome} IN ('won', 'lost', 'void')`,
    ),

    check(
      "prediction_outcomes_nonempty_fields",
      sql`
        length(trim(${table.market})) > 0
        AND length(trim(${table.selection})) > 0
        AND length(trim(${table.rulesVersion})) > 0
      `,
    ),
  ],
);

export const teamRatingSnapshots = pgTable(
  "team_rating_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),

    // e.g. footballdatabase.com or footballdatabase.eu
    source: text("source").notNull(),

    // Optional source-specific team identifier.
    sourceTeamId: text("source_team_id"),

    // Rating publication/effective date supplied by the source.
    snapshotDate: date("snapshot_date").notNull(),

    rating: integer("rating").notNull(),

    // Global/source ranking position if supplied.
    rankingPosition: integer("ranking_position"),

    isDemo: boolean("is_demo").notNull(),

    // Database-stamped observation time; callers must not backdate it.
    observedAt: timestamp("observed_at", {
      withTimezone: true,
    }).notNull().defaultNow(),

    // Preserve the raw/source context used to create this snapshot.
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull(),
  },
  (table) => [
    uniqueIndex("team_rating_snapshots_identity").on(
      table.teamId,
      table.source,
      table.snapshotDate,
    ),

    index("team_rating_snapshots_source_date").on(
      table.source,
      table.snapshotDate,
    ),

    index("team_rating_snapshots_team_date").on(
      table.teamId,
      table.snapshotDate,
    ),

    check(
      "team_rating_snapshots_source_nonempty",
      sql`length(trim(${table.source})) > 0`,
    ),

    check(
      "team_rating_snapshots_rating_nonnegative",
      sql`${table.rating} >= 0`,
    ),

    check(
      "team_rating_snapshots_ranking_positive",
      sql`
        ${table.rankingPosition} IS NULL
        OR ${table.rankingPosition} > 0
      `,
    ),

    check(
      "team_rating_snapshots_evidence_object",
      sql`jsonb_typeof(${table.evidence}) = 'object'`,
    ),
  ],
);

export const contextEvidenceSnapshots = pgTable(
  "context_evidence_snapshots",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    fixtureId: uuid("fixture_id")
      .notNull()
      .references(
        () => fixtures.id,
        { onDelete: "restrict" },
      ),

    kind: text("kind")
      .notNull(),

    side: text("side")
      .notNull(),

    description: text("description")
      .notNull(),

    source: text("source")
      .notNull(),

    sourceEvidenceId:
      text("source_evidence_id"),

    evidenceSha256:
      text("evidence_sha256")
        .notNull(),

    isDemo: boolean("is_demo")
      .notNull(),

    /*
     * When the underlying information was known/observed.
     */
    observedAt: timestamp(
      "observed_at",
      {
        withTimezone: true,
        mode: "date",
      },
    ).notNull(),

    /*
     * Database-stamped ingestion time.
     */
    capturedAt: timestamp(
      "captured_at",
      {
        withTimezone: true,
        mode: "date",
      },
    )
      .defaultNow()
      .notNull(),

    evidence: jsonb("evidence")
      .notNull(),
  },
  (table) => [
    uniqueIndex(
      "context_evidence_fixture_hash_unique",
    ).on(
      table.fixtureId,
      table.evidenceSha256,
    ),

    index(
      "context_evidence_fixture_observed_idx",
    ).on(
      table.fixtureId,
      table.observedAt,
    ),

    index(
      "context_evidence_source_idx",
    ).on(
      table.source,
    ),

    check(
      "context_evidence_kind_check",
      sql`${table.kind} IN (
        'recent_form',
        'home_away_form',
        'squad_availability',
        'rest_schedule',
        'competition_position',
        'head_to_head',
        'tactical_matchup',
        'other_verified'
      )`,
    ),

    check(
      "context_evidence_side_check",
      sql`${table.side} IN (
        'home',
        'away',
        'neutral'
      )`,
    ),

    check(
      "context_evidence_description_check",
      sql`length(trim(${table.description})) > 0`,
    ),

    check(
      "context_evidence_source_check",
      sql`length(trim(${table.source})) > 0`,
    ),

    check(
      "context_evidence_sha_check",
      sql`length(${table.evidenceSha256}) = 64`,
    ),

    check(
      "context_evidence_object_check",
      sql`jsonb_typeof(${table.evidence}) = 'object'`,
    ),
  ],
);
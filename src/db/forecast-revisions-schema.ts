import { sql } from "drizzle-orm";

import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  fixtures,
  predictions,
} from "./schema";

export const forecastRevisions =
  pgTable(
    "forecast_revisions",

    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      /*
       * The original immutable published
       * prediction. Revisions never replace it.
       */
      baselinePredictionId:
        uuid(
          "baseline_prediction_id",
        )
          .notNull()
          .references(
            () =>
              predictions.id,
            {
              onDelete:
                "restrict",
            },
          ),

      fixtureId:
        uuid(
          "fixture_id",
        )
          .notNull()
          .references(
            () =>
              fixtures.id,
            {
              onDelete:
                "restrict",
            },
          ),

      isDemo:
        boolean(
          "is_demo",
        )
          .notNull(),

      /*
       * 1, 2, 3...
       *
       * Sequence belongs to one baseline
       * prediction.
       */
      revisionNumber:
        integer(
          "revision_number",
        )
          .notNull(),

      revisionVersion:
        text(
          "revision_version",
        )
          .notNull(),

      /*
       * Why was another forecast generated?
       */
      reason:
        text(
          "reason",
        )
          .notNull(),

      /*
       * mathematical
       * gpt_research
       * fusion
       */
      engine:
        text(
          "engine",
        )
          .notNull(),

      engineVersion:
        text(
          "engine_version",
        )
          .notNull(),

      /*
       * unavailable
       * unconfirmed
       * confirmed
       */
      lineupState:
        text(
          "lineup_state",
        )
          .notNull(),

      /*
       * Frozen kickoff inherited from the
       * baseline prediction.
       */
      kickoffAt:
        timestamp(
          "kickoff_at",
          {
            withTimezone:
              true,
          },
        )
          .notNull(),

      /*
       * Latest evidence observation actually
       * admitted into this revision.
       */
      inputCutoffAt:
        timestamp(
          "input_cutoff_at",
          {
            withTimezone:
              true,
          },
        )
          .notNull(),

      /*
       * The database guard will eventually own
       * the authoritative generation timestamp.
       */
      generatedAt:
        timestamp(
          "generated_at",
          {
            withTimezone:
              true,
          },
        )
          .notNull(),

      /*
       * NULL = internal draft.
       *
       * The only permitted future UPDATE will be
       * first publication NULL -> database clock.
       */
      publishedAt:
        timestamp(
          "published_at",
          {
            withTimezone:
              true,
          },
        ),

      selection:
        text(
          "selection",
        )
          .notNull(),

      confidence:
        text(
          "confidence",
        )
          .notNull(),

      evidenceGrade:
        text(
          "evidence_grade",
        )
          .notNull(),

      /*
       * Human-readable list explaining why
       * regeneration was justified.
       */
      materialChanges:
        jsonb(
          "material_changes",
        )
          .$type<string[]>()
          .notNull(),

      /*
       * Exact canonical input identity.
       */
      inputSha256:
        text(
          "input_sha256",
        )
          .notNull(),

      /*
       * Exact immutable output identity.
       */
      outputSha256:
        text(
          "output_sha256",
        )
          .notNull(),

      /*
       * Complete evidence and provenance used by
       * this revision.
       */
      inputSnapshot:
        jsonb(
          "input_snapshot",
        )
          .$type<
            Record<
              string,
              unknown
            >
          >()
          .notNull(),

      /*
       * Complete revision output.
       *
       * GPT, mathematical and future fusion
       * outputs can all be preserved here.
       */
      output:
        jsonb(
          "output",
        )
          .$type<
            Record<
              string,
              unknown
            >
          >()
          .notNull(),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,
          },
        )
          .defaultNow()
          .notNull(),
    },

    (
      table,
    ) => [
      /*
       * Revision sequence is unique inside one
       * immutable baseline.
       */
      uniqueIndex(
        "forecast_revisions_baseline_revision_unique",
      ).on(
        table
          .baselinePredictionId,
        table
          .revisionNumber,
      ),

      /*
       * Same frozen evidence must not create
       * duplicate revisions on scheduler retry.
       */
      uniqueIndex(
        "forecast_revisions_generation_identity",
      ).on(
        table
          .baselinePredictionId,
        table
          .engineVersion,
        table
          .inputSha256,
        table
          .inputCutoffAt,
      ),

      index(
        "forecast_revisions_fixture_idx",
      ).on(
        table.fixtureId,
      ),

      index(
        "forecast_revisions_baseline_idx",
      ).on(
        table
          .baselinePredictionId,
      ),

      index(
        "forecast_revisions_active_idx",
      ).on(
        table.fixtureId,
        table.publishedAt,
      ),

      check(
        "forecast_revisions_positive_revision",
        sql`
          ${table.revisionNumber}
          > 0
        `,
      ),

      check(
        "forecast_revisions_version_nonempty",
        sql`
          length(
            trim(
              ${table.revisionVersion}
            )
          ) > 0
        `,
      ),

      check(
        "forecast_revisions_engine_version_nonempty",
        sql`
          length(
            trim(
              ${table.engineVersion}
            )
          ) > 0
        `,
      ),

      check(
        "forecast_revisions_reason_check",
        sql`
          ${table.reason}
          IN (
            'scheduled_refresh',
            'developing_news',
            'confirmed_lineup',
            'final_prematch'
          )
        `,
      ),

      check(
        "forecast_revisions_engine_check",
        sql`
          ${table.engine}
          IN (
            'mathematical',
            'gpt_research',
            'fusion'
          )
        `,
      ),

      check(
        "forecast_revisions_lineup_state_check",
        sql`
          ${table.lineupState}
          IN (
            'unavailable',
            'unconfirmed',
            'confirmed'
          )
        `,
      ),

      check(
        "forecast_revisions_selection_check",
        sql`
          ${table.selection}
          IN (
            'home',
            'draw',
            'away'
          )
        `,
      ),

      check(
        "forecast_revisions_confidence_check",
        sql`
          ${table.confidence}
          IN (
            'high',
            'medium',
            'low',
            'very_low'
          )
        `,
      ),

      check(
        "forecast_revisions_evidence_grade_check",
        sql`
          ${table.evidenceGrade}
          IN (
            'A',
            'B',
            'C',
            'D',
            'E'
          )
        `,
      ),

      check(
        "forecast_revisions_confirmed_lineup_check",
        sql`
          ${table.reason}
            <> 'confirmed_lineup'
          OR
          ${table.lineupState}
            = 'confirmed'
        `,
      ),

      check(
        "forecast_revisions_input_hash_check",
        sql`
          ${table.inputSha256}
          ~ '^[0-9a-f]{64}$'
        `,
      ),

      check(
        "forecast_revisions_output_hash_check",
        sql`
          ${table.outputSha256}
          ~ '^[0-9a-f]{64}$'
        `,
      ),

      check(
        "forecast_revisions_material_changes_array",
        sql`
          jsonb_typeof(
            ${table.materialChanges}
          ) = 'array'
        `,
      ),

      check(
        "forecast_revisions_material_changes_count",
        sql`
          jsonb_array_length(
            ${table.materialChanges}
          )
          BETWEEN 1 AND 20
        `,
      ),

      check(
        "forecast_revisions_input_object",
        sql`
          jsonb_typeof(
            ${table.inputSnapshot}
          ) = 'object'
        `,
      ),

      check(
        "forecast_revisions_output_object",
        sql`
          jsonb_typeof(
            ${table.output}
          ) = 'object'
        `,
      ),

      check(
        "forecast_revisions_generation_timing",
        sql`
          ${table.inputCutoffAt}
            <=
          ${table.generatedAt}

          AND

          ${table.generatedAt}
            <
          ${table.kickoffAt}
        `,
      ),

      check(
        "forecast_revisions_publication_timing",
        sql`
          ${table.publishedAt}
            IS NULL

          OR (
            ${table.publishedAt}
              >=
            ${table.generatedAt}

            AND

            ${table.publishedAt}
              <
            ${table.kickoffAt}
          )
        `,
      ),
    ],
  );
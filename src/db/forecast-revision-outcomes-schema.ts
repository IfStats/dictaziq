import { sql } from "drizzle-orm";

import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  resultSnapshots,
} from "./schema";

import {
  forecastRevisions,
} from "./forecast-revisions-schema";

export const forecastRevisionOutcomes =
  pgTable(
    "forecast_revision_outcomes",

    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      revisionId:
        uuid(
          "revision_id",
        )
          .notNull()
          .references(
            () =>
              forecastRevisions.id,
            {
              onDelete:
                "restrict",
            },
          ),

      resultSnapshotId:
        uuid(
          "result_snapshot_id",
        )
          .notNull()
          .references(
            () =>
              resultSnapshots.id,
            {
              onDelete:
                "restrict",
            },
          ),

      /*
       * v0.1 settles the mandatory forecast:
       * regulation-time 1X2.
       */
      market:
        text(
          "market",
        )
          .notNull(),

      selection:
        text(
          "selection",
        )
          .notNull(),

      outcome:
        text(
          "outcome",
        )
          .notNull(),

      rulesVersion:
        text(
          "rules_version",
        )
          .notNull(),

      /*
       * Database guard owns the actual timestamp.
       */
      settledAt:
        timestamp(
          "settled_at",
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
       * A revision can have exactly one settlement
       * for one market.
       */
      uniqueIndex(
        "forecast_revision_outcomes_revision_market_unique",
      ).on(
        table.revisionId,
        table.market,
      ),

      index(
        "forecast_revision_outcomes_result_idx",
      ).on(
        table.resultSnapshotId,
      ),

      check(
        "forecast_revision_outcomes_market_check",
        sql`
          ${table.market}
          = '1x2'
        `,
      ),

      check(
        "forecast_revision_outcomes_selection_check",
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
        "forecast_revision_outcomes_outcome_check",
        sql`
          ${table.outcome}
          IN (
            'won',
            'lost',
            'void'
          )
        `,
      ),

      check(
        "forecast_revision_outcomes_rules_nonempty",
        sql`
          length(
            trim(
              ${table.rulesVersion}
            )
          ) > 0
        `,
      ),
    ],
  );
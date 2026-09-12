import {
  sql,
} from "drizzle-orm";

import {
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

export const providerResponseCache =
  pgTable(
    "provider_response_cache",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      provider:
        text("provider")
          .notNull(),

      resource:
        text("resource")
          .notNull(),

      cacheKey:
        text("cache_key")
          .notNull(),

      payload:
        jsonb("payload")
          .$type<
            Record<
              string,
              unknown
            >
          >()
          .notNull(),

      resultCount:
        integer("result_count")
          .notNull(),

      fetchedAt:
        timestamp(
          "fetched_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .defaultNow()
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .defaultNow()
          .notNull(),
    },

    (
      table,
    ) => [
      uniqueIndex(
        "provider_response_cache_identity",
      ).on(
        table.provider,
        table.resource,
        table.cacheKey,
      ),

      index(
        "provider_response_cache_fetched_idx",
      ).on(
        table.provider,
        table.resource,
        table.fetchedAt,
      ),

      check(
        "provider_response_cache_provider_check",
        sql`
          length(
            trim(
              ${table.provider}
            )
          ) > 0
        `,
      ),

      check(
        "provider_response_cache_resource_check",
        sql`
          length(
            trim(
              ${table.resource}
            )
          ) > 0
        `,
      ),

      check(
        "provider_response_cache_key_check",
        sql`
          length(
            trim(
              ${table.cacheKey}
            )
          ) > 0
        `,
      ),

      check(
        "provider_response_cache_payload_check",
        sql`
          jsonb_typeof(
            ${table.payload}
          ) = 'object'
        `,
      ),

      check(
        "provider_response_cache_result_count_check",
        sql`
          ${table.resultCount} >= 0
        `,
      ),
    ],
  );
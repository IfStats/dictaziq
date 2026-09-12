CREATE TABLE "provider_response_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"resource" text NOT NULL,
	"cache_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result_count" integer NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_response_cache_provider_check" CHECK (
          length(
            trim(
              "provider_response_cache"."provider"
            )
          ) > 0
        ),
	CONSTRAINT "provider_response_cache_resource_check" CHECK (
          length(
            trim(
              "provider_response_cache"."resource"
            )
          ) > 0
        ),
	CONSTRAINT "provider_response_cache_key_check" CHECK (
          length(
            trim(
              "provider_response_cache"."cache_key"
            )
          ) > 0
        ),
	CONSTRAINT "provider_response_cache_payload_check" CHECK (
          jsonb_typeof(
            "provider_response_cache"."payload"
          ) = 'object'
        ),
	CONSTRAINT "provider_response_cache_result_count_check" CHECK (
          "provider_response_cache"."result_count" >= 0
        )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_response_cache_identity" ON "provider_response_cache" USING btree ("provider","resource","cache_key");--> statement-breakpoint
CREATE INDEX "provider_response_cache_fetched_idx" ON "provider_response_cache" USING btree ("provider","resource","fetched_at");
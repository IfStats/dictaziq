CREATE TABLE "provider_api_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"usage_date" date NOT NULL,
	"category" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_api_usage_daily_non_negative" CHECK ("provider_api_usage_daily"."request_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_api_usage_daily_identity" ON "provider_api_usage_daily" USING btree ("provider","usage_date","category");
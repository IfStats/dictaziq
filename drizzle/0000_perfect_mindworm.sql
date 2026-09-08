CREATE TYPE "public"."fixture_status" AS ENUM('scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled', 'suspended', 'abandoned', 'awarded', 'unknown');--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"is_demo" boolean NOT NULL,
	CONSTRAINT "competitions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"is_demo" boolean NOT NULL,
	"kickoff_at" timestamp with time zone,
	"status" "fixture_status" DEFAULT 'unknown' NOT NULL,
	"provider_status" text,
	"home_score" integer,
	"away_score" integer,
	"regulation_home_score" integer,
	"regulation_away_score" integer,
	"regulation_confirmed" boolean DEFAULT false NOT NULL,
	"provider_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixtures_different_teams" CHECK ("fixtures"."home_team_id" <> "fixtures"."away_team_id"),
	CONSTRAINT "fixtures_nonnegative_scores" CHECK (
        ("fixtures"."home_score" IS NULL OR "fixtures"."home_score" >= 0)
        AND ("fixtures"."away_score" IS NULL OR "fixtures"."away_score" >= 0)
        AND (
          "fixtures"."regulation_home_score" IS NULL
          OR "fixtures"."regulation_home_score" >= 0
        )
        AND (
          "fixtures"."regulation_away_score" IS NULL
          OR "fixtures"."regulation_away_score" >= 0
        )
      ),
	CONSTRAINT "fixtures_confirmed_regulation_scores" CHECK (
        NOT "fixtures"."regulation_confirmed"
        OR (
          "fixtures"."regulation_home_score" IS NOT NULL
          AND "fixtures"."regulation_away_score" IS NOT NULL
        )
      )
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"label" text NOT NULL,
	"start_date" date,
	"end_date" date,
	CONSTRAINT "seasons_date_order" CHECK ("seasons"."end_date" >= "seasons"."start_date")
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "sports_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"country" text,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"is_demo" boolean NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitions_provider_identity" ON "competitions" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fixtures_provider_identity" ON "fixtures" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "fixtures_kickoff" ON "fixtures" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "fixtures_season_kickoff" ON "fixtures" USING btree ("season_id","kickoff_at");--> statement-breakpoint
CREATE INDEX "fixtures_home_kickoff" ON "fixtures" USING btree ("home_team_id","kickoff_at");--> statement-breakpoint
CREATE INDEX "fixtures_away_kickoff" ON "fixtures" USING btree ("away_team_id","kickoff_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_competition_label" ON "seasons" USING btree ("competition_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_provider_identity" ON "teams" USING btree ("provider","provider_id");
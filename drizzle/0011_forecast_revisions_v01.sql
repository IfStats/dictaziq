CREATE TABLE "forecast_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baseline_prediction_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"is_demo" boolean NOT NULL,
	"revision_number" integer NOT NULL,
	"revision_version" text NOT NULL,
	"reason" text NOT NULL,
	"engine" text NOT NULL,
	"engine_version" text NOT NULL,
	"lineup_state" text NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"input_cutoff_at" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"selection" text NOT NULL,
	"confidence" text NOT NULL,
	"evidence_grade" text NOT NULL,
	"material_changes" jsonb NOT NULL,
	"input_sha256" text NOT NULL,
	"output_sha256" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forecast_revisions_positive_revision" CHECK (
          "forecast_revisions"."revision_number"
          > 0
        ),
	CONSTRAINT "forecast_revisions_version_nonempty" CHECK (
          length(
            trim(
              "forecast_revisions"."revision_version"
            )
          ) > 0
        ),
	CONSTRAINT "forecast_revisions_engine_version_nonempty" CHECK (
          length(
            trim(
              "forecast_revisions"."engine_version"
            )
          ) > 0
        ),
	CONSTRAINT "forecast_revisions_reason_check" CHECK (
          "forecast_revisions"."reason"
          IN (
            'scheduled_refresh',
            'developing_news',
            'confirmed_lineup',
            'final_prematch'
          )
        ),
	CONSTRAINT "forecast_revisions_engine_check" CHECK (
          "forecast_revisions"."engine"
          IN (
            'mathematical',
            'gpt_research',
            'fusion'
          )
        ),
	CONSTRAINT "forecast_revisions_lineup_state_check" CHECK (
          "forecast_revisions"."lineup_state"
          IN (
            'unavailable',
            'unconfirmed',
            'confirmed'
          )
        ),
	CONSTRAINT "forecast_revisions_selection_check" CHECK (
          "forecast_revisions"."selection"
          IN (
            'home',
            'draw',
            'away'
          )
        ),
	CONSTRAINT "forecast_revisions_confidence_check" CHECK (
          "forecast_revisions"."confidence"
          IN (
            'high',
            'medium',
            'low',
            'very_low'
          )
        ),
	CONSTRAINT "forecast_revisions_evidence_grade_check" CHECK (
          "forecast_revisions"."evidence_grade"
          IN (
            'A',
            'B',
            'C',
            'D',
            'E'
          )
        ),
	CONSTRAINT "forecast_revisions_confirmed_lineup_check" CHECK (
          "forecast_revisions"."reason"
            <> 'confirmed_lineup'
          OR
          "forecast_revisions"."lineup_state"
            = 'confirmed'
        ),
	CONSTRAINT "forecast_revisions_input_hash_check" CHECK (
          "forecast_revisions"."input_sha256"
          ~ '^[0-9a-f]{64}$'
        ),
	CONSTRAINT "forecast_revisions_output_hash_check" CHECK (
          "forecast_revisions"."output_sha256"
          ~ '^[0-9a-f]{64}$'
        ),
	CONSTRAINT "forecast_revisions_material_changes_array" CHECK (
          jsonb_typeof(
            "forecast_revisions"."material_changes"
          ) = 'array'
        ),
	CONSTRAINT "forecast_revisions_material_changes_count" CHECK (
          jsonb_array_length(
            "forecast_revisions"."material_changes"
          )
          BETWEEN 1 AND 20
        ),
	CONSTRAINT "forecast_revisions_input_object" CHECK (
          jsonb_typeof(
            "forecast_revisions"."input_snapshot"
          ) = 'object'
        ),
	CONSTRAINT "forecast_revisions_output_object" CHECK (
          jsonb_typeof(
            "forecast_revisions"."output"
          ) = 'object'
        ),
	CONSTRAINT "forecast_revisions_generation_timing" CHECK (
          "forecast_revisions"."input_cutoff_at"
            <=
          "forecast_revisions"."generated_at"

          AND

          "forecast_revisions"."generated_at"
            <
          "forecast_revisions"."kickoff_at"
        ),
	CONSTRAINT "forecast_revisions_publication_timing" CHECK (
          "forecast_revisions"."published_at"
            IS NULL

          OR (
            "forecast_revisions"."published_at"
              >=
            "forecast_revisions"."generated_at"

            AND

            "forecast_revisions"."published_at"
              <
            "forecast_revisions"."kickoff_at"
          )
        )
);
--> statement-breakpoint
ALTER TABLE "forecast_revisions" ADD CONSTRAINT "forecast_revisions_baseline_prediction_id_predictions_id_fk" FOREIGN KEY ("baseline_prediction_id") REFERENCES "public"."predictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_revisions" ADD CONSTRAINT "forecast_revisions_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_revisions_baseline_revision_unique" ON "forecast_revisions" USING btree ("baseline_prediction_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_revisions_generation_identity" ON "forecast_revisions" USING btree ("baseline_prediction_id","engine_version","input_sha256","input_cutoff_at");--> statement-breakpoint
CREATE INDEX "forecast_revisions_fixture_idx" ON "forecast_revisions" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "forecast_revisions_baseline_idx" ON "forecast_revisions" USING btree ("baseline_prediction_id");--> statement-breakpoint
CREATE INDEX "forecast_revisions_active_idx" ON "forecast_revisions" USING btree ("fixture_id","published_at");
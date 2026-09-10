CREATE TABLE "forecast_revision_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"result_snapshot_id" uuid NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"outcome" text NOT NULL,
	"rules_version" text NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forecast_revision_outcomes_market_check" CHECK (
          "forecast_revision_outcomes"."market"
          = '1x2'
        ),
	CONSTRAINT "forecast_revision_outcomes_selection_check" CHECK (
          "forecast_revision_outcomes"."selection"
          IN (
            'home',
            'draw',
            'away'
          )
        ),
	CONSTRAINT "forecast_revision_outcomes_outcome_check" CHECK (
          "forecast_revision_outcomes"."outcome"
          IN (
            'won',
            'lost',
            'void'
          )
        ),
	CONSTRAINT "forecast_revision_outcomes_rules_nonempty" CHECK (
          length(
            trim(
              "forecast_revision_outcomes"."rules_version"
            )
          ) > 0
        )
);
--> statement-breakpoint
ALTER TABLE "forecast_revision_outcomes" ADD CONSTRAINT "forecast_revision_outcomes_revision_id_forecast_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."forecast_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_revision_outcomes" ADD CONSTRAINT "forecast_revision_outcomes_result_snapshot_id_result_snapshots_id_fk" FOREIGN KEY ("result_snapshot_id") REFERENCES "public"."result_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_revision_outcomes_revision_market_unique" ON "forecast_revision_outcomes" USING btree ("revision_id","market");--> statement-breakpoint
CREATE INDEX "forecast_revision_outcomes_result_idx" ON "forecast_revision_outcomes" USING btree ("result_snapshot_id");
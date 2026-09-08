CREATE TABLE "prediction_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid NOT NULL,
	"result_snapshot_id" uuid NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"outcome" text NOT NULL,
	"rules_version" text NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_outcomes_valid_outcome" CHECK ("prediction_outcomes"."outcome" IN ('won', 'lost', 'void')),
	CONSTRAINT "prediction_outcomes_nonempty_fields" CHECK (
        length(trim("prediction_outcomes"."market")) > 0
        AND length(trim("prediction_outcomes"."selection")) > 0
        AND length(trim("prediction_outcomes"."rules_version")) > 0
      )
);
--> statement-breakpoint
ALTER TABLE "prediction_outcomes" ADD CONSTRAINT "prediction_outcomes_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_outcomes" ADD CONSTRAINT "prediction_outcomes_result_snapshot_id_result_snapshots_id_fk" FOREIGN KEY ("result_snapshot_id") REFERENCES "public"."result_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_outcomes_settlement_identity" ON "prediction_outcomes" USING btree ("prediction_id","result_snapshot_id","market","selection");
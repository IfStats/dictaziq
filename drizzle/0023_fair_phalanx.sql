CREATE TABLE "prematch_batch_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prematch_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"lineup_check_at" timestamp with time zone NOT NULL,
	"lineup_retry_at" timestamp with time zone NOT NULL,
	"final_review_at" timestamp with time zone NOT NULL,
	"fixture_count" integer DEFAULT 0 NOT NULL,
	"lineup_check_status" text DEFAULT 'pending' NOT NULL,
	"lineup_retry_status" text DEFAULT 'pending' NOT NULL,
	"final_review_status" text DEFAULT 'pending' NOT NULL,
	"lineup_check_completed_at" timestamp with time zone,
	"lineup_retry_completed_at" timestamp with time zone,
	"final_review_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prematch_batches_fixture_count_check" CHECK ("prematch_batches"."fixture_count" >= 0),
	CONSTRAINT "prematch_batches_schedule_order_check" CHECK (
        "prematch_batches"."lineup_check_at" < "prematch_batches"."lineup_retry_at"
        AND "prematch_batches"."lineup_retry_at" < "prematch_batches"."final_review_at"
        AND "prematch_batches"."final_review_at" < "prematch_batches"."kickoff_at"
      ),
	CONSTRAINT "prematch_batches_lineup_check_status_check" CHECK ("prematch_batches"."lineup_check_status" IN (
        'pending',
        'running',
        'completed',
        'skipped',
        'failed'
      )),
	CONSTRAINT "prematch_batches_lineup_retry_status_check" CHECK ("prematch_batches"."lineup_retry_status" IN (
        'pending',
        'running',
        'completed',
        'skipped',
        'failed'
      )),
	CONSTRAINT "prematch_batches_final_review_status_check" CHECK ("prematch_batches"."final_review_status" IN (
        'pending',
        'running',
        'completed',
        'skipped',
        'failed'
      ))
);
--> statement-breakpoint
ALTER TABLE "prematch_batch_fixtures" ADD CONSTRAINT "prematch_batch_fixtures_batch_id_prematch_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."prematch_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prematch_batch_fixtures" ADD CONSTRAINT "prematch_batch_fixtures_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prematch_batch_fixtures_fixture_unique" ON "prematch_batch_fixtures" USING btree ("fixture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prematch_batch_fixtures_batch_fixture_unique" ON "prematch_batch_fixtures" USING btree ("batch_id","fixture_id");--> statement-breakpoint
CREATE INDEX "prematch_batch_fixtures_batch_idx" ON "prematch_batch_fixtures" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prematch_batches_kickoff_unique" ON "prematch_batches" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "prematch_batches_final_review_idx" ON "prematch_batches" USING btree ("final_review_at","final_review_status");--> statement-breakpoint
CREATE INDEX "prematch_batches_lineup_check_idx" ON "prematch_batches" USING btree ("lineup_check_at","lineup_check_status");
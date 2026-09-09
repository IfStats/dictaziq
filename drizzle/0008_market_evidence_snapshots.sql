CREATE TABLE "market_evidence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"evidence_version" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"source" text NOT NULL,
	"is_demo" boolean NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "market_evidence_version_check" CHECK (
        length(
          trim("market_evidence_snapshots"."evidence_version")
        ) > 0
      ),
	CONSTRAINT "market_evidence_source_check" CHECK (
        length(
          trim("market_evidence_snapshots"."source")
        ) > 0
      ),
	CONSTRAINT "market_evidence_sha_check" CHECK (
        "market_evidence_snapshots"."evidence_sha256"
        ~ '^[0-9a-f]{64}$'
      ),
	CONSTRAINT "market_evidence_object_check" CHECK (
        jsonb_typeof(
          "market_evidence_snapshots"."evidence"
        ) = 'object'
      )
);
--> statement-breakpoint
ALTER TABLE "market_evidence_snapshots" ADD CONSTRAINT "market_evidence_snapshots_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_evidence_fixture_hash_unique" ON "market_evidence_snapshots" USING btree ("fixture_id","evidence_sha256");--> statement-breakpoint
CREATE INDEX "market_evidence_fixture_cutoff_idx" ON "market_evidence_snapshots" USING btree ("fixture_id","cutoff_at");--> statement-breakpoint
CREATE INDEX "market_evidence_source_idx" ON "market_evidence_snapshots" USING btree ("source");
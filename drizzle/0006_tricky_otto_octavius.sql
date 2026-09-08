CREATE TABLE "context_evidence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"side" text NOT NULL,
	"description" text NOT NULL,
	"source" text NOT NULL,
	"source_evidence_id" text,
	"evidence_sha256" text NOT NULL,
	"is_demo" boolean NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "context_evidence_kind_check" CHECK ("context_evidence_snapshots"."kind" IN (
        'recent_form',
        'home_away_form',
        'squad_availability',
        'rest_schedule',
        'competition_position',
        'head_to_head',
        'tactical_matchup',
        'other_verified'
      )),
	CONSTRAINT "context_evidence_side_check" CHECK ("context_evidence_snapshots"."side" IN (
        'home',
        'away',
        'neutral'
      )),
	CONSTRAINT "context_evidence_description_check" CHECK (length(trim("context_evidence_snapshots"."description")) > 0),
	CONSTRAINT "context_evidence_source_check" CHECK (length(trim("context_evidence_snapshots"."source")) > 0),
	CONSTRAINT "context_evidence_sha_check" CHECK (length("context_evidence_snapshots"."evidence_sha256") = 64),
	CONSTRAINT "context_evidence_object_check" CHECK (jsonb_typeof("context_evidence_snapshots"."evidence") = 'object')
);
--> statement-breakpoint
ALTER TABLE "context_evidence_snapshots" ADD CONSTRAINT "context_evidence_snapshots_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "context_evidence_fixture_hash_unique" ON "context_evidence_snapshots" USING btree ("fixture_id","evidence_sha256");--> statement-breakpoint
CREATE INDEX "context_evidence_fixture_observed_idx" ON "context_evidence_snapshots" USING btree ("fixture_id","observed_at");--> statement-breakpoint
CREATE INDEX "context_evidence_source_idx" ON "context_evidence_snapshots" USING btree ("source");

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dictaziq_guard_context_evidence_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fixture_is_demo boolean;
  fixture_kickoff timestamptz;
  checked_at timestamptz;
BEGIN
  SELECT
    is_demo,
    kickoff_at
  INTO
    fixture_is_demo,
    fixture_kickoff
  FROM public.fixtures
  WHERE id = NEW.fixture_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Context evidence fixture does not exist.';
  END IF;

  IF fixture_kickoff IS NULL THEN
    RAISE EXCEPTION
      'Context evidence requires a known fixture kickoff.';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM fixture_is_demo THEN
    RAISE EXCEPTION
      'Context evidence demo classification must match fixture.';
  END IF;

  checked_at := clock_timestamp();

  /*
   * Critical chronology rule:
   *
   * Evidence itself must have been observed before kickoff,
   * AND DictazIQ must actually ingest it before kickoff.
   *
   * Supplying an old observed_at after the match has started
   * therefore cannot retroactively create pre-match evidence.
   */
  IF checked_at >= fixture_kickoff THEN
    RAISE EXCEPTION
      'Context evidence cannot be captured at or after fixture kickoff.';
  END IF;

  IF NEW.observed_at >= fixture_kickoff THEN
    RAISE EXCEPTION
      'Context evidence observation must be before fixture kickoff.';
  END IF;

  IF NEW.observed_at > checked_at THEN
    RAISE EXCEPTION
      'Context evidence observation cannot be in the future.';
  END IF;

  NEW.kind := lower(trim(NEW.kind));
  NEW.side := lower(trim(NEW.side));
  NEW.source := lower(trim(NEW.source));
  NEW.description := trim(NEW.description);
  NEW.evidence_sha256 := lower(trim(NEW.evidence_sha256));

  IF NEW.source_evidence_id IS NOT NULL THEN
    NEW.source_evidence_id :=
      NULLIF(trim(NEW.source_evidence_id), '');
  END IF;

  IF NEW.source = '' THEN
    RAISE EXCEPTION
      'Context evidence source must not be empty.';
  END IF;

  IF NEW.description = '' THEN
    RAISE EXCEPTION
      'Context evidence description must not be empty.';
  END IF;

  IF NEW.evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION
      'Context evidence SHA-256 must be 64 lowercase hexadecimal characters.';
  END IF;

  /*
   * Caller cannot choose the ingestion timestamp.
   */
  NEW.captured_at := checked_at;

  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE TRIGGER context_evidence_snapshots_guard
BEFORE INSERT
ON public.context_evidence_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_guard_context_evidence_snapshot();

--> statement-breakpoint
CREATE TRIGGER context_evidence_snapshots_immutable
BEFORE UPDATE OR DELETE
ON public.context_evidence_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_reject_history_change();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dictaziq_reject_context_evidence_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Context evidence history cannot be truncated.';
END;
$$;

--> statement-breakpoint
CREATE TRIGGER context_evidence_snapshots_no_truncate
BEFORE TRUNCATE
ON public.context_evidence_snapshots
FOR EACH STATEMENT
EXECUTE FUNCTION public.dictaziq_reject_context_evidence_truncate();
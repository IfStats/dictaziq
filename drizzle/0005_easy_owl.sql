CREATE TABLE "team_rating_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_team_id" text,
	"snapshot_date" date NOT NULL,
	"rating" integer NOT NULL,
	"ranking_position" integer,
	"is_demo" boolean NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "team_rating_snapshots_source_nonempty" CHECK (length(trim("team_rating_snapshots"."source")) > 0),
	CONSTRAINT "team_rating_snapshots_rating_nonnegative" CHECK ("team_rating_snapshots"."rating" >= 0),
	CONSTRAINT "team_rating_snapshots_ranking_positive" CHECK (
        "team_rating_snapshots"."ranking_position" IS NULL
        OR "team_rating_snapshots"."ranking_position" > 0
      ),
	CONSTRAINT "team_rating_snapshots_evidence_object" CHECK (jsonb_typeof("team_rating_snapshots"."evidence") = 'object')
);
--> statement-breakpoint
ALTER TABLE "team_rating_snapshots" ADD CONSTRAINT "team_rating_snapshots_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_rating_snapshots_identity" ON "team_rating_snapshots" USING btree ("team_id","source","snapshot_date");--> statement-breakpoint
CREATE INDEX "team_rating_snapshots_source_date" ON "team_rating_snapshots" USING btree ("source","snapshot_date");--> statement-breakpoint
CREATE INDEX "team_rating_snapshots_team_date" ON "team_rating_snapshots" USING btree ("team_id","snapshot_date");

--> statement-breakpoint
CREATE FUNCTION public.dictaziq_guard_team_rating_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  team_is_demo boolean;
  checked_at timestamptz;
BEGIN
  SELECT is_demo
  INTO team_is_demo
  FROM public.teams
  WHERE id = NEW.team_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Rating snapshot team does not exist'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM team_is_demo THEN
    RAISE EXCEPTION
      'Rating snapshot and team demo classifications must match'
      USING ERRCODE = '23514';
  END IF;

  -- Normalize source identity so casing/whitespace cannot create
  -- duplicate logical providers.
  NEW.source := lower(trim(NEW.source));

  IF length(NEW.source) = 0 THEN
    RAISE EXCEPTION
      'Rating snapshot source must not be empty'
      USING ERRCODE = '23514';
  END IF;

  checked_at := clock_timestamp();

  -- A rating snapshot cannot claim an effective date in the future.
  IF NEW.snapshot_date > (checked_at AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION
      'Rating snapshot date cannot be in the future'
      USING ERRCODE = '23514';
  END IF;

  -- Never trust a caller-supplied observation timestamp.
  NEW.observed_at := checked_at;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER team_rating_snapshots_guard
BEFORE INSERT ON public.team_rating_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_guard_team_rating_snapshot();
--> statement-breakpoint
CREATE TRIGGER team_rating_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.team_rating_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_reject_history_change();
--> statement-breakpoint
CREATE TRIGGER team_rating_snapshots_no_truncate
BEFORE TRUNCATE ON public.team_rating_snapshots
FOR EACH STATEMENT
EXECUTE FUNCTION public.dictaziq_reject_history_change();
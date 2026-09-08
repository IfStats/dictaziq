CREATE TABLE "result_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"observation_key" text NOT NULL,
	"is_demo" boolean NOT NULL,
	"status" "fixture_status" NOT NULL,
	"regulation_home_score" integer,
	"regulation_away_score" integer,
	"regulation_confirmed" boolean DEFAULT false NOT NULL,
	"finished_at" timestamp with time zone,
	"provider_updated_at" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "result_snapshots_observation_key_nonempty" CHECK (length(trim("result_snapshots"."observation_key")) > 0),
	CONSTRAINT "result_snapshots_evidence_object" CHECK (jsonb_typeof("result_snapshots"."evidence") = 'object'),
	CONSTRAINT "result_snapshots_nonnegative_scores" CHECK (
        (
          "result_snapshots"."regulation_home_score" IS NULL
          OR "result_snapshots"."regulation_home_score" >= 0
        )
        AND (
          "result_snapshots"."regulation_away_score" IS NULL
          OR "result_snapshots"."regulation_away_score" >= 0
        )
      ),
	CONSTRAINT "result_snapshots_confirmed_scores" CHECK (
        NOT "result_snapshots"."regulation_confirmed"
        OR (
          "result_snapshots"."regulation_home_score" IS NOT NULL
          AND "result_snapshots"."regulation_away_score" IS NOT NULL
        )
      ),
	CONSTRAINT "result_snapshots_finish_before_observation" CHECK (
        "result_snapshots"."finished_at" IS NULL
        OR "result_snapshots"."finished_at" <= "result_snapshots"."observed_at"
      )
);
--> statement-breakpoint
ALTER TABLE "result_snapshots" ADD CONSTRAINT "result_snapshots_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "result_snapshots_observation_identity" ON "result_snapshots" USING btree ("fixture_id","observation_key");--> statement-breakpoint
CREATE INDEX "result_snapshots_fixture_observed" ON "result_snapshots" USING btree ("fixture_id","observed_at");

--> statement-breakpoint
CREATE FUNCTION public.dictaziq_stamp_result_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fixture_is_demo boolean;
BEGIN
  SELECT is_demo
  INTO fixture_is_demo
  FROM public.fixtures
  WHERE id = NEW.fixture_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Result snapshot fixture does not exist'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM fixture_is_demo THEN
    RAISE EXCEPTION
      'Result snapshot and fixture demo classifications must match'
      USING ERRCODE = '23514';
  END IF;

  NEW.observed_at := clock_timestamp();

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER result_snapshots_stamp
BEFORE INSERT ON public.result_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_stamp_result_snapshot();
--> statement-breakpoint
CREATE TRIGGER result_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.result_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_reject_history_change();
--> statement-breakpoint
CREATE TRIGGER result_snapshots_no_truncate
BEFORE TRUNCATE ON public.result_snapshots
FOR EACH STATEMENT
EXECUTE FUNCTION public.dictaziq_reject_history_change();
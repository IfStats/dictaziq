CREATE TABLE "model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid NOT NULL,
	"version" text NOT NULL,
	"description" text NOT NULL,
	"code_sha256" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_versions_version_unique" UNIQUE("version"),
	CONSTRAINT "model_versions_code_hash_format" CHECK ("model_versions"."code_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "model_versions_configuration_object" CHECK (jsonb_typeof("model_versions"."configuration") = 'object')
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"model_version_id" uuid NOT NULL,
	"is_demo" boolean NOT NULL,
	"kickoff_at_generation" timestamp with time zone NOT NULL,
	"input_cutoff_at" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"input_sha256" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_input_hash_format" CHECK ("predictions"."input_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "predictions_input_snapshot_object" CHECK (jsonb_typeof("predictions"."input_snapshot") = 'object'),
	CONSTRAINT "predictions_output_object" CHECK (jsonb_typeof("predictions"."output") = 'object'),
	CONSTRAINT "predictions_generation_timing" CHECK (
        "predictions"."input_cutoff_at" <= "predictions"."generated_at"
        AND "predictions"."generated_at" < "predictions"."kickoff_at_generation"
      ),
	CONSTRAINT "predictions_publication_timing" CHECK (
        "predictions"."published_at" IS NULL
        OR (
          "predictions"."published_at" >= "predictions"."generated_at"
          AND "predictions"."published_at" < "predictions"."kickoff_at_generation"
        )
      )
);
--> statement-breakpoint
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_generation_identity" ON "predictions" USING btree ("fixture_id","model_version_id","input_sha256","input_cutoff_at");--> statement-breakpoint
CREATE INDEX "predictions_fixture_generated" ON "predictions" USING btree ("fixture_id","generated_at");--> statement-breakpoint
CREATE INDEX "predictions_publication" ON "predictions" USING btree ("is_demo","published_at");

--> statement-breakpoint
CREATE FUNCTION public.dictaziq_reject_history_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Historical records in % cannot be changed or removed',
    TG_TABLE_NAME
    USING ERRCODE = '23514';

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER model_versions_immutable
BEFORE UPDATE OR DELETE ON public.model_versions
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_reject_history_change();
--> statement-breakpoint
CREATE TRIGGER model_versions_no_truncate
BEFORE TRUNCATE ON public.model_versions
FOR EACH STATEMENT
EXECUTE FUNCTION public.dictaziq_reject_history_change();
--> statement-breakpoint
CREATE TRIGGER predictions_no_truncate
BEFORE TRUNCATE ON public.predictions
FOR EACH STATEMENT
EXECUTE FUNCTION public.dictaziq_reject_history_change();
--> statement-breakpoint
CREATE FUNCTION public.dictaziq_guard_prediction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fixture_row public.fixtures%ROWTYPE;
  fixture_sport_id uuid;
  model_sport_id uuid;
  checked_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Predictions cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION
        'Published predictions are immutable'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.published_at IS NULL THEN
      RAISE EXCEPTION
        'Only first publication may update a prediction'
        USING ERRCODE = '23514';
    END IF;

    IF (to_jsonb(NEW) - 'published_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'published_at') THEN
      RAISE EXCEPTION
        'Prediction inputs, output and metadata are immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Hold the fixture stable while checking and storing this prediction.
  SELECT *
  INTO fixture_row
  FROM public.fixtures
  WHERE id = NEW.fixture_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Prediction fixture does not exist'
      USING ERRCODE = '23514';
  END IF;

  checked_at := clock_timestamp();

  IF fixture_row.status <> 'scheduled'
     OR fixture_row.kickoff_at IS NULL THEN
    RAISE EXCEPTION
      'Prediction requires a scheduled fixture with a known kickoff'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.kickoff_at_generation
     IS DISTINCT FROM fixture_row.kickoff_at THEN
    RAISE EXCEPTION
      'Fixture schedule changed: generate a new prediction'
      USING ERRCODE = '23514';
  END IF;

  IF checked_at >= fixture_row.kickoff_at THEN
    RAISE EXCEPTION
      'Pre-match predictions cannot be stored or published after kickoff'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM fixture_row.is_demo THEN
    RAISE EXCEPTION
      'Prediction and fixture demo classifications must match'
      USING ERRCODE = '23514';
  END IF;

  SELECT competition.sport_id
  INTO fixture_sport_id
  FROM public.seasons AS season
  JOIN public.competitions AS competition
    ON competition.id = season.competition_id
  WHERE season.id = fixture_row.season_id;

  SELECT sport_id
  INTO model_sport_id
  FROM public.model_versions
  WHERE id = NEW.model_version_id;

  IF fixture_sport_id IS NULL
     OR model_sport_id IS NULL
     OR fixture_sport_id <> model_sport_id THEN
    RAISE EXCEPTION
      'Model sport must match fixture sport'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.generated_at > checked_at THEN
      RAISE EXCEPTION
        'Generation time cannot be in the future'
        USING ERRCODE = '23514';
    END IF;

    NEW.created_at := checked_at;
  END IF;

  IF NEW.published_at IS NOT NULL THEN
    -- Ignore caller-supplied publication times to prevent backdating.
    NEW.published_at := checked_at;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER predictions_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.predictions
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_guard_prediction();
DROP INDEX "prediction_outcomes_settlement_identity";
--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_outcomes_settlement_identity"
ON "prediction_outcomes" USING btree (
  "prediction_id",
  "market",
  "selection"
);
--> statement-breakpoint
CREATE FUNCTION public.dictaziq_guard_prediction_outcome()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prediction_row public.predictions%ROWTYPE;
  result_row public.result_snapshots%ROWTYPE;
  checked_at timestamptz;
BEGIN
  SELECT *
  INTO prediction_row
  FROM public.predictions
  WHERE id = NEW.prediction_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Prediction outcome references a missing prediction'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO result_row
  FROM public.result_snapshots
  WHERE id = NEW.result_snapshot_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Prediction outcome references a missing result snapshot'
      USING ERRCODE = '23514';
  END IF;

  IF prediction_row.published_at IS NULL THEN
    RAISE EXCEPTION
      'Only published predictions may be settled'
      USING ERRCODE = '23514';
  END IF;

  IF prediction_row.fixture_id
     IS DISTINCT FROM result_row.fixture_id THEN
    RAISE EXCEPTION
      'Prediction and result snapshot must reference the same fixture'
      USING ERRCODE = '23514';
  END IF;

  IF result_row.status <> 'finished' THEN
    RAISE EXCEPTION
      'Settlement requires a finished result snapshot'
      USING ERRCODE = '23514';
  END IF;

  IF NOT result_row.regulation_confirmed
     OR result_row.regulation_home_score IS NULL
     OR result_row.regulation_away_score IS NULL THEN
    RAISE EXCEPTION
      'Settlement requires confirmed regulation-time scores'
      USING ERRCODE = '23514';
  END IF;

  IF result_row.observed_at < prediction_row.kickoff_at_generation THEN
    RAISE EXCEPTION
      'A pre-kickoff result snapshot cannot settle a prediction'
      USING ERRCODE = '23514';
  END IF;

  IF result_row.finished_at IS NOT NULL
     AND result_row.finished_at < prediction_row.kickoff_at_generation THEN
    RAISE EXCEPTION
      'Result finish time cannot precede the predicted fixture kickoff'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(prediction_row.output -> 'markets')
     IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION
      'Prediction output does not contain a valid markets object'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (prediction_row.output -> 'markets') ? NEW.market
  ) THEN
    RAISE EXCEPTION
      'Settlement market does not exist in the prediction output'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(
       prediction_row.output -> 'markets' -> NEW.market
     ) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION
      'Prediction market is not a valid object'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (prediction_row.output -> 'markets' -> NEW.market)
    ? NEW.selection
  ) THEN
    RAISE EXCEPTION
      'Settlement selection does not exist in the prediction output'
      USING ERRCODE = '23514';
  END IF;

  checked_at := clock_timestamp();

  -- Never trust a caller-supplied settlement timestamp.
  NEW.settled_at := checked_at;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER prediction_outcomes_guard
BEFORE INSERT ON public.prediction_outcomes
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_guard_prediction_outcome();
--> statement-breakpoint
CREATE TRIGGER prediction_outcomes_immutable
BEFORE UPDATE OR DELETE ON public.prediction_outcomes
FOR EACH ROW
EXECUTE FUNCTION public.dictaziq_reject_history_change();
--> statement-breakpoint
CREATE TRIGGER prediction_outcomes_no_truncate
BEFORE TRUNCATE ON public.prediction_outcomes
FOR EACH STATEMENT
EXECUTE FUNCTION public.dictaziq_reject_history_change();
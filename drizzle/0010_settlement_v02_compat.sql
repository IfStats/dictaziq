CREATE OR REPLACE FUNCTION public.dictaziq_guard_prediction_outcome()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prediction_row public.predictions%ROWTYPE;
  result_row public.result_snapshots%ROWTYPE;
  checked_at timestamptz;
  valid_selection boolean := false;
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
     IS DISTINCT FROM
     result_row.fixture_id THEN
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

  IF result_row.observed_at <
     prediction_row.kickoff_at_generation THEN
    RAISE EXCEPTION
      'A pre-kickoff result snapshot cannot settle a prediction'
      USING ERRCODE = '23514';
  END IF;

  IF result_row.finished_at IS NOT NULL
     AND result_row.finished_at <
       prediction_row.kickoff_at_generation THEN
    RAISE EXCEPTION
      'Result finish time cannot precede the predicted fixture kickoff'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Modern DictazIQ 1X2 contract.
   *
   * v0.2:
   * result.recommended must be true.
   *
   * Compatibility:
   * older result outputs without a
   * "recommended" field may settle only when
   * requiresContext=false.
   */
  IF NEW.market = '1x2'
     AND jsonb_typeof(
       prediction_row.output -> 'result'
     ) = 'object' THEN

    valid_selection :=
      (
        prediction_row.output
          #>> '{result,selection}'
      ) = NEW.selection

      AND
      (
        prediction_row.output
          -> 'result'
          -> 'recommended'
          = 'true'::jsonb

        OR
        (
          NOT (
            prediction_row.output
              -> 'result'
              ? 'recommended'
          )

          AND prediction_row.output
            -> 'result'
            -> 'requiresContext'
            = 'false'::jsonb
        )
      );
  END IF;

  /*
   * Modern multi-market contract.
   *
   * Only entries explicitly present in
   * qualifiedRecommendations are settleable.
   * Lean/no_pick decisions never qualify here.
   */
  IF NOT valid_selection
     AND jsonb_typeof(
       prediction_row.output
         -> 'qualifiedRecommendations'
     ) = 'array' THEN

    SELECT EXISTS (
      SELECT 1

      FROM jsonb_array_elements(
        prediction_row.output
          -> 'qualifiedRecommendations'
      ) AS recommendation

      WHERE recommendation
        ->> 'market'
          = NEW.market

        AND recommendation
          ->> 'selection'
          = NEW.selection

        AND recommendation
          ->> 'status'
          = 'qualified'
    )
    INTO valid_selection;
  END IF;

  /*
   * Legacy compatibility.
   *
   * Older DictazIQ predictions stored
   * market selections as object keys under
   * output.markets[market].
   */
  IF NOT valid_selection
     AND jsonb_typeof(
       prediction_row.output
         -> 'markets'
     ) = 'object'

     AND (
       prediction_row.output
         -> 'markets'
     ) ? NEW.market

     AND jsonb_typeof(
       prediction_row.output
         -> 'markets'
         -> NEW.market
     ) = 'object'

     AND (
       prediction_row.output
         -> 'markets'
         -> NEW.market
     ) ? NEW.selection THEN

    valid_selection :=
      true;
  END IF;

  IF NOT valid_selection THEN
    RAISE EXCEPTION
      'Settlement market/selection is not a settleable recommendation in the prediction output'
      USING ERRCODE = '23514';
  END IF;

  checked_at :=
    clock_timestamp();

  /*
   * Never trust caller-provided timestamps.
   */
  NEW.settled_at :=
    checked_at;

  RETURN NEW;
END;
$$;
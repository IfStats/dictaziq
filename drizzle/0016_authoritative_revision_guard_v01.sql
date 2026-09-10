/*
 * DictazIQ authoritative revision guard v0.1
 *
 * Production revisions may only attach to the
 * baseline selected by:
 *
 *   public.production_forecast_baselines_v01
 *
 * This prevents:
 * - prior-only Unified historical predictions
 * - duplicate model routes
 * - superseded/non-authoritative baselines
 *
 * from receiving new production revisions.
 *
 * Demo revisions remain outside this production
 * routing constraint so existing deterministic
 * database tests are not broken.
 */

CREATE OR REPLACE FUNCTION
public.dictaziq_guard_authoritative_forecast_revision_v01()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_authoritative_prediction_id uuid;
  v_authoritative_fixture_id uuid;
  v_route text;
  v_model_version text;
BEGIN
  /*
   * Production routing guard applies only to
   * real forecasts.
   */
  IF NEW.is_demo = true THEN
    RETURN NEW;
  END IF;

  /*
   * Resolve the single authoritative production
   * baseline for the revision's fixture.
   */
  SELECT
    route.baseline_prediction_id,
    route.fixture_id,
    route.route,
    route.model_version
  INTO
    v_authoritative_prediction_id,
    v_authoritative_fixture_id,
    v_route,
    v_model_version
  FROM public.production_forecast_baselines_v01
    AS route
  WHERE route.fixture_id =
    NEW.fixture_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Real forecast revision rejected: fixture % has no authoritative production baseline.',
      NEW.fixture_id;
  END IF;

  /*
   * Defensive fixture consistency check.
   */
  IF v_authoritative_fixture_id
    IS DISTINCT FROM
    NEW.fixture_id
  THEN
    RAISE EXCEPTION
      'Real forecast revision rejected: authoritative route fixture mismatch.';
  END IF;

  /*
   * This is the critical routing invariant.
   */
  IF v_authoritative_prediction_id
    IS DISTINCT FROM
    NEW.baseline_prediction_id
  THEN
    RAISE EXCEPTION
      'Real forecast revision rejected: baseline % is not authoritative for fixture %. Authoritative baseline is % using route % / model %.',
      NEW.baseline_prediction_id,
      NEW.fixture_id,
      v_authoritative_prediction_id,
      v_route,
      v_model_version;
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

DROP TRIGGER IF EXISTS
aaa_forecast_revisions_authoritative_guard
ON public.forecast_revisions;

--> statement-breakpoint

/*
 * Prefixing this trigger with aaa_ is deliberate.
 *
 * PostgreSQL fires triggers of the same timing/event
 * in alphabetical order. We want routing rejection
 * to occur before deeper revision-content guards.
 */
CREATE TRIGGER
aaa_forecast_revisions_authoritative_guard
BEFORE INSERT
ON public.forecast_revisions
FOR EACH ROW
EXECUTE FUNCTION
public.dictaziq_guard_authoritative_forecast_revision_v01();
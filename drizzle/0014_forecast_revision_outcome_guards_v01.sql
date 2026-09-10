CREATE OR REPLACE FUNCTION
public.dictaziq_guard_forecast_revision_outcome()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_checked_at timestamptz;

  v_revision_fixture_id uuid;
  v_revision_published_at timestamptz;
  v_revision_kickoff_at timestamptz;
  v_revision_selection text;

  v_result_fixture_id uuid;
  v_result_status public.fixture_status;
  v_result_home_score integer;
  v_result_away_score integer;
  v_result_confirmed boolean;
  v_result_observed_at timestamptz;

  v_actual_selection text;
BEGIN
  /*
   * ------------------------------------------------
   * LOAD IMMUTABLE REVISION
   * ------------------------------------------------
   */

  SELECT
    revision.fixture_id,
    revision.published_at,
    revision.kickoff_at,
    revision.selection
  INTO
    v_revision_fixture_id,
    v_revision_published_at,
    v_revision_kickoff_at,
    v_revision_selection
  FROM public.forecast_revisions
    AS revision
  WHERE revision.id =
    NEW.revision_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Forecast revision settlement requires an existing revision.';
  END IF;

  IF v_revision_published_at IS NULL THEN
    RAISE EXCEPTION
      'Unpublished forecast revision cannot be settled.';
  END IF;

  /*
   * ------------------------------------------------
   * LOAD IMMUTABLE RESULT SNAPSHOT
   * ------------------------------------------------
   */

  SELECT
    result.fixture_id,
    result.status,
    result.regulation_home_score,
    result.regulation_away_score,
    result.regulation_confirmed,
    result.observed_at
  INTO
    v_result_fixture_id,
    v_result_status,
    v_result_home_score,
    v_result_away_score,
    v_result_confirmed,
    v_result_observed_at
  FROM public.result_snapshots
    AS result
  WHERE result.id =
    NEW.result_snapshot_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Forecast revision settlement requires an existing result snapshot.';
  END IF;

  /*
   * The result must belong to the same fixture.
   */
  IF v_result_fixture_id
    IS DISTINCT FROM
    v_revision_fixture_id
  THEN
    RAISE EXCEPTION
      'Forecast revision and result snapshot fixtures do not match.';
  END IF;

  /*
   * v0.1 excludes awarded/abandoned/etc. from
   * automatic training settlement.
   */
  IF v_result_status <>
    'finished'
  THEN
    RAISE EXCEPTION
      'Forecast revision settlement requires a finished fixture.';
  END IF;

  IF NOT v_result_confirmed THEN
    RAISE EXCEPTION
      'Forecast revision settlement requires confirmed regulation scores.';
  END IF;

  IF v_result_home_score IS NULL
    OR
    v_result_away_score IS NULL
  THEN
    RAISE EXCEPTION
      'Forecast revision settlement requires both regulation scores.';
  END IF;

  /*
   * Result evidence must be genuinely post-match.
   */
  IF v_result_observed_at <
    v_revision_kickoff_at
  THEN
    RAISE EXCEPTION
      'Forecast revision cannot be settled from a pre-kickoff result snapshot.';
  END IF;

  /*
   * ------------------------------------------------
   * DERIVE THE ACTUAL 1X2 RESULT
   * ------------------------------------------------
   */

  IF v_result_home_score >
    v_result_away_score
  THEN
    v_actual_selection :=
      'home';

  ELSIF v_result_home_score <
    v_result_away_score
  THEN
    v_actual_selection :=
      'away';

  ELSE
    v_actual_selection :=
      'draw';
  END IF;

  /*
   * ------------------------------------------------
   * DATABASE OWNS SETTLEMENT CONTENT
   * ------------------------------------------------
   *
   * Caller cannot choose market, selection,
   * outcome, rules version or settlement time.
   */

  NEW.market :=
    '1x2';

  NEW.selection :=
    v_revision_selection;

  IF v_revision_selection =
    v_actual_selection
  THEN
    NEW.outcome :=
      'won';
  ELSE
    NEW.outcome :=
      'lost';
  END IF;

  NEW.rules_version :=
    'football-revision-settlement-v0.1';

  v_checked_at :=
    clock_timestamp();

  NEW.settled_at :=
    v_checked_at;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER
forecast_revision_outcomes_insert_guard
BEFORE INSERT
ON public.forecast_revision_outcomes
FOR EACH ROW
EXECUTE FUNCTION
public.dictaziq_guard_forecast_revision_outcome();

--> statement-breakpoint

CREATE TRIGGER
forecast_revision_outcomes_immutable
BEFORE UPDATE OR DELETE
ON public.forecast_revision_outcomes
FOR EACH ROW
EXECUTE FUNCTION
public.dictaziq_reject_history_change();

--> statement-breakpoint

CREATE TRIGGER
forecast_revision_outcomes_no_truncate
BEFORE TRUNCATE
ON public.forecast_revision_outcomes
FOR EACH STATEMENT
EXECUTE FUNCTION
public.dictaziq_reject_history_change();
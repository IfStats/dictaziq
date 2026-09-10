CREATE OR REPLACE FUNCTION
public.dictaziq_guard_forecast_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_at timestamptz;

  baseline_fixture_id uuid;
  baseline_is_demo boolean;
  baseline_kickoff timestamptz;
  baseline_input_cutoff timestamptz;
  baseline_generated_at timestamptz;
  baseline_published_at timestamptz;

  expected_revision integer;
  latest_input_cutoff timestamptz;

  invalid_material_change boolean;
BEGIN
  /*
   * Lock the immutable baseline prediction.
   *
   * This serializes competing revision writers
   * for the same baseline and prevents two workers
   * from allocating the same revision number.
   */
  SELECT
    prediction.fixture_id,
    prediction.is_demo,
    prediction.kickoff_at_generation,
    prediction.input_cutoff_at,
    prediction.generated_at,
    prediction.published_at
  INTO
    baseline_fixture_id,
    baseline_is_demo,
    baseline_kickoff,
    baseline_input_cutoff,
    baseline_generated_at,
    baseline_published_at
  FROM public.predictions
    AS prediction
  WHERE prediction.id =
    NEW.baseline_prediction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Forecast revision baseline prediction does not exist.';
  END IF;

  IF baseline_published_at IS NULL THEN
    RAISE EXCEPTION
      'Forecast revision requires a published baseline prediction.';
  END IF;

  /*
   * The revision must belong to exactly the same
   * fixture as the frozen baseline prediction.
   */
  IF NEW.fixture_id
    IS DISTINCT FROM
    baseline_fixture_id
  THEN
    RAISE EXCEPTION
      'Forecast revision fixture does not match baseline prediction.';
  END IF;

  IF NEW.is_demo
    IS DISTINCT FROM
    baseline_is_demo
  THEN
    RAISE EXCEPTION
      'Forecast revision demo classification must match baseline prediction.';
  END IF;

  /*
   * Never silently follow a later fixture schedule
   * change. The revision belongs to the kickoff that
   * was frozen by the original baseline.
   */
  IF NEW.kickoff_at
    IS DISTINCT FROM
    baseline_kickoff
  THEN
    RAISE EXCEPTION
      'Forecast revision kickoff must match frozen baseline kickoff.';
  END IF;

  checked_at :=
    clock_timestamp();

  /*
   * No revision may be inserted once the frozen
   * kickoff has been reached.
   */
  IF checked_at >=
    baseline_kickoff
  THEN
    RAISE EXCEPTION
      'Forecast revision cannot be generated at or after kickoff.';
  END IF;

  /*
   * Normalize controlled textual fields.
   */
  NEW.revision_version :=
    trim(
      NEW.revision_version
    );

  NEW.reason :=
    lower(
      trim(
        NEW.reason
      )
    );

  NEW.engine :=
    lower(
      trim(
        NEW.engine
      )
    );

  NEW.engine_version :=
    trim(
      NEW.engine_version
    );

  NEW.lineup_state :=
    lower(
      trim(
        NEW.lineup_state
      )
    );

  NEW.selection :=
    lower(
      trim(
        NEW.selection
      )
    );

  NEW.confidence :=
    lower(
      trim(
        NEW.confidence
      )
    );

  NEW.evidence_grade :=
    upper(
      trim(
        NEW.evidence_grade
      )
    );

  NEW.input_sha256 :=
    lower(
      trim(
        NEW.input_sha256
      )
    );

  NEW.output_sha256 :=
    lower(
      trim(
        NEW.output_sha256
      )
    );

  IF NEW.revision_version = '' THEN
    RAISE EXCEPTION
      'Forecast revision version must not be empty.';
  END IF;

  IF NEW.engine_version = '' THEN
    RAISE EXCEPTION
      'Forecast revision engine version must not be empty.';
  END IF;

  /*
   * Application code cannot fabricate revision
   * generation time.
   */
  NEW.generated_at :=
    checked_at;

  NEW.created_at :=
    checked_at;

  /*
   * Revisions always begin as drafts.
   *
   * First publication is handled by the dedicated
   * publication UPDATE guard below.
   */
  IF NEW.published_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Forecast revision must be inserted as an unpublished draft.';
  END IF;

  /*
   * Evidence admitted into this revision must
   * actually predate this database observation.
   */
  IF NEW.input_cutoff_at >
    checked_at
  THEN
    RAISE EXCEPTION
      'Forecast revision input cutoff cannot be in the future.';
  END IF;

  IF NEW.input_cutoff_at >=
    baseline_kickoff
  THEN
    RAISE EXCEPTION
      'Forecast revision input cutoff must be before kickoff.';
  END IF;

  /*
   * A revision is meaningful only if it uses
   * evidence newer than the original baseline.
   */
  IF NEW.input_cutoff_at <=
    baseline_input_cutoff
  THEN
    RAISE EXCEPTION
      'Forecast revision requires evidence newer than the baseline input cutoff.';
  END IF;

  /*
   * Sequential revision numbering:
   *
   * baseline
   *   revision 1
   *   revision 2
   *   revision 3
   *
   * The locked baseline row prevents concurrent
   * workers from independently claiming the same
   * next number.
   */
  SELECT
    COALESCE(
      MAX(
        revision.revision_number
      ),
      0
    ) + 1
  INTO
    expected_revision
  FROM public.forecast_revisions
    AS revision
  WHERE revision.baseline_prediction_id =
    NEW.baseline_prediction_id;

  IF NEW.revision_number
    IS DISTINCT FROM
    expected_revision
  THEN
    RAISE EXCEPTION
      'Forecast revision number must be %, received %.',
      expected_revision,
      NEW.revision_number;
  END IF;

  /*
   * Each revision must advance the evidence clock.
   */
  SELECT
    COALESCE(
      MAX(
        revision.input_cutoff_at
      ),
      baseline_input_cutoff
    )
  INTO
    latest_input_cutoff
  FROM public.forecast_revisions
    AS revision
  WHERE revision.baseline_prediction_id =
    NEW.baseline_prediction_id;

  IF NEW.input_cutoff_at <=
    latest_input_cutoff
  THEN
    RAISE EXCEPTION
      'Forecast revision input cutoff must advance beyond prior revision evidence.';
  END IF;

  /*
   * Confirmed-lineup revisions require an actual
   * confirmed lineup state.
   */
  IF NEW.reason =
      'confirmed_lineup'
    AND NEW.lineup_state <>
      'confirmed'
  THEN
    RAISE EXCEPTION
      'Confirmed-lineup revision requires confirmed lineup state.';
  END IF;

  /*
   * Material changes must be a non-empty array
   * of non-empty strings.
   */
  IF jsonb_typeof(
    NEW.material_changes
  ) <> 'array'
  THEN
    RAISE EXCEPTION
      'Forecast revision material changes must be a JSON array.';
  END IF;

  IF jsonb_array_length(
    NEW.material_changes
  ) < 1
    OR
    jsonb_array_length(
      NEW.material_changes
    ) > 20
  THEN
    RAISE EXCEPTION
      'Forecast revision requires between 1 and 20 material changes.';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        NEW.material_changes
      ) AS item
      WHERE
        jsonb_typeof(
          item
        ) <> 'string'
        OR
        length(
          trim(
            item #>> '{}'
          )
        ) = 0
    )
  INTO
    invalid_material_change;

  IF invalid_material_change THEN
    RAISE EXCEPTION
      'Forecast revision material changes must contain only non-empty strings.';
  END IF;

  IF NEW.input_sha256
    !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'Forecast revision input SHA-256 must be 64 lowercase hexadecimal characters.';
  END IF;

  IF NEW.output_sha256
    !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'Forecast revision output SHA-256 must be 64 lowercase hexadecimal characters.';
  END IF;

  IF jsonb_typeof(
    NEW.input_snapshot
  ) <> 'object'
  THEN
    RAISE EXCEPTION
      'Forecast revision input snapshot must be a JSON object.';
  END IF;

  IF jsonb_typeof(
    NEW.output
  ) <> 'object'
  THEN
    RAISE EXCEPTION
      'Forecast revision output must be a JSON object.';
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER
forecast_revisions_insert_guard
BEFORE INSERT
ON public.forecast_revisions
FOR EACH ROW
EXECUTE FUNCTION
public.dictaziq_guard_forecast_revision_insert();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION
public.dictaziq_guard_forecast_revision_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_at timestamptz;
BEGIN
  /*
   * An already-published revision can never be
   * modified again.
   */
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Published forecast revision is immutable.';
  END IF;

  /*
   * The only legal UPDATE is first publication.
   */
  IF NEW.published_at IS NULL THEN
    RAISE EXCEPTION
      'Forecast revision update rejected; only first publication is permitted.';
  END IF;

  /*
   * No other field may change during publication.
   */
  IF (
    to_jsonb(
      NEW
    ) - 'published_at'
  )
  IS DISTINCT FROM
  (
    to_jsonb(
      OLD
    ) - 'published_at'
  )
  THEN
    RAISE EXCEPTION
      'Forecast revision publication cannot modify revision contents.';
  END IF;

  checked_at :=
    clock_timestamp();

  IF checked_at >=
    OLD.kickoff_at
  THEN
    RAISE EXCEPTION
      'Forecast revision cannot be published at or after kickoff.';
  END IF;

  IF checked_at <
    OLD.generated_at
  THEN
    RAISE EXCEPTION
      'Forecast revision publication cannot precede generation.';
  END IF;

  /*
   * Caller cannot backdate or choose publication
   * timestamp.
   */
  NEW.published_at :=
    checked_at;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER
forecast_revisions_publication_guard
BEFORE UPDATE
ON public.forecast_revisions
FOR EACH ROW
EXECUTE FUNCTION
public.dictaziq_guard_forecast_revision_update();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION
public.dictaziq_reject_forecast_revision_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Forecast revision history cannot be deleted.';
END;
$$;

--> statement-breakpoint

CREATE TRIGGER
forecast_revisions_no_delete
BEFORE DELETE
ON public.forecast_revisions
FOR EACH ROW
EXECUTE FUNCTION
public.dictaziq_reject_forecast_revision_delete();

--> statement-breakpoint

CREATE OR REPLACE FUNCTION
public.dictaziq_reject_forecast_revision_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Forecast revision history cannot be truncated.';
END;
$$;

--> statement-breakpoint

CREATE TRIGGER
forecast_revisions_no_truncate
BEFORE TRUNCATE
ON public.forecast_revisions
FOR EACH STATEMENT
EXECUTE FUNCTION
public.dictaziq_reject_forecast_revision_truncate();
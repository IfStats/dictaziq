CREATE OR REPLACE FUNCTION
public.dictaziq_guard_market_evidence_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fixture_is_demo boolean;
  fixture_kickoff timestamptz;
  checked_at timestamptz;

  json_fixture_id text;
  json_version text;
  json_cutoff timestamptz;
  json_kickoff timestamptz;
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
      'Market evidence fixture does not exist.';
  END IF;

  IF fixture_kickoff IS NULL THEN
    RAISE EXCEPTION
      'Market evidence requires a known fixture kickoff.';
  END IF;

  IF NEW.is_demo
    IS DISTINCT FROM
    fixture_is_demo
  THEN
    RAISE EXCEPTION
      'Market evidence demo classification must match fixture.';
  END IF;

  checked_at :=
    clock_timestamp();

  IF checked_at >=
    fixture_kickoff
  THEN
    RAISE EXCEPTION
      'Market evidence cannot be captured at or after fixture kickoff.';
  END IF;

  IF NEW.cutoff_at >=
    fixture_kickoff
  THEN
    RAISE EXCEPTION
      'Market evidence cutoff must be before fixture kickoff.';
  END IF;

  IF NEW.cutoff_at >
    checked_at
  THEN
    RAISE EXCEPTION
      'Market evidence cutoff cannot be in the future.';
  END IF;

  NEW.evidence_version :=
    trim(
      NEW.evidence_version
    );

  NEW.source :=
    lower(
      trim(
        NEW.source
      )
    );

  NEW.evidence_sha256 :=
    lower(
      trim(
        NEW.evidence_sha256
      )
    );

  IF NEW.evidence_version = '' THEN
    RAISE EXCEPTION
      'Market evidence version must not be empty.';
  END IF;

  IF NEW.source = '' THEN
    RAISE EXCEPTION
      'Market evidence source must not be empty.';
  END IF;

  IF NEW.evidence_sha256
    !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'Market evidence SHA-256 must be 64 lowercase hexadecimal characters.';
  END IF;

  IF jsonb_typeof(
    NEW.evidence
  ) <> 'object'
  THEN
    RAISE EXCEPTION
      'Market evidence payload must be a JSON object.';
  END IF;

  json_fixture_id :=
    NEW.evidence
      ->> 'fixtureId';

  json_version :=
    NEW.evidence
      ->> 'evidenceVersion';

  IF json_fixture_id IS NULL
    OR trim(
      json_fixture_id
    ) = ''
  THEN
    RAISE EXCEPTION
      'Market evidence JSON fixtureId is missing.';
  END IF;

  IF json_fixture_id <>
    NEW.fixture_id::text
  THEN
    RAISE EXCEPTION
      'Market evidence JSON fixtureId does not match fixture_id.';
  END IF;

  IF json_version IS NULL
    OR trim(
      json_version
    ) = ''
  THEN
    RAISE EXCEPTION
      'Market evidence JSON evidenceVersion is missing.';
  END IF;

  IF trim(
    json_version
  ) <>
    NEW.evidence_version
  THEN
    RAISE EXCEPTION
      'Market evidence JSON version does not match evidence_version.';
  END IF;

  BEGIN
    json_cutoff :=
      (
        NEW.evidence
          ->> 'cutoffAt'
      )::timestamptz;

    json_kickoff :=
      (
        NEW.evidence
          ->> 'kickoffAt'
      )::timestamptz;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Market evidence JSON contains invalid cutoffAt or kickoffAt.';
  END;

  IF json_cutoff
    IS DISTINCT FROM
    NEW.cutoff_at
  THEN
    RAISE EXCEPTION
      'Market evidence JSON cutoffAt does not match cutoff_at.';
  END IF;

  IF json_kickoff
    IS DISTINCT FROM
    fixture_kickoff
  THEN
    RAISE EXCEPTION
      'Market evidence JSON kickoffAt does not match fixture kickoff.';
  END IF;

  NEW.captured_at :=
    checked_at;

  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE TRIGGER
market_evidence_snapshots_guard
BEFORE INSERT
ON public.market_evidence_snapshots
FOR EACH ROW
EXECUTE FUNCTION
public.dictaziq_guard_market_evidence_snapshot();

--> statement-breakpoint
CREATE TRIGGER
market_evidence_snapshots_immutable
BEFORE UPDATE OR DELETE
ON public.market_evidence_snapshots
FOR EACH ROW
EXECUTE FUNCTION
public.dictaziq_reject_history_change();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION
public.dictaziq_reject_market_evidence_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Market evidence history cannot be truncated.';
END;
$$;

--> statement-breakpoint
CREATE TRIGGER
market_evidence_snapshots_no_truncate
BEFORE TRUNCATE
ON public.market_evidence_snapshots
FOR EACH STATEMENT
EXECUTE FUNCTION
public.dictaziq_reject_market_evidence_truncate();-- Custom SQL migration file, put your code below! --
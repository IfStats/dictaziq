DROP VIEW IF EXISTS
public.production_forecast_baselines_v01;

--> statement-breakpoint

CREATE VIEW
public.production_forecast_baselines_v01
AS

WITH mathematical_candidates AS (
  SELECT
    prediction.id
      AS baseline_prediction_id,

    prediction.fixture_id,

    prediction.model_version_id,

    prediction.input_cutoff_at,

    prediction.generated_at,

    prediction.published_at,

    prediction.input_snapshot,

    prediction.output,

    model.version
      AS model_version,

    'mathematical'
      AS route,

    'common_rating_pair'
      AS route_reason,

    1
      AS route_priority

  FROM public.predictions
    AS prediction

  JOIN public.model_versions
    AS model
    ON model.id =
      prediction.model_version_id

  JOIN public.fixtures
    AS fixture
    ON fixture.id =
      prediction.fixture_id

  WHERE prediction.is_demo =
    false

    AND fixture.is_demo =
      false

    AND prediction.published_at
      IS NOT NULL

    AND model.version =
      'dictaziq-unified-match-analysis-v0.1'

    /*
     * An actual mathematical production route
     * requires a common FootballDatabase rating
     * snapshot for BOTH sides.
     *
     * prior_only Unified forecasts are retained
     * historically but are not production
     * mathematical baselines.
     */
    AND (
      prediction.input_snapshot
        -> 'ratingEvidence'
        ->> 'commonSnapshotDate'
    ) IS NOT NULL

    AND jsonb_typeof(
      prediction.input_snapshot
        -> 'ratingEvidence'
        -> 'home'
    ) = 'array'

    AND jsonb_array_length(
      prediction.input_snapshot
        -> 'ratingEvidence'
        -> 'home'
    ) > 0

    AND jsonb_typeof(
      prediction.input_snapshot
        -> 'ratingEvidence'
        -> 'away'
    ) = 'array'

    AND jsonb_array_length(
      prediction.input_snapshot
        -> 'ratingEvidence'
        -> 'away'
    ) > 0
),

gpt_candidates AS (
  SELECT
    prediction.id
      AS baseline_prediction_id,

    prediction.fixture_id,

    prediction.model_version_id,

    prediction.input_cutoff_at,

    prediction.generated_at,

    prediction.published_at,

    prediction.input_snapshot,

    prediction.output,

    model.version
      AS model_version,

    'gpt_research'
      AS route,

    'mathematical_rating_pair_unavailable'
      AS route_reason,

    2
      AS route_priority

  FROM public.predictions
    AS prediction

  JOIN public.model_versions
    AS model
    ON model.id =
      prediction.model_version_id

  JOIN public.fixtures
    AS fixture
    ON fixture.id =
      prediction.fixture_id

  WHERE prediction.is_demo =
    false

    AND fixture.is_demo =
      false

    AND prediction.published_at
      IS NOT NULL

    AND model.version =
      'dictaziq-gpt-research-prediction-v0.1'

    AND prediction.output
      ->> 'engine' =
      'gpt_research'

    AND prediction.output
      ->> 'engineVersion' =
      'dictaziq-gpt-research-prediction-v0.1'
),

all_candidates AS (
  SELECT *
  FROM mathematical_candidates

  UNION ALL

  SELECT *
  FROM gpt_candidates
),

ranked AS (
  SELECT
    candidate.*,

    row_number()
      OVER (
        PARTITION BY
          candidate.fixture_id

        ORDER BY
          candidate.route_priority,
          candidate.published_at,
          candidate.baseline_prediction_id
      )
      AS route_rank

  FROM all_candidates
    AS candidate
)

SELECT
  baseline_prediction_id,
  fixture_id,
  model_version_id,

  input_cutoff_at,
  generated_at,
  published_at,

  input_snapshot,
  output,

  model_version,
  route,
  route_reason

FROM ranked

WHERE route_rank = 1;
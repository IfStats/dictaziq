import "./load-env";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

async function main() {
  const client =
    neon(
      getDatabaseUrl(),
    );

  await client`
    DO $test$
    DECLARE
      v_source_fixture
        public.fixtures%ROWTYPE;

      v_test_sport_id uuid;

      v_test_model_id uuid :=
        gen_random_uuid();

      v_test_fixture_id uuid :=
        gen_random_uuid();

      v_post_kickoff_fixture_id uuid :=
        gen_random_uuid();

      v_baseline_prediction_id uuid :=
        gen_random_uuid();

      v_post_kickoff_prediction_id uuid :=
        gen_random_uuid();

      v_revision_id uuid :=
        gen_random_uuid();

      v_future_kickoff timestamptz;

      v_short_future_kickoff timestamptz;

      v_baseline_input_cutoff timestamptz;

      v_revision_input_cutoff timestamptz;

      v_insertion_started_at timestamptz;

      v_actual_generated_at timestamptz;

      v_publication_started_at timestamptz;

      v_actual_publication_at timestamptz;

      v_error_message text;
    BEGIN
      /*
       * All records created inside this nested
       * block are rolled back when ZX002 is raised.
       */
      BEGIN
        SELECT
          fixture.*
        INTO
          v_source_fixture
        FROM public.fixtures
          AS fixture
        WHERE fixture.home_team_id <>
          fixture.away_team_id
        ORDER BY
          fixture.created_at
        LIMIT 1;

        IF NOT FOUND THEN
          RAISE EXCEPTION
            'Required source fixture is missing.';
        END IF;

        SELECT
          competition.sport_id
        INTO
          v_test_sport_id
        FROM public.seasons
          AS season
        JOIN public.competitions
          AS competition
          ON competition.id =
            season.competition_id
        WHERE season.id =
          v_source_fixture.season_id;

        IF v_test_sport_id IS NULL THEN
          RAISE EXCEPTION
            'Required source sport is missing.';
        END IF;

        v_future_kickoff :=
          clock_timestamp()
          + interval '1 day';

        v_baseline_input_cutoff :=
          clock_timestamp()
          - interval '30 minutes';

        /*
         * ------------------------------------------------
         * TEST FIXTURE
         * ------------------------------------------------
         */

        INSERT INTO public.fixtures (
          id,
          season_id,
          home_team_id,
          away_team_id,
          slug,
          provider,
          provider_id,
          is_demo,
          kickoff_at,
          status,
          fetched_at
        )
        VALUES (
          v_test_fixture_id,
          v_source_fixture.season_id,
          v_source_fixture.home_team_id,
          v_source_fixture.away_team_id,
          'forecast-revision-guard-test',
          'forecast-revision-guard-test',
          v_test_fixture_id::text,
          v_source_fixture.is_demo,
          v_future_kickoff,
          'scheduled',
          clock_timestamp()
        );

        /*
         * ------------------------------------------------
         * TEST MODEL VERSION
         * ------------------------------------------------
         */

        INSERT INTO public.model_versions (
          id,
          sport_id,
          version,
          description,
          code_sha256,
          configuration
        )
        VALUES (
          v_test_model_id,
          v_test_sport_id,
          'forecast-revision-guard-test-'
            || v_test_model_id::text,
          'Rollback-only forecast revision guard test',
          repeat(
            'f',
            64
          ),
          jsonb_build_object(
            'test_only',
            true
          )
        );

        /*
         * ------------------------------------------------
         * IMMUTABLE PUBLISHED BASELINE
         * ------------------------------------------------
         */

        INSERT INTO public.predictions (
          id,
          fixture_id,
          model_version_id,
          is_demo,
          kickoff_at_generation,
          input_cutoff_at,
          generated_at,
          published_at,
          input_sha256,
          input_snapshot,
          output
        )
        VALUES (
          v_baseline_prediction_id,
          v_test_fixture_id,
          v_test_model_id,
          v_source_fixture.is_demo,
          v_future_kickoff,
          v_baseline_input_cutoff,
          clock_timestamp()
            - interval '20 minutes',
          NULL,
          repeat(
            'a',
            64
          ),
          jsonb_build_object(
            'test_only',
            true,
            'fixtureId',
            v_test_fixture_id
          ),
          jsonb_build_object(
            'forecast',
            'home',
            'test_only',
            true
          )
        );

        UPDATE public.predictions
        SET
          published_at =
            clock_timestamp()
        WHERE predictions.id =
          v_baseline_prediction_id;

        /*
         * ------------------------------------------------
         * 1. VALID DRAFT REVISION
         * ------------------------------------------------
         */

        v_revision_input_cutoff :=
          clock_timestamp()
          - interval '10 seconds';

        v_insertion_started_at :=
          clock_timestamp();

        INSERT INTO public.forecast_revisions (
          id,
          baseline_prediction_id,
          fixture_id,
          is_demo,
          revision_number,
          revision_version,
          reason,
          engine,
          engine_version,
          lineup_state,
          kickoff_at,
          input_cutoff_at,
          generated_at,
          published_at,
          selection,
          confidence,
          evidence_grade,
          material_changes,
          input_sha256,
          output_sha256,
          input_snapshot,
          output
        )
        VALUES (
          v_revision_id,
          v_baseline_prediction_id,
          v_test_fixture_id,
          v_source_fixture.is_demo,
          1,
          'dictaziq-forecast-revision-v0.1',
          'developing_news',
          'gpt_research',
          'dictaziq-llm-analysis-v0.2',
          'unconfirmed',
          v_future_kickoff,
          v_revision_input_cutoff,

          /*
           * Deliberately fake generated_at.
           * Trigger must overwrite this.
           */
          clock_timestamp()
            - interval '2 hours',

          NULL,
          'home',
          'low',
          'C',
          jsonb_build_array(
            'New verified pre-match evidence became available.'
          ),
          repeat(
            'b',
            64
          ),
          repeat(
            'c',
            64
          ),
          jsonb_build_object(
            'test_only',
            true,
            'cutoff',
            v_revision_input_cutoff
          ),
          jsonb_build_object(
            'selection',
            'home',
            'probability',
            NULL,
            'test_only',
            true
          )
        )
        RETURNING
          generated_at
        INTO
          v_actual_generated_at;

        IF v_actual_generated_at IS NULL
          OR
          v_actual_generated_at <
            v_insertion_started_at
        THEN
          RAISE EXCEPTION
            'FAIL: generated_at did not use database clock';
        END IF;

        /*
         * ------------------------------------------------
         * 2. WRONG REVISION NUMBER
         * ------------------------------------------------
         */

        BEGIN
          INSERT INTO public.forecast_revisions (
            baseline_prediction_id,
            fixture_id,
            is_demo,
            revision_number,
            revision_version,
            reason,
            engine,
            engine_version,
            lineup_state,
            kickoff_at,
            input_cutoff_at,
            generated_at,
            published_at,
            selection,
            confidence,
            evidence_grade,
            material_changes,
            input_sha256,
            output_sha256,
            input_snapshot,
            output
          )
          VALUES (
            v_baseline_prediction_id,
            v_test_fixture_id,
            v_source_fixture.is_demo,

            /*
             * 2 is required; deliberately use 3.
             */
            3,

            'dictaziq-forecast-revision-v0.1',
            'scheduled_refresh',
            'gpt_research',
            'dictaziq-llm-analysis-v0.2',
            'unconfirmed',
            v_future_kickoff,
            clock_timestamp()
              - interval '5 seconds',
            clock_timestamp(),
            NULL,
            'away',
            'low',
            'D',
            jsonb_build_array(
              'Additional verified evidence became available.'
            ),
            repeat(
              'd',
              64
            ),
            repeat(
              'e',
              64
            ),
            jsonb_build_object(
              'test_only',
              true
            ),
            jsonb_build_object(
              'selection',
              'away'
            )
          );

          RAISE EXCEPTION
            'FAIL: incorrect revision sequence was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message NOT LIKE
              'Forecast revision number must be %'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 3. STALE EVIDENCE CUTOFF
         * ------------------------------------------------
         */

        BEGIN
          INSERT INTO public.forecast_revisions (
            baseline_prediction_id,
            fixture_id,
            is_demo,
            revision_number,
            revision_version,
            reason,
            engine,
            engine_version,
            lineup_state,
            kickoff_at,
            input_cutoff_at,
            generated_at,
            published_at,
            selection,
            confidence,
            evidence_grade,
            material_changes,
            input_sha256,
            output_sha256,
            input_snapshot,
            output
          )
          VALUES (
            v_baseline_prediction_id,
            v_test_fixture_id,
            v_source_fixture.is_demo,
            2,
            'dictaziq-forecast-revision-v0.1',
            'scheduled_refresh',
            'gpt_research',
            'dictaziq-llm-analysis-v0.2',
            'unconfirmed',
            v_future_kickoff,

            /*
             * Deliberately reuse revision 1 cutoff.
             */
            v_revision_input_cutoff,

            clock_timestamp(),
            NULL,
            'home',
            'low',
            'C',
            jsonb_build_array(
              'Supposed evidence update.'
            ),
            repeat(
              'd',
              64
            ),
            repeat(
              'e',
              64
            ),
            jsonb_build_object(
              'test_only',
              true
            ),
            jsonb_build_object(
              'selection',
              'home'
            )
          );

          RAISE EXCEPTION
            'FAIL: stale revision evidence was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Forecast revision input cutoff must advance beyond prior revision evidence.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 4. DIRECT PUBLISHED INSERT
         * ------------------------------------------------
         */

        BEGIN
          INSERT INTO public.forecast_revisions (
            baseline_prediction_id,
            fixture_id,
            is_demo,
            revision_number,
            revision_version,
            reason,
            engine,
            engine_version,
            lineup_state,
            kickoff_at,
            input_cutoff_at,
            generated_at,
            published_at,
            selection,
            confidence,
            evidence_grade,
            material_changes,
            input_sha256,
            output_sha256,
            input_snapshot,
            output
          )
          VALUES (
            v_baseline_prediction_id,
            v_test_fixture_id,
            v_source_fixture.is_demo,
            2,
            'dictaziq-forecast-revision-v0.1',
            'scheduled_refresh',
            'gpt_research',
            'dictaziq-llm-analysis-v0.2',
            'unconfirmed',
            v_future_kickoff,
            clock_timestamp()
              - interval '5 seconds',
            clock_timestamp(),

            /*
             * Illegal published insert.
             */
            clock_timestamp(),

            'home',
            'low',
            'C',
            jsonb_build_array(
              'New verified evidence.'
            ),
            repeat(
              'd',
              64
            ),
            repeat(
              'e',
              64
            ),
            jsonb_build_object(
              'test_only',
              true
            ),
            jsonb_build_object(
              'selection',
              'home'
            )
          );

          RAISE EXCEPTION
            'FAIL: direct published revision insert was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Forecast revision must be inserted as an unpublished draft.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 5. FALSE CONFIRMED-LINEUP CLAIM
         * ------------------------------------------------
         */

        BEGIN
          INSERT INTO public.forecast_revisions (
            baseline_prediction_id,
            fixture_id,
            is_demo,
            revision_number,
            revision_version,
            reason,
            engine,
            engine_version,
            lineup_state,
            kickoff_at,
            input_cutoff_at,
            generated_at,
            published_at,
            selection,
            confidence,
            evidence_grade,
            material_changes,
            input_sha256,
            output_sha256,
            input_snapshot,
            output
          )
          VALUES (
            v_baseline_prediction_id,
            v_test_fixture_id,
            v_source_fixture.is_demo,
            2,
            'dictaziq-forecast-revision-v0.1',
            'confirmed_lineup',
            'gpt_research',
            'dictaziq-llm-analysis-v0.2',

            /*
             * Illegal for confirmed_lineup.
             */
            'unconfirmed',

            v_future_kickoff,
            clock_timestamp()
              - interval '5 seconds',
            clock_timestamp(),
            NULL,
            'home',
            'medium',
            'B',
            jsonb_build_array(
              'Lineup evidence changed.'
            ),
            repeat(
              'd',
              64
            ),
            repeat(
              'e',
              64
            ),
            jsonb_build_object(
              'test_only',
              true
            ),
            jsonb_build_object(
              'selection',
              'home'
            )
          );

          RAISE EXCEPTION
            'FAIL: fake confirmed-lineup revision was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Confirmed-lineup revision requires confirmed lineup state.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 6. DRAFT CONTENT CANNOT CHANGE
         * ------------------------------------------------
         */

        BEGIN
          UPDATE public.forecast_revisions
          SET
            selection =
              'away'
          WHERE forecast_revisions.id =
            v_revision_id;

          RAISE EXCEPTION
            'FAIL: draft revision modification was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Forecast revision update rejected; only first publication is permitted.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 7. PUBLICATION CANNOT REWRITE CONTENT
         * ------------------------------------------------
         */

        BEGIN
          UPDATE public.forecast_revisions
          SET
            published_at =
              clock_timestamp(),

            selection =
              'away'
          WHERE forecast_revisions.id =
            v_revision_id;

          RAISE EXCEPTION
            'FAIL: publication rewrote revision contents';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Forecast revision publication cannot modify revision contents.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 8. FIRST PUBLICATION USES DB CLOCK
         * ------------------------------------------------
         */

        v_publication_started_at :=
          clock_timestamp();

        UPDATE public.forecast_revisions
        SET
          /*
           * Caller attempts to backdate it.
           * Trigger must replace this value.
           */
          published_at =
            clock_timestamp()
            - interval '1 hour'
        WHERE forecast_revisions.id =
          v_revision_id
        RETURNING
          published_at
        INTO
          v_actual_publication_at;

        IF v_actual_publication_at IS NULL
          OR
          v_actual_publication_at <
            v_publication_started_at
        THEN
          RAISE EXCEPTION
            'FAIL: revision publication did not use database clock';
        END IF;

        /*
         * ------------------------------------------------
         * 9. PUBLISHED REVISION CANNOT CHANGE
         * ------------------------------------------------
         */

        BEGIN
          UPDATE public.forecast_revisions
          SET
            confidence =
              'high'
          WHERE forecast_revisions.id =
            v_revision_id;

          RAISE EXCEPTION
            'FAIL: published revision modification was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Published forecast revision is immutable.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 10. PUBLISHED REVISION CANNOT BE UNPUBLISHED
         * ------------------------------------------------
         */

        BEGIN
          UPDATE public.forecast_revisions
          SET
            published_at =
              NULL
          WHERE forecast_revisions.id =
            v_revision_id;

          RAISE EXCEPTION
            'FAIL: revision unpublishing was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Published forecast revision is immutable.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 11. DELETE MUST FAIL
         * ------------------------------------------------
         */

        BEGIN
          DELETE FROM
            public.forecast_revisions
          WHERE forecast_revisions.id =
            v_revision_id;

          RAISE EXCEPTION
            'FAIL: forecast revision deletion was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Forecast revision history cannot be deleted.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 12. TRUNCATE MUST FAIL
         * ------------------------------------------------
         */

        BEGIN
          TRUNCATE TABLE
            public.forecast_revisions;

          RAISE EXCEPTION
            'FAIL: forecast revision truncation was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Forecast revision history cannot be truncated.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * ------------------------------------------------
         * 13. POST-KICKOFF REVISION MUST FAIL
         * ------------------------------------------------
         */

        v_short_future_kickoff :=
          clock_timestamp()
          + interval '5 seconds';

        INSERT INTO public.fixtures (
          id,
          season_id,
          home_team_id,
          away_team_id,
          slug,
          provider,
          provider_id,
          is_demo,
          kickoff_at,
          status,
          fetched_at
        )
        VALUES (
          v_post_kickoff_fixture_id,
          v_source_fixture.season_id,
          v_source_fixture.home_team_id,
          v_source_fixture.away_team_id,
          'forecast-revision-post-kickoff-test',
          'forecast-revision-guard-test',
          v_post_kickoff_fixture_id::text,
          v_source_fixture.is_demo,
          v_short_future_kickoff,
          'scheduled',
          clock_timestamp()
        );

        INSERT INTO public.predictions (
          id,
          fixture_id,
          model_version_id,
          is_demo,
          kickoff_at_generation,
          input_cutoff_at,
          generated_at,
          published_at,
          input_sha256,
          input_snapshot,
          output
        )
        VALUES (
          v_post_kickoff_prediction_id,
          v_post_kickoff_fixture_id,
          v_test_model_id,
          v_source_fixture.is_demo,
          v_short_future_kickoff,
          clock_timestamp()
            - interval '30 seconds',
          clock_timestamp()
            - interval '20 seconds',
          NULL,
          repeat(
            '1',
            64
          ),
          jsonb_build_object(
            'test_only',
            true
          ),
          jsonb_build_object(
            'forecast',
            'home',
            'test_only',
            true
          )
        );

        UPDATE public.predictions
        SET
          published_at =
            clock_timestamp()
        WHERE predictions.id =
          v_post_kickoff_prediction_id;

        PERFORM
          pg_sleep(
            5.2
          );

        BEGIN
          INSERT INTO public.forecast_revisions (
            baseline_prediction_id,
            fixture_id,
            is_demo,
            revision_number,
            revision_version,
            reason,
            engine,
            engine_version,
            lineup_state,
            kickoff_at,
            input_cutoff_at,
            generated_at,
            published_at,
            selection,
            confidence,
            evidence_grade,
            material_changes,
            input_sha256,
            output_sha256,
            input_snapshot,
            output
          )
          VALUES (
            v_post_kickoff_prediction_id,
            v_post_kickoff_fixture_id,
            v_source_fixture.is_demo,
            1,
            'dictaziq-forecast-revision-v0.1',
            'final_prematch',
            'gpt_research',
            'dictaziq-llm-analysis-v0.2',
            'unconfirmed',
            v_short_future_kickoff,
            v_short_future_kickoff
              - interval '1 second',

            /*
             * Attempt to backdate generation.
             */
            v_short_future_kickoff
              - interval '500 milliseconds',

            NULL,
            'home',
            'low',
            'D',
            jsonb_build_array(
              'Attempted late revision.'
            ),
            repeat(
              '2',
              64
            ),
            repeat(
              '3',
              64
            ),
            jsonb_build_object(
              'test_only',
              true
            ),
            jsonb_build_object(
              'selection',
              'home'
            )
          );

          RAISE EXCEPTION
            'FAIL: post-kickoff forecast revision was allowed';

        EXCEPTION
          WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS
              v_error_message =
                MESSAGE_TEXT;

            IF v_error_message <>
              'Forecast revision cannot be generated at or after kickoff.'
            THEN
              RAISE;
            END IF;
        END;

        /*
         * Force rollback of every test write.
         */
        RAISE EXCEPTION USING
          ERRCODE =
            'ZX002',

          MESSAGE =
            'All forecast revision guard checks passed; roll back test records';

      EXCEPTION
        WHEN SQLSTATE 'ZX002' THEN
          NULL;
      END;

      /*
       * ------------------------------------------------
       * ROLLBACK VERIFICATION
       * ------------------------------------------------
       *
       * Explicit table aliases avoid all PL/pgSQL
       * variable/column ambiguity.
       */

      IF EXISTS (
        SELECT 1
        FROM public.forecast_revisions
          AS revision
        WHERE revision.baseline_prediction_id
          IN (
            v_baseline_prediction_id,
            v_post_kickoff_prediction_id
          )
      )
      THEN
        RAISE EXCEPTION
          'FAIL: forecast revision test records were not rolled back';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.predictions
          AS prediction
        WHERE prediction.id
          IN (
            v_baseline_prediction_id,
            v_post_kickoff_prediction_id
          )
      )
      THEN
        RAISE EXCEPTION
          'FAIL: forecast revision baseline records were not rolled back';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.fixtures
          AS fixture
        WHERE fixture.id
          IN (
            v_test_fixture_id,
            v_post_kickoff_fixture_id
          )
      )
      THEN
        RAISE EXCEPTION
          'FAIL: forecast revision fixture records were not rolled back';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.model_versions
          AS model
        WHERE model.id =
          v_test_model_id
      )
      THEN
        RAISE EXCEPTION
          'FAIL: forecast revision model record was not rolled back';
      END IF;
    END;
    $test$;
  `;

  console.log(
    "PASS: valid forecast revision draft accepted.",
  );

  console.log(
    "PASS: generated_at is controlled by database clock.",
  );

  console.log(
    "PASS: incorrect revision sequence rejected.",
  );

  console.log(
    "PASS: stale evidence cutoff rejected.",
  );

  console.log(
    "PASS: direct published revision insert rejected.",
  );

  console.log(
    "PASS: false confirmed-lineup state rejected.",
  );

  console.log(
    "PASS: draft revision content edits rejected.",
  );

  console.log(
    "PASS: publication cannot rewrite revision contents.",
  );

  console.log(
    "PASS: first revision publication uses database clock.",
  );

  console.log(
    "PASS: published revision edits and unpublishing rejected.",
  );

  console.log(
    "PASS: revision deletion rejected.",
  );

  console.log(
    "PASS: revision truncation rejected.",
  );

  console.log(
    "PASS: backdated post-kickoff revision rejected.",
  );

  console.log(
    "PASS: all forecast revision test records rolled back.",
  );

  console.log("");

  console.log(
    "PASS: dictaziq-forecast-revision-database-guards-v0.1",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : "";

    if (
      message.startsWith(
        "FAIL:",
      ) ||
      message.startsWith(
        "Required",
      )
    ) {
      console.error(
        message,
      );
    } else {
      console.error(
        "Forecast revision guard test failed. Check migrations and database connectivity.",
      );

      const code =
        typeof error ===
          "object" &&
        error !==
          null &&
        "code" in error
          ? String(
              error.code,
            )
          : "";

      if (
        /^[A-Z0-9]{5}$/.test(
          code,
        )
      ) {
        console.error(
          `Database error code: ${code}`,
        );
      }

      if (
        message
      ) {
        console.error(
          `Database message: ${message}`,
        );
      }
    }

    process.exitCode =
      1;
  },
);
import "./load-env";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

async function main() {
  const client = neon(getDatabaseUrl());

  await client`
    DO $test$
    DECLARE
      source_fixture public.fixtures%ROWTYPE;
      test_fixture_id uuid := gen_random_uuid();
      test_model_id uuid := gen_random_uuid();
      test_prediction_id uuid := gen_random_uuid();
      test_sport_id uuid;
      future_kickoff timestamptz;
      past_kickoff timestamptz;
      publication_started_at timestamptz;
      actual_publication_at timestamptz;
      error_message text;
    BEGIN
      -- This inner block is deliberately rolled back at the end.
      BEGIN
        SELECT *
        INTO source_fixture
        FROM public.fixtures
        WHERE provider = 'demo'
          AND provider_id = 'fixture-001'
          AND is_demo = true;

        IF NOT FOUND THEN
          RAISE EXCEPTION
            'Required demo fixture is missing. Run npm run demo:import first.';
        END IF;

        SELECT competition.sport_id
        INTO test_sport_id
        FROM public.seasons AS season
        JOIN public.competitions AS competition
          ON competition.id = season.competition_id
        WHERE season.id = source_fixture.season_id;

        future_kickoff := clock_timestamp() + interval '1 day';

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
          test_fixture_id,
          source_fixture.season_id,
          source_fixture.home_team_id,
          source_fixture.away_team_id,
          'demo-guard-test',
          'demo-guard-test',
          test_fixture_id::text,
          true,
          future_kickoff,
          'scheduled',
          clock_timestamp()
        );

        INSERT INTO public.model_versions (
          id,
          sport_id,
          version,
          description,
          code_sha256,
          configuration
        )
        VALUES (
          test_model_id,
          test_sport_id,
          'guard-test-' || test_model_id::text,
          'Rollback-only database protection test',
          repeat('a', 64),
          '{"test_only": true}'::jsonb
        );

        INSERT INTO public.predictions (
          id,
          fixture_id,
          model_version_id,
          is_demo,
          kickoff_at_generation,
          input_cutoff_at,
          generated_at,
          input_sha256,
          input_snapshot,
          output
        )
        VALUES (
          test_prediction_id,
          test_fixture_id,
          test_model_id,
          true,
          future_kickoff,
          clock_timestamp() - interval '10 minutes',
          clock_timestamp() - interval '5 minutes',
          repeat('b', 64),
          '{"test_only": true}'::jsonb,
          '{"test_only": true}'::jsonb
        );

        -- 1. Generated prediction contents cannot be edited.
        BEGIN
          UPDATE public.predictions
          SET output = '{"tampered": true}'::jsonb
          WHERE id = test_prediction_id;

          RAISE EXCEPTION 'FAIL: draft modification was allowed';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <>
              'Only first publication may update a prediction' THEN
              RAISE;
            END IF;
        END;

        -- 2. Publication cannot be combined with an output rewrite.
        BEGIN
          UPDATE public.predictions
          SET
            published_at = clock_timestamp(),
            output = '{"tampered": true}'::jsonb
          WHERE id = test_prediction_id;

          RAISE EXCEPTION 'FAIL: publication rewrote the prediction';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <>
              'Prediction inputs, output and metadata are immutable' THEN
              RAISE;
            END IF;
        END;

        -- 3. Draft predictions cannot be deleted.
        BEGIN
          DELETE FROM public.predictions
          WHERE id = test_prediction_id;

          RAISE EXCEPTION 'FAIL: draft deletion was allowed';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <> 'Predictions cannot be deleted' THEN
              RAISE;
            END IF;
        END;

        -- 4. Model versions cannot be rewritten.
        BEGIN
          UPDATE public.model_versions
          SET description = 'Tampered description'
          WHERE id = test_model_id;

          RAISE EXCEPTION 'FAIL: model modification was allowed';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <>
              'Historical records in model_versions cannot be changed or removed'
            THEN
              RAISE;
            END IF;
        END;

        -- 5. Model deletion must be rejected by its guard.
        BEGIN
          DELETE FROM public.model_versions
          WHERE id = test_model_id;

          RAISE EXCEPTION 'FAIL: model deletion was allowed';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <>
              'Historical records in model_versions cannot be changed or removed'
            THEN
              RAISE;
            END IF;
        END;

        -- 6. First publication succeeds and cannot be backdated.
        publication_started_at := clock_timestamp();

        UPDATE public.predictions
        SET published_at = clock_timestamp() - interval '1 minute'
        WHERE id = test_prediction_id
        RETURNING published_at INTO actual_publication_at;

        IF actual_publication_at IS NULL
           OR actual_publication_at < publication_started_at THEN
          RAISE EXCEPTION
            'FAIL: publication did not use the database clock';
        END IF;

        -- 7. Published output cannot be changed.
        BEGIN
          UPDATE public.predictions
          SET output = '{"tampered": true}'::jsonb
          WHERE id = test_prediction_id;

          RAISE EXCEPTION 'FAIL: published modification was allowed';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <> 'Published predictions are immutable' THEN
              RAISE;
            END IF;
        END;

        -- 8. Published predictions cannot be unpublished.
        BEGIN
          UPDATE public.predictions
          SET published_at = NULL
          WHERE id = test_prediction_id;

          RAISE EXCEPTION 'FAIL: unpublishing was allowed';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <> 'Published predictions are immutable' THEN
              RAISE;
            END IF;
        END;

        -- 9. Published predictions cannot be deleted.
        BEGIN
          DELETE FROM public.predictions
          WHERE id = test_prediction_id;

          RAISE EXCEPTION 'FAIL: published deletion was allowed';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <> 'Predictions cannot be deleted' THEN
              RAISE;
            END IF;
        END;

        -- 10. Backdated timestamps cannot bypass the kickoff deadline.
        past_kickoff := clock_timestamp() - interval '1 minute';

        UPDATE public.fixtures
        SET kickoff_at = past_kickoff
        WHERE id = test_fixture_id;

        BEGIN
          INSERT INTO public.predictions (
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
            test_fixture_id,
            test_model_id,
            true,
            past_kickoff,
            past_kickoff - interval '10 minutes',
            past_kickoff - interval '5 minutes',
            past_kickoff - interval '2 minutes',
            repeat('c', 64),
            '{"test_only": true}'::jsonb,
            '{"test_only": true}'::jsonb
          );

          RAISE EXCEPTION 'FAIL: post-kickoff publication was allowed';
        EXCEPTION
          WHEN check_violation THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            IF error_message <>
              'Pre-match predictions cannot be stored or published after kickoff'
            THEN
              RAISE;
            END IF;
        END;

        -- A dedicated exception rolls back all writes in this inner block.
        RAISE EXCEPTION USING
          ERRCODE = 'ZX001',
          MESSAGE = 'All guard checks passed; roll back test records';

      EXCEPTION
        WHEN SQLSTATE 'ZX001' THEN
          NULL;
      END;

      -- Confirm rollback removed the records we created.
      IF EXISTS (
        SELECT 1 FROM public.fixtures WHERE id = test_fixture_id
      ) OR EXISTS (
        SELECT 1 FROM public.model_versions WHERE id = test_model_id
      ) OR EXISTS (
        SELECT 1 FROM public.predictions WHERE id = test_prediction_id
      ) THEN
        RAISE EXCEPTION 'FAIL: test records were not rolled back';
      END IF;
    END;
    $test$;
  `;

  console.log("PASS: generated prediction edits rejected.");
  console.log("PASS: publication cannot rewrite prediction contents.");
  console.log("PASS: draft deletion rejected.");
  console.log("PASS: model version updates and deletion rejected.");
  console.log("PASS: first publication uses the database clock.");
  console.log("PASS: published edits, unpublishing and deletion rejected.");
  console.log("PASS: backdated post-kickoff publication rejected.");
  console.log("PASS: all test records rolled back.");
}

main().catch((error: unknown) => {
  // Only expose messages deliberately raised by our test.
  const message = error instanceof Error ? error.message : "";

  if (
    message.startsWith("FAIL:") ||
    message.startsWith("Required demo fixture")
  ) {
    console.error(message);
  } else {
    console.error(
      "Prediction guard test failed. Check migration installation and database connectivity.",
    );

    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";

    if (/^[A-Z0-9]{5}$/.test(code)) {
      console.error(`Database error code: ${code}`);
    }
  }

  process.exitCode = 1;
});
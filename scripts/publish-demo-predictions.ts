import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

async function main() {
  const client = neon(getDatabaseUrl());

  const fixtures = await client`
    SELECT
      id,
      slug,
      kickoff_at,
      status,
      is_demo,
      clock_timestamp() AS checked_at
    FROM public.fixtures
    WHERE provider = 'demo'
      AND provider_id = 'fixture-001'
      AND is_demo = true
  `;

  assert.equal(
    fixtures.length,
    1,
    "Demo fixture fixture-001 is missing.",
  );

  const fixture = fixtures[0];

  assert.equal(
    fixture.status,
    "scheduled",
    "Only scheduled pre-match fixtures may publish predictions.",
  );

  assert.ok(
    fixture.kickoff_at,
    "Demo fixture kickoff is missing.",
  );

  const kickoff = new Date(String(fixture.kickoff_at));
  const checkedAt = new Date(String(fixture.checked_at));

  assert.ok(
    Number.isFinite(kickoff.getTime()),
    "Fixture kickoff timestamp is invalid.",
  );

  assert.ok(
    Number.isFinite(checkedAt.getTime()),
    "Database clock timestamp is invalid.",
  );

  assert.ok(
    checkedAt.getTime() < kickoff.getTime(),
    "Demo fixture kickoff has passed. Predictions cannot be published.",
  );

  const before = await client`
    SELECT
      prediction.id,
      prediction.published_at,
      prediction.generated_at,
      prediction.input_sha256,
      model.version AS model_version

    FROM public.predictions AS prediction

    JOIN public.model_versions AS model
      ON model.id = prediction.model_version_id

    WHERE prediction.fixture_id =
      ${fixture.id}::uuid

    ORDER BY
      model.version,
      prediction.generated_at
  `;

  assert.ok(
    before.length >= 2,
    "Expected at least Poisson and rating-gap demo predictions.",
  );

  const targetVersions = new Set([
    "dictaziq-rating-gap-v0.1",
  ]);

  const ratingGapPredictions = before.filter(
    (row) => targetVersions.has(String(row.model_version)),
  );

  assert.ok(
    ratingGapPredictions.length >= 1,
    "Rating-gap prediction is missing.",
  );

  /*
   * Publish every currently unpublished demo prediction for the fixture.
   *
   * The predictions_guard database trigger:
   * - only permits the first publication update,
   * - forbids changing any other prediction field,
   * - checks fixture remains scheduled,
   * - requires publication before kickoff,
   * - replaces caller-supplied published_at with database clock time.
   */
  await client`
    UPDATE public.predictions
    SET published_at = clock_timestamp()
    WHERE fixture_id = ${fixture.id}::uuid
      AND is_demo = true
      AND published_at IS NULL
  `;

  const after = await client`
    SELECT
      prediction.id,
      prediction.generated_at,
      prediction.published_at,
      prediction.input_sha256,
      model.version AS model_version

    FROM public.predictions AS prediction

    JOIN public.model_versions AS model
      ON model.id = prediction.model_version_id

    WHERE prediction.fixture_id =
      ${fixture.id}::uuid

    ORDER BY
      model.version,
      prediction.generated_at
  `;

  assert.equal(
    after.length,
    before.length,
    "Publication unexpectedly changed prediction count.",
  );

  for (const prediction of after) {
    assert.ok(
      prediction.published_at,
      `Prediction ${prediction.id} remains unpublished.`,
    );

    const generatedAt = new Date(
      String(prediction.generated_at),
    );

    const publishedAt = new Date(
      String(prediction.published_at),
    );

    assert.ok(
      publishedAt.getTime() >= generatedAt.getTime(),
      `Prediction ${prediction.id} was published before generation.`,
    );

    assert.ok(
      publishedAt.getTime() < kickoff.getTime(),
      `Prediction ${prediction.id} was published after kickoff.`,
    );
  }

  console.log(
    "PASS: routine publication completed without admin approval.",
  );

  console.log(
    "PASS: database stamped publication timestamps.",
  );

  console.log(
    "PASS: all demo predictions remain pre-kickoff publications.",
  );

  console.log("");

  console.log(`Fixture: ${fixture.slug}`);
  console.log(`Published predictions: ${after.length}`);
  console.log("");

  for (const prediction of after) {
    console.log(
      `${prediction.model_version} | ${prediction.id} | ${prediction.published_at}`,
    );
  }
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(
      `Publication verification failed: ${error.message}`,
    );
  } else {
    console.error(
      error instanceof Error
        ? `Publication failed: ${error.message}`
        : "Publication failed.",
    );
  }

  process.exitCode = 1;
});
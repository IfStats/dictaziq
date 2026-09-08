import "./load-env";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/lib/env/database";

type ModelEnvelope = {
  model_version: string;
  code_sha256: string;
  input_sha256: string;
  configuration: Record<string, unknown>;
  prediction: {
    fixture_id: string;
    model_version: string;
    is_demo: boolean;
    validation_status: string;
    markets: {
      "1x2": {
        home: number;
        draw: number;
        away: number;
      };
    };
    most_likely_score: {
      home: number;
      away: number;
      probability: number;
    };
  };
};

function iso(value: unknown): string {
  const date = new Date(String(value));

  assert.ok(
    Number.isFinite(date.getTime()),
    "Database returned an invalid timestamp.",
  );

  return date.toISOString();
}

async function main() {
  const client = neon(getDatabaseUrl());

  const fixtures = await client`
    SELECT
      fixture.id,
      fixture.home_team_id,
      fixture.away_team_id,
      fixture.kickoff_at,
      fixture.is_demo,
      fixture.status,
      competition.id AS competition_id,
      competition.sport_id,
      clock_timestamp() AS input_cutoff
    FROM public.fixtures AS fixture
    JOIN public.seasons AS season
      ON season.id = fixture.season_id
    JOIN public.competitions AS competition
      ON competition.id = season.competition_id
    WHERE fixture.provider = 'demo'
      AND fixture.provider_id = 'fixture-001'
      AND fixture.is_demo = true
  `;

  assert.equal(fixtures.length, 1, "The demo target fixture is missing.");

  const target = fixtures[0];

  assert.equal(
    target.status,
    "scheduled",
    "The target fixture must still be scheduled.",
  );

  const cutoff = iso(target.input_cutoff);
  const kickoff = iso(target.kickoff_at);

  assert.ok(
    Date.parse(cutoff) < Date.parse(kickoff),
    "The demo kickoff has passed. Reschedule the demo before generating.",
  );

  // Select the latest observation BEFORE checking result eligibility.
  // A later withdrawal of a result must supersede its earlier final score.
  const snapshots = await client`
    WITH latest AS (
      SELECT DISTINCT ON (snapshot.fixture_id)
        snapshot.*
      FROM public.result_snapshots AS snapshot
      WHERE snapshot.observed_at <= ${cutoff}::timestamptz
        AND snapshot.is_demo = true
      ORDER BY
        snapshot.fixture_id,
        snapshot.observed_at DESC,
        snapshot.id DESC
    )
    SELECT *
    FROM latest
    WHERE fixture_id <> ${target.id}::uuid
      AND evidence ->> 'competition_id' = ${target.competition_id}::text
      AND status = 'finished'
      AND regulation_confirmed = true
    ORDER BY fixture_id
  `;

  assert.ok(snapshots.length > 0, "No eligible historical snapshots exist.");

  const history = snapshots.map((snapshot) => {
    const evidence = snapshot.evidence as Record<string, unknown>;

    assert.equal(
      typeof evidence.home_team_id,
      "string",
      "Snapshot is missing its home-team identity.",
    );
    assert.equal(
      typeof evidence.away_team_id,
      "string",
      "Snapshot is missing its away-team identity.",
    );

    return {
      id: snapshot.fixture_id,
      competition_id: evidence.competition_id,
      home_team_id: evidence.home_team_id,
      away_team_id: evidence.away_team_id,
      home_goals: snapshot.regulation_home_score,
      away_goals: snapshot.regulation_away_score,
      status: snapshot.status,
      regulation_confirmed: snapshot.regulation_confirmed,
      is_demo: snapshot.is_demo,

      // If no reliable finish time exists, observation time is the
      // conservative eligibility boundary. It is not claimed as actual FT.
      finished_at: iso(snapshot.finished_at ?? snapshot.observed_at),
      available_at: iso(snapshot.observed_at),
    };
  });

  const input = {
    fixture: {
      id: target.id,
      competition_id: target.competition_id,
      home_team_id: target.home_team_id,
      away_team_id: target.away_team_id,
      kickoff_at: kickoff,
      is_demo: true,
    },
    cutoff,
    history,

    // Preserve complete source observations alongside normalized inputs.
    source_snapshots: snapshots,
  };

  const processResult = spawnSync(
    "python",
    [resolve("services", "predictions", "run.py")],
    {
      input: JSON.stringify(input),
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    },
  );

  assert.ok(
    !processResult.error,
    "Python could not start or exceeded the execution timeout.",
  );

  assert.equal(
    processResult.status,
    0,
    processResult.stderr.trim() || "Python prediction generation failed.",
  );

  const envelope = JSON.parse(processResult.stdout) as ModelEnvelope;
  const prediction = envelope.prediction;

  assert.match(envelope.code_sha256, /^[0-9a-f]{64}$/);
  assert.match(envelope.input_sha256, /^[0-9a-f]{64}$/);
  assert.equal(prediction.fixture_id, target.id);
  assert.equal(prediction.is_demo, true);
  assert.equal(prediction.validation_status, "experimental");
  assert.equal(prediction.model_version, envelope.model_version);

  const probabilities = Object.values(prediction.markets["1x2"]);

  assert.equal(probabilities.length, 3);
  assert.ok(
    probabilities.every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1,
    ),
    "Invalid full-time outcome probabilities.",
  );
  assert.ok(
    Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) <
      1e-9,
    "Full-time outcome probabilities do not sum to one.",
  );

  // Immutable versions use DO NOTHING, never an update-on-conflict.
  await client`
    INSERT INTO public.model_versions (
      sport_id,
      version,
      description,
      code_sha256,
      configuration
    )
    VALUES (
      ${target.sport_id}::uuid,
      ${envelope.model_version},
      'Experimental football Poisson baseline; not validated for production',
      ${envelope.code_sha256},
      ${JSON.stringify(envelope.configuration)}::jsonb
    )
    ON CONFLICT (version) DO NOTHING
  `;

  const models = await client`
    SELECT id, code_sha256, sport_id, configuration
    FROM public.model_versions
    WHERE version = ${envelope.model_version}
  `;

  assert.equal(models.length, 1, "Model registration failed.");

  const model = models[0];

  assert.equal(
    model.code_sha256,
    envelope.code_sha256,
    "Model code changed under an existing version. Use a new model version.",
  );
  assert.equal(model.sport_id, target.sport_id);
  assert.deepEqual(
    model.configuration,
    envelope.configuration,
    "Model settings changed under an existing version.",
  );

  await client`
    INSERT INTO public.predictions (
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
      ${target.id}::uuid,
      ${model.id}::uuid,
      true,
      ${kickoff}::timestamptz,
      ${cutoff}::timestamptz,
      clock_timestamp(),
      ${envelope.input_sha256},
      ${JSON.stringify(input)}::jsonb,
      ${JSON.stringify(prediction)}::jsonb
    )
    ON CONFLICT (
      fixture_id,
      model_version_id,
      input_sha256,
      input_cutoff_at
    ) DO NOTHING
  `;

  const saved = await client`
    SELECT id, is_demo, published_at, input_snapshot, output
    FROM public.predictions
    WHERE fixture_id = ${target.id}::uuid
      AND model_version_id = ${model.id}::uuid
      AND input_sha256 = ${envelope.input_sha256}
      AND input_cutoff_at = ${cutoff}::timestamptz
  `;

  assert.equal(saved.length, 1, "Prediction storage failed.");
  assert.equal(saved[0].is_demo, true);
  assert.equal(saved[0].published_at, null);
  assert.deepEqual(saved[0].output, prediction);
  assert.deepEqual(
    saved[0].input_snapshot,
    JSON.parse(JSON.stringify(input)),
  );

  console.log("PASS: historical inputs selected at a fixed cutoff.");
  console.log("PASS: Python generated consistent outcome probabilities.");
  console.log("PASS: model source fingerprint and settings verified.");
  console.log("PASS: prediction and complete input snapshot persisted.");
  console.log("PASS: prediction remains unpublished demo data.");
  console.log(`Prediction ID: ${saved[0].id}`);

  const outcome = prediction.markets["1x2"];
  const score = prediction.most_likely_score;

  console.log(
    `Demo probabilities: home ${(outcome.home * 100).toFixed(1)}%, ` +
      `draw ${(outcome.draw * 100).toFixed(1)}%, ` +
      `away ${(outcome.away * 100).toFixed(1)}%`,
  );
  console.log(
    `Most likely demo score: ${score.home}-${score.away} ` +
      `(${(score.probability * 100).toFixed(1)}%)`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) {
    console.error(`Verification failed: ${error.message}`);
  } else {
    console.error(
      "Prediction generation failed. Check database connectivity, migrations and Python output.",
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
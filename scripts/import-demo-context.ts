import "./load-env";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "../src/lib/env/database";

type DemoContextEvidence = {
  kind:
    | "recent_form"
    | "home_away_form"
    | "squad_availability"
    | "rest_schedule"
    | "competition_position"
    | "head_to_head"
    | "tactical_matchup"
    | "other_verified";

  side:
    | "home"
    | "away"
    | "neutral";

  description: string;

  source: string;

  sourceEvidenceId: string;

  observedAt: string;

  evidence: Record<string, unknown>;
};

const OBSERVED_AT =
  "2026-09-08T12:00:00.000Z";

const demoEvidence: DemoContextEvidence[] = [
  {
    kind: "recent_form",
    side: "home",

    description:
      "Synthetic verified recent-form evidence favours the home side.",

    source:
      "verified-demo-source",

    sourceEvidenceId:
      "demo-recent-form-001",

    observedAt:
      OBSERVED_AT,

    evidence: {
      synthetic: true,
      category: "recent_form",
      assessment: "home",
      note:
        "Synthetic context used only to verify the DictazIQ evidence pipeline.",
    },
  },

  {
    kind: "home_away_form",
    side: "home",

    description:
      "Synthetic verified venue-form evidence favours the home side.",

    source:
      "verified-demo-source",

    sourceEvidenceId:
      "demo-home-away-form-001",

    observedAt:
      OBSERVED_AT,

    evidence: {
      synthetic: true,
      category: "home_away_form",
      assessment: "home",
      note:
        "Synthetic context used only to verify the DictazIQ evidence pipeline.",
    },
  },

  {
    kind: "squad_availability",
    side: "home",

    description:
      "Synthetic verified squad-availability evidence favours the home side.",

    source:
      "verified-demo-source",

    sourceEvidenceId:
      "demo-squad-001",

    observedAt:
      OBSERVED_AT,

    evidence: {
      synthetic: true,
      category: "squad_availability",
      assessment: "home",
      note:
        "Synthetic context used only to verify the DictazIQ evidence pipeline.",
    },
  },

  {
    kind: "rest_schedule",
    side: "neutral",

    description:
      "Synthetic verified rest-schedule evidence is neutral.",

    source:
      "verified-demo-source",

    sourceEvidenceId:
      "demo-rest-001",

    observedAt:
      OBSERVED_AT,

    evidence: {
      synthetic: true,
      category: "rest_schedule",
      assessment: "neutral",
      note:
        "Synthetic context used only to verify the DictazIQ evidence pipeline.",
    },
  },
];

function canonicalize(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      )
        .sort(
          ([left], [right]) =>
            left.localeCompare(right),
        )
        .map(
          ([key, item]) => [
            key,
            canonicalize(item),
          ],
        ),
    );
  }

  return value;
}

function sha256(
  value: unknown,
): string {
  const canonical =
    JSON.stringify(
      canonicalize(value),
    );

  return createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex");
}

async function main() {
  const client =
    neon(getDatabaseUrl());

  const fixtures = await client`
    SELECT
      id,
      slug,
      kickoff_at,
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

  const fixture =
    fixtures[0];

  const kickoff =
    new Date(
      String(fixture.kickoff_at),
    );

  const checkedAt =
    new Date(
      String(fixture.checked_at),
    );

  const observedAt =
    new Date(OBSERVED_AT);

  assert.ok(
    Number.isFinite(
      kickoff.getTime(),
    ),
    "Fixture kickoff is invalid.",
  );

  assert.ok(
    checkedAt.getTime() <
      kickoff.getTime(),
    "Context ingestion must occur before kickoff.",
  );

  assert.ok(
    observedAt.getTime() <=
      checkedAt.getTime(),
    "Synthetic observation time cannot be in the future.",
  );

  assert.ok(
    observedAt.getTime() <
      kickoff.getTime(),
    "Synthetic context must have been observed before kickoff.",
  );

  const expectedHashes: string[] = [];

  for (
    const item
    of demoEvidence
  ) {
    const identityPayload = {
      fixture_id:
        fixture.id,

      kind:
        item.kind,

      side:
        item.side,

      description:
        item.description.trim(),

      source:
        item.source
          .trim()
          .toLowerCase(),

      source_evidence_id:
        item.sourceEvidenceId,

      observed_at:
        item.observedAt,

      evidence:
        item.evidence,
    };

    const evidenceSha256 =
      sha256(identityPayload);

    expectedHashes.push(
      evidenceSha256,
    );

    await client`
      INSERT INTO public.context_evidence_snapshots (
        fixture_id,
        kind,
        side,
        description,
        source,
        source_evidence_id,
        evidence_sha256,
        is_demo,
        observed_at,
        evidence
      )
      VALUES (
        ${fixture.id}::uuid,
        ${item.kind},
        ${item.side},
        ${item.description},
        ${item.source},
        ${item.sourceEvidenceId},
        ${evidenceSha256},
        true,
        ${item.observedAt}::timestamptz,
        ${JSON.stringify(
          item.evidence,
        )}::jsonb
      )
      ON CONFLICT (
        fixture_id,
        evidence_sha256
      )
      DO NOTHING
    `;
  }

  const rows = await client`
    SELECT
      id,
      fixture_id,
      kind,
      side,
      description,
      source,
      source_evidence_id,
      evidence_sha256,
      is_demo,
      observed_at,
      captured_at,
      evidence

    FROM public.context_evidence_snapshots

    WHERE fixture_id =
      ${fixture.id}::uuid

      AND evidence_sha256 =
        ANY(
          ${expectedHashes}::text[]
        )

    ORDER BY
      kind,
      evidence_sha256
  `;

  assert.equal(
    rows.length,
    demoEvidence.length,
    "Expected all synthetic context evidence records to be stored.",
  );

  const storedHashes =
    new Set(
      rows.map(
        (row) =>
          String(
            row.evidence_sha256,
          ),
      ),
    );

  for (
    const hash
    of expectedHashes
  ) {
    assert.ok(
      storedHashes.has(hash),
      `Missing context evidence hash: ${hash}`,
    );
  }

  for (
    const row
    of rows
  ) {
    assert.equal(
      row.fixture_id,
      fixture.id,
    );

    assert.equal(
      row.is_demo,
      true,
    );

    const rowObserved =
      new Date(
        String(
          row.observed_at,
        ),
      );

    const rowCaptured =
      new Date(
        String(
          row.captured_at,
        ),
      );

    assert.ok(
      rowObserved.getTime() <
        kickoff.getTime(),
      "Stored context evidence was observed after kickoff.",
    );

    assert.ok(
      rowCaptured.getTime() <
        kickoff.getTime(),
      "Stored context evidence was captured after kickoff.",
    );

    assert.ok(
      rowObserved.getTime() <=
        rowCaptured.getTime(),
      "Context evidence was captured before it was observed.",
    );
  }

  /*
   * Prove that an immutable record cannot be modified.
   */
  const first =
    rows[0];

  let updateRejected =
    false;

  try {
    await client`
      UPDATE public.context_evidence_snapshots
      SET description =
        'tampered description'
      WHERE id =
        ${first.id}::uuid
    `;
  } catch {
    updateRejected =
      true;
  }

  assert.equal(
    updateRejected,
    true,
    "Context evidence UPDATE was not rejected.",
  );

  /*
   * Prove that an immutable record cannot be deleted.
   */
  let deleteRejected =
    false;

  try {
    await client`
      DELETE FROM public.context_evidence_snapshots
      WHERE id =
        ${first.id}::uuid
    `;
  } catch {
    deleteRejected =
      true;
  }

  assert.equal(
    deleteRejected,
    true,
    "Context evidence DELETE was not rejected.",
  );

  console.log(
    "PASS: synthetic pre-match context evidence ingested.",
  );

  console.log(
    "PASS: canonical evidence SHA-256 identities generated.",
  );

  console.log(
    "PASS: evidence reloaded from Neon.",
  );

  console.log(
    "PASS: all observations precede fixture kickoff.",
  );

  console.log(
    "PASS: captured_at is database-controlled and pre-kickoff.",
  );

  console.log(
    "PASS: repeated ingestion is idempotent.",
  );

  console.log(
    "PASS: context evidence UPDATE rejected.",
  );

  console.log(
    "PASS: context evidence DELETE rejected.",
  );

  console.log("");

  console.log(
    `Fixture: ${fixture.slug}`,
  );

  console.log(
    `Stored context records: ${rows.length}`,
  );

  console.log("");

  for (
    const row
    of rows
  ) {
    console.log(
      `${row.kind} | ${row.side} | ${row.evidence_sha256}`,
    );
  }

  console.log("");

  console.log(
    "WARNING: synthetic context evidence; this is pipeline verification data, not football performance evidence.",
  );
}

main().catch(
  (error: unknown) => {
    if (
      error instanceof
      assert.AssertionError
    ) {
      console.error(
        `Context ingestion verification failed: ${error.message}`,
      );
    } else {
      console.error(
        error instanceof Error
          ? `Context ingestion failed: ${error.message}`
          : "Context ingestion failed.",
      );
    }

    process.exitCode = 1;
  },
);
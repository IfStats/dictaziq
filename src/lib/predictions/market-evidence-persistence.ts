import assert from "node:assert/strict";

import {
  createHash,
} from "node:crypto";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../env/database";

import {
  validateMarketEvidenceSnapshotV02,
  type MarketEvidenceSnapshotV02,
} from "./market-evidence-v0.2";

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | {
      [key: string]:
        CanonicalJson;
    };

function canonicalize(
  value: unknown,
): CanonicalJson {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      throw new Error(
        "Canonical JSON cannot contain non-finite numbers.",
      );
    }

    return value;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    typeof value === "object"
  ) {
    const source =
      value as Record<
        string,
        unknown
      >;

    const result:
      Record<
        string,
        CanonicalJson
      > = {};

    for (
      const key
      of Object.keys(
        source,
      ).sort()
    ) {
      const child =
        source[key];

      if (
        child === undefined
      ) {
        throw new Error(
          `Canonical JSON cannot contain undefined at key ${key}.`,
        );
      }

      result[key] =
        canonicalize(
          child,
        );
    }

    return result;
  }

  throw new Error(
    `Unsupported canonical JSON value: ${typeof value}.`,
  );
}

export function canonicalJson(
  value: unknown,
): string {
  return JSON.stringify(
    canonicalize(
      value,
    ),
  );
}

export function canonicalSha256(
  value: unknown,
): string {
  return createHash(
    "sha256",
  )
    .update(
      canonicalJson(
        value,
      ),
      "utf8",
    )
    .digest(
      "hex",
    );
}

export type PersistedMarketEvidence = {
  id: string;

  evidenceSha256: string;

  capturedAt: string;

  status:
    | "inserted"
    | "existing";

  evidence:
    MarketEvidenceSnapshotV02;
};

export async function persistAndReloadMarketEvidence(
  input: {
    evidence:
      MarketEvidenceSnapshotV02;

    source: string;

    isDemo: boolean;
  },
): Promise<
  PersistedMarketEvidence
> {
  /*
   * Application-level validation must succeed
   * before anything is written to immutable
   * history.
   */
  const validated =
    validateMarketEvidenceSnapshotV02(
      input.evidence,
    );

  const evidenceSha256 =
    canonicalSha256(
      validated,
    );

  assert.match(
    evidenceSha256,
    /^[0-9a-f]{64}$/,
  );

  const source =
    input.source
      .trim()
      .toLowerCase();

  if (!source) {
    throw new Error(
      "Market evidence source must not be empty.",
    );
  }

  const sql =
    neon(
      getDatabaseUrl(),
    );

  const inserted =
    await sql`
      INSERT INTO public.market_evidence_snapshots (
        fixture_id,
        evidence_version,
        evidence_sha256,
        source,
        is_demo,
        cutoff_at,
        evidence
      )
      VALUES (
        ${validated.fixtureId}::uuid,

        ${validated.evidenceVersion},

        ${evidenceSha256},

        ${source},

        ${input.isDemo},

        ${validated.cutoffAt}::timestamptz,

        ${JSON.stringify(
          validated,
        )}::jsonb
      )

      ON CONFLICT (
        fixture_id,
        evidence_sha256
      )
      DO NOTHING

      RETURNING
        id,
        fixture_id,
        evidence_version,
        evidence_sha256,
        source,
        is_demo,
        cutoff_at,
        captured_at,
        evidence
    `;

  let row:
    Record<
      string,
      unknown
    >;

  let status:
    | "inserted"
    | "existing";

  if (
    inserted.length ===
    1
  ) {
    row =
      inserted[0];

    status =
      "inserted";
  } else {
    const existing =
      await sql`
        SELECT
          id,
          fixture_id,
          evidence_version,
          evidence_sha256,
          source,
          is_demo,
          cutoff_at,
          captured_at,
          evidence

        FROM public.market_evidence_snapshots

        WHERE fixture_id =
          ${validated.fixtureId}::uuid

          AND evidence_sha256 =
            ${evidenceSha256}

        LIMIT 1
      `;

    assert.equal(
      existing.length,
      1,
      "Market evidence conflict occurred but existing snapshot could not be reloaded.",
    );

    row =
      existing[0];

    status =
      "existing";
  }

  /*
   * Reload from PostgreSQL and validate the
   * stored representation instead of trusting
   * the object that was sent to INSERT.
   */
  const storedEvidence =
    row.evidence as
      MarketEvidenceSnapshotV02;

  validateMarketEvidenceSnapshotV02(
    storedEvidence,
  );

  const storedSha256 =
    canonicalSha256(
      storedEvidence,
    );

  assert.equal(
    storedSha256,
    evidenceSha256,
    "Reloaded market evidence SHA-256 does not match the inserted snapshot.",
  );

  assert.equal(
    String(
      row.fixture_id,
    ),
    validated.fixtureId,
    "Stored market evidence fixture identity changed.",
  );

  assert.equal(
    String(
      row.evidence_version,
    ),
    validated.evidenceVersion,
    "Stored market evidence version changed.",
  );

  assert.equal(
    String(
      row.evidence_sha256,
    ),
    evidenceSha256,
    "Stored market evidence hash changed.",
  );

  assert.equal(
    String(
      row.source,
    ),
    source,
    "Stored market evidence source changed.",
  );

  assert.equal(
    Boolean(
      row.is_demo,
    ),
    input.isDemo,
    "Stored market evidence demo classification changed.",
  );

  const capturedAt =
    new Date(
      String(
        row.captured_at,
      ),
    ).toISOString();

  return {
    id:
      String(
        row.id,
      ),

    evidenceSha256,

    capturedAt,

    status,

    evidence:
      storedEvidence,
  };
}
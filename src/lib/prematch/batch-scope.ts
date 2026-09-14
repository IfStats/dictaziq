import {
  type NeonQueryFunction,
} from "@neondatabase/serverless";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestedBatchId(
  argv:
    string[] =
      process.argv.slice(2),
): string | null {
  const argument =
    argv.find(
      (
        value,
      ) =>
        value.startsWith(
          "--batch-id=",
        ),
    );

  if (!argument) {
    return null;
  }

  const batchId =
    argument
      .slice(
        "--batch-id=".length,
      )
      .trim();

  if (
    !UUID_PATTERN.test(
      batchId,
    )
  ) {
    throw new Error(
      "--batch-id must be a valid UUID.",
    );
  }

  return batchId;
}

export async function loadBatchFixtureIds(
  sql: SqlClient,
  batchId: string,
): Promise<Set<string>> {
  const rows =
    await sql`
      SELECT
        fixture_id::text
          AS fixture_id

      FROM public.prematch_batch_fixtures

      WHERE
        batch_id =
          ${batchId}::uuid

      ORDER BY
        fixture_id
    `;

  if (
    rows.length ===
    0
  ) {
    throw new Error(
      `Prematch batch ${batchId} has no fixtures.`,
    );
  }

  return new Set(
    rows.map(
      (
        row,
      ) =>
        String(
          row.fixture_id,
        ),
    ),
  );
}

export function fixtureInBatch(
  fixtureIds: Set<string> | null,
  fixtureId: string,
): boolean {
  return (
    fixtureIds === null ||
    fixtureIds.has(
      fixtureId,
    )
  );
}

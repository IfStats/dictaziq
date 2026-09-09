import "./load-env";

import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

const MANIFEST_VERSION =
  "dictaziq-reviewed-team-mappings-v0.1";

const RATING_SOURCE =
  "footballdatabase.com";

type Provider =
  | "api-football"
  | "football-data.org";

type MatchMethod =
  | "exact"
  | "alias";

type MappingEntry = {
  provider: Provider;
  providerTeamId: string;
  providerName: string;
  footballDatabaseName: string;
  method: MatchMethod;
  reason: string;
};

type Manifest = {
  version: string;
  reviewedAt: string;
  mappings: MappingEntry[];
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requiredString(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function providerTeamId(
  value: unknown,
): string {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw new Error(
      "providerTeamId must be a string or number.",
    );
  }

  const result =
    String(value).trim();

  if (!result) {
    throw new Error(
      "providerTeamId must not be empty.",
    );
  }

  return result;
}

function parseManifest(
  value: unknown,
): Manifest {
  if (!isRecord(value)) {
    throw new Error(
      "Mapping manifest must be an object.",
    );
  }

  const version =
    requiredString(
      value.version,
      "version",
    );

  if (
    version !==
    MANIFEST_VERSION
  ) {
    throw new Error(
      `Unsupported mapping manifest version: ${version}.`,
    );
  }

  const reviewedAt =
    requiredString(
      value.reviewedAt,
      "reviewedAt",
    );

  const reviewedDate =
    new Date(
      `${reviewedAt}T00:00:00.000Z`,
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      reviewedAt,
    ) ||
    !Number.isFinite(
      reviewedDate.getTime(),
    )
  ) {
    throw new Error(
      "reviewedAt must use YYYY-MM-DD.",
    );
  }

  if (
    !Array.isArray(
      value.mappings,
    )
  ) {
    throw new Error(
      "mappings must be an array.",
    );
  }

  const mappings:
    MappingEntry[] =
    value.mappings.map(
      (
        raw,
        index,
      ) => {
        if (
          !isRecord(raw)
        ) {
          throw new Error(
            `mappings[${index}] must be an object.`,
          );
        }

        const provider =
          requiredString(
            raw.provider,
            `mappings[${index}].provider`,
          );

        if (
          provider !==
            "api-football" &&
          provider !==
            "football-data.org"
        ) {
          throw new Error(
            `Unsupported provider ${provider}.`,
          );
        }

        const method =
          requiredString(
            raw.method,
            `mappings[${index}].method`,
          );

        if (
          method !== "exact" &&
          method !== "alias"
        ) {
          throw new Error(
            `Unsupported match method ${method}.`,
          );
        }

        return {
          provider,

          providerTeamId:
            providerTeamId(
              raw.providerTeamId,
            ),

          providerName:
            requiredString(
              raw.providerName,
              `mappings[${index}].providerName`,
            ),

          footballDatabaseName:
            requiredString(
              raw.footballDatabaseName,
              `mappings[${index}].footballDatabaseName`,
            ),

          method,

          reason:
            requiredString(
              raw.reason,
              `mappings[${index}].reason`,
            ),
        };
      },
    );

  const identities =
    new Set<string>();

  for (
    const mapping
    of mappings
  ) {
    const key =
      `${mapping.provider}:${mapping.providerTeamId}`;

    if (
      identities.has(
        key,
      )
    ) {
      throw new Error(
        `Duplicate provider identity in manifest: ${key}.`,
      );
    }

    identities.add(
      key,
    );
  }

  return {
    version,
    reviewedAt,
    mappings,
  };
}

function loadManifest():
  {
    manifest: Manifest;
    path: string;
  } {
  const path =
    resolve(
      process.argv[2]?.trim() ||
        "config/reviewed-team-mappings.json",
    );

  const raw =
    readFileSync(
      path,
      "utf8",
    );

  const parsed: unknown =
    JSON.parse(
      raw,
    );

  return {
    manifest:
      parseManifest(
        parsed,
      ),

    path,
  };
}

async function main() {
  const {
    manifest,
    path,
  } =
    loadManifest();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  console.log(
    "DictazIQ Reviewed Mapping Import",
  );

  console.log(
    `Manifest: ${path}`,
  );

  console.log(
    `Version: ${manifest.version}`,
  );

  console.log(
    `Reviewed: ${manifest.reviewedAt}`,
  );

  console.log(
    `Mappings: ${manifest.mappings.length}`,
  );

  let inserted =
    0;

  let existing =
    0;

  let upgraded =
    0;

  const resolvedCanonical =
    new Set<string>();

  for (
    const entry
    of manifest.mappings
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${entry.provider} ${entry.providerTeamId} | ${entry.providerName}`,
    );

    /*
     * Resolve through the FootballDatabase
     * identity that owns the rating history.
     *
     * This keeps all providers attached to one
     * canonical DictazIQ team.
     */
    const targets =
      await sql`
        SELECT
          mapping.team_id,

          mapping.source_team_id
            AS rating_source_team_id,

          mapping.source_name
            AS rating_source_name,

          team.name
            AS canonical_name,

          team.country,
          team.is_demo

        FROM public.team_source_mappings
          AS mapping

        JOIN public.teams
          AS team
          ON team.id =
            mapping.team_id

        WHERE mapping.source =
          ${RATING_SOURCE}

          AND lower(
            trim(
              mapping.source_name
            )
          ) =
            lower(
              trim(
                ${entry.footballDatabaseName}
              )
            )
      `;

    assert.equal(
      targets.length,
      1,
      `Expected exactly one FootballDatabase identity for ${entry.footballDatabaseName}.`,
    );

    const target =
      targets[0];

    assert.equal(
      target.is_demo,
      false,
      `${entry.footballDatabaseName} points to demo data.`,
    );

    const canonicalKey =
      `${entry.provider}:${String(
        target.team_id,
      )}`;

    if (
      resolvedCanonical.has(
        canonicalKey,
      )
    ) {
      throw new Error(
        `Manifest assigns multiple ${entry.provider} identities to ${target.canonical_name}.`,
      );
    }

    resolvedCanonical.add(
      canonicalKey,
    );

    /*
     * Provider identity must not already point
     * at another canonical team.
     */
    const providerExisting =
      await sql`
        SELECT
          id,
          team_id,
          source_team_id,
          source_name,
          match_method,
          is_verified

        FROM public.team_source_mappings

        WHERE source =
          ${entry.provider}

          AND source_team_id =
            ${entry.providerTeamId}
      `;

    assert.ok(
      providerExisting.length <=
        1,
      `${entry.provider} ${entry.providerTeamId} has duplicate mappings.`,
    );

    /*
     * One canonical first team should not carry
     * another identity for the same provider.
     */
    const canonicalExisting =
      await sql`
        SELECT
          id,
          source_team_id,
          source_name,
          is_verified

        FROM public.team_source_mappings

        WHERE source =
          ${entry.provider}

          AND team_id =
            ${String(
              target.team_id,
            )}::uuid
      `;

    if (
      canonicalExisting.length >
      0
    ) {
      assert.equal(
        canonicalExisting.length,
        1,
        `${target.canonical_name} has multiple ${entry.provider} mappings.`,
      );

      assert.equal(
        String(
          canonicalExisting[0]
            .source_team_id,
        ),
        entry.providerTeamId,
        `${target.canonical_name} is already linked to another ${entry.provider} team ID.`,
      );
    }

    const reviewEvidence = {
      kind:
        "reviewed_provider_mapping",

      reviewed:
        true,

      manifest_version:
        manifest.version,

      reviewed_at:
        manifest.reviewedAt,

      provider:
        entry.provider,

      provider_team_id:
        entry.providerTeamId,

      provider_name:
        entry.providerName,

      football_database_source_team_id:
        target.rating_source_team_id,

      football_database_name:
        target.rating_source_name,

      canonical_name:
        target.canonical_name,

      match_method:
        entry.method,

      reason:
        entry.reason,
    };

    if (
      providerExisting.length ===
      1
    ) {
      const stored =
        providerExisting[0];

      assert.equal(
        String(
          stored.team_id,
        ),
        String(
          target.team_id,
        ),
        `${entry.provider} ${entry.providerTeamId} is mapped to another canonical team.`,
      );

      if (
        stored.is_verified ===
        true
      ) {
        existing +=
          1;

        console.log(
          `EXISTS -> ${target.canonical_name}`,
        );
      } else {
        /*
         * This is the deliberate human-review
         * transition from discovered/unverified
         * identity to verified identity.
         */
        await sql`
          UPDATE public.team_source_mappings

          SET
            is_verified =
              true,

            match_method =
              ${entry.method},

            evidence =
              coalesce(
                evidence,
                '{}'::jsonb
              )
              ||
              ${JSON.stringify(
                reviewEvidence,
              )}::jsonb

          WHERE id =
            ${String(
              stored.id,
            )}::uuid
        `;

        upgraded +=
          1;

        console.log(
          `VERIFIED -> ${target.canonical_name}`,
        );
      }
    } else {
      await sql`
        INSERT INTO public.team_source_mappings (
          team_id,
          source,
          source_team_id,
          source_name,
          source_country,
          source_url,
          match_method,
          is_verified,
          evidence
        )
        VALUES (
          ${String(
            target.team_id,
          )}::uuid,

          ${entry.provider},

          ${entry.providerTeamId},

          ${entry.providerName},

          ${target.country},

          NULL,

          ${entry.method},

          true,

          ${JSON.stringify(
            reviewEvidence,
          )}::jsonb
        )
      `;

      inserted +=
        1;

      console.log(
        `INSERT -> ${target.canonical_name}`,
      );
    }

    /*
     * Final verification:
     *
     * the provider identity must be verified
     * and its canonical team must retain real
     * FootballDatabase rating history.
     */
    const verification =
      await sql`
        SELECT
          mapping.team_id,
          mapping.is_verified,

          team.name
            AS canonical_name,

          count(
            rating.id
          )::int
            AS rating_count

        FROM public.team_source_mappings
          AS mapping

        JOIN public.teams
          AS team
          ON team.id =
            mapping.team_id

        LEFT JOIN public.team_rating_snapshots
          AS rating
          ON rating.team_id =
            mapping.team_id

          AND rating.source =
            ${RATING_SOURCE}

          AND rating.is_demo =
            false

        WHERE mapping.source =
          ${entry.provider}

          AND mapping.source_team_id =
            ${entry.providerTeamId}

        GROUP BY
          mapping.team_id,
          mapping.is_verified,
          team.name
      `;

    assert.equal(
      verification.length,
      1,
      "Mapping verification failed.",
    );

    assert.equal(
      verification[0]
        .is_verified,
      true,
      "Mapping is not verified.",
    );

    assert.ok(
      Number(
        verification[0]
          .rating_count,
      ) > 0,
      `${verification[0].canonical_name} has no real FootballDatabase rating history.`,
    );

    console.log(
      `PASS | rating snapshots=${verification[0].rating_count}`,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "REVIEWED MAPPING SUMMARY",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Inserted: ${inserted}`,
  );

  console.log(
    `Upgraded to verified: ${upgraded}`,
  );

  console.log(
    `Already verified: ${existing}`,
  );

  console.log(
    `Total reviewed: ${manifest.mappings.length}`,
  );

  console.log("");

  console.log(
    "PASS: all reviewed mappings resolve through canonical FootballDatabase identities.",
  );

  console.log(
    "PASS: no provider identity was silently reassigned.",
  );

  console.log(
    "PASS: all reviewed teams retain rating history.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof
      Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
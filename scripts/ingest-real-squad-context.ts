import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  fetchFixtureInjuries,
} from "../src/providers/api-football/client";

import {
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

const SOURCE =
  "api-football";

const MODEL_VERSION =
  "dictaziq-prematch-markets-v0.1";

const CONTEXT_CONTRACT_VERSION =
  "dictaziq-squad-availability-v0.1";

function requestedDate():
  string {
  const value =
    process.argv[2]?.trim() ??
    "2026-09-09";

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  return value;
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  const result =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      result,
    ) ||
    result <= 0
  ) {
    throw new Error(
      `${label} must be a positive integer.`,
    );
  }

  return result;
}

function timestampDate(
  value: unknown,
): Date {
  const result =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(
            value,
          ),
        );

  assert.ok(
    Number.isFinite(
      result.getTime(),
    ),
    "Invalid timestamp.",
  );

  return result;
}

function iso(
  value: unknown,
): string {
  return timestampDate(
    value,
  ).toISOString();
}

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * Only process real fixtures whose current
   * prematch draft still requires result context.
   */
  const fixtures =
  await sql`
    SELECT DISTINCT ON (
      fixture.id
    )
      fixture.id,

      fixture.provider_id,
      fixture.kickoff_at,

      home.id
        AS home_team_id,

      home.name
        AS home_team_name,

      home_api.source_team_id
        AS home_provider_team_id,

      away_team.id
        AS away_team_id,

      away_team.name
        AS away_team_name,

      away_api.source_team_id
        AS away_provider_team_id

    FROM public.fixtures
      AS fixture

    JOIN public.teams
      AS home
      ON home.id =
        fixture.home_team_id

    JOIN public.teams
      AS away_team
      ON away_team.id =
        fixture.away_team_id

    JOIN public.team_source_mappings
      AS home_api
      ON home_api.team_id =
        home.id

      AND home_api.source =
        ${SOURCE}

      AND home_api.is_verified =
        true

    JOIN public.team_source_mappings
      AS away_api
      ON away_api.team_id =
        away_team.id

      AND away_api.source =
        ${SOURCE}

      AND away_api.is_verified =
        true

    JOIN public.predictions
      AS prediction
      ON prediction.fixture_id =
        fixture.id

    JOIN public.model_versions
      AS model
      ON model.id =
        prediction.model_version_id

    WHERE fixture.provider =
      ${SOURCE}

      AND fixture.is_demo =
        false

      AND fixture.status =
        'scheduled'

      AND (
        fixture.kickoff_at
        AT TIME ZONE 'UTC'
      )::date =
        ${date}::date

      AND model.version =
        ${MODEL_VERSION}

      AND prediction.output
        #>> '{result,requiresContext}' =
        'true'

    ORDER BY
      fixture.id,
      prediction.generated_at DESC
  `;

  assert.ok(
    fixtures.length > 0,
    "No context-required fixtures were found.",
  );

  let insertedCount =
    0;

  let existingCount =
    0;

  let noEvidenceCount =
    0;

  console.log(
    `Context-required fixtures: ${fixtures.length}`,
  );

  for (
    const fixture
    of fixtures
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home_team_name} vs ${fixture.away_team_name}`,
    );

    const fixtureId =
      String(
        fixture.id,
      );

    const providerFixtureId =
      positiveInteger(
        fixture.provider_id,
        "Fixture provider ID",
      );

    const kickoffAt =
      iso(
        fixture.kickoff_at,
      );

    console.log(
      `API fixture: ${providerFixtureId}`,
    );

    console.log(
      `Kickoff: ${kickoffAt}`,
    );

    if (
      Date.now() >=
      Date.parse(
        kickoffAt,
      )
    ) {
      console.log(
        "SKIP: fixture kickoff has passed.",
      );

      continue;
    }

    const homeProviderTeamId =
      positiveInteger(
        fixture.home_provider_team_id,
        "Home provider team ID",
      );

    const awayProviderTeamId =
      positiveInteger(
        fixture.away_provider_team_id,
        "Away provider team ID",
      );

    /*
     * fetchFixtureInjuries() must already
     * return the deduplicated provider result.
     */
    const injuries =
      await fetchFixtureInjuries(
        providerFixtureId,
      );

    console.log(
      `Unique injury records: ${injuries.length}`,
    );

    if (
      injuries.length ===
      0
    ) {
      console.log(
        "NO CONTEXT SNAPSHOT: provider returned no usable squad-availability evidence.",
      );

      noEvidenceCount +=
        1;

      continue;
    }

    /*
     * Observation time represents when this
     * exact provider response was actually seen.
     */
    const observedAt =
      new Date()
        .toISOString();

    assert.ok(
      Date.parse(
        observedAt,
      ) <
        Date.parse(
          kickoffAt,
        ),
      "Squad evidence was collected at or after kickoff.",
    );

    const groups =
      new Map<
        number,
        typeof injuries
      >();

    for (
      const injury
      of injuries
    ) {
      if (
        injury.team.id !==
          homeProviderTeamId &&
        injury.team.id !==
          awayProviderTeamId
      ) {
        throw new Error(
          `Unexpected injury team ${injury.team.id} for fixture ${providerFixtureId}.`,
        );
      }

      const current =
        groups.get(
          injury.team.id,
        ) ?? [];

      current.push(
        injury,
      );

      groups.set(
        injury.team.id,
        current,
      );
    }

    for (
      const [
        providerTeamId,
        teamInjuries,
      ]
      of groups
    ) {
      const isHome =
        providerTeamId ===
        homeProviderTeamId;

      const canonicalTeamId =
        isHome
          ? String(
              fixture.home_team_id,
            )
          : String(
              fixture.away_team_id,
            );

      const canonicalTeamName =
        isHome
          ? String(
              fixture.home_team_name,
            )
          : String(
              fixture.away_team_name,
            );

      /*
       * Stable ordering ensures the same provider
       * evidence produces the same SHA even if
       * API response ordering changes.
       */
      const players =
        [...teamInjuries]
          .sort(
            (
              left,
              right,
            ) => {
              const leftId =
                left.player.id ??
                Number.MAX_SAFE_INTEGER;

              const rightId =
                right.player.id ??
                Number.MAX_SAFE_INTEGER;

              if (
                leftId !==
                rightId
              ) {
                return (
                  leftId -
                  rightId
                );
              }

              return left.player.name
                .localeCompare(
                  right.player.name,
                );
            },
          )
          .map(
            (injury) => ({
              playerId:
                injury.player.id,

              playerName:
                injury.player.name,

              type:
                injury.type,

              reason:
                injury.reason,
            }),
          );

      const unavailableCount =
        players.length;

      const description =
        [
          `${canonicalTeamName}:`,
          `${unavailableCount}`,
          "unique player",
          unavailableCount === 1
            ? "absence"
            : "absences",
          "reported by API-Football;",
          "directional impact has not been assessed.",
        ].join(
          " ",
        );

      const sourceEvidenceId =
        [
          "api-football",
          "injuries",
          providerFixtureId,
          providerTeamId,
        ].join(
          ":",
        );

      /*
       * Raw evidence only.
       *
       * Important:
       * absence count does NOT determine which
       * team is favoured.
       */
      const evidence = {
        contractVersion:
          CONTEXT_CONTRACT_VERSION,

        providerFixtureId,

        providerTeam: {
          id:
            providerTeamId,

          name:
            teamInjuries[0]
              .team
              .name,
        },

        canonicalTeam: {
          id:
            canonicalTeamId,

          name:
            canonicalTeamName,

          fixtureSide:
            isHome
              ? "home"
              : "away",
        },

        unavailableCount,

        unavailablePlayers:
          players,

        deduplicated:
          true,

        directionalAssessment:
          null,

        playerImpactAssessed:
          false,

        scoringPolicy:
          "Raw squad-availability evidence only. Player count must not create a home/away context vote.",
      };

      /*
       * observedAt is deliberately outside the
       * content identity.
       *
       * An unchanged provider response remains
       * idempotent. A changed player set produces
       * a new immutable evidence hash.
       */
      const identityPayload = {
        fixtureId,

        kind:
          "squad_availability",

        side:
          "neutral",

        description,

        source:
          SOURCE,

        sourceEvidenceId,

        evidence,
      };

      const evidenceSha256 =
        canonicalSha256(
          identityPayload,
        );

      const inserted =
        await sql`
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
            ${fixtureId}::uuid,

            'squad_availability',

            'neutral',

            ${description},

            ${SOURCE},

            ${sourceEvidenceId},

            ${evidenceSha256},

            false,

            ${observedAt}::timestamptz,

            ${JSON.stringify(
              evidence,
            )}::jsonb
          )

          ON CONFLICT (
            fixture_id,
            evidence_sha256
          )
          DO NOTHING

          RETURNING
            id,
            observed_at,
            captured_at
        `;

      if (
        inserted.length ===
        1
      ) {
        insertedCount +=
          1;

        console.log(
          [
            "CONTEXT INSERTED",
            canonicalTeamName,
            `count=${unavailableCount}`,
            `id=${inserted[0].id}`,
            `sha256=${evidenceSha256}`,
          ].join(
            " | ",
          ),
        );
      } else {
        const existing =
          await sql`
            SELECT
              id,
              observed_at,
              captured_at

            FROM public.context_evidence_snapshots

            WHERE fixture_id =
              ${fixtureId}::uuid

              AND evidence_sha256 =
                ${evidenceSha256}

            LIMIT 1
          `;

        assert.equal(
          existing.length,
          1,
          "Context conflict occurred but existing evidence could not be reloaded.",
        );

        existingCount +=
          1;

        console.log(
          [
            "CONTEXT EXISTING",
            canonicalTeamName,
            `count=${unavailableCount}`,
            `id=${existing[0].id}`,
            `sha256=${evidenceSha256}`,
          ].join(
            " | ",
          ),
        );
      }
    }
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Context inserted: ${insertedCount}`,
  );

  console.log(
    `Context existing: ${existingCount}`,
  );

  console.log(
    `No-evidence fixtures: ${noEvidenceCount}`,
  );

  console.log("");
  console.log(
    "IMPORTANT: all stored squad evidence remains NEUTRAL.",
  );

  console.log(
    "No winner prediction was changed.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
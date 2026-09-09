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
  fetchFixtureLineups,
} from "../src/providers/api-football/client";

const MODEL_VERSION =
  "dictaziq-prematch-markets-v0.1";

function requestedDate():
  string {
  const value =
    process.argv[2]
      ?.trim() ??
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
      "Provider fixture ID is invalid.",
    );
  }

  return result;
}

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  /*
   * Probe only fixtures whose current immutable
   * draft says the match-result market requires
   * contextual resolution.
   */
  const fixtures =
    await sql`
      SELECT DISTINCT ON (
        fixture.id
      )
        fixture.id,
        fixture.provider_id,
        fixture.kickoff_at,

        home.name
          AS home_name,

        away.name
          AS away_name

      FROM public.fixtures
        AS fixture

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away
        ON away.id =
          fixture.away_team_id

      JOIN public.predictions
        AS prediction
        ON prediction.fixture_id =
          fixture.id

      JOIN public.model_versions
        AS model
        ON model.id =
          prediction.model_version_id

      WHERE fixture.provider =
        'api-football'

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
    "No context-required draft fixtures were found.",
  );

  console.log(
    `Context-required fixtures: ${fixtures.length}`,
  );

  for (
    const fixture
    of fixtures
  ) {
    const providerFixtureId =
      positiveInteger(
        fixture.provider_id,
      );

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home_name} vs ${fixture.away_name}`,
    );

    console.log(
      `API fixture: ${providerFixtureId}`,
    );

    /*
     * Confirmed lineups are often unavailable
     * several hours before kickoff.
     *
     * An empty response is evidence of
     * unavailability, NOT permission to infer
     * a lineup.
     */
    const lineups =
      await fetchFixtureLineups(
        providerFixtureId,
      );

    console.log(
      `Lineup teams returned: ${lineups.length}`,
    );

    if (
      lineups.length ===
      0
    ) {
      console.log(
        "CONFIRMED LINEUPS: NOT AVAILABLE",
      );
    } else {
      for (
        const lineup
        of lineups
      ) {
        console.log("");
        console.log(
          `TEAM: ${lineup.team.name}`,
        );

        console.log(
          `Formation: ${lineup.formation ?? "unknown"}`,
        );

        console.log(
          `Starting XI: ${lineup.startXI.length}`,
        );

        for (
          const player
          of lineup.startXI
        ) {
          console.log(
            [
              "  XI",
              player.name,
              player.position ??
                "unknown-pos",
              player.number ??
                "no-number",
            ].join(
              " | ",
            ),
          );
        }

        console.log(
          `Substitutes: ${lineup.substitutes.length}`,
        );
      }
    }

    console.log("");

    const injuries =
      await fetchFixtureInjuries(
        providerFixtureId,
      );

    console.log(
      `Injury records returned: ${injuries.length}`,
    );

    if (
      injuries.length ===
      0
    ) {
      console.log(
        "INJURIES: NONE RETURNED / COVERAGE UNAVAILABLE",
      );
    } else {
      for (
        const injury
        of injuries
      ) {
        console.log(
          [
            injury.team.name,
            injury.player.name,
            injury.type ??
              "unknown-type",
            injury.reason ??
              "no-reason",
          ].join(
            " | ",
          ),
        );
      }
    }
  }

  console.log("");
  console.log(
    "READ-ONLY PROBE COMPLETE.",
  );

  console.log(
    "No context evidence was persisted.",
  );

  console.log(
    "No prediction was changed.",
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
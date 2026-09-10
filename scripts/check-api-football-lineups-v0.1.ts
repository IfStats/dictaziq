import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  fetchFixtureLineups,
} from "../src/providers/api-football/client";

type SqlClient =
  NeonQueryFunction<
    false,
    false
  >;

function requestedDate():
  string {
  const value =
    process.argv
      .slice(2)
      .find(
        (argument) =>
          !argument.startsWith("--"),
      ) ??
    new Date()
      .toISOString()
      .slice(0, 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  return value;
}

function requestedContains():
  string |
  null {
  const argument =
    process.argv.find(
      (value) =>
        value.startsWith(
          "--contains=",
        ),
    );

  if (!argument) {
    return null;
  }

  const value =
    argument
      .slice(
        "--contains=".length,
      )
      .trim()
      .toLowerCase();

  return value || null;
}

function timestamp(
  value:
    unknown,

  label:
    string,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(
          String(value),
        );

  assert.ok(
    Number.isFinite(
      date.getTime(),
    ),
    `${label} is invalid.`,
  );

  return date.toISOString();
}

function positiveInteger(
  value:
    unknown,
):
  number |
  null {
  const result =
    Number(value);

  return (
    Number.isInteger(result) &&
    result > 0
  )
    ? result
    : null;
}

async function databaseNow(
  sql:
    SqlClient,
): Promise<string> {
  const rows =
    await sql`
      SELECT
        clock_timestamp()
          AS now
    `;

  assert.equal(
    rows.length,
    1,
  );

  return timestamp(
    rows[0].now,
    "Database clock",
  );
}

async function main() {
  const sql:
    SqlClient =
    neon(
      getDatabaseUrl(),
    );

  const date =
    requestedDate();

  const contains =
    requestedContains();

  const now =
    await databaseNow(sql);

  console.log(
    "DictazIQ API-Football Lineup Probe",
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    `Database time: ${now}`,
  );

  console.log(
    `Filter: ${contains ?? "NONE"}`,
  );

  const rows =
    await sql`
      SELECT
        fixture.id,
        fixture.provider_id,
        fixture.kickoff_at,
        fixture.status,

        home_team.name
          AS home_team,

        away_team.name
          AS away_team

      FROM public.fixtures
        AS fixture

      JOIN public.teams
        AS home_team
        ON home_team.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      WHERE fixture.provider =
        'api-football'

        AND fixture.is_demo =
          false

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  const fixtures =
    rows.filter(
      (row) => {
        if (!contains) {
          return true;
        }

        const haystack =
          `${String(
            row.home_team,
          )} ${String(
            row.away_team,
          )}`
            .toLowerCase();

        return haystack.includes(
          contains,
        );
      },
    );

  console.log(
    `Matching fixtures: ${fixtures.length}`,
  );

  for (
    const fixture
    of fixtures
  ) {
    const apiFixtureId =
      positiveInteger(
        fixture.provider_id,
      );

    if (
      apiFixtureId === null
    ) {
      continue;
    }

    const kickoffAt =
      timestamp(
        fixture.kickoff_at,
        "Kickoff",
      );

    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home_team} vs ${fixture.away_team}`,
    );

    console.log(
      `API fixture ID: ${apiFixtureId}`,
    );

    console.log(
      `Kickoff: ${kickoffAt}`,
    );

    const beforeFetch =
      await databaseNow(sql);

    let lineups;

    try {
      lineups =
        await fetchFixtureLineups(
          apiFixtureId,
        );
    } catch (error) {
      console.log(
        error instanceof Error
          ? `Lineup fetch failed: ${error.message}`
          : "Lineup fetch failed.",
      );

      continue;
    }

    const fetchedAt =
      await databaseNow(sql);

    const admissiblePrematch =
      Date.parse(fetchedAt) <
      Date.parse(kickoffAt);

    console.log(
      `Fetch started: ${beforeFetch}`,
    );

    console.log(
      `Fetch completed: ${fetchedAt}`,
    );

    console.log(
      `Lineup teams returned: ${lineups.length}`,
    );

    console.log(
      `PRE-MATCH ADMISSIBLE: ${
        admissiblePrematch
          ? "YES"
          : "NO"
      }`,
    );

    if (
      !admissiblePrematch
    ) {
      console.log(
        "NOTE: lineup may be inspected, but MUST NOT be used to create or revise a pre-match prediction.",
      );
    }

    for (
      const lineup
      of lineups
    ) {
      console.log("");
      console.log(
        `TEAM: ${lineup.team.name}`,
      );

      console.log(
        `Formation: ${lineup.formation ?? "N/A"}`,
      );

      console.log(
        `Starting XI (${lineup.startXI.length}):`,
      );

      for (
        const player
        of lineup.startXI
      ) {
        console.log(
          `- ${player.name}${
            player.position
              ? ` (${player.position})`
              : ""
          }`,
        );
      }

      console.log(
        `Substitutes: ${lineup.substitutes.length}`,
      );
    }
  }
}

main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? `Lineup probe failed: ${error.message}`
        : "Lineup probe failed.",
    );

    process.exitCode = 1;
  },
);
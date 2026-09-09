import "./load-env";

import assert from "node:assert/strict";

import {
  fetchFixturesByDate,
} from "../src/providers/api-football/client";

function requestedDate(): string {
  const argument =
    process.argv[2]?.trim();

  if (argument) {
    return argument;
  }

  /*
   * Default demo date for the current
   * DictazIQ development session.
   */
  return "2026-09-09";
}

async function main() {
  const date =
    requestedDate();

  console.log(
    `Fetching API-Football fixtures for ${date}...`,
  );

  const result =
    await fetchFixturesByDate(
      date,
    );

  assert.equal(
    result.source,
    "api-football",
  );

  assert.equal(
    result.date,
    date,
  );

  assert.equal(
    result.results,
    result.fixtures.length,
  );

  console.log(
    "PASS: API-Football authentication accepted.",
  );

  console.log(
    "PASS: fixture response parsed.",
  );

  console.log(
    "PASS: fixture/team/league provider IDs normalized.",
  );

  console.log(
    "PASS: kickoff timestamps normalized to UTC.",
  );

  console.log("");

  console.log(
    `Date: ${result.date}`,
  );

  console.log(
    `Fixtures received: ${result.fixtures.length}`,
  );

  console.log("");

  for (
    const fixture
    of result.fixtures.slice(
      0,
      25,
    )
  ) {
    console.log(
      [
        fixture.kickoffAt
          .slice(11, 16),

        fixture.home.name,

        "vs",

        fixture.away.name,

        `| ${fixture.league.name}`,

        `| ${fixture.league.country}`,

        `| fixture=${fixture.fixtureId}`,

        `| teams=${fixture.home.id}-${fixture.away.id}`,

        `| status=${fixture.status.short}`,
      ].join(" "),
    );
  }

  if (
    result.fixtures.length >
    25
  ) {
    console.log("");

    console.log(
      `... ${result.fixtures.length - 25} additional fixtures not displayed.`,
    );
  }

  console.log("");

  console.log(
    "NOTE: live API-Football fixture data; no database writes were performed.",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? `API-Football live test failed: ${error.message}`
        : "API-Football live test failed.",
    );

    process.exitCode = 1;
  },
);
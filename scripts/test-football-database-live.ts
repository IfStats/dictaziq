import assert from "node:assert/strict";

import {
  fetchFootballDatabaseWorldRanking,
} from "../src/providers/football-database/client";

async function main() {
  const ranking =
    await fetchFootballDatabaseWorldRanking(
      1,
    );

  assert.equal(
    ranking.source,
    "footballdatabase.com",
  );

  assert.equal(
    ranking.page,
    1,
  );

  assert.match(
    ranking.snapshotDate,
    /^\d{4}-\d{2}-\d{2}$/,
  );

  assert.ok(
    ranking.ratings.length >=
      40,
    "Expected a substantial world-ranking page.",
  );

  const first =
    ranking.ratings[0];

  assert.equal(
    first.worldRank,
    1,
  );

  assert.ok(
    first.teamName.length > 0,
  );

  assert.ok(
    first.country.length > 0,
  );

  assert.ok(
    first.rating > 0,
  );

  assert.ok(
    first.sourceTeamId.length >
      0,
  );

  console.log(
    "PASS: FootballDatabase world ranking fetched.",
  );

  console.log(
    "PASS: current ranking snapshot date parsed.",
  );

  console.log(
    "PASS: club IDs, countries, ranks and ratings parsed.",
  );

  console.log("");

  console.log(
    `Snapshot date: ${ranking.snapshotDate}`,
  );

  console.log(
    `Clubs parsed: ${ranking.ratings.length}`,
  );

  console.log("");

  for (
    const club
    of ranking.ratings.slice(
      0,
      10,
    )
  ) {
    console.log(
      `${club.worldRank}. ${club.teamName} (${club.country}) = ${club.rating}`,
    );
  }

  console.log("");

  console.log(
    "NOTE: development-only public-page adapter; production use remains subject to approved data-access terms.",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? `FootballDatabase live test failed: ${error.message}`
        : "FootballDatabase live test failed.",
    );

    process.exitCode = 1;
  },
);
import "./load-env";

import {
  getFixturesByDateCached,
} from "../src/providers/api-football/fixture-cache";

async function main() {
  const date =
    process.argv[2]?.trim();

  if (
    !date
  ) {
    throw new Error(
      "Usage: npx tsx scripts/test-api-football-fixture-cache.ts YYYY-MM-DD",
    );
  }

  console.log(
    "DictazIQ API-Football Fixture Cache Test",
  );

  console.log(
    `Date: ${date}`,
  );

  console.log(
    "Network mode: DISABLED",
  );

  const result =
    await getFixturesByDateCached(
      date,
      {
        cacheOnly:
          true,
      },
    );

  console.log("");
  console.log(
    `Origin: ${result.origin}`,
  );

  console.log(
    `Fixtures available: ${result.page.fixtures.length}`,
  );

  console.log(
    `Snapshot fetched-at: ${result.fetchedAt.toISOString()}`,
  );

  console.log(
    "API-Football calls consumed: 0",
  );

  if (
    result.origin !==
    "cache"
  ) {
    throw new Error(
      "Cache-only test unexpectedly returned a network result.",
    );
  }

  console.log("");
  console.log(
    "PASS: fixture data loaded from Neon without provider access.",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Fixture cache test failed.",
    );

    process.exitCode =
      1;
  },
);
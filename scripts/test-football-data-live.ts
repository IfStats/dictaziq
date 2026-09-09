import "./load-env";

import {
  fetchFinishedTeamMatches,
} from "../src/providers/football-data/client";

async function main() {
  const teamId =
    Number(
      process.argv[2],
    );

  if (
    !Number.isInteger(teamId) ||
    teamId <= 0
  ) {
    throw new Error(
      "Usage: npm run test:football-data-live -- TEAM_ID",
    );
  }

  const matches =
    await fetchFinishedTeamMatches(
      teamId,
     { limit: 5,

     },
    );

  console.log(
    `Finished matches received: ${matches.length}`,
  );

  for (
    const match
    of matches
  ) {
    console.log(
      [
        match.kickoffAt.slice(
          0,
          10,
        ),

        match.home.name,
        `${match.score.home}-${match.score.away}`,
        match.away.name,

        `| ${match.competition.code}`,
      ].join(" "),
    );
  }
}

main().catch(
  (error) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
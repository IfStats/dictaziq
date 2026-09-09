import "./load-env";

import {
  fetchFinishedTeamMatches,
} from "../src/providers/football-data/client";

async function main() {
  const teamId =
    Number(
      process.argv[2],
    );

  const season =
    Number(
      process.argv[3],
    );

  if (
    !Number.isInteger(teamId) ||
    teamId <= 0
  ) {
    throw new Error(
      "TEAM_ID must be a positive integer.",
    );
  }

  if (
    !Number.isInteger(season) ||
    season < 1900
  ) {
    throw new Error(
      "SEASON must be a valid starting year.",
    );
  }

  console.log(
    `Testing team=${teamId} season=${season}...`,
  );

  const matches =
    await fetchFinishedTeamMatches(
      teamId,
      {
        limit: 10,
        season,
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
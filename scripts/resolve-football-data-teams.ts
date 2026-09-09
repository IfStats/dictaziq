import "./load-env";

import assert from "node:assert/strict";

import {
  fetchCompetitionTeams,
} from "../src/providers/football-data/client";

import type {
  FootballDataCompetitionTeam,
} from "../src/providers/football-data/types";

const COMPETITIONS = [
  "PL",
  "SA",
  "PD",
  "PPL",
  "CL",
] as const;

type Target = {
  canonicalName: string;

  aliases: string[];
};

const TARGETS: Target[] = [
  {
    canonicalName:
      "Arsenal",

    aliases: [
      "arsenal",
      "arsenal fc",
    ],
  },

  {
    canonicalName:
      "Chelsea FC",

    aliases: [
      "chelsea",
      "chelsea fc",
    ],
  },

  {
    canonicalName:
      "Liverpool FC",

    aliases: [
      "liverpool",
      "liverpool fc",
    ],
  },

  {
    canonicalName:
      "Leeds United",

    aliases: [
      "leeds",
      "leeds united",
      "leeds united fc",
    ],
  },

  {
    canonicalName:
      "SSC Napoli",

    aliases: [
      "napoli",
      "ssc napoli",
      "ssc napoli spa",
    ],
  },

  {
    canonicalName:
      "Atlético Madrid",

    aliases: [
      "atletico madrid",
      "atletico de madrid",
      "club atletico de madrid",
      "atletico madrid cf",
    ],
  },

  {
    canonicalName:
      "Sporting",

    aliases: [
      "sporting",
      "sporting cp",
      "sporting clube de portugal",
    ],
  },

  {
    canonicalName:
      "Galatasaray",

    aliases: [
      "galatasaray",
      "galatasaray sk",
      "galatasaray spor kulubu",
    ],
  },
];

type Candidate = {
  competition:
    string;

  team:
    FootballDataCompetitionTeam;
};

function normalize(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .trim()
    .replace(
      /\s+/g,
      " ",
    );
}

function matchesTarget(
  target: Target,
  team:
    FootballDataCompetitionTeam,
): boolean {
  const values =
    [
      team.name,
      team.shortName,
    ]
      .filter(
        (
          value,
        ): value is string =>
          value !== null,
      )
      .map(
        normalize,
      );

  const aliases =
    target.aliases.map(
      normalize,
    );

  return values.some(
    (value) =>
      aliases.includes(
        value,
      ),
  );
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds,
      ),
  );
}

async function main() {
  const candidates:
    Candidate[] = [];

  console.log(
    "Resolving football-data.org team IDs...",
  );

  for (
    const competition
    of COMPETITIONS
  ) {
    console.log(
      `Fetching ${competition} teams...`,
    );

    try {
      const teams =
        await fetchCompetitionTeams(
          competition,
        );

      console.log(
        `${competition}: ${teams.length} teams received.`,
      );

      for (
        const team
        of teams
      ) {
        candidates.push({
          competition,
          team,
        });
      }
    } catch (
      error
    ) {
      console.log(
        `${competition}: unavailable`,
      );

      console.log(
        error instanceof Error
          ? error.message
          : error,
      );
    }

    /*
     * Be polite to the free API tier.
     */
    await sleep(
      700,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    "DICTAZIQ TEAM RESOLUTION",
  );

  console.log(
    "========================================",
  );

  let resolved = 0;

  for (
    const target
    of TARGETS
  ) {
    const matches =
      candidates.filter(
        (candidate) =>
          matchesTarget(
            target,
            candidate.team,
          ),
      );

    /*
     * A team may appear in both its domestic
     * competition and the Champions League.
     *
     * Provider ID must remain identical across
     * those competition lists.
     */
    const providerIds =
      [
        ...new Set(
          matches.map(
            (candidate) =>
              candidate.team.id,
          ),
        ),
      ];

    if (
      providerIds.length ===
      0
    ) {
      console.log(
        `UNRESOLVED | ${target.canonicalName}`,
      );

      continue;
    }

    assert.equal(
      providerIds.length,
      1,
      `${target.canonicalName} resolved to conflicting football-data.org IDs.`,
    );

    const providerId =
      providerIds[0];

    const representative =
      matches[0];

    const competitions =
      [
        ...new Set(
          matches.map(
            (candidate) =>
              candidate.competition,
          ),
        ),
      ].join(",");

    resolved +=
      1;

    console.log(
      [
        "RESOLVED",
        target.canonicalName,
        `id=${providerId}`,
        `sourceName=${representative.team.name}`,
        `competitions=${competitions}`,
      ].join(" | "),
    );
  }

  console.log("");
  console.log(
    `Resolved: ${resolved}/${TARGETS.length}`,
  );

  console.log("");

  console.log(
    "NOTE: read-only provider discovery; no database writes performed.",
  );
}

main().catch(
  (error) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
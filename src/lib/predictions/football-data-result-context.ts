import {
  fetchFinishedTeamMatches,
} from "../../providers/football-data/client";

import type {
  FootballDataMatch,
} from "../../providers/football-data/types";

import type {
  FormRecord,
} from "./result-context-v0.2";

const RECENT_SAMPLE = 5;
const VENUE_SAMPLE = 5;
const MIN_VENUE_SAMPLE = 3;
const FETCH_LIMIT = 20;
const REQUEST_GAP_MS = 6_500;

const DAY_MS =
  24 * 60 * 60 * 1000;

export const FOOTBALL_DATA_RESULT_CONTEXT_VERSION =
  "dictaziq-football-data-result-context-v0.1" as const;

export class ResultContextEvidenceUnavailableError
  extends Error {}

export type ResultContextTeamIdentity = {
  canonicalTeamId: string;
  canonicalName: string;
  footballDataTeamId: number;
};

type NormalizedResultMatch = {
  matchId: number;
  kickoffAt: string;

  venueSide:
    | "home"
    | "away";

  goalsFor: number;
  goalsAgainst: number;

  result:
    | "win"
    | "draw"
    | "loss";

  competition: {
    id: number;
    code: string;
    name: string;
  };
};

export type TeamResultContextEvidence = {
  teamId: string;
  teamName: string;

  providerTeamId: number;

  recent: {
    record: FormRecord;
    matches:
      NormalizedResultMatch[];
  };

  venue:
    | {
        record:
          FormRecord;

        matches:
          NormalizedResultMatch[];
      }
    | null;

  /*
   * Whole kickoff-to-kickoff days since
   * the most recent finished match.
   */
  restDays: number;

  lastMatchKickoffAt: string;
};

export type FootballDataResultContextEvidence = {
  version:
    typeof FOOTBALL_DATA_RESULT_CONTEXT_VERSION;

  fixtureId: string;

  kickoffAt: string;
  observedAt: string;

  seasonYear: number;

  home:
    TeamResultContextEvidence;

  away:
    TeamResultContextEvidence;

  source:
    "football-data.org";
};

let previousRequestAt =
  0;

async function throttledFetch(
  teamId: number,
  season: number,
): Promise<FootballDataMatch[]> {
  const now =
    Date.now();

  const elapsed =
    now -
    previousRequestAt;

  if (
    previousRequestAt > 0 &&
    elapsed <
      REQUEST_GAP_MS
  ) {
    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          REQUEST_GAP_MS -
            elapsed,
        ),
    );
  }

  previousRequestAt =
    Date.now();

  return fetchFinishedTeamMatches(
    teamId,
    {
      season,
      limit:
        FETCH_LIMIT,
    },
  );
}

function normalize(
  matches:
    FootballDataMatch[],

  teamId: number,

  cutoffMs: number,
): NormalizedResultMatch[] {
  const output:
    NormalizedResultMatch[] =
      [];

  for (
    const match
    of matches
  ) {
    if (
      match.status !==
      "FINISHED"
    ) {
      continue;
    }

    const matchTime =
      Date.parse(
        match.kickoffAt,
      );

    if (
      !Number.isFinite(
        matchTime,
      ) ||
      matchTime >=
        cutoffMs
    ) {
      continue;
    }

    if (
      match.score.home ===
        null ||
      match.score.away ===
        null
    ) {
      continue;
    }

    let venueSide:
      | "home"
      | "away";

    let goalsFor:
      number;

    let goalsAgainst:
      number;

    if (
      match.home.id ===
      teamId
    ) {
      venueSide =
        "home";

      goalsFor =
        match.score.home;

      goalsAgainst =
        match.score.away;
    } else if (
      match.away.id ===
      teamId
    ) {
      venueSide =
        "away";

      goalsFor =
        match.score.away;

      goalsAgainst =
        match.score.home;
    } else {
      continue;
    }

    const result =
      goalsFor >
      goalsAgainst
        ? "win"
        : goalsFor <
            goalsAgainst
          ? "loss"
          : "draw";

    output.push({
      matchId:
        match.matchId,

      kickoffAt:
        match.kickoffAt,

      venueSide,

      goalsFor,
      goalsAgainst,

      result,

      competition: {
        ...match.competition,
      },
    });
  }

  return output;
}

function dedupeAndSort(
  matches:
    NormalizedResultMatch[],
): NormalizedResultMatch[] {
  const unique =
    new Map<
      number,
      NormalizedResultMatch
    >();

  for (
    const match
    of matches
  ) {
    unique.set(
      match.matchId,
      match,
    );
  }

  return [
    ...unique.values(),
  ].sort(
    (left, right) =>
      Date.parse(
        right.kickoffAt,
      ) -
      Date.parse(
        left.kickoffAt,
      ),
  );
}

function formRecord(
  matches:
    NormalizedResultMatch[],
): FormRecord {
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (
    const match
    of matches
  ) {
    if (
      match.result ===
      "win"
    ) {
      wins += 1;
    } else if (
      match.result ===
      "draw"
    ) {
      draws += 1;
    } else {
      losses += 1;
    }
  }

  return {
    matches:
      matches.length,

    wins,
    draws,
    losses,
  };
}

async function loadTeamEvidence(
  team:
    ResultContextTeamIdentity,

  seasonYear: number,

  cutoffMs: number,

  fixtureKickoffMs: number,

  venueSide:
    | "home"
    | "away",
): Promise<TeamResultContextEvidence> {
  const currentRaw =
    await throttledFetch(
      team.footballDataTeamId,
      seasonYear,
    );

  const current =
    normalize(
      currentRaw,
      team.footballDataTeamId,
      cutoffMs,
    );

  /*
   * Same freshness rule as market evidence:
   * previous-season data may complete a sample,
   * but cannot replace current-season evidence.
   */
  if (
    current.length ===
    0
  ) {
    throw new ResultContextEvidenceUnavailableError(
      `${team.canonicalName} has no current-season finished result context.`,
    );
  }

  const previousRaw =
    await throttledFetch(
      team.footballDataTeamId,
      seasonYear - 1,
    );

  const previous =
    normalize(
      previousRaw,
      team.footballDataTeamId,
      cutoffMs,
    );

  const history =
    dedupeAndSort([
      ...current,
      ...previous,
    ]);

  const recent =
    history.slice(
      0,
      RECENT_SAMPLE,
    );

  if (
    recent.length <
    RECENT_SAMPLE
  ) {
    throw new ResultContextEvidenceUnavailableError(
      `${team.canonicalName} has fewer than ${RECENT_SAMPLE} valid recent matches.`,
    );
  }

  const venueMatches =
    history
      .filter(
        (match) =>
          match.venueSide ===
          venueSide,
      )
      .slice(
        0,
        VENUE_SAMPLE,
      );

  const latest =
    history[0];

  if (!latest) {
    throw new ResultContextEvidenceUnavailableError(
      `${team.canonicalName} has no valid last match.`,
    );
  }

  const latestKickoffMs =
    Date.parse(
      latest.kickoffAt,
    );

  const restDays =
    Math.floor(
      (
        fixtureKickoffMs -
        latestKickoffMs
      ) /
        DAY_MS,
    );

  if (
    restDays < 0
  ) {
    throw new Error(
      "Calculated rest days cannot be negative.",
    );
  }

  return {
    teamId:
      team.canonicalTeamId,

    teamName:
      team.canonicalName,

    providerTeamId:
      team.footballDataTeamId,

    recent: {
      record:
        formRecord(
          recent,
        ),

      matches:
        recent,
    },

    venue:
      venueMatches.length >=
      MIN_VENUE_SAMPLE
        ? {
            record:
              formRecord(
                venueMatches,
              ),

            matches:
              venueMatches,
          }
        : null,

    restDays,

    lastMatchKickoffAt:
      latest.kickoffAt,
  };
}

export async function buildFootballDataResultContext(
  input: {
    fixtureId: string;

    kickoffAt: string;

    seasonYear: number;

    home:
      ResultContextTeamIdentity;

    away:
      ResultContextTeamIdentity;
  },
): Promise<
  FootballDataResultContextEvidence
> {
  const kickoffMs =
    Date.parse(
      input.kickoffAt,
    );

  if (
    !Number.isFinite(
      kickoffMs,
    )
  ) {
    throw new Error(
      "Fixture kickoff is invalid.",
    );
  }

  if (
    Date.now() >=
    kickoffMs
  ) {
    throw new Error(
      "Cannot collect pre-match result context after kickoff.",
    );
  }

  if (
    !Number.isInteger(
      input.seasonYear,
    )
  ) {
    throw new Error(
      "Season year must be an integer.",
    );
  }

  const captureStartedAt =
    new Date()
      .toISOString();

  const cutoffMs =
    Date.parse(
      captureStartedAt,
    );

  const home =
    await loadTeamEvidence(
      input.home,
      input.seasonYear,
      cutoffMs,
      kickoffMs,
      "home",
    );

  const away =
    await loadTeamEvidence(
      input.away,
      input.seasonYear,
      cutoffMs,
      kickoffMs,
      "away",
    );

  const observedAt =
    new Date()
      .toISOString();

  if (
    Date.parse(
      observedAt,
    ) >=
    kickoffMs
  ) {
    throw new Error(
      "Result-context collection completed after kickoff.",
    );
  }

  return {
    version:
      FOOTBALL_DATA_RESULT_CONTEXT_VERSION,

    fixtureId:
      input.fixtureId,

    kickoffAt:
      new Date(
        kickoffMs,
      ).toISOString(),

    observedAt,

    seasonYear:
      input.seasonYear,

    home,
    away,

    source:
      "football-data.org",
  };
}
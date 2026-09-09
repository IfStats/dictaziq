import {
  fetchFinishedTeamMatches,
} from "../../providers/football-data/client";

import type {
  FootballDataMatch,
} from "../../providers/football-data/types";

import {
  MARKET_EVIDENCE_VERSION_V02,
  type MarketEvidenceSnapshotV02,
  type TeamStatWindow,
} from "./market-evidence-v0.2";

const RECENT_SAMPLE =
  5;

const VENUE_SAMPLE =
  5;

const MIN_VENUE_SAMPLE =
  3;

const HISTORY_FETCH_LIMIT =
  20;

/*
 * Free football-data.org access is rate-limited.
 * Keep provider calls deliberately sequential.
 */
const PROVIDER_REQUEST_GAP_MS =
  6_500;

export class MarketEvidenceUnavailableError
  extends Error {}

type TeamIdentity = {
  canonicalTeamId: string;

  canonicalName: string;

  footballDataTeamId: number;
};

export type BuildFootballDataMarketEvidenceInput = {
  fixtureId: string;

  kickoffAt: string;

  /*
   * API-Football/DictazIQ season starting year.
   * Example: 2026 for 2026/27.
   */
  seasonYear: number;

  home: TeamIdentity;

  away: TeamIdentity;
};

type HistoricalMatch = {
  fixture:
    FootballDataMatch;

  teamSide:
    | "home"
    | "away";

  goalsFor:
    number;

  goalsAgainst:
    number;
};

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

let firstProviderRequest =
  true;

async function throttledFetch(
  teamId: number,
  season: number,
): Promise<
  FootballDataMatch[]
> {
  if (
    !firstProviderRequest
  ) {
    await sleep(
      PROVIDER_REQUEST_GAP_MS,
    );
  }

  firstProviderRequest =
    false;

  return fetchFinishedTeamMatches(
    teamId,
    {
      limit:
        HISTORY_FETCH_LIMIT,

      season,
    },
  );
}

function normalizeHistory(
  fixtures:
    FootballDataMatch[],

  teamId: number,

  cutoff:
    number,
): HistoricalMatch[] {
  const normalized:
    HistoricalMatch[] = [];

  for (
    const fixture
    of fixtures
  ) {
    const kickoff =
      Date.parse(
        fixture.kickoffAt,
      );

    if (
      !Number.isFinite(
        kickoff,
      ) ||
      kickoff >= cutoff
    ) {
      continue;
    }

    if (
      fixture.status !==
      "FINISHED"
    ) {
      continue;
    }

    if (
      fixture.score.home ===
        null ||
      fixture.score.away ===
        null
    ) {
      continue;
    }

    if (
      fixture.home.id ===
      teamId
    ) {
      normalized.push({
        fixture,

        teamSide:
          "home",

        goalsFor:
          fixture.score.home,

        goalsAgainst:
          fixture.score.away,
      });

      continue;
    }

    if (
      fixture.away.id ===
      teamId
    ) {
      normalized.push({
        fixture,

        teamSide:
          "away",

        goalsFor:
          fixture.score.away,

        goalsAgainst:
          fixture.score.home,
      });
    }
  }

  return normalized;
}

function deduplicateAndSort(
  matches:
    HistoricalMatch[],
): HistoricalMatch[] {
  const byFixture =
    new Map<
      number,
      HistoricalMatch
    >();

  for (
    const match
    of matches
  ) {
    byFixture.set(
      match.fixture.matchId,
      match,
    );
  }

  return [
    ...byFixture.values(),
  ].sort(
    (a, b) =>
      Date.parse(
        b.fixture.kickoffAt,
      ) -
      Date.parse(
        a.fixture.kickoffAt,
      ),
  );
}

function createWindow(
  matches:
    HistoricalMatch[],

  scope:
    | "recent"
    | "home"
    | "away",

  observedAt:
    string,
): TeamStatWindow {
  if (
    matches.length ===
    0
  ) {
    throw new Error(
      `Cannot create ${scope} window from zero matches.`,
    );
  }

  let goalsFor = 0;
  let goalsAgainst = 0;

  let scoredMatches = 0;
  let concededMatches = 0;

  let cleanSheets = 0;
  let failedToScore = 0;

  let bttsMatches = 0;

  let over15Matches = 0;
  let over25Matches = 0;
  let over35Matches = 0;

  for (
    const match
    of matches
  ) {
    const scored =
      match.goalsFor;

    const conceded =
      match.goalsAgainst;

    const total =
      scored +
      conceded;

    goalsFor +=
      scored;

    goalsAgainst +=
      conceded;

    if (
      scored > 0
    ) {
      scoredMatches +=
        1;
    } else {
      failedToScore +=
        1;
    }

    if (
      conceded > 0
    ) {
      concededMatches +=
        1;
    } else {
      cleanSheets +=
        1;
    }

    if (
      scored > 0 &&
      conceded > 0
    ) {
      bttsMatches +=
        1;
    }

    if (
      total >= 2
    ) {
      over15Matches +=
        1;
    }

    if (
      total >= 3
    ) {
      over25Matches +=
        1;
    }

    if (
      total >= 4
    ) {
      over35Matches +=
        1;
    }
  }

  return {
    scope,

    sourceFixtureIds:
      matches.map(
        (match) =>
          String(
            match.fixture
              .matchId,
          ),
      ),

    matches:
      matches.length,

    goalsFor,
    goalsAgainst,

    scoredMatches,
    concededMatches,

    cleanSheets,
    failedToScore,

    bttsMatches,

    over15Matches,
    over25Matches,
    over35Matches,

    /*
     * Not available from the current
     * football-data.org evidence source.
     */
    xgFor: null,
    xgAgainst: null,

    shotsFor: null,
    shotsAgainst: null,

    shotsOnTargetFor:
      null,

    shotsOnTargetAgainst:
      null,

    source:
      "football-data.org",

    observedAt,
  };
}

async function loadTeamHistory(
  team:
    TeamIdentity,

  seasonYear:
    number,

  cutoff:
    number,
): Promise<
  HistoricalMatch[]
> {
  const currentRaw =
    await throttledFetch(
      team.footballDataTeamId,
      seasonYear,
    );

  const current =
    normalizeHistory(
      currentRaw,
      team.footballDataTeamId,
      cutoff,
    );

  /*
   * Critical freshness guard.
   *
   * We will use the previous season to complete
   * an early-season sample, but there must be at
   * least one valid match in the target season.
   *
   * This deliberately makes Galatasaray NO PICK
   * with the provider coverage currently observed.
   */
  if (
    current.length ===
    0
  ) {
    throw new MarketEvidenceUnavailableError(
      `${team.canonicalName} has no current-season finished matches available from football-data.org.`,
    );
  }

  const previousRaw =
    await throttledFetch(
      team.footballDataTeamId,
      seasonYear - 1,
    );

  const previous =
    normalizeHistory(
      previousRaw,
      team.footballDataTeamId,
      cutoff,
    );

  return deduplicateAndSort([
    ...current,
    ...previous,
  ]);
}

function buildWindows(
  history:
    HistoricalMatch[],

  venueSide:
    | "home"
    | "away",

  observedAt:
    string,
): {
  recent:
    TeamStatWindow;

  venue:
    TeamStatWindow | null;
} {
  const recent =
    history.slice(
      0,
      RECENT_SAMPLE,
    );

  const venue =
    history
      .filter(
        (match) =>
          match.teamSide ===
          venueSide,
      )
      .slice(
        0,
        VENUE_SAMPLE,
      );

  return {
    recent:
      createWindow(
        recent,
        "recent",
        observedAt,
      ),

    venue:
      venue.length >=
        MIN_VENUE_SAMPLE
        ? createWindow(
            venue,
            venueSide,
            observedAt,
          )
        : null,
  };
}

export async function buildFootballDataMarketEvidence(
  input:
    BuildFootballDataMarketEvidenceInput,
): Promise<
  MarketEvidenceSnapshotV02
> {
  if (
    !Number.isInteger(
      input.seasonYear,
    ) ||
    input.seasonYear < 1900
  ) {
    throw new Error(
      "Fixture season year is invalid.",
    );
  }

  const kickoff =
    new Date(
      input.kickoffAt,
    );

  if (
    !Number.isFinite(
      kickoff.getTime(),
    )
  ) {
    throw new Error(
      "Fixture kickoff is invalid.",
    );
  }

  if (
    Date.now() >=
    kickoff.getTime()
  ) {
    throw new Error(
      "Cannot capture pre-match evidence after kickoff.",
    );
  }

  /*
   * Use actual capture time.
   * Never manufacture a historical cutoff.
   */
  const requestStartedAt =
    new Date()
      .toISOString();

  const cutoff =
    Date.parse(
      requestStartedAt,
    );

  const homeHistory =
    await loadTeamHistory(
      input.home,
      input.seasonYear,
      cutoff,
    );

  const awayHistory =
    await loadTeamHistory(
      input.away,
      input.seasonYear,
      cutoff,
    );

  const observedAt =
    new Date()
      .toISOString();

  if (
    Date.parse(
      observedAt,
    ) >=
    kickoff.getTime()
  ) {
    throw new Error(
      "Evidence collection completed after kickoff.",
    );
  }

  const homeWindows =
    buildWindows(
      homeHistory,
      "home",
      observedAt,
    );

  const awayWindows =
    buildWindows(
      awayHistory,
      "away",
      observedAt,
    );

  return {
    evidenceVersion:
      MARKET_EVIDENCE_VERSION_V02,

    fixtureId:
      input.fixtureId,

    cutoffAt:
      observedAt,

    kickoffAt:
      kickoff.toISOString(),

    home: {
      teamId:
        input.home
          .canonicalTeamId,

      teamName:
        input.home
          .canonicalName,

      side:
        "home",

      recent:
        homeWindows.recent,

      venue:
        homeWindows.venue,
    },

    away: {
      teamId:
        input.away
          .canonicalTeamId,

      teamName:
        input.away
          .canonicalName,

      side:
        "away",

      recent:
        awayWindows.recent,

      venue:
        awayWindows.venue,
    },

    verifiedFactors: [],
  };
}
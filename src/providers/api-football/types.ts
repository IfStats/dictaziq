export const API_FOOTBALL_SOURCE =
  "api-football" as const;

export type ApiFootballFixtureStatus = {
  long: string;
  short: string;
  elapsed: number | null;
};

export type ApiFootballTeam = {
  id: number;
  name: string;
  winner: boolean | null;
};

export type NormalizedApiFootballFixture = {
  source: typeof API_FOOTBALL_SOURCE;

  fixtureId: number;

  kickoffAt: string;
  timezone: string;

  status: ApiFootballFixtureStatus;

  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    round: string | null;
  };

  home: ApiFootballTeam;
  away: ApiFootballTeam;

  goals: {
    home: number | null;
    away: number | null;
  };

  venue: {
    id: number | null;
    name: string | null;
    city: string | null;
  };
};

export type ApiFootballFixturePage = {
  source: typeof API_FOOTBALL_SOURCE;
  date: string;
  results: number;
  fixtures: NormalizedApiFootballFixture[];
};
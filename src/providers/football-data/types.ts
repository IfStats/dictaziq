export const FOOTBALL_DATA_SOURCE =
  "football-data.org" as const;

export type FootballDataTeam = {
  id: number;
  name: string;
};

export type FootballDataMatch = {
  source:
    typeof FOOTBALL_DATA_SOURCE;

  matchId: number;

  kickoffAt: string;

  status: string;

  competition: {
    id: number;
    code: string;
    name: string;
  };

  home: FootballDataTeam;
  away: FootballDataTeam;

  score: {
    home: number | null;
    away: number | null;
  };
};

export type FootballDataCompetitionTeam = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
};
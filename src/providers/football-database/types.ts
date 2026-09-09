export const FOOTBALL_DATABASE_SOURCE =
  "footballdatabase.com" as const;

export type FootballDatabaseRating = {
  source: typeof FOOTBALL_DATABASE_SOURCE;

  sourceTeamId: string;
  teamName: string;
  country: string;

  worldRank: number;
  rating: number;

  snapshotDate: string;

  clubUrl: string;
};

export type FootballDatabaseRankingPage = {
  source: typeof FOOTBALL_DATABASE_SOURCE;

  page: number;
  snapshotDate: string;

  ratings: FootballDatabaseRating[];
};
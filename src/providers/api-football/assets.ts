const API_FOOTBALL_TEAM_MEDIA_BASE =
  "https://media.api-sports.io/football/teams";

export function apiFootballTeamLogoUrl(
  teamId: number | string,
): string {
  const value =
    String(
      teamId,
    ).trim();

  if (
    !/^\d+$/.test(
      value,
    )
  ) {
    throw new Error(
      "API-Football team ID must be numeric.",
    );
  }

  return `${API_FOOTBALL_TEAM_MEDIA_BASE}/${value}.png`;
}

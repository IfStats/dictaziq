import {
  parseFootballDatabaseWorldRanking,
} from "./parser";

import type {
  FootballDatabaseRankingPage,
} from "./types";

const BASE_URL =
  "https://footballdatabase.com";

export async function fetchFootballDatabaseWorldRanking(
  page = 1,
): Promise<FootballDatabaseRankingPage> {
  if (
    !Number.isInteger(page) ||
    page < 1
  ) {
    throw new Error(
      "FootballDatabase page must be a positive integer.",
    );
  }

  const url =
    `${BASE_URL}/ranking/world/${page}`;

  const response =
    await fetch(
      url,
      {
        method: "GET",

        headers: {
          Accept:
            "text/html,application/xhtml+xml",

          "Accept-Language":
            "en-US,en;q=0.9",

          /*
           * Transparent identification rather than
           * pretending to be an ordinary browser.
           */
          "User-Agent":
            "DictazIQ/0.1 development-ranking-ingestor",
        },

        signal:
          AbortSignal.timeout(
            15_000,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      `FootballDatabase request failed: HTTP ${response.status}.`,
    );
  }

  const contentType =
    response.headers.get(
      "content-type",
    );

  if (
    contentType &&
    !contentType
      .toLowerCase()
      .includes("text/html")
  ) {
    throw new Error(
      `FootballDatabase returned unexpected content type: ${contentType}.`,
    );
  }

  const html =
    await response.text();

  return parseFootballDatabaseWorldRanking(
    html,
    page,
  );
}
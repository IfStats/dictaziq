import { load } from "cheerio";

import {
  FOOTBALL_DATABASE_SOURCE,
  type FootballDatabaseRankingPage,
  type FootballDatabaseRating,
} from "./types";

const BASE_URL =
  "https://footballdatabase.com";

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function cleanText(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function parseSnapshotDate(
  html: string,
): string {
  const $ = load(html);

  const text =
    cleanText(
      $("body").text(),
    );

  const match =
    /Updated after matches played on\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(
      text,
    );

  if (!match) {
    throw new Error(
      "FootballDatabase ranking update date was not found.",
    );
  }

  const day =
    Number(match[1]);

  const monthName =
    match[2].toLowerCase();

  const month =
    MONTHS[monthName];

  const year =
    Number(match[3]);

  if (
    !month ||
    !Number.isInteger(day) ||
    !Number.isInteger(year)
  ) {
    throw new Error(
      "FootballDatabase returned an invalid ranking date.",
    );
  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(
      "FootballDatabase ranking date is invalid.",
    );
  }

  return date
    .toISOString()
    .slice(0, 10);
}

function sourceTeamIdFromHref(
  href: string,
): string {
  const match =
    /^\/clubs-ranking\/([^/?#]+)/i.exec(
      href,
    );

  if (!match) {
    throw new Error(
      `Unsupported FootballDatabase club URL: ${href}`,
    );
  }

  return decodeURIComponent(
    match[1],
  );
}

export function parseFootballDatabaseWorldRanking(
  html: string,
  page: number,
): FootballDatabaseRankingPage {
  if (
    !Number.isInteger(page) ||
    page < 1
  ) {
    throw new Error(
      "FootballDatabase page must be a positive integer.",
    );
  }

  const $ = load(html);

  const snapshotDate =
    parseSnapshotDate(html);

  /*
   * Locate the ranking table by meaning rather
   * than by a fragile CSS class name.
   */
  const rankingTable =
    $("table")
      .filter((_, element) => {
        const headerText =
          cleanText(
            $(element)
              .find("tr")
              .first()
              .text(),
          ).toLowerCase();

        return (
          headerText.includes(
            "rank",
          ) &&
          headerText.includes(
            "club",
          ) &&
          headerText.includes(
            "points",
          )
        );
      })
      .first();

  if (
    rankingTable.length === 0
  ) {
    throw new Error(
      "FootballDatabase ranking table was not found.",
    );
  }

  const ratings:
    FootballDatabaseRating[] =
      [];

  rankingTable
    .find("tr")
    .each((_, row) => {
      const cells =
        $(row).find("td");

      if (
        cells.length < 3
      ) {
        return;
      }

      const rankText =
        cleanText(
          cells.eq(0).text(),
        );

      const pointsText =
        cleanText(
          cells.eq(2).text(),
        );

      const worldRank =
        Number(rankText);

      const rating =
        Number(pointsText);

      if (
        !Number.isInteger(
          worldRank,
        ) ||
        worldRank <= 0 ||
        !Number.isInteger(
          rating,
        ) ||
        rating < 0
      ) {
        return;
      }

      const teamCell =
        cells.eq(1);

      const clubLink =
        teamCell
          .find(
            'a[href^="/clubs-ranking/"]',
          )
          .first();

      if (
        clubLink.length === 0
      ) {
        throw new Error(
          `FootballDatabase ranking ${worldRank} has no club link.`,
        );
      }

      const teamName =
        cleanText(
          clubLink.text(),
        );

      const clubHref =
        clubLink.attr("href");

      if (
        !teamName ||
        !clubHref
      ) {
        throw new Error(
          `FootballDatabase ranking ${worldRank} has incomplete club data.`,
        );
      }

      /*
       * Country is normally the other linked value
       * in the Club / Country cell.
       */
      const country =
        cleanText(
          teamCell
            .find("a")
            .filter(
              (_, anchor) =>
                $(anchor).attr(
                  "href",
                ) !== clubHref,
            )
            .first()
            .text(),
        );

      if (!country) {
        throw new Error(
          `FootballDatabase ranking ${worldRank} has no country.`,
        );
      }

      const sourceTeamId =
        sourceTeamIdFromHref(
          clubHref,
        );

      const clubUrl =
        new URL(
          clubHref,
          BASE_URL,
        ).toString();

      ratings.push({
        source:
          FOOTBALL_DATABASE_SOURCE,

        sourceTeamId,

        teamName,
        country,

        worldRank,
        rating,

        snapshotDate,

        clubUrl,
      });
    });

  if (
    ratings.length === 0
  ) {
    throw new Error(
      "FootballDatabase ranking page contained no usable ratings.",
    );
  }

  const rankIdentity =
    new Set<number>();

  const teamIdentity =
    new Set<string>();

  for (
    const rating
    of ratings
  ) {
    if (
      rankIdentity.has(
        rating.worldRank,
      )
    ) {
      throw new Error(
        `Duplicate FootballDatabase world rank ${rating.worldRank}.`,
      );
    }

    rankIdentity.add(
      rating.worldRank,
    );

    const identity =
      rating.sourceTeamId
        .toLowerCase();

    if (
      teamIdentity.has(
        identity,
      )
    ) {
      throw new Error(
        `Duplicate FootballDatabase club ${rating.sourceTeamId}.`,
      );
    }

    teamIdentity.add(
      identity,
    );
  }

  return {
    source:
      FOOTBALL_DATABASE_SOURCE,

    page,
    snapshotDate,

    ratings,
  };
}
import type {
  Metadata,
} from "next";

import {
  connection,
} from "next/server";

import Link from "next/link";
import { neon } from "@neondatabase/serverless";

import LocalTime from "@/components/football/LocalTime";

import {
  getDatabaseUrl,
} from "@/lib/env/database";

export const metadata:
  Metadata = {
    title:
      "Live Scores",

    description:
      "Current DictazIQ football fixture and score snapshot.",
  };

type MatchRow =
  Record<string, unknown>;

function value(
  input: unknown,
): string {
  return input === null ||
    input === undefined
    ? ""
    : String(
        input,
      );
}

function timestamp(
  input: unknown,
): string | null {
  if (
    input === null ||
    input === undefined
  ) {
    return null;
  }

  const date =
    input instanceof Date
      ? new Date(
          input.getTime(),
        )
      : new Date(
          String(
            input,
          ),
        );

  return Number.isFinite(
    date.getTime(),
  )
    ? date.toISOString()
    : null;
}

function numberValue(
  input: unknown,
): number | null {
  if (
    typeof input === "number" &&
    Number.isFinite(
      input,
    )
  ) {
    return input;
  }

  if (
    typeof input === "string" &&
    input.trim().length > 0
  ) {
    const parsed =
      Number(
        input,
      );

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : null;
  }

  return null;
}

function statusLabel(
  input: string,
): string {
  switch (
    input
  ) {
    case "live":
      return "Live";

    case "halftime":
      return "HT";

    case "scheduled":
      return "Upcoming";

    case "finished":
      return "Finished";

    case "postponed":
      return "Postponed";

    case "cancelled":
      return "Cancelled";

    case "suspended":
      return "Suspended";

    case "abandoned":
      return "Abandoned";

    case "awarded":
      return "Awarded";

    default:
      return input.length > 0
        ? input
        : "Unknown";
  }
}

async function loadMatches():
Promise<MatchRow[]> {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const rows =
    await sql`
      SELECT
        fixture.id,

        fixture.slug,

        fixture.kickoff_at,

        fixture.status,

        fixture.provider_status,

        fixture.home_score,

        fixture.away_score,

        home.name
          AS home_name,

        away_team.name
          AS away_name,

        competition.name
          AS competition_name,

        competition.country
          AS competition_country

      FROM public.fixtures
        AS fixture

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      JOIN public.seasons
        AS season
        ON season.id =
          fixture.season_id

      JOIN public.competitions
        AS competition
        ON competition.id =
          season.competition_id

      WHERE
        fixture.is_demo =
          false

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
        (
          clock_timestamp()
          AT TIME ZONE 'UTC'
        )::date

      ORDER BY
        CASE
          WHEN fixture.status =
            'live'
            THEN 1

          WHEN fixture.status =
            'halftime'
            THEN 2

          WHEN fixture.status =
            'scheduled'
            THEN 3

          WHEN fixture.status =
            'finished'
            THEN 4

          ELSE 5
        END,

        fixture.kickoff_at,

        fixture.provider_id

      LIMIT 150
    `;

  return rows as
    MatchRow[];
}

export default async function LivePage() {
  await connection();

  let matches:
    MatchRow[];

  try {
    matches =
      await loadMatches();
  } catch (
    error
  ) {
    console.error(
      "DictazIQ live snapshot read failed.",
      error,
    );

    matches = [];
  }

  const liveCount =
    matches.filter(
      (
        match,
      ) => {
        const status =
          value(
            match.status,
          );

        return (
          status ===
            "live" ||
          status ===
            "halftime"
        );
      },
    ).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">
            Match Centre
          </p>

          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Live Scores
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Current persisted provider snapshot. Continuous
            API-Football live polling will be added in the
            next live-data phase.
          </p>
        </div>

        <div className="rounded-full border border-red-900/70 bg-red-950/30 px-4 py-2 text-xs font-black text-red-300">
          {liveCount} live
        </div>
      </div>

      {matches.length ===
      0 ? (
        <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <p className="font-bold">
            No match snapshot available.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {matches.map(
            (
              match,
            ) => {
              const id =
                value(
                  match.id,
                );

              const slug =
                value(
                  match.slug,
                );

              const status =
                value(
                  match.status,
                );

              const kickoffAt =
                timestamp(
                  match.kickoff_at,
                );

              const live =
                status ===
                  "live" ||
                status ===
                  "halftime";

              const homeScore =
                numberValue(
                  match.home_score,
                );

              const awayScore =
                numberValue(
                  match.away_score,
                );

              const homeName =
                value(
                  match.home_name,
                ) ||
                "Home";

              const awayName =
                value(
                  match.away_name,
                ) ||
                "Away";

              const competition =
                value(
                  match.competition_name,
                ) ||
                "Football";

              const country =
                value(
                  match.competition_country,
                );

              return (
                <Link
                  key={
                    id
                  }
                  href={`/football/matches/${slug}`}
                  aria-label={`View ${homeName} vs ${awayName} match intelligence`}
                  className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-blue-500/50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {
                          competition
                        }
                      </p>

                      {country && (
                        <p className="mt-1 text-xs text-slate-600">
                          {
                            country
                          }
                        </p>
                      )}
                    </div>

                    <span
                      className={
                        live
                          ? "rounded-full bg-red-950 px-3 py-1 text-xs font-black uppercase text-red-300"
                          : "rounded-full bg-slate-800 px-3 py-1 text-xs font-bold uppercase text-slate-300"
                      }
                    >
                      {
                        statusLabel(
                          status,
                        )
                      }
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <p className="text-right font-black">
                      {
                        homeName
                      }
                    </p>

                    <div className="min-w-16 text-center text-xl font-black tabular-nums">
                      {homeScore !==
                        null &&
                      awayScore !==
                        null
                        ? `${homeScore} – ${awayScore}`
                        : "VS"}
                    </div>

                    <p className="font-black">
                      {
                        awayName
                      }
                    </p>
                  </div>

                  {kickoffAt !==
                    null && (
                    <div className="mt-4 text-center text-xs text-slate-500">
                      <LocalTime
                        value={
                          kickoffAt
                        }
                      />
                    </div>
                  )}
                </Link>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
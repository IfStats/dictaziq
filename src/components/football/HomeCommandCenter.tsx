import "server-only";

import Link from "next/link";
import { neon } from "@neondatabase/serverless";

import LocalTime from "@/components/football/LocalTime";
import TodayPredictions from "@/components/football/TodayPredictions";

import {
  getDatabaseUrl,
} from "@/lib/env/database";

type Row =
  Record<string, unknown>;

type DashboardData = {
  summary: Row | null;
  live: Row[];
  upcoming: Row[];
  recent: Row[];
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function record(
  value: unknown,
): Record<string, unknown> {
  return isRecord(value)
    ? value
    : {};
}

function text(
  value: unknown,
): string | null {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  )
    ? value.trim()
    : null;
}

function numberValue(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim().length > 0
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function integerValue(
  value: unknown,
): number | null {
  const result =
    numberValue(value);

  return (
    result !== null &&
    Number.isInteger(result)
  )
    ? result
    : null;
}

function timestamp(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const date =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(value),
        );

  return Number.isFinite(
    date.getTime(),
  )
    ? date.toISOString()
    : null;
}

function forecastLabel(
  selection: string | null,
  home: string,
  away: string,
): string {
  switch (selection) {
    case "home":
      return `${home} Win`;

    case "away":
      return `${away} Win`;

    case "draw":
      return "Draw";

    default:
      return "Awaiting forecast";
  }
}

function activeSelection(
  row: Row,
): string | null {
  const revision =
    text(
      row.revision_selection,
    );

  if (revision) {
    return revision;
  }

  const output =
    record(
      row.baseline_output,
    );

  return text(
    output.forecast,
  );
}

function forecastOutcome(
  selection: string | null,
  homeScore: number | null,
  awayScore: number | null,
  regulationConfirmed: boolean,
): "won" | "lost" | null {
  if (
    !selection ||
    homeScore === null ||
    awayScore === null ||
    !regulationConfirmed
  ) {
    return null;
  }

  let actual:
    "home" |
    "draw" |
    "away";

  if (
    homeScore >
    awayScore
  ) {
    actual =
      "home";
  } else if (
    homeScore <
    awayScore
  ) {
    actual =
      "away";
  } else {
    actual =
      "draw";
  }

  return actual ===
    selection
    ? "won"
    : "lost";
}

async function loadDashboard():
Promise<DashboardData> {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const [
    summaryRows,
    liveRows,
    upcomingRows,
    recentRows,
  ] =
    await Promise.all([
      sql`
        SELECT
          COUNT(*)
            AS fixture_count,

          COUNT(*) FILTER (
            WHERE fixture.status
              IN (
                'live',
                'halftime'
              )
          )
            AS live_count,

          COUNT(*) FILTER (
            WHERE fixture.status =
              'scheduled'
          )
            AS upcoming_count,

          COUNT(*) FILTER (
            WHERE fixture.status =
              'finished'
          )
            AS finished_count,

          COUNT(
            baseline.fixture_id
          )
            AS forecast_count

        FROM public.fixtures
          AS fixture

        LEFT JOIN
          public.production_forecast_baselines_v01
            AS baseline
          ON baseline.fixture_id =
            fixture.id

        WHERE
          fixture.is_demo =
            false

          AND fixture.kickoff_at
            IS NOT NULL

          AND (
            fixture.kickoff_at
            AT TIME ZONE 'UTC'
          )::date =
          (
            clock_timestamp()
            AT TIME ZONE 'UTC'
          )::date
      `,

      sql`
        SELECT
          fixture.id
            AS fixture_id,

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
            AS competition_country,

          baseline.route,

          baseline.output
            AS baseline_output,

          revision.selection
            AS revision_selection

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

        LEFT JOIN
          public.production_forecast_baselines_v01
            AS baseline
          ON baseline.fixture_id =
            fixture.id

        LEFT JOIN LATERAL (
          SELECT
            revision_row.selection

          FROM public.forecast_revisions
            AS revision_row

          WHERE
            baseline.baseline_prediction_id
              IS NOT NULL

            AND revision_row.baseline_prediction_id =
              baseline.baseline_prediction_id

            AND revision_row.fixture_id =
              fixture.id

            AND revision_row.is_demo =
              false

            AND revision_row.published_at
              IS NOT NULL

          ORDER BY
            revision_row.revision_number DESC,
            revision_row.published_at DESC,
            revision_row.id DESC

          LIMIT 1
        ) AS revision
          ON true

        WHERE
          fixture.is_demo =
            false

          AND fixture.status
            IN (
              'live',
              'halftime'
            )

        ORDER BY
          fixture.kickoff_at,
          fixture.provider_id

        LIMIT 8
      `,

      sql`
        SELECT
          fixture.id
            AS fixture_id,

          fixture.slug,

          fixture.kickoff_at,

          fixture.status,

          home.name
            AS home_name,

          away_team.name
            AS away_name,

          competition.name
            AS competition_name,

          competition.country
            AS competition_country,

          baseline.route,

          baseline.output
            AS baseline_output,

          revision.selection
            AS revision_selection

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

        LEFT JOIN
          public.production_forecast_baselines_v01
            AS baseline
          ON baseline.fixture_id =
            fixture.id

        LEFT JOIN LATERAL (
          SELECT
            revision_row.selection

          FROM public.forecast_revisions
            AS revision_row

          WHERE
            baseline.baseline_prediction_id
              IS NOT NULL

            AND revision_row.baseline_prediction_id =
              baseline.baseline_prediction_id

            AND revision_row.fixture_id =
              fixture.id

            AND revision_row.is_demo =
              false

            AND revision_row.published_at
              IS NOT NULL

          ORDER BY
            revision_row.revision_number DESC,
            revision_row.published_at DESC,
            revision_row.id DESC

          LIMIT 1
        ) AS revision
          ON true

        WHERE
          fixture.is_demo =
            false

          AND fixture.status =
            'scheduled'

          AND fixture.kickoff_at >
            clock_timestamp()

        ORDER BY
          fixture.kickoff_at,
          fixture.provider_id

        LIMIT 8
      `,

      sql`
        SELECT
          fixture.id
            AS fixture_id,

          fixture.slug,

          fixture.kickoff_at,

          fixture.regulation_home_score,

          fixture.regulation_away_score,

          fixture.regulation_confirmed,

          home.name
            AS home_name,

          away_team.name
            AS away_name,

          competition.name
            AS competition_name,

          baseline.route,

          baseline.output
            AS baseline_output,

          revision.selection
            AS revision_selection

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

        JOIN
          public.production_forecast_baselines_v01
            AS baseline
          ON baseline.fixture_id =
            fixture.id

        LEFT JOIN LATERAL (
          SELECT
            revision_row.selection

          FROM public.forecast_revisions
            AS revision_row

          WHERE
            revision_row.baseline_prediction_id =
              baseline.baseline_prediction_id

            AND revision_row.fixture_id =
              fixture.id

            AND revision_row.is_demo =
              false

            AND revision_row.published_at
              IS NOT NULL

          ORDER BY
            revision_row.revision_number DESC,
            revision_row.published_at DESC,
            revision_row.id DESC

          LIMIT 1
        ) AS revision
          ON true

        WHERE
          fixture.is_demo =
            false

          AND fixture.status =
            'finished'

          AND fixture.regulation_confirmed =
            true

          AND fixture.kickoff_at >=
            clock_timestamp()
            - INTERVAL '7 days'

        ORDER BY
          fixture.kickoff_at DESC,
          fixture.provider_id DESC

        LIMIT 6
      `,
    ]);

  return {
    summary:
      summaryRows[0] as
        Row |
        undefined ??
      null,

    live:
      liveRows as Row[],

    upcoming:
      upcomingRows as Row[],

    recent:
      recentRows as Row[],
  };
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="text-2xl font-black tabular-nums">
        {value}
      </div>

      <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
    </div>
  );
}

export default async function HomeCommandCenter() {
  let dashboard:
    DashboardData;

  try {
    dashboard =
      await loadDashboard();
  } catch (
    error
  ) {
    console.error(
      "DictazIQ homepage dashboard read failed.",
      error,
    );

    dashboard = {
      summary:
        null,

      live:
        [],

      upcoming:
        [],

      recent:
        [],
    };
  }

  const summary =
    dashboard.summary;

  const fixtureCount =
    integerValue(
      summary?.fixture_count,
    ) ??
    0;

  const liveCount =
    integerValue(
      summary?.live_count,
    ) ??
    0;

  const upcomingCount =
    integerValue(
      summary?.upcoming_count,
    ) ??
    0;

  const forecastCount =
    integerValue(
      summary?.forecast_count,
    ) ??
    0;

  return (
    <div className="space-y-12">
      <section className="overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-950/80 via-slate-900 to-slate-950 p-7 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-400">
              Prediction Intelligence + Match Tracking
            </p>

            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              One football command center for forecasts,
              live matches and accountability.
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              DictazIQ combines published pre-match intelligence
              with the current match state while preserving the
              original forecast exactly as it existed before kickoff.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/predictions"
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black hover:bg-blue-500"
              >
                View Predictions
              </Link>

              <Link
                href="/live"
                className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-black text-slate-200 hover:border-blue-500"
              >
                Open Match Centre
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Fixtures Today"
              value={
                fixtureCount
              }
            />

            <StatCard
              label="Published Forecasts"
              value={
                forecastCount
              }
            />

            <StatCard
              label="Live Now"
              value={
                liveCount
              }
            />

            <StatCard
              label="Upcoming"
              value={
                upcomingCount
              }
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">
              Match Centre
            </p>

            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              Live Now
            </h2>
          </div>

          <Link
            href="/live"
            className="text-sm font-black text-blue-400 hover:text-blue-300"
          >
            All matches →
          </Link>
        </div>

        {dashboard.live.length ===
        0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="font-bold">
              No persisted matches are currently marked live.
            </p>

            <p className="mt-2 text-sm text-slate-500">
              This will become near-real-time when the centralized
              API-Football live worker is activated.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard.live.map(
              (
                row,
              ) => {
                const home =
                  text(
                    row.home_name,
                  ) ??
                  "Home";

                const away =
                  text(
                    row.away_name,
                  ) ??
                  "Away";

                const selection =
                  activeSelection(
                    row,
                  );

                const homeScore =
                  integerValue(
                    row.home_score,
                  );

                const awayScore =
                  integerValue(
                    row.away_score,
                  );

                return (
                  <Link
                    key={
                      String(
                        row.fixture_id,
                      )
                    }
                    href={`/football/matches/${String(
                      row.slug,
                    )}`}
                    className="rounded-3xl border border-slate-800 bg-slate-900 p-5 transition hover:border-red-500/40"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                          {
                            text(
                              row.competition_name,
                            ) ??
                            "Football"
                          }
                        </p>
                      </div>

                      <span className="rounded-full bg-red-950 px-3 py-1 text-xs font-black uppercase text-red-300">
                        ●{" "}
                        {row.status ===
                        "halftime"
                          ? "HT"
                          : "Live"}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <p className="text-right font-black">
                        {
                          home
                        }
                      </p>

                      <div className="text-2xl font-black tabular-nums">
                        {homeScore ??
                          0}
                        <span className="mx-2 text-slate-600">
                          –
                        </span>
                        {awayScore ??
                          0}
                      </div>

                      <p className="font-black">
                        {
                          away
                        }
                      </p>
                    </div>

                    <div className="mt-5 rounded-xl bg-slate-950 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Pre-match forecast
                      </p>

                      <p className="mt-1 text-sm font-black text-blue-300">
                        {
                          forecastLabel(
                            selection,
                            home,
                            away,
                          )
                        }
                      </p>
                    </div>
                  </Link>
                );
              },
            )}
          </div>
        )}
      </section>

      <section id="today">
        <TodayPredictions />
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
              Schedule
            </p>

            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              Coming Up
            </h2>
          </div>

          <Link
            href="/live"
            className="text-sm font-black text-blue-400 hover:text-blue-300"
          >
            Full fixture board →
          </Link>
        </div>

        {dashboard.upcoming.length ===
        0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">
            No upcoming persisted fixtures are currently available.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {dashboard.upcoming.map(
              (
                row,
              ) => {
                const home =
                  text(
                    row.home_name,
                  ) ??
                  "Home";

                const away =
                  text(
                    row.away_name,
                  ) ??
                  "Away";

                const kickoffAt =
                  timestamp(
                    row.kickoff_at,
                  );

                const selection =
                  activeSelection(
                    row,
                  );

                return (
                  <Link
                    key={
                      String(
                        row.fixture_id,
                      )
                    }
                    href={`/football/matches/${String(
                      row.slug,
                    )}`}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-blue-500/50"
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {
                            text(
                              row.competition_name,
                            ) ??
                            "Football"
                          }
                        </p>

                        <p className="mt-3 font-black">
                          {home}
                          <span className="mx-2 text-slate-600">
                            vs
                          </span>
                          {away}
                        </p>
                      </div>

                      {kickoffAt && (
                        <div className="shrink-0 text-right text-xs text-slate-500">
                          <LocalTime
                            value={
                              kickoffAt
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 border-t border-slate-800 pt-3 text-xs">
                      {selection ? (
                        <span className="font-bold text-blue-300">
                          DictazIQ:{" "}
                          {
                            forecastLabel(
                              selection,
                              home,
                              away,
                            )
                          }
                        </span>
                      ) : (
                        <span className="text-slate-600">
                          Forecast not published yet
                        </span>
                      )}
                    </div>
                  </Link>
                );
              },
            )}
          </div>
        )}
      </section>

      <section>
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">
            Accountability
          </p>

          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            Recent Forecast Results
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            These are recent authoritative 1X2 forecasts compared
            against confirmed regulation-time results.
          </p>
        </div>

        {dashboard.recent.length ===
        0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">
            No settled recent forecasts are available yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
            {dashboard.recent.map(
              (
                row,
                index,
              ) => {
                const home =
                  text(
                    row.home_name,
                  ) ??
                  "Home";

                const away =
                  text(
                    row.away_name,
                  ) ??
                  "Away";

                const homeScore =
                  integerValue(
                    row.regulation_home_score,
                  );

                const awayScore =
                  integerValue(
                    row.regulation_away_score,
                  );

                const selection =
                  activeSelection(
                    row,
                  );

                const outcome =
                  forecastOutcome(
                    selection,
                    homeScore,
                    awayScore,
                    row.regulation_confirmed ===
                      true,
                  );

                return (
                  <Link
                    key={
                      String(
                        row.fixture_id,
                      )
                    }
                    href={`/football/matches/${String(
                      row.slug,
                    )}`}
                    className={`grid gap-3 p-5 transition hover:bg-slate-800/50 sm:grid-cols-[1fr_auto_auto] sm:items-center ${
                      index >
                      0
                        ? "border-t border-slate-800"
                        : ""
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {
                          text(
                            row.competition_name,
                          ) ??
                          "Football"
                        }
                      </p>

                      <p className="mt-2 font-black">
                        {home}{" "}
                        {homeScore ??
                          "–"}
                        <span className="mx-1 text-slate-600">
                          –
                        </span>
                        {awayScore ??
                          "–"}{" "}
                        {away}
                      </p>
                    </div>

                    <div className="text-sm">
                      <span className="text-slate-500">
                        Forecast:{" "}
                      </span>

                      <span className="font-bold">
                        {
                          forecastLabel(
                            selection,
                            home,
                            away,
                          )
                        }
                      </span>
                    </div>

                    <div>
                      {outcome ===
                      "won" ? (
                        <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs font-black uppercase text-emerald-300">
                          Won
                        </span>
                      ) : outcome ===
                        "lost" ? (
                        <span className="rounded-full bg-red-950 px-3 py-1 text-xs font-black uppercase text-red-300">
                          Lost
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black uppercase text-slate-400">
                          Pending
                        </span>
                      )}
                    </div>
                  </Link>
                );
              },
            )}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
              Special Picks
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Qualification layer comes next
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              DictazIQ will only publish Special Picks after the
              independent markets are ranked by evidence quality and
              model agreement. We are not manufacturing picks from
              incomplete market evidence just to populate this section.
            </p>
          </div>

          <Link
            href="/how-it-works"
            className="inline-flex rounded-xl border border-slate-700 px-5 py-3 text-sm font-black hover:border-blue-500"
          >
            View methodology
          </Link>
        </div>
      </section>
    </div>
  );
}
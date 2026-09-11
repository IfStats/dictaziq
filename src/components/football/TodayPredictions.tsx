import "server-only";

import Link from "next/link";
import { neon } from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "@/lib/env/database";

import LocalTime from "./LocalTime";

type Row =
  Record<string, unknown>;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asRecord(
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

  return null;
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
      ? value
      : new Date(
          String(value),
        );

  return Number.isFinite(
    date.getTime(),
  )
    ? date.toISOString()
    : null;
}

function titleCase(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
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
      return "Forecast unavailable";
  }
}

function routeLabel(
  route: string | null,
): string {
  switch (route) {
    case "mathematical":
      return "Mathematical";

    case "gpt_research":
      return "GPT Research";

    default:
      return "Production";
  }
}

function goalsLabel(
  value: string | null,
): string | null {
  switch (value) {
    case "over_2_5":
    case "over_2_5_support":
      return "Over 2.5";

    case "under_2_5":
    case "under_2_5_support":
      return "Under 2.5";

    case "conflict":
      return "Goals conflict";

    case "neutral":
    case "none":
      return null;

    default:
      return null;
  }
}

function bttsLabel(
  value: string | null,
): string | null {
  switch (value) {
    case "yes":
    case "yes_support":
      return "BTTS — Yes";

    case "no":
    case "no_support":
      return "BTTS — No";

    case "neutral":
    case "none":
      return null;

    default:
      return null;
  }
}

function statusLabel(
  value: string,
): string {
  switch (value) {
    case "scheduled":
      return "Upcoming";

    case "live":
      return "Live";

    case "halftime":
      return "HT";

    case "finished":
      return "Finished";

    case "postponed":
      return "Postponed";

    case "cancelled":
      return "Cancelled";

    case "suspended":
      return "Suspended";

    default:
      return titleCase(
        value,
      );
  }
}

async function loadPredictions():
Promise<Row[]> {
  const sql =
    neon(
      getDatabaseUrl(),
    );

  const rows =
    await sql`
      SELECT
        fixture.id
          AS fixture_id,

        fixture.slug
          AS fixture_slug,

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

        baseline.baseline_prediction_id,

        baseline.model_version,

        baseline.route,

        baseline.route_reason,

        baseline.generated_at,

        baseline.published_at,

        baseline.output
          AS baseline_output,

        revision.id
          AS revision_id,

        revision.revision_number,

        revision.reason
          AS revision_reason,

        revision.selection
          AS revision_selection,

        revision.confidence
          AS revision_confidence,

        revision.evidence_grade
          AS revision_evidence_grade,

        revision.lineup_state,

        revision.published_at
          AS revision_published_at

      FROM public.production_forecast_baselines_v01
        AS baseline

      JOIN public.fixtures
        AS fixture
        ON fixture.id =
          baseline.fixture_id

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

      LEFT JOIN LATERAL (
        SELECT
          revision_row.id,

          revision_row.revision_number,

          revision_row.reason,

          revision_row.selection,

          revision_row.confidence,

          revision_row.evidence_grade,

          revision_row.lineup_state,

          revision_row.published_at

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

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
        (
          clock_timestamp()
          AT TIME ZONE 'UTC'
        )::date

      ORDER BY
        fixture.kickoff_at,
        fixture.provider_id
    `;

  return rows as Row[];
}

export default async function TodayPredictions() {
  let matches:
    Row[];

  try {
    matches =
      await loadPredictions();
  } catch (
    error
  ) {
    console.error(
      "DictazIQ authoritative homepage read failed.",
      error,
    );

    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-3xl font-black">
            Dictaz
            <span className="text-blue-400">
              IQ
            </span>
          </h1>

          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-bold">
              Prediction data temporarily unavailable
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              The production forecast store could not be read.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <div>
            <div className="text-2xl font-black tracking-tight">
              Dictaz
              <span className="text-blue-400">
                IQ
              </span>
            </div>

            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Football Intelligence
            </p>
          </div>

          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
            Production
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <section className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
            DictazIQ Predictions
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Today&apos;s Football Intelligence
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Published pre-match forecasts from the authoritative
            DictazIQ production pipeline.
          </p>
        </section>

        {matches.length === 0 ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <h2 className="font-bold">
              No published forecasts today
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Fixtures will appear here after an authoritative
              DictazIQ baseline has been published before kickoff.
            </p>
          </section>
        ) : (
          <section className="grid gap-5 lg:grid-cols-2">
            {matches.map(
              (
                row,
              ) => {
                const fixtureId =
                  String(
                    row.fixture_id,
                  );

                const slug =
                  String(
                    row.fixture_slug,
                  );

                const homeName =
                  text(
                    row.home_name,
                  ) ??
                  "Home";

                const awayName =
                  text(
                    row.away_name,
                  ) ??
                  "Away";

                const competition =
                  text(
                    row.competition_name,
                  ) ??
                  "Football";

                const country =
                  text(
                    row.competition_country,
                  );

                const kickoffAt =
                  timestamp(
                    row.kickoff_at,
                  );

                const status =
                  text(
                    row.status,
                  ) ??
                  "unknown";

                const baseline =
                  asRecord(
                    row.baseline_output,
                  );

                const marketEvidence =
                  asRecord(
                    baseline.marketEvidence,
                  );

                const goalsEvidence =
                  asRecord(
                    marketEvidence.goals,
                  );

                const bttsEvidence =
                  asRecord(
                    marketEvidence.btts,
                  );

                const baselineForecast =
                  text(
                    baseline.forecast,
                  );

                const baselineConfidence =
                  text(
                    baseline.confidence,
                  );

                const baselineGrade =
                  text(
                    baseline.evidenceGrade,
                  );

                const activeForecast =
                  text(
                    row.revision_selection,
                  ) ??
                  baselineForecast;

                const activeConfidence =
                  text(
                    row.revision_confidence,
                  ) ??
                  baselineConfidence;

                const activeGrade =
                  text(
                    row.revision_evidence_grade,
                  ) ??
                  baselineGrade;

                const ratingGap =
                  numberValue(
                    baseline.ratingGap,
                  );

                const goals =
                  goalsLabel(
                    text(
                      baseline.goalsView,
                    ) ??
                    text(
                      goalsEvidence.signal,
                    ),
                  );

                const btts =
                  bttsLabel(
                    text(
                      baseline.bttsView,
                    ) ??
                    text(
                      bttsEvidence.signal,
                    ),
                  );

                const route =
                  text(
                    row.route,
                  );

                const revisionId =
                  text(
                    row.revision_id,
                  );

                const homeScore =
                  numberValue(
                    row.home_score,
                  );

                const awayScore =
                  numberValue(
                    row.away_score,
                  );

                return (
                  <Link
                    key={
                      fixtureId
                    }
                    href={`/football/matches/${slug}`}
                    aria-label={`View ${homeName} vs ${awayName} match intelligence`}
                    className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    <article className="h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-blue-500/60 group-hover:shadow-xl group-hover:shadow-blue-950/20">
                      <div className="border-b border-slate-800 px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                              {
                                competition
                              }
                            </p>

                            {country && (
                              <p className="mt-1 text-xs text-slate-500">
                                {
                                  country
                                }
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {revisionId && (
                              <span className="rounded-full border border-blue-900 bg-blue-950 px-2 py-1 text-[10px] font-bold uppercase text-blue-300">
                                Updated
                              </span>
                            )}

                            <span
                              className={
                                status ===
                                "live"
                                  ? "rounded-full bg-red-950 px-3 py-1 text-xs font-black uppercase text-red-300"
                                  : "rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase text-slate-300"
                              }
                            >
                              {
                                statusLabel(
                                  status,
                                )
                              }
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          <p className="text-right text-lg font-black">
                            {
                              homeName
                            }
                          </p>

                          {homeScore !==
                            null &&
                          awayScore !==
                            null ? (
                            <div className="text-xl font-black tabular-nums">
                              {
                                homeScore
                              }
                              <span className="mx-1 text-slate-600">
                                –
                              </span>
                              {
                                awayScore
                              }
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-slate-600">
                              VS
                            </span>
                          )}

                          <p className="text-lg font-black">
                            {
                              awayName
                            }
                          </p>
                        </div>

                        <div className="mt-4 text-center text-sm text-slate-400">
                          {kickoffAt ? (
                            <LocalTime
                              value={
                                kickoffAt
                              }
                            />
                          ) : (
                            "Kickoff unavailable"
                          )}
                        </div>
                      </div>

                      <div className="space-y-5 p-5">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-slate-500">
                            DictazIQ Forecast
                          </p>

                          <p className="mt-2 text-xl font-black text-emerald-400">
                            {
                              forecastLabel(
                                activeForecast,
                                homeName,
                                awayName,
                              )
                            }
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-xl bg-slate-950 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">
                              Confidence
                            </p>

                            <p className="mt-2 text-sm font-black">
                              {activeConfidence
                                ? titleCase(
                                    activeConfidence,
                                  )
                                : "—"}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-950 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">
                              Evidence
                            </p>

                            <p className="mt-2 text-sm font-black">
                              {
                                activeGrade ??
                                "—"
                              }
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-950 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">
                              Rating Gap
                            </p>

                            <p className="mt-2 text-sm font-black tabular-nums">
                              {ratingGap ===
                              null
                                ? "—"
                                : ratingGap >
                                    0
                                  ? `+${ratingGap}`
                                  : String(
                                      ratingGap,
                                    )}
                            </p>
                          </div>
                        </div>

                        {(goals ||
                          btts) && (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              Market Intelligence
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {goals && (
                                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">
                                  {
                                    goals
                                  }
                                </span>
                              )}

                              {btts && (
                                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">
                                  {
                                    btts
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-end justify-between gap-4 border-t border-slate-800 pt-4">
                          <div className="text-xs text-slate-500">
                            <div>
                              Route:{" "}
                              {
                                routeLabel(
                                  route,
                                )
                              }
                            </div>

                            <div className="mt-1">
                              Published before kickoff
                            </div>
                          </div>

                          <div className="shrink-0 text-xs font-black text-blue-400 transition group-hover:text-blue-300">
                            Match Intelligence
                            <span className="ml-1 inline-block transition-transform group-hover:translate-x-1">
                              →
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  </Link>
                );
              },
            )}
          </section>
        )}

        <footer className="mt-10 border-t border-slate-800 pt-6 text-xs leading-5 text-slate-500">
          DictazIQ forecasts are experimental and uncertain.
          Market signals are analytical evidence, not calibrated
          probabilities. Published forecasts remain available for
          post-match accountability.
        </footer>
      </main>
    </div>
  );
}
import "server-only";

import Image from "next/image";
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
  return isRecord(
    value,
  )
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
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
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
    .replaceAll(
      "_",
      " ",
    )
    .replaceAll(
      "-",
      " ",
    )
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
  switch (
    selection
  ) {
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
  switch (
    route
  ) {
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
  switch (
    value
  ) {
    case "over_2_5":
    case "over_2_5_support":
      return "Over 2.5";

    case "under_2_5":
    case "under_2_5_support":
      return "Under 2.5";

    case "conflict":
      return "Goals conflict";

    default:
      return null;
  }
}

function bttsLabel(
  value: string | null,
): string | null {
  switch (
    value
  ) {
    case "yes":
    case "yes_support":
      return "BTTS — Yes";

    case "no":
    case "no_support":
      return "BTTS — No";

    default:
      return null;
  }
}

function TeamCrest({
  logoUrl,
  name,
}: {
  logoUrl: string | null;
  name: string;
}) {
  if (!logoUrl) {
    return (
      <div
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-sm font-black text-slate-500"
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-white/95 p-1.5">
      <Image
        src={logoUrl}
        alt={`${name} crest`}
        width={48}
        height={48}
        sizes="48px"
        className="h-full w-full object-contain"
      />
    </div>
  );
}

function statusLabel(
  value: string,
): string {
  switch (
    value
  ) {
    case "scheduled":
      return "Upcoming";

    case "awaiting_update":
      return "Awaiting update";

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

        CASE
          WHEN
            fixture.status = 'scheduled'
            AND fixture.kickoff_at <= clock_timestamp()
          THEN 'awaiting_update'

          ELSE fixture.status::text
        END AS display_status,

        fixture.home_score,
        fixture.away_score,

        home.name
          AS home_name,

        home.logo_url
          AS home_logo_url,

        away_team.name
          AS away_name,

        away_team.logo_url
          AS away_logo_url,

        competition.name
          AS competition_name,

        competition.country
          AS competition_country,

        baseline.model_version,
        baseline.route,

        baseline.output
          AS baseline_output,

        revision.id
          AS revision_id,

        revision.selection
          AS revision_selection,

        revision.confidence
          AS revision_confidence,

        revision.evidence_grade
  AS revision_evidence_grade,

         deepseek.output
         AS deepseek_output

deepseek.output
  AS deepseek_output

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
          revision_row.selection,
          revision_row.confidence,
          revision_row.evidence_grade

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

        LEFT JOIN LATERAL (
  SELECT
    prediction.output

  FROM public.predictions
    AS prediction

  JOIN public.model_versions
    AS model
    ON model.id =
      prediction.model_version_id

  WHERE
    prediction.fixture_id =
      fixture.id

    AND prediction.is_demo =
      false

    AND prediction.published_at
      IS NOT NULL

    AND model.version =
      'dictaziq-deepseek-research-prediction-v0.1'

  ORDER BY
    prediction.published_at DESC,
    prediction.generated_at DESC,
    prediction.id DESC

  LIMIT 1
) AS deepseek
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
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-7">
        <h2 className="text-lg font-black">
          Prediction data temporarily unavailable
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          The authoritative production forecast store could not be read.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
            DictazIQ Predictions
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Today&apos;s Football Intelligence
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Published pre-match forecasts from the authoritative
            DictazIQ production pipeline.
          </p>
        </div>

        <div className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-400">
          {matches.length} published
        </div>
      </div>

      {matches.length ===
      0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="font-bold">
            No published forecasts today
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Fixtures appear here after an authoritative
            DictazIQ baseline has been published before kickoff.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
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

              const homeLogoUrl =
                text(
                  row.home_logo_url,
                );

              const awayLogoUrl =
                text(
                  row.away_logo_url,
                );

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

              const displayStatus =
                text(
                  row.display_status,
                ) ??
                status;

              const baseline =
                asRecord(
                  row.baseline_output,
                );

              const deepseek =
               asRecord(
         row.deepseek_output,
         );

        const deepseekForecast =
           text(
                 deepseek.forecast,
          );

          const deepseekConfidence =
          text(
          deepseek.confidence,
         );

           const deepseekGrade =
             text(
    deepseek.evidenceGrade,
  );

const deepseekGoals =
  goalsLabel(
    text(
      deepseek.goalsView,
    ),
  );

const deepseekBtts =
  bttsLabel(
    text(
      deepseek.bttsView,
    ),
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

              const activeForecast =
                text(
                  row.revision_selection,
                ) ??
                text(
                  baseline.forecast,
                );

              const activeConfidence =
                text(
                  row.revision_confidence,
                ) ??
                text(
                  baseline.confidence,
                );

              const activeGrade =
                text(
                  row.revision_evidence_grade,
                ) ??
                text(
                  baseline.evidenceGrade,
                );

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
                  className="group block rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <article className="h-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-blue-500/50">
                    <div className="border-b border-slate-800 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-blue-400">
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
                            <span className="rounded-full border border-blue-900 bg-blue-950 px-2 py-1 text-[10px] font-black uppercase text-blue-300">
                              Updated
                            </span>
                          )}

                          <span
                            className={
                              displayStatus ===
                                "live" ||
                              displayStatus ===
                                "halftime"
                                ? "rounded-full bg-red-950 px-3 py-1 text-xs font-black uppercase text-red-300"
                                : displayStatus ===
                                    "awaiting_update"
                                  ? "rounded-full bg-amber-950 px-3 py-1 text-xs font-black uppercase text-amber-300"
                                  : "rounded-full bg-slate-800 px-3 py-1 text-xs font-bold uppercase text-slate-300"
                            }
                          >
                            {
                              statusLabel(
                                displayStatus,
                              )
                            }
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="flex min-w-0 flex-col items-end gap-2 text-right">
                          <TeamCrest
                            logoUrl={
                              homeLogoUrl
                            }
                            name={
                              homeName
                            }
                          />

                          <p className="text-lg font-black">
                            {
                              homeName
                            }
                          </p>
                        </div>

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
                          <span className="text-xs font-black text-slate-600">
                            VS
                          </span>
                        )}

                        <div className="flex min-w-0 flex-col items-start gap-2">
                          <TeamCrest
                            logoUrl={
                              awayLogoUrl
                            }
                            name={
                              awayName
                            }
                          />

                          <p className="text-lg font-black">
                            {
                              awayName
                            }
                          </p>
                        </div>
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

                      {deepseekForecast && (
  <div className="rounded-2xl border border-blue-900/60 bg-blue-950/30 p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-black uppercase tracking-wider text-blue-400">
        DeepSeek AI Forecast
      </p>

      {deepseekGrade && (
        <span className="rounded-full border border-blue-900 px-2 py-1 text-[10px] font-black text-blue-300">
          Evidence {deepseekGrade}
        </span>
      )}
    </div>

    <p className="mt-3 text-xl font-black text-blue-300">
      {forecastLabel(
        deepseekForecast,
        homeName,
        awayName,
      )}
    </p>

    <div className="mt-3 flex flex-wrap gap-2">
      {deepseekConfidence && (
        <span className="rounded-full bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300">
          Confidence: {titleCase(
            deepseekConfidence,
          )}
        </span>
      )}

      {deepseekGoals && (
        <span className="rounded-full bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300">
          {deepseekGoals}
        </span>
      )}

      {deepseekBtts && (
        <span className="rounded-full bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300">
          {deepseekBtts}
        </span>
      )}
    </div>

    <p className="mt-3 text-[11px] leading-5 text-slate-500">
      Independent DeepSeek analysis using verified structured pre-match evidence.
    </p>
  </div>
)}

                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-slate-950 p-3">
                          <p className="text-[10px] uppercase text-slate-500">
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
                          <p className="text-[10px] uppercase text-slate-500">
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
                          <p className="text-[10px] uppercase text-slate-500">
                            Rating Gap
                          </p>

                          <p className="mt-2 text-sm font-black">
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
                        <div className="flex flex-wrap gap-2">
                          {goals && (
                            <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300">
                              {
                                goals
                              }
                            </span>
                          )}

                          {btts && (
                            <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300">
                              {
                                btts
                              }
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-end justify-between gap-4 border-t border-slate-800 pt-4">
                        <p className="text-xs text-slate-500">
                          Route:{" "}
                          {
                            routeLabel(
                              route,
                            )
                          }
                        </p>

                        <div className="text-xs font-black text-blue-400">
                          Match Intelligence →
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}
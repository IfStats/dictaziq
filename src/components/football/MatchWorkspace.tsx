import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { neon } from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "@/lib/env/database";

import LocalTime from "./LocalTime";

type Row =
  Record<string, unknown>;

type LoadResult =
  | {
      status: "ready";
      row: Row;
    }
  | {
      status: "missing";
    }
  | {
      status: "unavailable";
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

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return isRecord(value)
    ? value
    : {};
}

function stringValue(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    return null;
  }

  return value.trim();
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
  const parsed =
    numberValue(value);

  return (
    parsed !== null &&
    Number.isInteger(parsed)
  )
    ? parsed
    : null;
}

function timestampValue(
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

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function stringArray(
  value: unknown,
): string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is string =>
        typeof item === "string" &&
        item.trim().length > 0,
    )
    .map(
      (item) =>
        item.trim(),
    );
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
  homeName: string,
  awayName: string,
): string {
  switch (selection) {
    case "home":
      return `${homeName} Win`;

    case "away":
      return `${awayName} Win`;

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
      return "GPT Research Fallback";

    default:
      return "Unrouted";
  }
}

function routeReasonLabel(
  reason: string | null,
): string {
  switch (reason) {
    case "common_rating_pair":
      return "Common FootballDatabase rating pair available";

    case "mathematical_rating_pair_unavailable":
      return "Mathematical rating pair unavailable";

    default:
      return reason
        ? titleCase(reason)
        : "Not recorded";
  }
}

function goalsLabel(
  signal: string | null,
): string {
  switch (signal) {
    case "over_2_5_support":
    case "over_2_5":
      return "Over 2.5 support";

    case "under_2_5_support":
    case "under_2_5":
      return "Under 2.5 support";

    case "conflict":
      return "Conflicting signals";

    case "neutral":
    case "none":
      return "Neutral / unresolved";

    default:
      return "Unavailable";
  }
}

function bttsLabel(
  signal: string | null,
): string {
  switch (signal) {
    case "yes_support":
    case "yes":
      return "BTTS — Yes support";

    case "no_support":
    case "no":
      return "BTTS — No support";

    case "neutral":
    case "none":
      return "Neutral / unresolved";

    default:
      return "Unavailable";
  }
}

function statusLabel(
  status: string,
): string {
  switch (status) {
    case "scheduled":
      return "Upcoming";

    case "live":
      return "Live";

    case "halftime":
      return "Half Time";

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
      return titleCase(status);
  }
}

function confidenceClass(
  value: string | null,
): string {
  switch (value) {
    case "high":
      return "text-emerald-300";

    case "medium":
      return "text-blue-300";

    case "low":
      return "text-amber-300";

    case "very_low":
      return "text-orange-300";

    default:
      return "text-slate-300";
  }
}

async function loadProductionMatch(
  slug: string,
): Promise<LoadResult> {
  try {
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

          fixture.provider,
          fixture.provider_id,

          fixture.kickoff_at,
          fixture.status,
          fixture.provider_status,

          fixture.home_score,
          fixture.away_score,

          fixture.regulation_home_score,
          fixture.regulation_away_score,
          fixture.regulation_confirmed,

          fixture.fetched_at,

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

          baseline.input_cutoff_at,
          baseline.generated_at
            AS baseline_generated_at,

          baseline.published_at
            AS baseline_published_at,

          baseline.output
            AS baseline_output,

          revision.id
            AS revision_id,

          revision.revision_number,
          revision.revision_version,
          revision.reason
            AS revision_reason,

          revision.engine
            AS revision_engine,

          revision.engine_version
            AS revision_engine_version,

          revision.lineup_state,

          revision.selection
            AS revision_selection,

          revision.confidence
            AS revision_confidence,

          revision.evidence_grade
            AS revision_evidence_grade,

          revision.material_changes,

          revision.generated_at
            AS revision_generated_at,

          revision.published_at
            AS revision_published_at,

          revision.output
            AS revision_output

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
            revision_row.id,
            revision_row.revision_number,
            revision_row.revision_version,
            revision_row.reason,
            revision_row.engine,
            revision_row.engine_version,
            revision_row.lineup_state,
            revision_row.selection,
            revision_row.confidence,
            revision_row.evidence_grade,
            revision_row.material_changes,
            revision_row.generated_at,
            revision_row.published_at,
            revision_row.output

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
          fixture.slug =
            ${slug}

          AND fixture.is_demo =
            false

          AND home.is_demo =
            false

          AND away_team.is_demo =
            false

          AND competition.is_demo =
            false

        LIMIT 1
      `;

    if (
      rows.length ===
      0
    ) {
      return {
        status:
          "missing",
      };
    }

    return {
      status:
        "ready",

      row:
        rows[0] as Row,
    };
  } catch (
    error
  ) {
    console.error(
      "DictazIQ production match read failed.",
      error,
    );

    return {
      status:
        "unavailable",
    };
  }
}

export default async function MatchWorkspace({
  slug,
}: {
  slug?: string;
}) {
  if (
    !slug ||
    slug.trim().length === 0
  ) {
    notFound();
  }

  const result =
    await loadProductionMatch(
      slug.trim(),
    );

  if (
    result.status ===
    "missing"
  ) {
    notFound();
  }

  if (
    result.status ===
    "unavailable"
  ) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <Link
            href="/"
            className="text-2xl font-black tracking-tight"
          >
            Dictaz
            <span className="text-blue-400">
              IQ
            </span>
          </Link>

          <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-7">
            <h1 className="text-xl font-bold">
              Match intelligence temporarily unavailable
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              DictazIQ could not read the production match record.
              The stored prediction has not been modified.
            </p>

            <Link
              href="/"
              className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold hover:bg-blue-500"
            >
              Return home
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const row =
    result.row;

  const homeName =
    stringValue(
      row.home_name,
    ) ??
    "Home";

  const awayName =
    stringValue(
      row.away_name,
    ) ??
    "Away";

  const competition =
    stringValue(
      row.competition_name,
    ) ??
    "Football";

  const country =
    stringValue(
      row.competition_country,
    );

  const status =
    stringValue(
      row.status,
    ) ??
    "unknown";

  const providerStatus =
    stringValue(
      row.provider_status,
    );

  const kickoffAt =
    timestampValue(
      row.kickoff_at,
    );

  const fetchedAt =
    timestampValue(
      row.fetched_at,
    );

  const baselinePublishedAt =
    timestampValue(
      row.baseline_published_at,
    );

  const baselineGeneratedAt =
    timestampValue(
      row.baseline_generated_at,
    );

  const inputCutoffAt =
    timestampValue(
      row.input_cutoff_at,
    );

  const revisionPublishedAt =
    timestampValue(
      row.revision_published_at,
    );

  const revisionGeneratedAt =
    timestampValue(
      row.revision_generated_at,
    );

  const route =
    stringValue(
      row.route,
    );

  const routeReason =
    stringValue(
      row.route_reason,
    );

  const modelVersion =
    stringValue(
      row.model_version,
    );

  const baselineOutput =
    asRecord(
      row.baseline_output,
    );

  const marketEvidence =
    asRecord(
      baselineOutput.marketEvidence,
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
    stringValue(
      baselineOutput.forecast,
    );

  const baselineConfidence =
    stringValue(
      baselineOutput.confidence,
    );

  const baselineEvidenceGrade =
    stringValue(
      baselineOutput.evidenceGrade,
    );

  const revisionSelection =
    stringValue(
      row.revision_selection,
    );

  const revisionConfidence =
    stringValue(
      row.revision_confidence,
    );

  const revisionEvidenceGrade =
    stringValue(
      row.revision_evidence_grade,
    );

  const activeForecast =
    revisionSelection ??
    baselineForecast;

  const activeConfidence =
    revisionConfidence ??
    baselineConfidence;

  const activeEvidenceGrade =
    revisionEvidenceGrade ??
    baselineEvidenceGrade;

  const ratingGap =
    numberValue(
      baselineOutput.ratingGap,
    );

  const matchProfile =
    stringValue(
      baselineOutput.matchProfile,
    );

  const scoringArchetype =
    stringValue(
      baselineOutput.scoringArchetype,
    );

  const coverage =
    stringValue(
      baselineOutput.coverage,
    );

  const goalsSignal =
    stringValue(
      baselineOutput.goalsView,
    ) ??
    stringValue(
      goalsEvidence.signal,
    );

  const bttsSignal =
    stringValue(
      baselineOutput.bttsView,
    ) ??
    stringValue(
      bttsEvidence.signal,
    );

  const reasoningSummary =
    stringArray(
      baselineOutput.reasoningSummary,
    );

  const materialFactors =
    stringArray(
      baselineOutput.materialFactors,
    );

  const contradictions =
    stringArray(
      baselineOutput.contradictions,
    );

  const missingInformation =
    stringArray(
      baselineOutput.missingInformation,
    );

  const mathematicalReason =
    stringValue(
      baselineOutput.reason,
    );

  const revisionId =
    stringValue(
      row.revision_id,
    );

  const revisionNumber =
    integerValue(
      row.revision_number,
    );

  const revisionReason =
    stringValue(
      row.revision_reason,
    );

  const revisionEngine =
    stringValue(
      row.revision_engine,
    );

  const lineupState =
    stringValue(
      row.lineup_state,
    );

  const materialChanges =
    stringArray(
      row.material_changes,
    );

  const homeScore =
    integerValue(
      row.home_score,
    );

  const awayScore =
    integerValue(
      row.away_score,
    );

  const regulationHomeScore =
    integerValue(
      row.regulation_home_score,
    );

  const regulationAwayScore =
    integerValue(
      row.regulation_away_score,
    );

  const regulationConfirmed =
    row.regulation_confirmed ===
    true;

  const hasDisplayScore =
    homeScore !== null &&
    awayScore !== null;

  const hasBaseline =
    stringValue(
      row.baseline_prediction_id,
    ) !==
    null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <Link
            href="/"
            className="text-2xl font-black tracking-tight"
          >
            Dictaz
            <span className="text-blue-400">
              IQ
            </span>
          </Link>

          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
              Match Intelligence
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Production
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white"
        >
          <span>
            ←
          </span>

          Today&apos;s predictions
        </Link>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-5 py-5 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-blue-400">
                  {competition}
                </p>

                {country && (
                  <p className="mt-1 text-xs text-slate-500">
                    {country}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {status ===
                  "live" && (
                  <span className="rounded-full bg-red-950 px-3 py-1 text-xs font-black uppercase text-red-300">
                    ● Live
                  </span>
                )}

                <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold uppercase text-slate-300">
                  {statusLabel(
                    status,
                  )}
                </span>
              </div>
            </div>

            <div className="mt-7 grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
              <div className="sm:text-right">
                <p className="text-xl font-black sm:text-2xl">
                  {homeName}
                </p>
              </div>

              <div className="text-center">
                {hasDisplayScore ? (
                  <div className="text-4xl font-black tabular-nums">
                    {homeScore}
                    <span className="mx-2 text-slate-600">
                      –
                    </span>
                    {awayScore}
                  </div>
                ) : (
                  <div className="text-lg font-black text-slate-500">
                    VS
                  </div>
                )}
              </div>

              <div>
                <p className="text-xl font-black sm:text-2xl">
                  {awayName}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-400">
              {kickoffAt ? (
                <LocalTime
                  value={
                    kickoffAt
                  }
                />
              ) : (
                <span>
                  Kickoff unavailable
                </span>
              )}

              {providerStatus && (
                <span>
                  Provider status:{" "}
                  {providerStatus}
                </span>
              )}
            </div>

            {regulationConfirmed &&
              regulationHomeScore !==
                null &&
              regulationAwayScore !==
                null && (
                <p className="mt-3 text-center text-xs text-slate-500">
                  Regulation score:{" "}
                  {regulationHomeScore}
                  –
                  {regulationAwayScore}
                </p>
              )}
          </div>

          {!hasBaseline ? (
            <div className="p-6 sm:p-7">
              <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-5">
                <h2 className="font-bold text-amber-300">
                  No published DictazIQ forecast yet
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  The fixture exists in production, but no authoritative
                  published pre-match baseline currently routes to it.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-7 p-5 sm:p-7">
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
                      DictazIQ Forecast
                    </p>

                    <h1 className="mt-2 text-2xl font-black sm:text-3xl">
                      {forecastLabel(
                        activeForecast,
                        homeName,
                        awayName,
                      )}
                    </h1>
                  </div>

                  {revisionId && (
                    <span className="rounded-full border border-blue-800 bg-blue-950 px-3 py-1 text-xs font-bold text-blue-300">
                      Updated pre-match
                    </span>
                  )}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Confidence
                    </p>

                    <p
                      className={`mt-2 text-xl font-black ${confidenceClass(
                        activeConfidence,
                      )}`}
                    >
                      {activeConfidence
                        ? titleCase(
                            activeConfidence,
                          )
                        : "Unavailable"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Evidence Grade
                    </p>

                    <p className="mt-2 text-xl font-black text-white">
                      {activeEvidenceGrade ??
                        "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Rating Gap
                    </p>

                    <p className="mt-2 text-xl font-black tabular-nums text-white">
                      {ratingGap !==
                      null
                        ? ratingGap >
                          0
                          ? `+${ratingGap}`
                          : String(
                              ratingGap,
                            )
                        : "Unavailable"}
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <h2 className="font-black">
                    Market Intelligence
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Analytical signals only. They are not calibrated
                    probabilities or automatic betting recommendations.
                  </p>

                  <div className="mt-5 space-y-4">
                    <div className="flex items-center justify-between gap-5 border-b border-slate-800 pb-3">
                      <span className="text-sm text-slate-400">
                        Goals
                      </span>

                      <span className="text-right text-sm font-bold">
                        {goalsLabel(
                          goalsSignal,
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-5 border-b border-slate-800 pb-3">
                      <span className="text-sm text-slate-400">
                        BTTS
                      </span>

                      <span className="text-right text-sm font-bold">
                        {bttsLabel(
                          bttsSignal,
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-5 border-b border-slate-800 pb-3">
                      <span className="text-sm text-slate-400">
                        Match profile
                      </span>

                      <span className="text-right text-sm font-bold">
                        {matchProfile
                          ? titleCase(
                              matchProfile,
                            )
                          : "Unavailable"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-5 border-b border-slate-800 pb-3">
                      <span className="text-sm text-slate-400">
                        Scoring archetype
                      </span>

                      <span className="text-right text-sm font-bold">
                        {scoringArchetype
                          ? titleCase(
                              scoringArchetype,
                            )
                          : "Unavailable"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-5">
                      <span className="text-sm text-slate-400">
                        Coverage
                      </span>

                      <span className="text-right text-sm font-bold">
                        {coverage
                          ? titleCase(
                              coverage,
                            )
                          : "Unavailable"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <h2 className="font-black">
                    Prediction Route
                  </h2>

                  <div className="mt-5 space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Engine
                      </p>

                      <p className="mt-1 font-bold">
                        {routeLabel(
                          route,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Why this route
                      </p>

                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        {routeReasonLabel(
                          routeReason,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Model
                      </p>

                      <p className="mt-1 break-all text-sm font-semibold text-slate-300">
                        {modelVersion ??
                          "Unavailable"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Calibrated probability
                      </p>

                      <p className="mt-1 text-sm font-bold text-slate-300">
                        Not published
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {revisionId && (
                <section className="rounded-2xl border border-blue-900/70 bg-blue-950/20 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
                        Latest Pre-Match Revision
                      </p>

                      <h2 className="mt-2 text-lg font-black">
                        Revision{" "}
                        {revisionNumber ??
                          "—"}
                      </h2>
                    </div>

                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">
                      Lineup:{" "}
                      {lineupState
                        ? titleCase(
                            lineupState,
                          )
                        : "Unavailable"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Reason
                      </p>

                      <p className="mt-1 text-sm font-bold">
                        {revisionReason
                          ? titleCase(
                              revisionReason,
                            )
                          : "Unavailable"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Engine
                      </p>

                      <p className="mt-1 text-sm font-bold">
                        {revisionEngine
                          ? titleCase(
                              revisionEngine,
                            )
                          : "Unavailable"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Published
                      </p>

                      <div className="mt-1 text-sm font-bold">
                        {revisionPublishedAt ? (
                          <LocalTime
                            value={
                              revisionPublishedAt
                            }
                          />
                        ) : (
                          "Unavailable"
                        )}
                      </div>
                    </div>
                  </div>

                  {materialChanges.length >
                    0 && (
                    <div className="mt-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Material changes
                      </p>

                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                        {materialChanges.map(
                          (
                            change,
                            index,
                          ) => (
                            <li
                              key={`${change}-${index}`}
                              className="flex gap-2"
                            >
                              <span className="text-blue-400">
                                •
                              </span>

                              <span>
                                {change}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {(materialFactors.length >
                0 ||
                reasoningSummary.length >
                  0 ||
                mathematicalReason) && (
                <section className="rounded-2xl border border-slate-800 bg-slate-900">
                  <div className="border-b border-slate-800 p-5">
                    <h2 className="font-black">
                      Why DictazIQ sees the match this way
                    </h2>
                  </div>

                  <div className="space-y-6 p-5">
                    {mathematicalReason && (
                      <p className="text-sm leading-7 text-slate-300">
                        {mathematicalReason}
                      </p>
                    )}

                    {reasoningSummary.length >
                      0 && (
                      <div>
                        <h3 className="text-sm font-bold">
                          Research conclusions
                        </h3>

                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                          {reasoningSummary.map(
                            (
                              item,
                              index,
                            ) => (
                              <li
                                key={`${item}-${index}`}
                                className="flex gap-2"
                              >
                                <span className="text-blue-400">
                                  •
                                </span>

                                <span>
                                  {item}
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}

                    {materialFactors.length >
                      0 && (
                      <div>
                        <h3 className="text-sm font-bold">
                          Material factors
                        </h3>

                        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                          {materialFactors.map(
                            (
                              factor,
                              index,
                            ) => (
                              <li
                                key={`${factor}-${index}`}
                                className="rounded-xl bg-slate-950 p-3 text-sm leading-6 text-slate-300"
                              >
                                {factor}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {(contradictions.length >
                0 ||
                missingInformation.length >
                  0) && (
                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                    <h2 className="font-black">
                      Contradictions
                    </h2>

                    {contradictions.length ===
                    0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        None recorded.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                        {contradictions.map(
                          (
                            item,
                            index,
                          ) => (
                            <li
                              key={`${item}-${index}`}
                            >
                              • {item}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                    <h2 className="font-black">
                      Missing Information
                    </h2>

                    {missingInformation.length ===
                    0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        None recorded.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                        {missingInformation.map(
                          (
                            item,
                            index,
                          ) => (
                            <li
                              key={`${item}-${index}`}
                            >
                              • {item}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <h2 className="font-black">
                  Prediction Provenance
                </h2>

                <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Evidence cutoff
                    </p>

                    <div className="mt-2 font-semibold text-slate-300">
                      {inputCutoffAt ? (
                        <LocalTime
                          value={
                            inputCutoffAt
                          }
                        />
                      ) : (
                        "Unavailable"
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Baseline generated
                    </p>

                    <div className="mt-2 font-semibold text-slate-300">
                      {baselineGeneratedAt ? (
                        <LocalTime
                          value={
                            baselineGeneratedAt
                          }
                        />
                      ) : (
                        "Unavailable"
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Baseline published
                    </p>

                    <div className="mt-2 font-semibold text-slate-300">
                      {baselinePublishedAt ? (
                        <LocalTime
                          value={
                            baselinePublishedAt
                          }
                        />
                      ) : (
                        "Unavailable"
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Data refreshed
                    </p>

                    <div className="mt-2 font-semibold text-slate-300">
                      {fetchedAt ? (
                        <LocalTime
                          value={
                            fetchedAt
                          }
                        />
                      ) : (
                        "Unavailable"
                      )}
                    </div>
                  </div>
                </div>

                {revisionGeneratedAt && (
                  <p className="mt-5 border-t border-slate-800 pt-4 text-xs leading-5 text-slate-500">
                    Latest revision generated before kickoff at{" "}
                    <LocalTime
                      value={
                        revisionGeneratedAt
                      }
                    />
                    .
                  </p>
                )}
              </section>
            </div>
          )}
        </section>

        <footer className="pb-8 text-xs leading-5 text-slate-500">
          DictazIQ publishes uncertain football forecasts.
          Analytical support signals are not calibrated probabilities.
          Published baselines and pre-match revisions are retained for
          accountability and post-match settlement.
        </footer>
      </main>
    </div>
  );
}
import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import {
  competitions,
  fixtures,
  modelVersions,
  predictions,
  seasons,
  teams,
} from "@/db/schema";
import LocalTime from "./LocalTime";

const panel =
  "rounded-xl border border-slate-200 bg-white p-5 " +
  "dark:border-slate-800 dark:bg-slate-900";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percent(value: unknown): string {
  const number = numeric(value);

  return number !== null && number >= 0 && number <= 1
    ? `${(number * 100).toFixed(1)}%`
    : "Unavailable";
}

async function loadAnalysis() {
  try {
    const db = getDb();
    const home = alias(teams, "home_team");
    const away = alias(teams, "away_team");

    const [match] = await db
      .select({
        id: fixtures.id,
        slug: fixtures.slug,
        kickoffAt: fixtures.kickoffAt,
        status: fixtures.status,
        fetchedAt: fixtures.fetchedAt,
        homeName: home.name,
        awayName: away.name,
        competition: competitions.name,
      })
      .from(fixtures)
      .innerJoin(home, eq(home.id, fixtures.homeTeamId))
      .innerJoin(away, eq(away.id, fixtures.awayTeamId))
      .innerJoin(seasons, eq(seasons.id, fixtures.seasonId))
      .innerJoin(
        competitions,
        eq(competitions.id, seasons.competitionId),
      )
      .where(
        and(
          eq(fixtures.provider, "demo"),
          eq(fixtures.providerId, "fixture-001"),
          eq(fixtures.isDemo, true),
          eq(competitions.isDemo, true),
          eq(home.isDemo, true),
          eq(away.isDemo, true),
        ),
      )
      .limit(1);

    if (!match) {
      return { status: "missing" as const };
    }

    const [prediction] = await db
      .select({
        id: predictions.id,
        output: predictions.output,
        inputCutoffAt: predictions.inputCutoffAt,
        generatedAt: predictions.generatedAt,
        publishedAt: predictions.publishedAt,
        inputSha256: predictions.inputSha256,
        kickoffAtGeneration: predictions.kickoffAtGeneration,
        version: modelVersions.version,
      })
      .from(predictions)
      .innerJoin(
        modelVersions,
        eq(modelVersions.id, predictions.modelVersionId),
      )
      .where(
        and(
          eq(predictions.fixtureId, match.id),
          eq(predictions.isDemo, true),
        ),
      )
      .orderBy(desc(predictions.generatedAt), desc(predictions.id))
      .limit(1);

    return {
      status: "ready" as const,
      match,
      prediction: prediction ?? null,
    };
  } catch {
    console.error("DictazIQ demo analysis database read failed.");
    return { status: "unavailable" as const };
  }
}

export default async function MatchWorkspace({
  slug,
}: {
  slug?: string;
}) {
  const result = await loadAnalysis();

  if (result.status === "missing" && slug) {
    notFound();
  }

  if (result.status !== "ready") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">DictazIQ</h1>
        <p role="status" className="mt-4">
          {result.status === "missing"
            ? "No demo fixture has been imported yet."
            : "Match data is temporarily unavailable. Please try again shortly."}
        </p>
        <Link className="mt-4 inline-block underline" href="/">
          Return to fixtures
        </Link>
      </main>
    );
  }

  const { match, prediction } = result;
  const matchSlug = `${match.slug}-${match.id}`;

  if (slug && slug !== matchSlug) {
    notFound();
  }

  const output = record(prediction?.output);
  const markets = record(output.markets);
  const outcomes = record(markets["1x2"]);
  const score = record(output.most_likely_score);
  const estimatedGoals = record(output.model_estimated_goals);
  const samples = record(output.sample_sizes);

  const scheduleChanged =
    prediction !== null &&
    match.kickoffAt?.getTime() !==
      prediction.kickoffAtGeneration.getTime();

  const outcomeCards = [
    { key: "home", label: "Home win" },
    { key: "draw", label: "Draw" },
    { key: "away", label: "Away win" },
  ];

  const marketRows = [
    ["Home or draw", "double_chance", "home_or_draw"],
    ["Home or away", "double_chance", "home_or_away"],
    ["Draw or away", "double_chance", "draw_or_away"],
    ["Over 1.5 goals", "goals_1.5", "over"],
    ["Under 1.5 goals", "goals_1.5", "under"],
    ["Over 2.5 goals", "goals_2.5", "over"],
    ["Under 2.5 goals", "goals_2.5", "under"],
    ["Over 3.5 goals", "goals_3.5", "over"],
    ["Under 3.5 goals", "goals_3.5", "under"],
    ["Both teams score — yes", "btts", "yes"],
    ["Both teams score — no", "btts", "no"],
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <Link
            href="/"
            className="text-2xl font-black tracking-tight focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Dictaz<span className="text-blue-600 dark:text-blue-400">IQ</span>
          </Link>
          <span className="text-sm font-medium">Football · Demo workspace</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          Synthetic fixtures and results. Experimental model.
          This workspace can display unpublished demo predictions.
          These records must not enter public performance reports.
        </div>

        <section className={panel}>
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
            {match.competition}
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {match.homeName}
            <span className="mx-2 font-normal text-slate-500">vs</span>
            {match.awayName}
          </h1>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span className="capitalize">{match.status}</span>
            {match.kickoffAt ? (
              <LocalTime value={match.kickoffAt.toISOString()} />
            ) : (
              <span>Kickoff unconfirmed</span>
            )}
            <span>
              {prediction?.publishedAt ? "Published demo" : "Unpublished demo"}
            </span>
          </div>

          {!slug && (
            <Link
              href={`/football/matches/${matchSlug}`}
              className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Open match analysis
            </Link>
          )}
        </section>

        {scheduleChanged && (
          <p role="status" className="rounded-lg border border-amber-400 p-4">
            The schedule changed after generation. This prediction is retained
            for reference and needs a new version before publication.
          </p>
        )}

        {!prediction ? (
          <p role="status" className={panel}>
            No prediction has been generated for this demo fixture.
          </p>
        ) : (
          <>
            <section aria-labelledby="outcomes-title">
              <h2 id="outcomes-title" className="mb-3 text-xl font-bold">
                Full-time probabilities
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {outcomeCards.map(({ key, label }) => {
                  const value = numeric(outcomes[key]);

                  return (
                    <article key={key} className={panel}>
                      <h3 className="font-medium">{label}</h3>
                      <p className="my-3 text-3xl font-bold tabular-nums">
                        {percent(value)}
                      </p>
                      {value !== null && value >= 0 && value <= 1 && (
                        <progress
                          aria-label={`${label} estimated probability`}
                          max={1}
                          value={value}
                          className="h-2 w-full accent-blue-600"
                        />
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className={panel}>
                <h2 className="text-xl font-bold">Goals and scoreline</h2>
                <p className="mt-4 text-3xl font-bold">
                  {numeric(score.home) ?? "—"}–{numeric(score.away) ?? "—"}
                </p>
                <p className="mt-1 text-sm">
                  Most likely score · {percent(score.probability)}
                </p>
                <p className="mt-5">
                  Model-estimated goals:{" "}
                  {numeric(estimatedGoals.home)?.toFixed(2) ?? "Unavailable"}
                  {" home · "}
                  {numeric(estimatedGoals.away)?.toFixed(2) ?? "Unavailable"}
                  {" away"}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  These are scoring-rate estimates, not provider-supplied xG.
                  Even the most likely individual score can have a low probability.
                </p>
              </section>

              <section className={panel}>
                <h2 className="text-xl font-bold">Supporting evidence</h2>
                <dl className="mt-4 space-y-3">
                  {[
                    ["League results", samples.league],
                    ["Home team at home", samples.home_team_at_home],
                    ["Away team away", samples.away_team_away],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-4">
                      <dt>{String(label)}</dt>
                      <dd className="font-semibold">{numeric(value) ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 text-sm text-slate-600 dark:text-slate-400">
                  Injuries, lineups, odds and provider xG are unavailable in
                  this demo. LLM analysis is not connected yet.
                </p>
              </section>
            </div>

            <section className={panel}>
              <h2 className="text-xl font-bold">Related markets</h2>
              <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
                {marketRows.map(([label, market, selection]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 border-b border-slate-200 py-3 dark:border-slate-800"
                  >
                    <dt>{label}</dt>
                    <dd className="shrink-0 font-semibold tabular-nums">
                      {percent(record(markets[market])[selection])}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm">
                Regulation time plus stoppage time. Extra time and penalties
                excluded. Double-chance selections overlap and do not sum to 100%.
              </p>
            </section>

            <section className={panel}>
              <h2 className="text-xl font-bold">Prediction provenance</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="font-semibold">Model</dt>
                  <dd>{prediction.version} · Experimental</dd>
                </div>
                <div>
                  <dt className="font-semibold">Input cutoff</dt>
                  <dd><LocalTime value={prediction.inputCutoffAt.toISOString()} /></dd>
                </div>
                <div>
                  <dt className="font-semibold">Generated</dt>
                  <dd><LocalTime value={prediction.generatedAt.toISOString()} /></dd>
                </div>
                <div>
                  <dt className="font-semibold">Published</dt>
                  <dd>
                    {prediction.publishedAt ? (
                      <LocalTime value={prediction.publishedAt.toISOString()} />
                    ) : "Not published"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Prediction ID</dt>
                  <dd className="break-all font-mono">{prediction.id}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Input fingerprint · SHA-256</dt>
                  <dd className="break-all font-mono">{prediction.inputSha256}</dd>
                </div>
              </dl>
            </section>
          </>
        )}

        <footer className="pb-6 text-sm text-slate-600 dark:text-slate-400">
          DictazIQ provides information. Predictions are uncertain.
          No wagers or betting funds are accepted.
        </footer>
      </main>
    </div>
  );
}
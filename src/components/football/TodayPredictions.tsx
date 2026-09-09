import "server-only";

import {
  desc,
  eq,
  sql,
} from "drizzle-orm";

import {
  alias,
} from "drizzle-orm/pg-core";

import {
  getDb,
} from "@/db";

import {
  competitions,
  fixtures,
  modelVersions,
  predictions,
  seasons,
  teams,
} from "@/db/schema";

import LocalTime from "./LocalTime";

const MODEL_VERSION =
  "dictaziq-prematch-markets-v0.2";

type Recommendation = {
  market: string;
  selection: string;
  status: string;
};

type PredictionOutput = {
  result?: {
    ratingGap?: number;
    ratingSignal?: string;
    selection?: string | null;
    recommended?: boolean;
    requiresContext?: boolean;
    contextStatus?: string;
  };

  qualifiedRecommendations?:
    Recommendation[];
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

function parseOutput(
  value: unknown,
): PredictionOutput {
  if (!isRecord(value)) {
    return {};
  }

  const result =
    isRecord(value.result)
      ? value.result
      : undefined;

  const recommendations =
    Array.isArray(
      value.qualifiedRecommendations,
    )
      ? value.qualifiedRecommendations
          .filter(isRecord)
          .map(
            (
              item,
            ): Recommendation => ({
              market:
                typeof item.market === "string"
                  ? item.market
                  : "",

              selection:
                typeof item.selection === "string"
                  ? item.selection
                  : "",

              status:
                typeof item.status === "string"
                  ? item.status
                  : "",
            }),
          )
          .filter(
            (item) =>
              item.market.length > 0 &&
              item.selection.length > 0 &&
              item.status === "qualified",
          )
      : [];

  return {
    result: result
      ? {
          ratingGap:
            typeof result.ratingGap === "number"
              ? result.ratingGap
              : undefined,

          ratingSignal:
            typeof result.ratingSignal === "string"
              ? result.ratingSignal
              : undefined,

          selection:
            typeof result.selection === "string"
              ? result.selection
              : null,

          recommended:
            result.recommended === true,

          requiresContext:
            result.requiresContext === true,

          contextStatus:
            typeof result.contextStatus === "string"
              ? result.contextStatus
              : undefined,
        }
      : undefined,

    qualifiedRecommendations:
      recommendations,
  };
}

function titleCase(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function marketLabel(
  recommendation:
    Recommendation,
): string {
  const {
    market,
    selection,
  } = recommendation;

  switch (market) {
    case "goals_1.5":
      return `${titleCase(selection)} 1.5 Goals`;

    case "goals_2.5":
      return `${titleCase(selection)} 2.5 Goals`;

    case "goals_3.5":
      return `${titleCase(selection)} 3.5 Goals`;

    case "btts":
      return selection === "yes"
        ? "BTTS — Yes"
        : "BTTS — No";

    default:
      return `${titleCase(
        market,
      )} — ${titleCase(
        selection,
      )}`;
  }
}

function resultLabel(
  output:
    PredictionOutput,
  homeName: string,
  awayName: string,
): string {
  const result =
    output.result;

  if (
    !result ||
    result.recommended !== true ||
    !result.selection
  ) {
    return "NO PICK";
  }

  switch (
    result.selection
  ) {
    case "home":
      return `${homeName} Win`;

    case "away":
      return `${awayName} Win`;

    case "draw":
      return "Draw";

    default:
      return "NO PICK";
  }
}

async function loadPredictions() {
  const db =
    getDb();

  const home =
    alias(
      teams,
      "home_team",
    );

  const away =
    alias(
      teams,
      "away_team",
    );

  return db
    .select({
      fixtureId:
        fixtures.id,

      slug:
        fixtures.slug,

      kickoffAt:
        fixtures.kickoffAt,

      status:
        fixtures.status,

      providerStatus:
        fixtures.providerStatus,

      homeName:
        home.name,

      awayName:
        away.name,

      competition:
        competitions.name,

      predictionId:
        predictions.id,

      generatedAt:
        predictions.generatedAt,

      publishedAt:
        predictions.publishedAt,

      output:
        predictions.output,

      modelVersion:
        modelVersions.version,
    })
    .from(
      predictions,
    )
    .innerJoin(
      fixtures,
      eq(
        fixtures.id,
        predictions.fixtureId,
      ),
    )
    .innerJoin(
      modelVersions,
      eq(
        modelVersions.id,
        predictions.modelVersionId,
      ),
    )
    .innerJoin(
      seasons,
      eq(
        seasons.id,
        fixtures.seasonId,
      ),
    )
    .innerJoin(
      competitions,
      eq(
        competitions.id,
        seasons.competitionId,
      ),
    )
    .innerJoin(
      home,
      eq(
        home.id,
        fixtures.homeTeamId,
      ),
    )
    .innerJoin(
      away,
      eq(
        away.id,
        fixtures.awayTeamId,
      ),
    )
    .where(
      sql`
        ${predictions.isDemo} = false

        AND ${fixtures.isDemo} = false

        AND ${predictions.publishedAt}
          IS NOT NULL

        AND ${modelVersions.version} =
          ${MODEL_VERSION}

        AND (
          ${fixtures.kickoffAt}
          AT TIME ZONE 'UTC'
        )::date =
        (
          clock_timestamp()
          AT TIME ZONE 'UTC'
        )::date
      `,
    )
    .orderBy(
      fixtures.kickoffAt,
      desc(
        predictions.generatedAt,
      ),
    );
}

export default async function TodayPredictions() {
  let rows:
    Awaited<
      ReturnType<
        typeof loadPredictions
      >
    >;

  try {
    rows =
      await loadPredictions();
  } catch (
    error
  ) {
    console.error(
      "DictazIQ homepage prediction read failed.",
      error,
    );

    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-black">
          DictazIQ
        </h1>

        <p className="mt-4 text-slate-600">
          Prediction data is temporarily unavailable.
        </p>
      </main>
    );
  }

  /*
   * Protect against multiple pre-match snapshots
   * for the same fixture.
   *
   * Latest generated published prediction wins
   * for display only. Historical predictions
   * remain untouched in the database.
   */
  const unique =
    new Map<
      string,
      (typeof rows)[number]
    >();

  for (
    const row
    of rows
  ) {
    if (
      !unique.has(
        row.fixtureId,
      )
    ) {
      unique.set(
        row.fixtureId,
        row,
      );
    }
  }

  const matches =
    [...unique.values()];

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

          <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
            Core v1
          </div>
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
            Published pre-match selections from the frozen
            DictazIQ Core v1 model. Only qualified markets
            are presented as recommendations.
          </p>
        </section>

        {matches.length === 0 ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <h2 className="font-bold">
              No published predictions today
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              DictazIQ will display fixtures here when a
              real prediction has been generated and
              published before kickoff.
            </p>
          </section>
        ) : (
          <section className="grid gap-5 lg:grid-cols-2">
            {matches.map(
              (
                row,
              ) => {
                const output =
                  parseOutput(
                    row.output,
                  );

                const result =
                  output.result;

                const recommendations =
                  output
                    .qualifiedRecommendations ??
                  [];

                const prediction =
                  resultLabel(
                    output,
                    row.homeName,
                    row.awayName,
                  );

                return (
                  <article
                    key={
                      row.fixtureId
                    }
                    className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                  >
                    <div className="border-b border-slate-800 px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                            {
                              row.competition
                            }
                          </p>

                          <h2 className="mt-2 text-xl font-bold">
                            {
                              row.homeName
                            }

                            <span className="mx-2 font-normal text-slate-500">
                              vs
                            </span>

                            {
                              row.awayName
                            }
                          </h2>
                        </div>

                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase text-slate-300">
                          {
                            row.status
                          }
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-slate-400">
                        {row.kickoffAt ? (
                          <LocalTime
                            value={
                              row.kickoffAt.toISOString()
                            }
                          />
                        ) : (
                          "Kickoff unavailable"
                        )}
                      </div>
                    </div>

                    <div className="space-y-5 p-5">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-slate-950 p-4">
                          <p className="text-xs uppercase tracking-wider text-slate-500">
                            Rating Gap
                          </p>

                          <p className="mt-2 text-2xl font-black tabular-nums">
                            {typeof result?.ratingGap ===
                            "number"
                              ? result.ratingGap >
                                0
                                ? `+${result.ratingGap}`
                                : String(
                                    result.ratingGap,
                                  )
                              : "—"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-950 p-4">
                          <p className="text-xs uppercase tracking-wider text-slate-500">
                            Result
                          </p>

                          <p
                            className={
                              prediction ===
                              "NO PICK"
                                ? "mt-2 text-lg font-black text-amber-400"
                                : "mt-2 text-lg font-black text-emerald-400"
                            }
                          >
                            {
                              prediction
                            }
                          </p>
                        </div>
                      </div>

                      {result?.requiresContext && (
                        <div className="text-xs text-slate-500">
                          Result context:{" "}
                          {titleCase(
                            result.contextStatus ??
                              "missing",
                          )}
                        </div>
                      )}

                      <div>
                        <h3 className="text-sm font-bold">
                          Qualified Markets
                        </h3>

                        {recommendations.length ===
                        0 ? (
                          <p className="mt-3 text-sm text-slate-500">
                            No qualified market recommendations.
                          </p>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {recommendations.map(
                              (
                                item,
                              ) => (
                                <span
                                  key={`${item.market}:${item.selection}`}
                                  className="rounded-full border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm font-semibold text-emerald-300"
                                >
                                  ✓{" "}
                                  {marketLabel(
                                    item,
                                  )}
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-slate-800 pt-4 text-xs text-slate-500">
                        <div>
                          Model:{" "}
                          {
                            row.modelVersion
                          }
                        </div>

                        <div className="mt-1">
                          Published before kickoff
                        </div>
                      </div>
                    </div>
                  </article>
                );
              },
            )}
          </section>
        )}

        <footer className="mt-10 border-t border-slate-800 pt-6 text-xs leading-5 text-slate-500">
          DictazIQ predictions are experimental and uncertain.
          NO PICK means the evidence did not satisfy the model&apos;s
          selection policy. No calibrated probabilities are currently
          published.
        </footer>
      </main>
    </div>
  );
}
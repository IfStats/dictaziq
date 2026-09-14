import type {
  Metadata,
} from "next";

import Link from "next/link";
import type {
  ReactNode,
} from "react";

import {
  connection,
} from "next/server";

import TodayPredictions, {
  type BttsFilter,
  type GoalsFilter,
  type OutcomeFilter,
} from "@/components/football/TodayPredictions";

export const metadata:
  Metadata = {
    title:
      "Predictions",

    description:
      "Published DictazIQ football predictions and match intelligence.",
  };

type PredictionsPageProps = {
  searchParams:
    Promise<{
      outcome?:
        | string
        | string[];
      goals?:
        | string
        | string[];
      btts?:
        | string
        | string[];
    }>;
};

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string | undefined {
  return Array.isArray(value)
    ? value[0]
    : value;
}

function normalizeOutcome(
  value:
    | string
    | string[]
    | undefined,
): OutcomeFilter {
  const normalized =
    firstParam(value);

  if (
    normalized === "home" ||
    normalized === "draw" ||
    normalized === "away"
  ) {
    return normalized;
  }

  return "all";
}

function normalizeGoals(
  value:
    | string
    | string[]
    | undefined,
): GoalsFilter {
  const normalized =
    firstParam(value);

  if (
    normalized === "over_2_5" ||
    normalized === "under_2_5"
  ) {
    return normalized;
  }

  return "all";
}

function normalizeBtts(
  value:
    | string
    | string[]
    | undefined,
): BttsFilter {
  const normalized =
    firstParam(value);

  if (
    normalized === "yes" ||
    normalized === "no"
  ) {
    return normalized;
  }

  return "all";
}

type FilterState = {
  outcome: OutcomeFilter;
  goals: GoalsFilter;
  btts: BttsFilter;
};

function predictionsHref(
  state: FilterState,
): string {
  const params =
    new URLSearchParams();

  if (
    state.outcome !==
    "all"
  ) {
    params.set(
      "outcome",
      state.outcome,
    );
  }

  if (
    state.goals !==
    "all"
  ) {
    params.set(
      "goals",
      state.goals,
    );
  }

  if (
    state.btts !==
    "all"
  ) {
    params.set(
      "btts",
      state.btts,
    );
  }

  const query =
    params.toString();

  return query
    ? `/predictions?${query}`
    : "/predictions";
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={
        active
          ? "page"
          : undefined
      }
      className={
        active
          ? "rounded-full border border-blue-500 bg-blue-500 px-4 py-2 text-sm font-black text-white"
          : "rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-300 transition hover:border-slate-600 hover:text-white"
      }
    >
      {children}
    </Link>
  );
}

export default async function PredictionsPage({
  searchParams,
}: PredictionsPageProps) {
  await connection();

  const params =
    await searchParams;

  const filters:
    FilterState = {
      outcome:
        normalizeOutcome(
          params.outcome,
        ),

      goals:
        normalizeGoals(
          params.goals,
        ),

      btts:
        normalizeBtts(
          params.btts,
        ),
    };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-7 space-y-5 rounded-3xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5">
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            Predicted outcome
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterLink
              href={predictionsHref({
                ...filters,
                outcome:
                  "all",
              })}
              active={
                filters.outcome ===
                "all"
              }
            >
              All
            </FilterLink>

            <FilterLink
              href={predictionsHref({
                ...filters,
                outcome:
                  "home",
              })}
              active={
                filters.outcome ===
                "home"
              }
            >
              Home Win
            </FilterLink>

            <FilterLink
              href={predictionsHref({
                ...filters,
                outcome:
                  "draw",
              })}
              active={
                filters.outcome ===
                "draw"
              }
            >
              Draw
            </FilterLink>

            <FilterLink
              href={predictionsHref({
                ...filters,
                outcome:
                  "away",
              })}
              active={
                filters.outcome ===
                "away"
              }
            >
              Away Win
            </FilterLink>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            Goals
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterLink
              href={predictionsHref({
                ...filters,
                goals:
                  "all",
              })}
              active={
                filters.goals ===
                "all"
              }
            >
              All
            </FilterLink>

            <FilterLink
              href={predictionsHref({
                ...filters,
                goals:
                  "over_2_5",
              })}
              active={
                filters.goals ===
                "over_2_5"
              }
            >
              Over 2.5
            </FilterLink>

            <FilterLink
              href={predictionsHref({
                ...filters,
                goals:
                  "under_2_5",
              })}
              active={
                filters.goals ===
                "under_2_5"
              }
            >
              Under 2.5
            </FilterLink>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            BTTS
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterLink
              href={predictionsHref({
                ...filters,
                btts:
                  "all",
              })}
              active={
                filters.btts ===
                "all"
              }
            >
              All
            </FilterLink>

            <FilterLink
              href={predictionsHref({
                ...filters,
                btts:
                  "yes",
              })}
              active={
                filters.btts ===
                "yes"
              }
            >
              Yes
            </FilterLink>

            <FilterLink
              href={predictionsHref({
                ...filters,
                btts:
                  "no",
              })}
              active={
                filters.btts ===
                "no"
              }
            >
              No
            </FilterLink>
          </div>
        </div>
      </div>

      <TodayPredictions
        outcome={
          filters.outcome
        }
        goals={
          filters.goals
        }
        btts={
          filters.btts
        }
      />
    </div>
  );
}

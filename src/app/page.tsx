import type {
  Metadata,
} from "next";

import {
  connection,
} from "next/server";

import TodayPredictions from "@/components/football/TodayPredictions";

export const metadata:
  Metadata = {
    title:
      "Football Intelligence",

    description:
      "DictazIQ production football forecasts and daily match intelligence.",
  };

export default async function HomePage() {
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <section className="mb-10 overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-950/70 via-slate-900 to-slate-950 p-7 sm:p-10">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-400">
          Prediction Intelligence
        </p>

        <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
          Football forecasts built to be
          tracked, reviewed and accountable.
        </h1>

        <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
          DictazIQ combines mathematical team-strength analysis,
          verified pre-match evidence and controlled research
          fallbacks without fabricating calibrated probabilities.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href="#today"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500"
          >
            Today&apos;s Forecasts
          </a>

          <LinkButton
            href="/live"
            label="Live Scores"
          />
        </div>
      </section>

      <div id="today">
        <TodayPredictions />
      </div>
    </div>
  );
}

function LinkButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={
        href
      }
      className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-black text-slate-200 hover:border-blue-500 hover:text-white"
    >
      {
        label
      }
    </a>
  );
}
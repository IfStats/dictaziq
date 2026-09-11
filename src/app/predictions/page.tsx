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
      "Predictions",

    description:
      "Published DictazIQ football predictions and match intelligence.",
  };

export default async function PredictionsPage() {
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <TodayPredictions />
    </div>
  );
}
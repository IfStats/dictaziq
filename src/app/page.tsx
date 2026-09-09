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
      "DictazIQ | Football Intelligence",

    description:
      "Published DictazIQ football predictions and market intelligence.",

    robots: {
      index:
        false,

      follow:
        false,
    },
  };

export default async function HomePage() {
  await connection();

  return (
    <TodayPredictions />
  );
}
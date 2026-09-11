import type {
  Metadata,
} from "next";

import {
  connection,
} from "next/server";

import HomeCommandCenter from "@/components/football/HomeCommandCenter";

export const metadata:
  Metadata = {
    title:
      "Football Intelligence",

    description:
      "DictazIQ football predictions, live match tracking and transparent forecast accountability.",
  };

export default async function HomePage() {
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <HomeCommandCenter />
    </div>
  );
}
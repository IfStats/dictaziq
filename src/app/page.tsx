import type { Metadata } from "next";
import { connection } from "next/server";
import MatchWorkspace from "@/components/football/MatchWorkspace";

export const metadata: Metadata = {
  title: "DictazIQ | Football Intelligence",
  description: "Explore the DictazIQ football prediction demo.",
  robots: { index: false, follow: false },
};

export default async function HomePage() {
  await connection();

  return <MatchWorkspace />;
}
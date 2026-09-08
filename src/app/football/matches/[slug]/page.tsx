import type { Metadata } from "next";
import { connection } from "next/server";
import MatchWorkspace from "@/components/football/MatchWorkspace";

export const metadata: Metadata = {
  title: "Match Analysis | DictazIQ",
  description: "Demo football probabilities, evidence and prediction provenance.",
  robots: { index: false, follow: false },
};

export default async function MatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;

  return <MatchWorkspace slug={slug} />;
}
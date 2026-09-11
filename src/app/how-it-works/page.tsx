import type {
  Metadata,
} from "next";

export const metadata:
  Metadata = {
    title:
      "How It Works",

    description:
      "How DictazIQ produces and publishes football forecasts.",
  };

const stages = [
  {
    number: "01",
    title: "Fixture ingestion",
    description:
      "Real fixtures are captured and normalized before analysis.",
  },
  {
    number: "02",
    title: "Mathematical strength",
    description:
      "FootballDatabase ratings are compared using the core home-rating-minus-away-rating relationship.",
  },
  {
    number: "03",
    title: "Football evidence",
    description:
      "Recent scoring behaviour, competition context and verified pre-match information are evaluated independently.",
  },
  {
    number: "04",
    title: "Fallback research",
    description:
      "When the required mathematical rating pair is unavailable, the controlled GPT research route produces the mandatory result forecast from sourced pre-match evidence.",
  },
  {
    number: "05",
    title: "Pre-match review",
    description:
      "Material developments and confirmed lineups can create immutable pre-match revisions without rewriting the original baseline.",
  },
  {
    number: "06",
    title: "Accountability",
    description:
      "Published forecasts remain stored for result settlement and transparent performance scorecards.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <section className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
          Methodology
        </p>

        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          How DictazIQ works
        </h1>

        <p className="mt-5 text-base leading-8 text-slate-400">
          DictazIQ separates forecasting, evidence collection,
          publication and settlement. Missing data lowers evidence
          quality; it does not authorize fabricated information or
          invented probabilities.
        </p>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stages.map(
          (
            stage,
          ) => (
            <article
              key={
                stage.number
              }
              className="rounded-3xl border border-slate-800 bg-slate-900 p-6"
            >
              <div className="text-sm font-black text-blue-400">
                {
                  stage.number
                }
              </div>

              <h2 className="mt-5 text-xl font-black">
                {
                  stage.title
                }
              </h2>

              <p className="mt-3 text-sm leading-7 text-slate-400">
                {
                  stage.description
                }
              </p>
            </article>
          ),
        )}
      </section>

      <section className="mt-10 rounded-3xl border border-amber-900/50 bg-amber-950/20 p-6">
        <h2 className="font-black text-amber-300">
          Probability policy
        </h2>

        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          DictazIQ currently does not publish calibrated probabilities.
          Confidence classes and evidence grades must not be interpreted
          as percentage win probabilities.
        </p>
      </section>
    </div>
  );
}
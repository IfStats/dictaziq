import "./load-env";

import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  generateOpenAiAnalysis,
} from "../src/lib/ai/openai-analysis";

import type {
  LlmAnalysisInput,
} from "../src/lib/ai/llm-analysis";

const PREDICTION_ID =
  "fa571d9b-e5d6-4bce-a75c-c050a4ccde6b";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  assert.ok(
    isRecord(value),
    `${label} must be an object.`,
  );

  return value;
}

function requireString(
  value: unknown,
  label: string,
): string {
  assert.equal(
    typeof value,
    "string",
    `${label} must be a string.`,
  );

  return value as string;
}

function requireNumber(
  value: unknown,
  label: string,
): number {
  assert.equal(
    typeof value,
    "number",
    `${label} must be a number.`,
  );

  assert.ok(
    Number.isFinite(
      value as number,
    ),
    `${label} must be finite.`,
  );

  return value as number;
}

async function main() {
  const client =
    neon(getDatabaseUrl());

  /*
   * Load the already-published composite
   * DictazIQ pre-match prediction.
   *
   * The LLM must work exclusively from the
   * immutable prediction-time snapshot.
   */
  const rows = await client`
    SELECT
      prediction.id,
      prediction.published_at,
      prediction.input_cutoff_at,
      prediction.input_sha256,
      prediction.input_snapshot,
      prediction.output,

      model.version
        AS model_version

    FROM public.predictions
      AS prediction

    JOIN public.model_versions
      AS model
      ON model.id =
        prediction.model_version_id

    WHERE prediction.id =
      ${PREDICTION_ID}::uuid
  `;

  assert.equal(
    rows.length,
    1,
    "Published 5-49 composite prediction is missing.",
  );

  const prediction =
    rows[0];

  assert.ok(
    prediction.published_at,
    "LLM analysis requires a published prediction.",
  );

  assert.equal(
    prediction.model_version,
    "dictaziq-prematch-v0.1",
    "Unexpected prediction model version.",
  );

  /*
   * Extract immutable prediction input.
   */
  const snapshot =
    requireRecord(
      prediction.input_snapshot,
      "Prediction input snapshot",
    );

  const fixture =
    requireRecord(
      snapshot.fixture,
      "Fixture snapshot",
    );

  /*
   * Context evidence was embedded in the
   * prediction snapshot at generation time.
   *
   * This is important:
   *
   * We do NOT query today's context table and
   * accidentally give the LLM newer information.
   *
   * The LLM sees exactly what this prediction saw.
   */
  const contextEvidence =
    snapshot.context_evidence;

  assert.ok(
    Array.isArray(
      contextEvidence,
    ),
    "Prediction snapshot must contain context evidence.",
  );

  /*
   * Extract deterministic model output.
   */
  const output =
    requireRecord(
      prediction.output,
      "Prediction output",
    );

  const ratingGap =
    requireRecord(
      output.rating_gap,
      "Rating-gap output",
    );

  const context =
    requireRecord(
      output.context,
      "Context output",
    );

  const finalSelection =
    output.final_selection;

  assert.ok(
    finalSelection === "home" ||
      finalSelection === "away" ||
      finalSelection === "draw" ||
      finalSelection === null,
    "Unexpected final selection.",
  );

  const route =
    requireString(
      output.route,
      "Prediction route",
    );

  assert.ok(
    route === "rating_gap_only" ||
      route === "context_required" ||
      route === "rating_gap_plus_context",
    `Unsupported prediction route: ${route}`,
  );

  /*
   * Convert the immutable prediction snapshot into
   * the strict LLM input contract.
   */
  const input:
    LlmAnalysisInput = {
      fixture: {
        homeTeam:
          requireString(
            fixture.home_team_name,
            "Home team",
          ),

        awayTeam:
          requireString(
            fixture.away_team_name,
            "Away team",
          ),
      },

      prediction: {
        predictionId:
          String(
            prediction.id,
          ),

        modelVersion:
          String(
            prediction.model_version,
          ),

        route,

        ratingGap:
          requireNumber(
            ratingGap.difference,
            "Rating difference",
          ),

        ratingSignal:
          requireString(
            ratingGap.signal,
            "Rating signal",
          ),

        contextDecision:
          context.decision === null ||
          context.decision === undefined
            ? null
            : requireString(
                context.decision,
                "Context decision",
              ),

        finalSelection,

        over25Signal:
          output
            .over_2_5_signal === true,

        /*
         * The rating/context heuristic remains
         * explicitly uncalibrated.
         */
        calibratedProbability:
          null,
      },

      evidence: {
        contextFactorCount:
          requireNumber(
            context.factor_count,
            "Context factor count",
          ),

        homeSupport:
          requireNumber(
            context.home_support,
            "Home support",
          ),

        awaySupport:
          requireNumber(
            context.away_support,
            "Away support",
          ),

        neutralFactors:
          requireNumber(
            context.neutral_factors,
            "Neutral factors",
          ),

        /*
         * Give the LLM the actual verified factors,
         * not merely aggregate counts.
         *
         * These are still taken from the immutable
         * prediction snapshot.
         */
        contextFactors:
          contextEvidence.map(
            (
              rawFactor,
              index,
            ) => {
              const factor =
                requireRecord(
                  rawFactor,
                  `Context factor ${index}`,
                );

              const side =
                requireString(
                  factor.side,
                  `Context factor ${index} side`,
                );

              assert.ok(
                side === "home" ||
                  side === "away" ||
                  side === "neutral",
                `Context factor ${index} has an invalid side.`,
              );

              return {
                kind:
                  requireString(
                    factor.kind,
                    `Context factor ${index} kind`,
                  ),

                side,

                description:
                  requireString(
                    factor.description,
                    `Context factor ${index} description`,
                  ),

                source:
                  requireString(
                    factor.source,
                    `Context factor ${index} source`,
                  ),

                observedAt:
                  requireString(
                    factor.observed_at,
                    `Context factor ${index} observed_at`,
                  ),
              };
            },
          ),
      },
    };

  /*
   * Internal consistency checks.
   *
   * Aggregate counts stored by the deterministic
   * model must match the actual immutable evidence
   * records being supplied to the LLM.
   */
  assert.equal(
    input.evidence
      .contextFactors.length,
    input.evidence
      .contextFactorCount,
    "Context factor count does not match immutable evidence records.",
  );

  const calculatedHomeSupport =
    input.evidence.contextFactors.filter(
      (factor) =>
        factor.side === "home",
    ).length;

  const calculatedAwaySupport =
    input.evidence.contextFactors.filter(
      (factor) =>
        factor.side === "away",
    ).length;

  const calculatedNeutralFactors =
    input.evidence.contextFactors.filter(
      (factor) =>
        factor.side === "neutral",
    ).length;

  assert.equal(
    calculatedHomeSupport,
    input.evidence.homeSupport,
    "Home-support count does not match immutable evidence.",
  );

  assert.equal(
    calculatedAwaySupport,
    input.evidence.awaySupport,
    "Away-support count does not match immutable evidence.",
  );

  assert.equal(
    calculatedNeutralFactors,
    input.evidence.neutralFactors,
    "Neutral-factor count does not match immutable evidence.",
  );

  console.log(
    "PASS: published DictazIQ prediction loaded.",
  );

  console.log(
    "PASS: immutable prediction converted to LLM input.",
  );

  console.log(
    "PASS: exact immutable context factors loaded.",
  );

  console.log(
    "PASS: context aggregates match underlying evidence.",
  );

  console.log("");

  console.log(
    `Calling OpenAI model: ${
      process.env
        .OPENAI_LLM_MODEL ||
      "gpt-5.6-luna"
    }`,
  );

  /*
   * Live OpenAI request.
   *
   * generateOpenAiAnalysis() performs:
   *
   * 1. Structured Output validation
   * 2. DictazIQ semantic validation
   * 3. deterministic-selection protection
   * 4. probability-fabrication protection
   */
  const result =
    await generateOpenAiAnalysis(
      input,
    );

  /*
   * Integration-level reassertion of the most
   * important DictazIQ safety contract.
   */
  assert.equal(
    result.analysis.assessment,
    "home",
    "LLM changed the deterministic home selection.",
  );

  assert.equal(
    result.analysis.confidenceLabel,
    "contextual",
    "LLM returned an incorrect confidence classification.",
  );

  assert.equal(
    result.analysis.modelOverride,
    false,
    "LLM attempted a model override.",
  );

  assert.equal(
    result.analysis.probability,
    null,
    "LLM fabricated a probability.",
  );

  console.log("");

  console.log(
    "PASS: live OpenAI response received.",
  );

  console.log(
    "PASS: structured output parsed.",
  );

  console.log(
    "PASS: DictazIQ semantic validation accepted the response.",
  );

  console.log(
    "PASS: deterministic selection remains home.",
  );

  console.log(
    "PASS: LLM supplied no fabricated probability.",
  );

  console.log("");

  console.log(
    `Provider: ${result.provider}`,
  );

  console.log(
    `Model: ${result.model}`,
  );

  console.log(
    `Response ID: ${result.responseId}`,
  );

  console.log(
    `Prediction ID: ${prediction.id}`,
  );

  console.log(
    `Prediction model: ${prediction.model_version}`,
  );

  console.log(
    `Prediction input SHA-256: ${prediction.input_sha256}`,
  );

  console.log("");

  console.log(
    `Rating gap: ${input.prediction.ratingGap}`,
  );

  console.log(
    `Rating signal: ${input.prediction.ratingSignal}`,
  );

  console.log(
    `Context decision: ${input.prediction.contextDecision}`,
  );

  console.log(
    `Context factors: ${input.evidence.contextFactorCount}`,
  );

  console.log(
    `Context support: home=${input.evidence.homeSupport}, away=${input.evidence.awaySupport}, neutral=${input.evidence.neutralFactors}`,
  );

  console.log("");

  console.log(
    `Assessment: ${result.analysis.assessment}`,
  );

  console.log(
    `Confidence label: ${result.analysis.confidenceLabel}`,
  );

  console.log(
    `Model override: ${result.analysis.modelOverride}`,
  );

  console.log(
    `Probability: ${result.analysis.probability}`,
  );

  console.log("");

  console.log(
    "Verified context supplied to LLM:",
  );

  for (
    const factor
    of input.evidence.contextFactors
  ) {
    console.log(
      `- ${factor.kind} | ${factor.side} | ${factor.description}`,
    );
  }

  console.log("");

  console.log(
    "Explanation:",
  );

  for (
    const item
    of result.analysis.explanation
  ) {
    console.log(
      `- ${item}`,
    );
  }

  if (
    result.analysis
      .contradictions.length > 0
  ) {
    console.log("");

    console.log(
      "Contradictions:",
    );

    for (
      const item
      of result.analysis
        .contradictions
    ) {
      console.log(
        `- ${item}`,
      );
    }
  }

  if (
    result.analysis
      .missingInformation
      .length > 0
  ) {
    console.log("");

    console.log(
      "Missing information:",
    );

    for (
      const item
      of result.analysis
        .missingInformation
    ) {
      console.log(
        `- ${item}`,
      );
    }
  }

  console.log("");

  console.log(
    `Tokens: input=${result.usage.inputTokens ?? "n/a"}, output=${result.usage.outputTokens ?? "n/a"}, total=${result.usage.totalTokens ?? "n/a"}`,
  );

  console.log("");

  console.log(
    "WARNING: LLM explanation is synthetic-demo analysis and is not independent predictive evidence.",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? `Live LLM analysis failed: ${error.message}`
        : "Live LLM analysis failed.",
    );

    process.exitCode = 1;
  },
);
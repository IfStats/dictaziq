import OpenAI from "openai";

import {
  LLM_ANALYSIS_VERSION,
  buildLlmAnalysisPrompt,
  validateLlmAnalysisOutput,
  type LlmAnalysisInput,
  type LlmAnalysisOutput,
} from "./llm-analysis";

export const DEFAULT_LLM_MODEL =
  "gpt-5.6-luna" as const;

export type OpenAiAnalysisResult = {
  provider: "openai";

  model: string;

  responseId: string;

  analysis: LlmAnalysisOutput;

  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

const outputSchema = {
  type: "object",

  additionalProperties: false,

  properties: {
    version: {
      type: "string",
      enum: [
        LLM_ANALYSIS_VERSION,
      ],
    },

    assessment: {
      type: "string",
      enum: [
        "home",
        "away",
        "draw",
        "no_pick",
      ],
    },

    confidenceLabel: {
      type: "string",
      enum: [
        "deterministic",
        "contextual",
        "insufficient_evidence",
      ],
    },

    explanation: {
      type: "array",
      minItems: 1,
      maxItems: 10,

      items: {
        type: "string",
      },
    },

    contradictions: {
      type: "array",
      maxItems: 10,

      items: {
        type: "string",
      },
    },

    missingInformation: {
      type: "array",
      maxItems: 10,

      items: {
        type: "string",
      },
    },

    modelOverride: {
      type: "boolean",
      enum: [false],
    },

    probability: {
      type: "null",
    },
  },

  required: [
    "version",
    "assessment",
    "confidenceLabel",
    "explanation",
    "contradictions",
    "missingInformation",
    "modelOverride",
    "probability",
  ],
} as const;

function getApiKey(): string {
  const value =
    process.env.OPENAI_API_KEY?.trim();

  if (!value) {
    throw new Error(
      "OPENAI_API_KEY is not configured.",
    );
  }

  return value;
}

function getModel(): string {
  const configured =
    process.env.OPENAI_LLM_MODEL?.trim();

  return (
    configured ||
    DEFAULT_LLM_MODEL
  );
}

export async function generateOpenAiAnalysis(
  input: LlmAnalysisInput,
): Promise<OpenAiAnalysisResult> {
  const client =
    new OpenAI({
      apiKey: getApiKey(),
    });

  const model =
    getModel();

  const prompt =
    buildLlmAnalysisPrompt(
      input,
    );

  const response =
    await client.responses.create({
      model,

      /*
       * Keep the API request isolated.
       * DictazIQ itself will own the durable
       * provenance record later.
       */
      store: false,

      reasoning: {
        effort: "none",
      },

      instructions:
        prompt.system,

      input: [
        {
          role: "user",

          content: [
            {
              type:
                "input_text",

              text:
                prompt.user,
            },
          ],
        },
      ],

      text: {
        format: {
          type:
            "json_schema",

          name:
            "dictaziq_llm_analysis",

          strict: true,

          schema:
            outputSchema,
        },
      },

      max_output_tokens: 1200,
    });

  if (
    response.status !==
    "completed"
  ) {
    throw new Error(
      `OpenAI response did not complete successfully. Status: ${response.status}`,
    );
  }

  const raw =
    response.output_text?.trim();

  if (!raw) {
    throw new Error(
      "OpenAI returned no structured analysis.",
    );
  }

  let candidate: unknown;

  try {
    candidate =
      JSON.parse(raw);
  } catch {
    throw new Error(
      "OpenAI returned invalid JSON.",
    );
  }

  /*
   * Structured Outputs constrains shape.
   *
   * This local validator separately enforces
   * DictazIQ semantic rules:
   *
   * - no model override
   * - no probability fabrication
   * - correct deterministic assessment
   * - correct confidence classification
   */
  const analysis =
    validateLlmAnalysisOutput(
      input,
      candidate,
    );

  return {
    provider: "openai",

    model,

    responseId:
      response.id,

    analysis,

    usage: {
      inputTokens:
        response.usage
          ?.input_tokens ??
        null,

      outputTokens:
        response.usage
          ?.output_tokens ??
        null,

      totalTokens:
        response.usage
          ?.total_tokens ??
        null,
    },
  };
}
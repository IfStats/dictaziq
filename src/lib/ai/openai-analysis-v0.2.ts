import OpenAI from "openai";

import {
  LLM_ANALYSIS_VERSION_V02,
  buildLlmAnalysisPromptV02,
  validateLlmAnalysisInputV02,
  validateLlmAnalysisOutputV02,
  type LlmAnalysisInputV02,
  type LlmAnalysisOutputV02,
} from "./llm-analysis-v0.2";

export const DEFAULT_LLM_MODEL_V02 =
  "gpt-5.6-luna" as const;

export type OpenAiAnalysisResultV02 = {
  provider:
    "openai";

  model:
    string;

  responseId:
    string;

  analysis:
    LlmAnalysisOutputV02;

  usage: {
    inputTokens:
      number |
      null;

    outputTokens:
      number |
      null;

    totalTokens:
      number |
      null;
  };
};

const outputSchema = {
  type:
    "object",

  additionalProperties:
    false,

  properties: {
    version: {
      type:
        "string",

      enum: [
        LLM_ANALYSIS_VERSION_V02,
      ],
    },

    assessment: {
      type:
        "string",

      enum: [
        "home",
        "draw",
        "away",
        "no_pick",
      ],
    },

    confidence: {
      type:
        "string",

      enum: [
        "high",
        "medium",
        "low",
        "insufficient",
      ],
    },

    resultSignalStrength: {
      type:
        "string",

      enum: [
        "strong",
        "moderate",
        "weak",
        "none",
      ],
    },

    goalsView: {
      type:
        "string",

      enum: [
        "over_2_5",
        "under_2_5",
        "neutral",
      ],
    },

    bttsView: {
      type:
        "string",

      enum: [
        "yes",
        "no",
        "neutral",
      ],
    },

    evidenceQuality: {
      type:
        "string",

      enum: [
        "strong",
        "moderate",
        "weak",
        "insufficient",
      ],
    },

    reasoningSummary: {
      type:
        "array",

      minItems:
        1,

      maxItems:
        8,

      items: {
        type:
          "string",
      },
    },

    contradictions: {
      type:
        "array",

      maxItems:
        8,

      items: {
        type:
          "string",
      },
    },

    missingInformation: {
      type:
        "array",

      maxItems:
        8,

      items: {
        type:
          "string",
      },
    },

    modelOverride: {
      type:
        "boolean",

      enum: [
        false,
      ],
    },

    probability: {
      type:
        "null",
    },
  },

  required: [
    "version",
    "assessment",
    "confidence",
    "resultSignalStrength",
    "goalsView",
    "bttsView",
    "evidenceQuality",
    "reasoningSummary",
    "contradictions",
    "missingInformation",
    "modelOverride",
    "probability",
  ],
} as const;

function apiKey():
  string {
  const value =
    process.env
      .OPENAI_API_KEY
      ?.trim();

  if (
    !value
  ) {
    throw new Error(
      "OPENAI_API_KEY is not configured.",
    );
  }

  return value;
}

function configuredModel():
  string {
  return (
    process.env
      .OPENAI_LLM_MODEL
      ?.trim() ||
    DEFAULT_LLM_MODEL_V02
  );
}

export async function generateOpenAiAnalysisV02(
  input:
    LlmAnalysisInputV02,
): Promise<OpenAiAnalysisResultV02> {
  const validatedInput =
    validateLlmAnalysisInputV02(
      input,
    );

  const prompt =
    buildLlmAnalysisPromptV02(
      validatedInput,
    );

  const client =
    new OpenAI({
      apiKey:
        apiKey(),
    });

  const model =
    configuredModel();

  const response =
    await client.responses.create({
      model,

      /*
       * DictazIQ owns the durable audit record.
       */
      store:
        false,

      /*
       * Give the independent assessment enough
       * reasoning capacity without turning this
       * into an expensive long-form task.
       */
      reasoning: {
        effort:
          "low",
      },

      instructions:
        prompt.system,

      input: [
        {
          role:
            "user",

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
            "dictaziq_llm_analysis_v02",

          strict:
            true,

          schema:
            outputSchema,
        },
      },

      max_output_tokens:
        1600,
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
    response
      .output_text
      ?.trim();

  if (
    !raw
  ) {
    throw new Error(
      "OpenAI returned no structured LLM v0.2 analysis.",
    );
  }

  let candidate:
    unknown;

  try {
    candidate =
      JSON.parse(
        raw,
      );
  } catch {
    throw new Error(
      "OpenAI returned invalid JSON for LLM v0.2.",
    );
  }

  /*
   * Structured Outputs constrains syntax.
   *
   * DictazIQ validation separately enforces
   * semantic invariants such as:
   *
   * - no fabricated probability
   * - no model override
   * - valid no_pick semantics
   */
  const analysis =
    validateLlmAnalysisOutputV02(
      candidate,
    );

  return {
    provider:
      "openai",

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
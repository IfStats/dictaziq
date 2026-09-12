import OpenAI from "openai";

import {
  GPT_RESEARCH_PREDICTION_VERSION_V02,
  buildGptResearchPromptV02,
  validateGptResearchOutputV02,
  type GptResearchPredictionInputV02,
  type GptResearchPredictionOutputV02,
} from "./gpt-research-prediction-v0.2";

export const DEFAULT_GPT_RESEARCH_MODEL_V02 =
  "gpt-5.6-luna" as const;

export type GptResearchWebSourceV02 = {
  url: string;

  title:
    string |
    null;
};

export type OpenAiResearchPredictionResultV02 = {
  provider:
    "openai";

  model:
    string;

  responseId:
    string;

  prediction:
    GptResearchPredictionOutputV02;

  webSearchUsed:
    boolean;

  webSources:
    GptResearchWebSourceV02[];

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

type UnknownRecord =
  Record<
    string,
    unknown
  >;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
}

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
        GPT_RESEARCH_PREDICTION_VERSION_V02,
      ],
    },

    selection: {
      type:
        "string",

      enum: [
        "home",
        "draw",
        "away",
      ],
    },

    confidence: {
      type:
        "string",

      enum: [
        "high",
        "medium",
        "low",
        "very_low",
      ],
    },

    evidenceGrade: {
      type:
        "string",

      enum: [
        "A",
        "B",
        "C",
        "D",
        "E",
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

    materialFactors: {
      type:
        "array",

      minItems:
        1,

      maxItems:
        12,

      items: {
        type:
          "string",
      },
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

    probability: {
      type:
        "null",
    },

    modelOverride: {
      type:
        "boolean",

      enum: [
        false,
      ],
    },
  },

  required: [
    "version",
    "selection",
    "confidence",
    "evidenceGrade",
    "goalsView",
    "bttsView",
    "materialFactors",
    "reasoningSummary",
    "contradictions",
    "missingInformation",
    "probability",
    "modelOverride",
  ],
} as const;

function getApiKey():
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

function getModel():
  string {
  return (
    process.env
      .OPENAI_LLM_MODEL
      ?.trim() ||
    DEFAULT_GPT_RESEARCH_MODEL_V02
  );
}

function extractWebSources(
  response:
    unknown,
): {
  used:
    boolean;

  sources:
    GptResearchWebSourceV02[];
} {
  if (
    !isRecord(
      response,
    ) ||
    !Array.isArray(
      response.output,
    )
  ) {
    return {
      used:
        false,

      sources: [],
    };
  }

  let used =
    false;

  const sources =
    new Map<
      string,
      GptResearchWebSourceV02
    >();

  for (
    const item
    of response.output
  ) {
    if (
      !isRecord(
        item,
      ) ||
      item.type !==
        "web_search_call"
    ) {
      continue;
    }

    used =
      true;

    const action =
      isRecord(
        item.action,
      )
        ? item.action
        : null;

    if (
      !action ||
      !Array.isArray(
        action.sources,
      )
    ) {
      continue;
    }

    for (
      const rawSource
      of action.sources
    ) {
      if (
        !isRecord(
          rawSource,
        )
      ) {
        continue;
      }

      const url =
        typeof rawSource.url ===
          "string"
          ? rawSource.url.trim()
          : "";

      if (
        !url
      ) {
        continue;
      }

      const title =
        typeof rawSource.title ===
          "string" &&
        rawSource.title.trim()
          ? rawSource.title.trim()
          : null;

      if (
        !sources.has(
          url,
        )
      ) {
        sources.set(
          url,
          {
            url,
            title,
          },
        );
      }
    }
  }

  return {
    used,

    sources:
      [...sources.values()],
  };
}

export async function generateOpenAiResearchPredictionV02(
  input:
    GptResearchPredictionInputV02,
): Promise<
  OpenAiResearchPredictionResultV02
> {
  const client =
    new OpenAI({
      apiKey:
        getApiKey(),
    });

  const model =
    getModel();

  const prompt =
    buildGptResearchPromptV02(
      input,
       {
      webSearchAvailable:
        true,
    },

  
    );

  const response =
    await client.responses.create({
      model,

      store:
        false,

      reasoning: {
        effort:
          "low",
      },

      /*
       * Only one built-in tool is exposed.
       *
       * tool_choice=required therefore forces
       * at least one web research call.
       */
      tools: [
        {
          type:
            "web_search_preview",
        },
      ],

      tool_choice:
        "required",

      include: [
        "web_search_call.action.sources",
      ],

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
            "dictaziq_gpt_research_prediction_v01",

          strict:
            true,

          schema:
            outputSchema,
        },
      },

      max_output_tokens:
        1800,
    });

  if (
    response.status !==
    "completed"
  ) {
    throw new Error(
      `OpenAI research response did not complete successfully. Status: ${response.status}`,
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
      "OpenAI returned no GPT research prediction.",
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
      "OpenAI returned invalid JSON for GPT research prediction.",
    );
  }

  const prediction =
    validateGptResearchOutputV02(
      candidate,
    );

  const provenance =
    extractWebSources(
      response,
    );

  if (
    !provenance.used
  ) {
    throw new Error(
      "GPT research prediction completed without a web-search call.",
    );
  }

  return {
    provider:
      "openai",

    model,

    responseId:
      response.id,

    prediction,

    webSearchUsed:
      provenance.used,

    webSources:
      provenance.sources,

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

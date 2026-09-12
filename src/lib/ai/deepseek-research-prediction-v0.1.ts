import {
  GPT_RESEARCH_PREDICTION_VERSION_V02,
  buildGptResearchPromptV02,
  validateGptResearchOutputV02,
  type GptResearchPredictionInputV02,
  type GptResearchPredictionOutputV02,
} from "./gpt-research-prediction-v0.2";

export const DEFAULT_DEEPSEEK_RESEARCH_MODEL_V01 =
  "deepseek-v4-flash" as const;

const DEEPSEEK_BASE_URL =
  "https://api.deepseek.com";

type UnknownRecord =
  Record<string, unknown>;

export type DeepSeekResearchWebSourceV01 = {
  url: string;

  title:
    string |
    null;
};

export type DeepSeekResearchPredictionResultV01 = {
  provider:
    "deepseek";

  model:
    string;

  responseId:
    string;

  prediction:
    GptResearchPredictionOutputV02;

  webSearchUsed:
    boolean;

  webSources:
    DeepSeekResearchWebSourceV01[];

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

type DeepSeekResponseV01 = {
  id?: unknown;

  status?: unknown;

  model?: unknown;

  error?: unknown;

  output?: unknown;

  usage?: unknown;
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

function isRecord(
  value:
    unknown,
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

function nonEmptyString(
  value:
    unknown,

  label:
    string,
): string {
  if (
    typeof value !==
      "string" ||
    value.trim().length ===
      0
  ) {
    throw new Error(
      `${label} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function optionalNumber(
  value:
    unknown,
): number | null {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
  ) {
    return value;
  }

  return null;
}

function getApiKey():
  string {
  const value =
    process.env
      .DEEPSEEK_API_KEY
      ?.trim();

  if (
    !value
  ) {
    throw new Error(
      "DEEPSEEK_API_KEY is not configured.",
    );
  }

  return value;
}

function getModel():
  string {
  return (
    process.env
      .DEEPSEEK_LLM_MODEL
      ?.trim() ||
    DEFAULT_DEEPSEEK_RESEARCH_MODEL_V01
  );
}

function getBaseUrl():
  string {
  const configured =
    process.env
      .DEEPSEEK_BASE_URL
      ?.trim();

  const value =
    configured ||
    DEEPSEEK_BASE_URL;

  return value.replace(
    /\/+$/,
    "",
  );
}

function extractOutputText(
  response:
    DeepSeekResponseV01,
): string {
  if (
    !Array.isArray(
      response.output,
    )
  ) {
    throw new Error(
      "DeepSeek response output is missing.",
    );
  }

  const fragments:
    string[] = [];

  for (
    const item
    of response.output
  ) {
    if (
      !isRecord(
        item,
      ) ||
      item.type !==
        "message" ||
      !Array.isArray(
        item.content,
      )
    ) {
      continue;
    }

    for (
      const content
      of item.content
    ) {
      if (
        !isRecord(
          content,
        ) ||
        content.type !==
          "output_text" ||
        typeof content.text !==
          "string"
      ) {
        continue;
      }

      const value =
        content.text.trim();

      if (
        value.length >
        0
      ) {
        fragments.push(
          value,
        );
      }
    }
  }

  const text =
    fragments
      .join("\n")
      .trim();

  if (
    !text
  ) {
    throw new Error(
      "DeepSeek returned no research prediction text.",
    );
  }

  return text;
}

function collectUrls(
  value:
    unknown,

  sources:
    Map<
      string,
      DeepSeekResearchWebSourceV01
    >,
): void {
  if (
    Array.isArray(
      value,
    )
  ) {
    for (
      const item
      of value
    ) {
      collectUrls(
        item,
        sources,
      );
    }

    return;
  }

  if (
    !isRecord(
      value,
    )
  ) {
    return;
  }

  const rawUrl =
    typeof value.url ===
      "string"
      ? value.url.trim()
      : "";

  if (
    rawUrl &&
    /^https?:\/\//i.test(
      rawUrl,
    )
  ) {
    const title =
      typeof value.title ===
        "string" &&
      value.title
        .trim()
        .length >
        0
        ? value.title.trim()
        : null;

    if (
      !sources.has(
        rawUrl,
      )
    ) {
      sources.set(
        rawUrl,
        {
          url:
            rawUrl,

          title,
        },
      );
    }
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    if (
      nested ===
      value.url
    ) {
      continue;
    }

    collectUrls(
      nested,
      sources,
    );
  }
}

function extractWebSearchProvenance(
  response:
    DeepSeekResponseV01,
): {
  used:
    boolean;

  sources:
    DeepSeekResearchWebSourceV01[];
} {
  if (
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
      DeepSeekResearchWebSourceV01
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

    collectUrls(
      item.action,
      sources,
    );
  }

  return {
    used,

    sources:
      [...sources.values()],
  };
}

function extractUsage(
  response:
    DeepSeekResponseV01,
): {
  inputTokens:
    number |
    null;

  outputTokens:
    number |
    null;

  totalTokens:
    number |
    null;
} {
  if (
    !isRecord(
      response.usage,
    )
  ) {
    return {
      inputTokens:
        null,

      outputTokens:
        null,

      totalTokens:
        null,
    };
  }

  return {
    inputTokens:
      optionalNumber(
        response
          .usage
          .input_tokens,
      ),

    outputTokens:
      optionalNumber(
        response
          .usage
          .output_tokens,
      ),

    totalTokens:
      optionalNumber(
        response
          .usage
          .total_tokens,
      ),
  };
}

function extractErrorMessage(
  response:
    DeepSeekResponseV01,
): string | null {
  if (
    !isRecord(
      response.error,
    )
  ) {
    return null;
  }

  if (
    typeof response
      .error
      .message ===
      "string" &&
    response
      .error
      .message
      .trim()
  ) {
    return response
      .error
      .message
      .trim();
  }

  return null;
}

async function callDeepSeekResponsesApi(
  body:
    UnknownRecord,
): Promise<
  DeepSeekResponseV01
> {
  const endpoint =
    `${getBaseUrl()}/responses`;

  const response =
    await fetch(
      endpoint,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${getApiKey()}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            body,
          ),

        signal:
          AbortSignal.timeout(
            90_000,
          ),
      },
    );

  let payload:
    unknown;

  try {
    payload =
      await response.json();
  } catch {
    throw new Error(
      `DeepSeek returned a non-JSON response. HTTP ${response.status}.`,
    );
  }

  if (
    !response.ok
  ) {
    const message =
      isRecord(
        payload,
      ) &&
      isRecord(
        payload.error,
      ) &&
      typeof payload
        .error
        .message ===
        "string"
        ? payload
            .error
            .message
            .trim()
        : "";

    throw new Error(
      message
        ? `DeepSeek API error ${response.status}: ${message}`
        : `DeepSeek API error ${response.status}.`,
    );
  }

  if (
    !isRecord(
      payload,
    )
  ) {
    throw new Error(
      "DeepSeek returned an invalid response object.",
    );
  }

  return payload as
    DeepSeekResponseV01;
}

export async function generateDeepSeekResearchPredictionV01(
  input:
    GptResearchPredictionInputV02,
): Promise<
  DeepSeekResearchPredictionResultV01
> {
  const model =
    getModel();

  const prompt =
    buildGptResearchPromptV02(
      input,
      {
      webSearchAvailable:
        false,
    },
    );

  /*
   * We intentionally use the raw HTTP endpoint
   * rather than OpenAI.responses.create().
   *
   * DeepSeek supports the Responses API and the
   * built-in "web_search" tool, but the currently
   * installed OpenAI TypeScript SDK does not yet
   * include "web_search" in its Tool union.
   *
   * This preserves strict TypeScript without
   * unsafe `as any` / `as never` casts.
   */
  const response =
    await callDeepSeekResponsesApi({
      model,

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

      reasoning: {
        effort:
          "low",
      },

     

      text: {
        format: {
          type:
            "json_schema",

          name:
            "dictaziq_deepseek_research_prediction_v01",

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
    const apiError =
      extractErrorMessage(
        response,
      );

    throw new Error(
      apiError
        ? `DeepSeek research response failed: ${apiError}`
        : `DeepSeek research response did not complete successfully. Status: ${String(
            response.status,
          )}`,
    );
  }

  const raw =
    extractOutputText(
      response,
    );

  let candidate:
    unknown;

  try {
    candidate =
      JSON.parse(
        raw,
      );
  } catch {
    throw new Error(
      "DeepSeek returned invalid JSON for the research prediction.",
    );
  }

  const prediction =
    validateGptResearchOutputV02(
      candidate,
    );

   

  const provenance =
    extractWebSearchProvenance(
      response,
    );

  /*
   * DictazIQ research predictions must actually
   * perform independent research. A response that
   * never invoked web_search is rejected.
   */
  

  const responseId =
    nonEmptyString(
      response.id,
      "DeepSeek response ID",
    );

  const returnedModel =
    typeof response.model ===
      "string" &&
    response.model
      .trim()
      .length >
      0
      ? response.model.trim()
      : model;

  return {
    provider:
      "deepseek",

    model:
      returnedModel,

    responseId,

    prediction,

    webSearchUsed:
      provenance.used,

    webSources:
      provenance.sources,

    usage:
      extractUsage(
        response,
      ),
  };
}

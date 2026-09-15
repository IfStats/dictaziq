import {
  buildGptResearchPromptV02,
  validateGptResearchInputV02,
  type GptResearchPredictionInputV02,
  type GptResearchSelectionV02,
  type GptResearchConfidenceV02,
  type GptResearchEvidenceGradeV02,
} from "./gpt-research-prediction-v0.2";

export const DEEPSEEK_RESEARCH_PREDICTION_VERSION_V02 =
  "dictaziq-deepseek-research-prediction-v0.2" as const;

export type DeepSeekMarketSelectionV02 =
  | "yes"
  | "no";

export type DeepSeekMarketForecastV02 = {
  selection:
    DeepSeekMarketSelectionV02;

  confidence:
    GptResearchConfidenceV02;

  evidenceGrade:
    GptResearchEvidenceGradeV02;
};

export type DeepSeekResearchPredictionOutputV02 = {
  version:
    typeof DEEPSEEK_RESEARCH_PREDICTION_VERSION_V02;

  selection:
    GptResearchSelectionV02;

  confidence:
    GptResearchConfidenceV02;

  evidenceGrade:
    GptResearchEvidenceGradeV02;

  over15:
    DeepSeekMarketForecastV02;

  over25:
    DeepSeekMarketForecastV02;

  btts:
    DeepSeekMarketForecastV02;

  materialFactors:
    string[];

  reasoningSummary:
    string[];

  contradictions:
    string[];

  missingInformation:
    string[];

  probability:
    null;

  modelOverride:
    false;
};

export const DEFAULT_DEEPSEEK_RESEARCH_MODEL_V02 =
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
    DeepSeekResearchPredictionOutputV02;

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
        DEEPSEEK_RESEARCH_PREDICTION_VERSION_V02,
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

    over15: {
  type:
    "object",

  additionalProperties:
    false,

  properties: {
    selection: {
      type:
        "string",

      enum: [
        "yes",
        "no",
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
  },

  required: [
    "selection",
    "confidence",
    "evidenceGrade",
  ],
},

over25: {
  type:
    "object",

  additionalProperties:
    false,

  properties: {
    selection: {
      type:
        "string",

      enum: [
        "yes",
        "no",
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
  },

  required: [
    "selection",
    "confidence",
    "evidenceGrade",
  ],
},

btts: {
  type:
    "object",

  additionalProperties:
    false,

  properties: {
    selection: {
      type:
        "string",

      enum: [
        "yes",
        "no",
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
  },

  required: [
    "selection",
    "confidence",
    "evidenceGrade",
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
  "over15",
  "over25",
  "btts",
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
    DEFAULT_DEEPSEEK_RESEARCH_MODEL_V02
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

function validateDeepSeekMarketV02(
  value: unknown,
  label: string,
): DeepSeekMarketForecastV02 {
  if (!isRecord(value)) {
    throw new Error(
      `${label} must be an object.`,
    );
  }

  if (
    value.selection !== "yes" &&
    value.selection !== "no"
  ) {
    throw new Error(
      `${label}.selection must be yes or no.`,
    );
  }

  const confidences =
    new Set<GptResearchConfidenceV02>([
      "high",
      "medium",
      "low",
      "very_low",
    ]);

  if (
    typeof value.confidence !== "string" ||
    !confidences.has(
      value.confidence as GptResearchConfidenceV02,
    )
  ) {
    throw new Error(
      `${label}.confidence is invalid.`,
    );
  }

  const grades =
    new Set<GptResearchEvidenceGradeV02>([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);

  if (
    typeof value.evidenceGrade !== "string" ||
    !grades.has(
      value.evidenceGrade as GptResearchEvidenceGradeV02,
    )
  ) {
    throw new Error(
      `${label}.evidenceGrade is invalid.`,
    );
  }

  return {
    selection:
      value.selection,

    confidence:
      value.confidence as GptResearchConfidenceV02,

    evidenceGrade:
      value.evidenceGrade as GptResearchEvidenceGradeV02,
  };
}

function validateDeepSeekStringArrayV02(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${label} must be an array.`,
    );
  }

  if (
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new Error(
      `${label} must contain between ${minimum} and ${maximum} items.`,
    );
  }

  return value.map(
    (
      item,
      index,
    ) =>
      nonEmptyString(
        item,
        `${label}[${index}]`,
      ),
  );
}

function validateDeepSeekResearchOutputV02(
  candidate: unknown,
): DeepSeekResearchPredictionOutputV02 {
  if (!isRecord(candidate)) {
    throw new Error(
      "DeepSeek research output must be an object.",
    );
  }

  if (
    candidate.version !==
    DEEPSEEK_RESEARCH_PREDICTION_VERSION_V02
  ) {
    throw new Error(
      "DeepSeek research version is invalid.",
    );
  }

  const selections =
    new Set<GptResearchSelectionV02>([
      "home",
      "draw",
      "away",
    ]);

  if (
    typeof candidate.selection !== "string" ||
    !selections.has(
      candidate.selection as GptResearchSelectionV02,
    )
  ) {
    throw new Error(
      "DeepSeek must produce HOME, DRAW or AWAY.",
    );
  }

  const confidences =
    new Set<GptResearchConfidenceV02>([
      "high",
      "medium",
      "low",
      "very_low",
    ]);

  if (
    typeof candidate.confidence !== "string" ||
    !confidences.has(
      candidate.confidence as GptResearchConfidenceV02,
    )
  ) {
    throw new Error(
      "DeepSeek result confidence is invalid.",
    );
  }

  const grades =
    new Set<GptResearchEvidenceGradeV02>([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);

  if (
    typeof candidate.evidenceGrade !== "string" ||
    !grades.has(
      candidate.evidenceGrade as GptResearchEvidenceGradeV02,
    )
  ) {
    throw new Error(
      "DeepSeek result evidence grade is invalid.",
    );
  }

  if (candidate.probability !== null) {
    throw new Error(
      "DeepSeek cannot fabricate a probability.",
    );
  }

  if (candidate.modelOverride !== false) {
    throw new Error(
      "DeepSeek modelOverride must remain false.",
    );
  }

  return {
    version:
      DEEPSEEK_RESEARCH_PREDICTION_VERSION_V02,

    selection:
      candidate.selection as GptResearchSelectionV02,

    confidence:
      candidate.confidence as GptResearchConfidenceV02,

    evidenceGrade:
      candidate.evidenceGrade as GptResearchEvidenceGradeV02,

    over15:
      validateDeepSeekMarketV02(
        candidate.over15,
        "over15",
      ),

    over25:
      validateDeepSeekMarketV02(
        candidate.over25,
        "over25",
      ),

    btts:
      validateDeepSeekMarketV02(
        candidate.btts,
        "btts",
      ),

    materialFactors:
      validateDeepSeekStringArrayV02(
        candidate.materialFactors,
        "materialFactors",
        1,
        12,
      ),

    reasoningSummary:
      validateDeepSeekStringArrayV02(
        candidate.reasoningSummary,
        "reasoningSummary",
        1,
        8,
      ),

    contradictions:
      validateDeepSeekStringArrayV02(
        candidate.contradictions,
        "contradictions",
        0,
        8,
      ),

    missingInformation:
      validateDeepSeekStringArrayV02(
        candidate.missingInformation,
        "missingInformation",
        0,
        8,
      ),

    probability:
      null,

    modelOverride:
      false,
  };
}

function buildDeepSeekResearchPromptV02(
  input:
    GptResearchPredictionInputV02,
): {
  system: string;
  user: string;
} {
  const validated =
    validateGptResearchInputV02(
      input,
    );

  const base =
    buildGptResearchPromptV02(
      validated,
      {
        webSearchAvailable:
          false,
      },
    );

  const system = [
    base.system.replace(
      "Use neutral when goals or BTTS evidence is not adequate.",
      "For every required market, you MUST choose a direction even when evidence is weak.",
    ),
    "",
    "DEEPSEEK V0.2 MANDATORY MARKET CONTRACT:",
    "You MUST produce a prediction for every required market.",
    "Low confidence is NOT a reason to abstain.",
    "Weak evidence is NOT a reason to abstain.",
    "There is no neutral and there is no no_pick.",
    "",
    "RESULT:",
    "Choose exactly one: home, draw or away.",
    "",
    "OVER 1.5:",
    "Choose yes if you forecast more than 1.5 total goals.",
    "Choose no otherwise.",
    "",
    "OVER 2.5:",
    "Choose yes if you forecast more than 2.5 total goals.",
    "Choose no otherwise.",
    "",
    "BTTS:",
    "Choose yes if you forecast both teams to score.",
    "Choose no otherwise.",
    "",
    "CONFIDENCE:",
    "Every market must independently receive high, medium, low or very_low confidence.",
    "",
    "EVIDENCE:",
    "Every market must independently receive evidence grade A, B, C, D or E.",
    "",
    "If evidence is sparse or contradictory, still make the most defensible prediction and express uncertainty through confidence and evidenceGrade.",
  ].join(
    "\n",
  );

  const user =
    JSON.stringify(
      {
        contractVersion:
          DEEPSEEK_RESEARCH_PREDICTION_VERSION_V02,

        purpose:
          validated.purpose,

        fixture:
          validated.fixture,

        evidence:
          validated.evidence,

        requiredOutput: {
          version:
            DEEPSEEK_RESEARCH_PREDICTION_VERSION_V02,

          selection:
            "home | draw | away",

          confidence:
            "high | medium | low | very_low",

          evidenceGrade:
            "A | B | C | D | E",

          over15: {
            selection:
              "yes | no",

            confidence:
              "high | medium | low | very_low",

            evidenceGrade:
              "A | B | C | D | E",
          },

          over25: {
            selection:
              "yes | no",

            confidence:
              "high | medium | low | very_low",

            evidenceGrade:
              "A | B | C | D | E",
          },

          btts: {
            selection:
              "yes | no",

            confidence:
              "high | medium | low | very_low",

            evidenceGrade:
              "A | B | C | D | E",
          },

          materialFactors: [
            "material football factor",
          ],

          reasoningSummary: [
            "concise evidence-based conclusion",
          ],

          contradictions: [],

          missingInformation: [],

          probability:
            null,

          modelOverride:
            false,
        },
      },
      null,
      2,
    );

  return {
    system,
    user,
  };
}

export async function generateDeepSeekResearchPredictionV02(
  input:
    GptResearchPredictionInputV02,
): Promise<
  DeepSeekResearchPredictionResultV01
> {
  const model =
    getModel();

  const prompt =
  buildDeepSeekResearchPromptV02(
    input,
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
    validateDeepSeekResearchOutputV02(
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

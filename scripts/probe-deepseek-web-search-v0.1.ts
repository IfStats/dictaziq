import "./load-env";

const apiKey =
  process.env
    .DEEPSEEK_API_KEY
    ?.trim();

if (!apiKey) {
  throw new Error(
    "DEEPSEEK_API_KEY is not configured.",
  );
}

const baseUrl =
  process.env
    .DEEPSEEK_BASE_URL
    ?.trim()
    .replace(
      /\/+$/,
      "",
    ) ||
  "https://api.deepseek.com";

const model =
  process.env
    .DEEPSEEK_LLM_MODEL
    ?.trim() ||
  "deepseek-v4-flash";

const toolTypes = [
  "web_search",
  "web_search_2025_08_26",
] as const;

type UnknownRecord =
  Record<string, unknown>;

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

async function main() {
  console.log(
    "DeepSeek Web Search Isolation Probe",
  );

  console.log(
    `Model: ${model}`,
  );

  for (
    const toolType
    of toolTypes
  ) {
    console.log("");
    console.log(
      "========================================",
    );
    console.log(
      `Testing: ${toolType}`,
    );
    console.log(
      "========================================",
    );

    const response =
      await fetch(
        `${baseUrl}/responses`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              model,

              input:
                "Search the web for the latest DeepSeek API changelog entry. Return only its date and title.",

              tools: [
                {
                  type:
                    toolType,
                },
              ],

              tool_choice: {
                type:
                  toolType,
              },

              max_output_tokens:
                300,
            }),
        },
      );

    const payload:
      unknown =
      await response.json();

    console.log(
      `HTTP: ${response.status}`,
    );

    if (
      !isRecord(
        payload,
      )
    ) {
      console.log(
        "Invalid response object.",
      );

      continue;
    }

    console.log(
      `Response status: ${String(
        payload.status,
      )}`,
    );

    const output =
      payload.output;

    const outputTypes =
      Array.isArray(
        output,
      )
        ? output.map(
            (
              item,
            ) =>
              isRecord(
                item,
              )
                ? String(
                    item.type ??
                      "<missing-type>",
                  )
                : typeof item,
          )
        : [];

    console.log(
      "Output item types:",
      outputTypes,
    );

    console.log(
      "Output:",
    );

    console.log(
      JSON.stringify(
        output,
        null,
        2,
      ),
    );
  }
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
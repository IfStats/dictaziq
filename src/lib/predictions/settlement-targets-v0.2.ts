import {
  type SupportedMarket,
} from "./settlement";

export const SETTLEMENT_TARGETS_VERSION_V02 =
  "dictaziq-settlement-targets-v0.2" as const;

export type SettlementTargetV02 = {
  market:
    SupportedMarket;

  selection:
    string;
};

const SUPPORTED_MARKETS =
  new Set<SupportedMarket>([
    "1x2",
    "btts",
    "goals_1.5",
    "goals_2.5",
    "goals_3.5",
  ]);

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

function supportedMarket(
  value: unknown,
): value is SupportedMarket {
  return (
    typeof value ===
      "string" &&
    SUPPORTED_MARKETS.has(
      value as SupportedMarket,
    )
  );
}

function nonEmptyString(
  value: unknown,
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed ||
    null;
}

export function extractSettlementTargetsV02(
  output: unknown,
): SettlementTargetV02[] {
  if (
    !isRecord(
      output,
    )
  ) {
    throw new Error(
      "Prediction output must be an object.",
    );
  }

  const targets:
    SettlementTargetV02[] =
      [];

  /*
   * 1X2 result:
   *
   * v0.2 only settles a result when
   * result.recommended === true.
   *
   * A context_lean deliberately has
   * recommended=false and is therefore
   * NOT performance-scored as a pick.
   */
  if (
    isRecord(
      output.result,
    )
  ) {
    const result =
      output.result;

    const selection =
      nonEmptyString(
        result.selection,
      );

    if (
      result.recommended ===
        true &&
      (
        selection ===
          "home" ||
        selection ===
          "draw" ||
        selection ===
          "away"
      )
    ) {
      targets.push({
        market:
          "1x2",

        selection,
      });
    }
  }

  /*
   * Goals/BTTS:
   *
   * Only qualifiedRecommendations are
   * actual recommendations.
   *
   * lean and no_pick market decisions
   * remain analysis-only.
   */
  const recommendations =
    output
      .qualifiedRecommendations;

  if (
    recommendations !==
      undefined &&
    !Array.isArray(
      recommendations,
    )
  ) {
    throw new Error(
      "qualifiedRecommendations must be an array.",
    );
  }

  if (
    Array.isArray(
      recommendations,
    )
  ) {
    for (
      const raw
      of recommendations
    ) {
      if (
        !isRecord(
          raw,
        )
      ) {
        throw new Error(
          "Qualified recommendation must be an object.",
        );
      }

      if (
        raw.status !==
        "qualified"
      ) {
        throw new Error(
          "Only qualified recommendations may appear in qualifiedRecommendations.",
        );
      }

      if (
        !supportedMarket(
          raw.market,
        ) ||
        raw.market ===
          "1x2"
      ) {
        throw new Error(
          `Unsupported qualified market: ${String(
            raw.market,
          )}`,
        );
      }

      const selection =
        nonEmptyString(
          raw.selection,
        );

      if (
        selection ===
        null
      ) {
        throw new Error(
          "Qualified recommendation selection must not be empty.",
        );
      }

      targets.push({
        market:
          raw.market,

        selection,
      });
    }
  }

  /*
   * Protect settlement identity from
   * accidental duplicate recommendations.
   */
  const unique =
    new Map<
      string,
      SettlementTargetV02
    >();

  for (
    const target
    of targets
  ) {
    const key =
      `${target.market}:${target.selection}`;

    if (
      unique.has(
        key,
      )
    ) {
      throw new Error(
        `Duplicate settlement target: ${key}`,
      );
    }

    unique.set(
      key,
      target,
    );
  }

  return [
    ...unique.values(),
  ];
}
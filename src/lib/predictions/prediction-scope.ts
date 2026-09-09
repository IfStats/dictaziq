import type {
  NormalizedApiFootballFixture,
} from "../../providers/api-football/types";

export const PREDICTION_SCOPE_VERSION =
  "dictaziq-prediction-scope-v0.1" as const;

export type PredictionScopeExclusionReason =
  | "youth"
  | "women"
  | "reserve"
  | "academy";

export type PredictionScopeDecision = {
  version:
    typeof PREDICTION_SCOPE_VERSION;

  eligible: boolean;

  reason:
    | PredictionScopeExclusionReason
    | null;
};

/*
 * DictazIQ Core v1 prediction population:
 *
 * - senior men's first-team football only
 *
 * Explicitly excluded for now:
 *
 * - youth football
 * - women's football
 * - reserve / B / II teams
 * - academy teams
 *
 * These exclusions are model-population boundaries,
 * not statements about whether DictazIQ may support
 * these categories in future dedicated models.
 */

function normalize(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function isYouth(
  value: string,
): boolean {
  const text =
    normalize(value);

  /*
   * Common team/competition forms:
   *
   * U17
   * U-17
   * U 17
   * U19
   * U20
   * U21
   * U23
   * Under 19
   * Under-19
   * Youth League
   */
  return (
    /\bu[\s-]?(?:15|16|17|18|19|20|21|22|23)\b/i.test(
      text,
    ) ||
    /\bunder[\s-]?(?:15|16|17|18|19|20|21|22|23)\b/i.test(
      text,
    ) ||
    /\byouth\b/i.test(
      text,
    )
  );
}

function isWomen(
  value: string,
): boolean {
  const text =
    normalize(value);

  /*
   * Competition-level markers are the strongest
   * source for women's fixtures.
   *
   * Team names ending in W are also common in
   * API-Football.
   */
  return (
    /\bwomen\b/i.test(
      text,
    ) ||
    /\bwomen'?s\b/i.test(
      text,
    ) ||
    /\bfeminine\b/i.test(
      text,
    ) ||
    /\bfemenin[ao]\b/i.test(
      text,
    ) ||
    /\bfeminino\b/i.test(
      text,
    ) ||
    /\sf$/i.test(
      text,
    ) ||
    /\sw$/i.test(
      text,
    )
  );
}

function isReserve(
  value: string,
): boolean {
  const text =
    normalize(value);

  /*
   * Reserve-team forms observed across providers:
   *
   * Banfield Res.
   * Reserve League
   * Dinamo Tbilisi II
   * Houston Dynamo FC II
   * Team 2
   *
   * Do not match arbitrary Roman numerals or numbers
   * in the middle of a club name.
   */
  return (
    /\breserve\b/i.test(
      text,
    ) ||
    /\bres\.$/i.test(
      text,
    ) ||
    /\bres$/i.test(
      text,
    ) ||
    /\bii$/i.test(
      text,
    ) ||
    /\b2$/i.test(
      text,
    )
  );
}

function isAcademy(
  value: string,
): boolean {
  const text =
    normalize(value);

  return (
    /\bacademy\b/i.test(
      text,
    ) ||
    /\bakademiya\b/i.test(
      text,
    ) ||
    /\bakademija\b/i.test(
      text,
    )
  );
}

function classifyText(
  value: string,
):
  | PredictionScopeExclusionReason
  | null {
  /*
   * Order matters.
   *
   * A women's U20 fixture should be classified
   * as youth first because both characteristics
   * place it outside the current population.
   *
   * We only need one deterministic exclusion
   * reason for filtering/auditing.
   */

  if (
    isYouth(value)
  ) {
    return "youth";
  }

  if (
    isWomen(value)
  ) {
    return "women";
  }

  if (
    isReserve(value)
  ) {
    return "reserve";
  }

  if (
    isAcademy(value)
  ) {
    return "academy";
  }

  return null;
}

export function evaluatePredictionScope(
  fixture:
    NormalizedApiFootballFixture,
): PredictionScopeDecision {
  /*
   * Inspect both competition identity and team
   * identities.
   *
   * A fixture is excluded if any one of these
   * values proves it belongs outside the current
   * senior men's first-team model population.
   */
  const values = [
    fixture.league.name,

    fixture.league.round ??
      "",

    fixture.home.name,

    fixture.away.name,
  ];

  for (
    const value
    of values
  ) {
    const reason =
      classifyText(
        value,
      );

    if (
      reason !== null
    ) {
      return {
        version:
          PREDICTION_SCOPE_VERSION,

        eligible:
          false,

        reason,
      };
    }
  }

  return {
    version:
      PREDICTION_SCOPE_VERSION,

    eligible:
      true,

    reason:
      null,
  };
}
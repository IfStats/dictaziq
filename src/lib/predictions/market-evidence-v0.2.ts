export type { TeamStatWindow } from "./market-evidence";

import {
  MARKET_EVIDENCE_VERSION,
  validateMarketEvidenceSnapshot,
  type MarketEvidenceRelevance,
  type MarketEvidenceSnapshot,
  type VerifiedMarketFactor,
} from "./market-evidence";

export const MARKET_EVIDENCE_VERSION_V02 =
  "dictaziq-market-evidence-v0.2" as const;

export type MarketEffectDirection =
  | "supports"
  | "suppresses"
  | "neutral";

export type MarketFactorEffect = {
  market: MarketEvidenceRelevance;
  direction: MarketEffectDirection;
};

export type VerifiedMarketFactorV02 =
  Omit<
    VerifiedMarketFactor,
    "relevantTo"
  > & {
    effects:
      MarketFactorEffect[];
  };

export type MarketEvidenceSnapshotV02 =
  Omit<
    MarketEvidenceSnapshot,
    | "evidenceVersion"
    | "verifiedFactors"
  > & {
    evidenceVersion:
      typeof MARKET_EVIDENCE_VERSION_V02;

    verifiedFactors:
      VerifiedMarketFactorV02[];
  };

export function validateMarketEvidenceSnapshotV02(
  input:
    MarketEvidenceSnapshotV02,
): MarketEvidenceSnapshotV02 {
  if (
    input.evidenceVersion !==
    MARKET_EVIDENCE_VERSION_V02
  ) {
    throw new Error(
      "Unsupported market evidence v0.2 version.",
    );
  }

  for (
    const factor
    of input.verifiedFactors
  ) {
    if (
      factor.effects.length ===
      0
    ) {
      throw new Error(
        "Verified market factors must contain at least one market effect.",
      );
    }

    const markets =
      factor.effects.map(
        (effect) =>
          effect.market,
      );

    if (
      new Set(markets).size !==
      markets.length
    ) {
      throw new Error(
        "A verified factor cannot define multiple effects for the same market.",
      );
    }
  }

  /*
   * Reuse all v0.1 temporal, sample,
   * identity and leakage guards.
   */
  validateMarketEvidenceSnapshot({
    ...input,

    evidenceVersion:
      MARKET_EVIDENCE_VERSION,

    verifiedFactors:
      input.verifiedFactors.map(
        (factor) => ({
          kind:
            factor.kind,

          side:
            factor.side,

          relevantTo:
            factor.effects.map(
              (effect) =>
                effect.market,
            ),

          description:
            factor.description,

          source:
            factor.source,

          sourceEvidenceId:
            factor.sourceEvidenceId,

          observedAt:
            factor.observedAt,
        }),
      ),
  });

  return input;
}
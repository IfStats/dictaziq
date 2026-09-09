import type {
  MarketEvidenceSnapshotV02,
} from "./market-evidence-v0.2";

import {
  evaluateGoalsAndBtts,
  type EvidenceDecision,
  type GoalsSelection,
  type BttsSelection,
  type GoalsBttsAnalysisResult,
} from "./goals-btts-engine";

export const GOALS_BTTS_ENGINE_VERSION_V02 =
  "dictaziq-goals-btts-v0.2" as const;

export type GoalsBttsAnalysisResultV02 =
  Omit<
    GoalsBttsAnalysisResult,
    "engineVersion"
  > & {
    engineVersion:
      typeof GOALS_BTTS_ENGINE_VERSION_V02;
  };

function rate(
  count: number,
  matches: number,
): number {
  return count / matches;
}

function noPick<T>(
  decision:
    EvidenceDecision<T>,
  reason: string,
): EvidenceDecision<T> {
  return {
    ...decision,

    status:
      "no_pick",

    selection:
      null as T,

    opposingSignals: [
      ...decision.opposingSignals,
      reason,
    ],
  };
}

function lean<T>(
  decision:
    EvidenceDecision<T>,
  reason: string,
): EvidenceDecision<T> {
  if (
    decision.selection ===
    null
  ) {
    return decision;
  }

  return {
    ...decision,

    status:
      "lean",

    opposingSignals: [
      ...decision.opposingSignals,
      reason,
    ],
  };
}

function refineGoals25(
  evidence:
    MarketEvidenceSnapshotV02,

  decision:
    EvidenceDecision<
      GoalsSelection
    >,
): EvidenceDecision<
  GoalsSelection
> {
  if (
    decision.selection ===
    null
  ) {
    return decision;
  }

  const homeRate =
    rate(
      evidence.home.recent
        .over25Matches,

      evidence.home.recent
        .matches,
    );

  const awayRate =
    rate(
      evidence.away.recent
        .over25Matches,

      evidence.away.recent
        .matches,
    );

  const minimum =
    Math.min(
      homeRate,
      awayRate,
    );

  const maximum =
    Math.max(
      homeRate,
      awayRate,
    );

  if (
    decision.selection ===
    "over"
  ) {
    /*
     * QUALIFIED OVER:
     *
     * Both teams must independently show
     * an Over 2.5 profile of at least 60%.
     *
     * This prevents one explosive team from
     * overwhelming a clearly low-scoring
     * opponent profile.
     */
    if (
      minimum >= 0.6
    ) {
      return decision;
    }

    /*
     * Mixed but not contradictory:
     * one side >= 60%, the other >= 40%.
     */
    if (
      minimum >= 0.4 &&
      maximum >= 0.6
    ) {
      return lean(
        decision,

        "v0.2 consensus guard: one team is below the 60% recent Over 2.5 qualification threshold.",
      );
    }

    return noPick(
      decision,

      "v0.2 consensus guard: one team has a recent Over 2.5 rate below 40%.",
    );
  }

  /*
   * Under 2.5 uses the inverse consensus.
   */
  if (
    decision.selection ===
    "under"
  ) {
    if (
      maximum <= 0.4
    ) {
      return decision;
    }

    if (
      minimum <= 0.4 &&
      maximum <= 0.6
    ) {
      return lean(
        decision,

        "v0.2 consensus guard: both teams do not independently satisfy the Under 2.5 qualification threshold.",
      );
    }

    return noPick(
      decision,

      "v0.2 consensus guard: one team's recent goal profile materially contradicts Under 2.5.",
    );
  }

  return decision;
}

function refineBtts(
  evidence:
    MarketEvidenceSnapshotV02,

  decision:
    EvidenceDecision<
      BttsSelection
    >,
): EvidenceDecision<
  BttsSelection
> {
  if (
    decision.selection ===
    null
  ) {
    return decision;
  }

  const homeRate =
    rate(
      evidence.home.recent
        .bttsMatches,

      evidence.home.recent
        .matches,
    );

  const awayRate =
    rate(
      evidence.away.recent
        .bttsMatches,

      evidence.away.recent
        .matches,
    );

  const minimum =
    Math.min(
      homeRate,
      awayRate,
    );

  const maximum =
    Math.max(
      homeRate,
      awayRate,
    );

  if (
    decision.selection ===
    "yes"
  ) {
    /*
     * Qualified BTTS Yes requires actual
     * recent BTTS support from BOTH teams.
     */
    if (
      minimum >= 0.6
    ) {
      return decision;
    }

    /*
     * 40%-59% on one side is mixed evidence:
     * retain the directional idea only as LEAN.
     */
    if (
      minimum >= 0.4 &&
      maximum >= 0.6
    ) {
      return lean(
        decision,

        "v0.2 BTTS consensus guard: one team's recent BTTS rate is below 60%.",
      );
    }

    return noPick(
      decision,

      "v0.2 BTTS consensus guard: one team's recent BTTS profile is below 40%.",
    );
  }

  if (
    decision.selection ===
    "no"
  ) {
    if (
      maximum <= 0.4
    ) {
      return decision;
    }

    if (
      minimum <= 0.4 &&
      maximum <= 0.6
    ) {
      return lean(
        decision,

        "v0.2 BTTS consensus guard: one team's recent BTTS rate does not fully support BTTS No.",
      );
    }

    return noPick(
      decision,

      "v0.2 BTTS consensus guard: one team's recent BTTS profile contradicts BTTS No.",
    );
  }

  return decision;
}

export function evaluateGoalsAndBttsV02(
  input: {
    evidence:
      MarketEvidenceSnapshotV02;

    ratingMismatchCandidate:
      boolean;
  },
): GoalsBttsAnalysisResultV02 {
  /*
   * v0.1 remains the signal-generation engine.
   *
   * v0.2 adds cross-team consensus before
   * allowing strong market qualification.
   */
  const base =
    evaluateGoalsAndBtts(
      input,
    );

  return {
    ...base,

    engineVersion:
      GOALS_BTTS_ENGINE_VERSION_V02,

    goals25:
      refineGoals25(
        input.evidence,
        base.goals25,
      ),

    btts:
      refineBtts(
        input.evidence,
        base.btts,
      ),
  };
}
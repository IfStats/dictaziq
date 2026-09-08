export const SETTLEMENT_RULES_VERSION =
  "football-settlement-v0.1" as const;

export type SettlementOutcome =
  | "won"
  | "lost"
  | "void";

export type SupportedMarket =
  | "1x2"
  | "btts"
  | "goals_1.5"
  | "goals_2.5"
  | "goals_3.5";

export type SettlementInput = {
  market: SupportedMarket;
  selection: string;
  regulationHomeScore: number;
  regulationAwayScore: number;
};

export type SettlementResult = {
  rulesVersion: typeof SETTLEMENT_RULES_VERSION;
  market: SupportedMarket;
  selection: string;
  outcome: SettlementOutcome;
};

function assertScore(
  value: number,
  label: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} score must be a non-negative integer.`,
    );
  }
}

function settle1x2(
  selection: string,
  home: number,
  away: number,
): SettlementOutcome {
  if (
    selection !== "home" &&
    selection !== "draw" &&
    selection !== "away"
  ) {
    throw new Error(
      `Unsupported 1x2 selection: ${selection}`,
    );
  }

  const actual =
    home > away
      ? "home"
      : home < away
        ? "away"
        : "draw";

  return selection === actual
    ? "won"
    : "lost";
}

function settleBtts(
  selection: string,
  home: number,
  away: number,
): SettlementOutcome {
  if (
    selection !== "yes" &&
    selection !== "no"
  ) {
    throw new Error(
      `Unsupported BTTS selection: ${selection}`,
    );
  }

  const actual =
    home > 0 && away > 0
      ? "yes"
      : "no";

  return selection === actual
    ? "won"
    : "lost";
}

function settleGoals(
  market: SupportedMarket,
  selection: string,
  home: number,
  away: number,
): SettlementOutcome {
  if (
    selection !== "over" &&
    selection !== "under"
  ) {
    throw new Error(
      `Unsupported goals selection: ${selection}`,
    );
  }

  const lineText =
    market.replace("goals_", "");

  const line = Number(lineText);

  if (
    !Number.isFinite(line) ||
    ![1.5, 2.5, 3.5].includes(line)
  ) {
    throw new Error(
      `Unsupported goals market: ${market}`,
    );
  }

  const totalGoals = home + away;

  const actual =
    totalGoals > line
      ? "over"
      : "under";

  return selection === actual
    ? "won"
    : "lost";
}

export function settleFootballSelection(
  input: SettlementInput,
): SettlementResult {
  assertScore(
    input.regulationHomeScore,
    "Home",
  );

  assertScore(
    input.regulationAwayScore,
    "Away",
  );

  const {
    market,
    selection,
    regulationHomeScore: home,
    regulationAwayScore: away,
  } = input;

  let outcome: SettlementOutcome;

  switch (market) {
    case "1x2":
      outcome = settle1x2(
        selection,
        home,
        away,
      );
      break;

    case "btts":
      outcome = settleBtts(
        selection,
        home,
        away,
      );
      break;

    case "goals_1.5":
    case "goals_2.5":
    case "goals_3.5":
      outcome = settleGoals(
        market,
        selection,
        home,
        away,
      );
      break;

    default: {
      const exhaustive: never = market;

      throw new Error(
        `Unsupported market: ${String(exhaustive)}`,
      );
    }
  }

  return {
    rulesVersion:
      SETTLEMENT_RULES_VERSION,

    market,
    selection,
    outcome,
  };
}
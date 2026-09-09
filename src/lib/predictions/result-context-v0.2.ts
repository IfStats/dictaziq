export const RESULT_CONTEXT_VERSION_V02 =
  "dictaziq-result-context-v0.2" as const;

export type FormRecord = {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
};

export type ResultContextInputV02 = {
  ratingGap: number;

  home: {
    recent: FormRecord;
    venue: FormRecord | null;
    restDays: number | null;
  };

  away: {
    recent: FormRecord;
    venue: FormRecord | null;
    restDays: number | null;
  };
};

export type ResultContextSide =
  | "home"
  | "away"
  | "neutral";

export type ResultContextSignal = {
  kind:
    | "recent_form"
    | "home_away_form"
    | "rest_schedule";

  side:
    ResultContextSide;

  homeValue: number | null;
  awayValue: number | null;

  description: string;
};

function validateRecord(
  record: FormRecord,
  label: string,
): void {
  const values = [
    record.matches,
    record.wins,
    record.draws,
    record.losses,
  ];

  for (const value of values) {
    if (
      !Number.isInteger(value) ||
      value < 0
    ) {
      throw new Error(
        `${label} values must be non-negative integers.`,
      );
    }
  }

  if (
    record.matches !==
    record.wins +
      record.draws +
      record.losses
  ) {
    throw new Error(
      `${label} W/D/L must equal matches.`,
    );
  }

  if (record.matches < 1) {
    throw new Error(
      `${label} requires at least one match.`,
    );
  }
}

function pointsPerGame(
  record: FormRecord,
): number {
  return (
    record.wins * 3 +
    record.draws
  ) / record.matches;
}

function sideFromDifference(
  difference: number,
  threshold: number,
): ResultContextSide {
  if (difference >= threshold) {
    return "home";
  }

  if (difference <= -threshold) {
    return "away";
  }

  return "neutral";
}

export function evaluateResultContextV02(
  input: ResultContextInputV02,
) {
  const absoluteGap =
    Math.abs(
      input.ratingGap,
    );

  if (
    !Number.isInteger(
      input.ratingGap,
    ) ||
    absoluteGap < 5 ||
    absoluteGap > 49
  ) {
    throw new Error(
      "Result context v0.2 applies only to absolute rating gaps from 5 through 49.",
    );
  }

  validateRecord(
    input.home.recent,
    "Home recent form",
  );

  validateRecord(
    input.away.recent,
    "Away recent form",
  );

  const signals:
    ResultContextSignal[] = [];

  const homeRecentPpg =
    pointsPerGame(
      input.home.recent,
    );

  const awayRecentPpg =
    pointsPerGame(
      input.away.recent,
    );

  const recentDifference =
    homeRecentPpg -
    awayRecentPpg;

  signals.push({
    kind:
      "recent_form",

    side:
      sideFromDifference(
        recentDifference,
        0.6,
      ),

    homeValue:
      homeRecentPpg,

    awayValue:
      awayRecentPpg,

    description:
      `Recent PPG: home=${homeRecentPpg.toFixed(
        2,
      )}, away=${awayRecentPpg.toFixed(
        2,
      )}.`,
  });

  if (
    input.home.venue &&
    input.away.venue
  ) {
    validateRecord(
      input.home.venue,
      "Home venue form",
    );

    validateRecord(
      input.away.venue,
      "Away venue form",
    );

    const homeVenuePpg =
      pointsPerGame(
        input.home.venue,
      );

    const awayVenuePpg =
      pointsPerGame(
        input.away.venue,
      );

    signals.push({
      kind:
        "home_away_form",

      side:
        sideFromDifference(
          homeVenuePpg -
            awayVenuePpg,
          0.6,
        ),

      homeValue:
        homeVenuePpg,

      awayValue:
        awayVenuePpg,

      description:
        `Venue PPG: home-home=${homeVenuePpg.toFixed(
          2,
        )}, away-away=${awayVenuePpg.toFixed(
          2,
        )}.`,
    });
  }

  if (
    input.home.restDays !==
      null &&
    input.away.restDays !==
      null
  ) {
    if (
      input.home.restDays < 0 ||
      input.away.restDays < 0
    ) {
      throw new Error(
        "Rest days cannot be negative.",
      );
    }

    const restDifference =
      input.home.restDays -
      input.away.restDays;

    signals.push({
      kind:
        "rest_schedule",

      side:
        sideFromDifference(
          restDifference,
          2,
        ),

      homeValue:
        input.home.restDays,

      awayValue:
        input.away.restDays,

      description:
        `Rest days: home=${input.home.restDays}, away=${input.away.restDays}.`,
    });
  }

  const recent =
    signals.find(
      (signal) =>
        signal.kind ===
        "recent_form",
    );

  const venue =
    signals.find(
      (signal) =>
        signal.kind ===
        "home_away_form",
    );

  const rest =
    signals.find(
      (signal) =>
        signal.kind ===
        "rest_schedule",
    );

  /*
   * Conservative rule:
   *
   * Recent form AND venue form must agree.
   *
   * Rest may agree or be neutral.
   * If rest materially opposes them, abstain.
   *
   * This prevents three correlated statistics
   * from becoming three artificial votes.
   */
  let selection:
    "home" |
    "away" |
    null =
      null;

  if (
    recent &&
    venue &&
    recent.side !==
      "neutral" &&
    recent.side ===
      venue.side
  ) {
    const agreedSide =
      recent.side;

    const restOpposes =
      rest &&
      rest.side !==
        "neutral" &&
      rest.side !==
        agreedSide;

    if (!restOpposes) {
      selection =
        agreedSide;
    }
  }

  return {
    version:
      RESULT_CONTEXT_VERSION_V02,

    validationStatus:
      "experimental" as const,

    ratingGap:
      input.ratingGap,

    absoluteGap,

    signals,

    selection,

    status:
      selection === null
        ? "no_pick"
        : "context_lean",

    calibratedProbability:
      null,
  };
}
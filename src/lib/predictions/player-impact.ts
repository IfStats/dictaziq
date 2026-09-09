export const PLAYER_IMPACT_VERSION =
  "dictaziq-player-impact-v0.1" as const;

export type PlayerPositionGroup =
  | "goalkeeper"
  | "defender"
  | "midfielder"
  | "attacker"
  | "unknown";

export type SquadRole =
  | "core"
  | "rotation"
  | "fringe"
  | "unknown";

export type PlayerImpactTier =
  | "unassessed"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type PlayerImpactInput = {
  playerId:
    number | null;

  playerName:
    string;

  teamSide:
    | "home"
    | "away";

  positionGroup:
    PlayerPositionGroup;

  squadRole:
    SquadRole;

  /*
   * Share of recent matches started.
   * 0.0 through 1.0.
   */
  recentStartRate:
    number | null;

  /*
   * Share of available team minutes played.
   * 0.0 through 1.0.
   */
  recentMinutesShare:
    number | null;

  source:
    string;

  sourceEvidenceId:
    string;

  observedAt:
    string;

  cutoffAt:
    string;

  kickoffAt:
    string;
};

export type PlayerImpactResult = {
  version:
    typeof PLAYER_IMPACT_VERSION;

  validationStatus:
    "experimental";

  playerId:
    number | null;

  playerName:
    string;

  teamSide:
    | "home"
    | "away";

  positionGroup:
    PlayerPositionGroup;

  squadRole:
    SquadRole;

  recentStartRate:
    number | null;

  recentMinutesShare:
    number | null;

  impactTier:
    PlayerImpactTier;

  /*
   * Internal ordinal classification.
   *
   * This is NOT a probability and must not be
   * interpreted as goals, win chance or expected
   * points.
   */
  impactScore:
    0 | 1 | 2 | 3 | 4;

  assessed:
    boolean;

  source:
    string;

  sourceEvidenceId:
    string;

  observedAt:
    string;

  calibratedProbability:
    null;
};

function assertNonEmpty(
  value: string,
  label: string,
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    throw new Error(
      `${label} must not be empty.`,
    );
  }

  return trimmed;
}

function timestamp(
  value: string,
  label: string,
): number {
  const parsed =
    Date.parse(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`,
    );
  }

  return parsed;
}

function rate(
  value:
    number | null,
  label: string,
): number | null {
  if (
    value === null
  ) {
    return null;
  }

  if (
    !Number.isFinite(
      value,
    ) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      `${label} must be between 0 and 1.`,
    );
  }

  return value;
}

export function classifyPlayerImpact(
  input:
    PlayerImpactInput,
): PlayerImpactResult {
  const playerName =
    assertNonEmpty(
      input.playerName,
      "Player name",
    );

  const source =
    assertNonEmpty(
      input.source,
      "Impact source",
    );

  const sourceEvidenceId =
    assertNonEmpty(
      input.sourceEvidenceId,
      "Source evidence ID",
    );

  if (
    input.playerId !== null &&
    (
      !Number.isInteger(
        input.playerId,
      ) ||
      input.playerId <= 0
    )
  ) {
    throw new Error(
      "Player ID must be a positive integer or null.",
    );
  }

  const recentStartRate =
    rate(
      input.recentStartRate,
      "Recent start rate",
    );

  const recentMinutesShare =
    rate(
      input.recentMinutesShare,
      "Recent minutes share",
    );

  const observedAt =
    timestamp(
      input.observedAt,
      "Observation time",
    );

  const cutoffAt =
    timestamp(
      input.cutoffAt,
      "Impact cutoff",
    );

  const kickoffAt =
    timestamp(
      input.kickoffAt,
      "Fixture kickoff",
    );

  if (
    cutoffAt >=
    kickoffAt
  ) {
    throw new Error(
      "Impact cutoff must be before kickoff.",
    );
  }

  if (
    observedAt >
    cutoffAt
  ) {
    throw new Error(
      "Player-impact evidence observed after the cutoff cannot be used.",
    );
  }

  if (
    observedAt >=
    kickoffAt
  ) {
    throw new Error(
      "Post-kickoff player evidence cannot be used.",
    );
  }

  let impactTier:
    PlayerImpactTier =
      "unassessed";

  let impactScore:
    0 | 1 | 2 | 3 | 4 =
      0;

  /*
   * No usage evidence and no known squad role:
   * do not guess player importance.
   */
  if (
    input.squadRole ===
      "unknown" &&
    recentStartRate ===
      null &&
    recentMinutesShare ===
      null
  ) {
    impactTier =
      "unassessed";

    impactScore =
      0;
  }

  /*
   * Critical:
   * established core player with very high
   * recent starting and minute participation.
   */
  else if (
    input.squadRole ===
      "core" &&
    recentStartRate !==
      null &&
    recentMinutesShare !==
      null &&
    recentStartRate >=
      0.8 &&
    recentMinutesShare >=
      0.75
  ) {
    impactTier =
      "critical";

    impactScore =
      4;
  }

  /*
   * High:
   * strong evidence the player is regularly
   * relied upon.
   */
  else if (
    (
      input.squadRole ===
        "core" &&
      (
        (
          recentStartRate !==
            null &&
          recentStartRate >=
            0.6
        ) ||
        (
          recentMinutesShare !==
            null &&
          recentMinutesShare >=
            0.6
        )
      )
    ) ||
    (
      recentStartRate !==
        null &&
      recentStartRate >=
        0.75
    ) ||
    (
      recentMinutesShare !==
        null &&
      recentMinutesShare >=
        0.7
    )
  ) {
    impactTier =
      "high";

    impactScore =
      3;
  }

  /*
   * Medium:
   * meaningful rotation or regular involvement.
   */
  else if (
    input.squadRole ===
      "rotation" ||
    (
      recentStartRate !==
        null &&
      recentStartRate >=
        0.35
    ) ||
    (
      recentMinutesShare !==
        null &&
      recentMinutesShare >=
        0.35
    )
  ) {
    impactTier =
      "medium";

    impactScore =
      2;
  }

  /*
   * Known player with verified but comparatively
   * limited recent involvement.
   */
  else {
    impactTier =
      "low";

    impactScore =
      1;
  }

  return {
    version:
      PLAYER_IMPACT_VERSION,

    validationStatus:
      "experimental",

    playerId:
      input.playerId,

    playerName,

    teamSide:
      input.teamSide,

    positionGroup:
      input.positionGroup,

    squadRole:
      input.squadRole,

    recentStartRate,

    recentMinutesShare,

    impactTier,

    impactScore,

    assessed:
      impactTier !==
      "unassessed",

    source,

    sourceEvidenceId,

    observedAt:
      new Date(
        observedAt,
      ).toISOString(),

    calibratedProbability:
      null,
  };
}
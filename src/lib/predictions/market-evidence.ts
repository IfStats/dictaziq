export const MARKET_EVIDENCE_VERSION =
  "dictaziq-market-evidence-v0.1" as const;

export type MarketEvidenceSide =
  | "home"
  | "away"
  | "neutral";

export type MarketEvidenceScope =
  | "recent"
  | "home"
  | "away";

export type MarketEvidenceKind =
  | "squad_availability"
  | "expected_lineup"
  | "confirmed_lineup"
  | "tactical_matchup"
  | "rest_schedule"
  | "match_importance"
  | "competition_context"
  | "opponent_quality"
  | "weather"
  | "other_verified";

export type MarketEvidenceRelevance =
  | "result"
  | "goals"
  | "btts"
  | "team_totals"
  | "corners";

export type TeamStatWindow = {
  scope: MarketEvidenceScope;

  /*
   * Exact provider fixture identities used to
   * calculate this statistical window.
   */
  sourceFixtureIds: string[];

  matches: number;

  goalsFor: number;
  goalsAgainst: number;

  scoredMatches: number;
  concededMatches: number;

  cleanSheets: number;
  failedToScore: number;

  bttsMatches: number;

  over15Matches: number;
  over25Matches: number;
  over35Matches: number;

  /*
   * Advanced statistics may be unavailable from
   * some providers. Missing data remains null.
   */
  xgFor: number | null;
  xgAgainst: number | null;

  shotsFor: number | null;
  shotsAgainst: number | null;

  shotsOnTargetFor: number | null;
  shotsOnTargetAgainst: number | null;

  source: string;

  observedAt: string;
};

export type VerifiedMarketFactor = {
  kind: MarketEvidenceKind;

  side: MarketEvidenceSide;

  /*
   * A factor may matter to more than one market.
   *
   * Example:
   * a missing striker can matter to goals,
   * BTTS and team totals simultaneously.
   */
  relevantTo:
    MarketEvidenceRelevance[];

  description: string;

  source: string;

  sourceEvidenceId:
    string | null;

  observedAt: string;
};

export type TeamMarketEvidence = {
  teamId: string;

  teamName: string;

  side:
    | "home"
    | "away";

  /*
   * General recent form window.
   */
  recent:
    TeamStatWindow;

  /*
   * Venue-specific window:
   *
   * home team -> home matches
   * away team -> away matches
   *
   * Null is preferable to fabricated data.
   */
  venue:
    TeamStatWindow | null;
};

export type MarketEvidenceSnapshot = {
  evidenceVersion:
    typeof MARKET_EVIDENCE_VERSION;

  fixtureId: string;

  cutoffAt: string;

  kickoffAt: string;

  home:
    TeamMarketEvidence;

  away:
    TeamMarketEvidence;

  verifiedFactors:
    VerifiedMarketFactor[];
};

function assertNonEmpty(
  value: string,
  label: string,
): void {
  if (!value.trim()) {
    throw new Error(
      `${label} must not be empty.`,
    );
  }
}

function timestamp(
  value: string,
  label: string,
): number {
  const result =
    Date.parse(value);

  if (
    !Number.isFinite(result)
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`,
    );
  }

  return result;
}

function assertCount(
  value: number,
  label: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} must be a non-negative integer.`,
    );
  }
}

function assertOptionalMetric(
  value: number | null,
  label: string,
): void {
  if (value === null) {
    return;
  }

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} must be null or a non-negative finite number.`,
    );
  }
}

function validateStatWindow(
  input: TeamStatWindow,
  expectedScope:
    MarketEvidenceScope,
  cutoff: number,
  kickoff: number,
): void {
  if (
    input.scope !==
    expectedScope
  ) {
    throw new Error(
      `Expected ${expectedScope} statistical scope but received ${input.scope}.`,
    );
  }

  assertNonEmpty(
    input.source,
    "Statistical source",
  );

  assertCount(
    input.matches,
    "Matches",
  );

  if (
    input.matches < 1
  ) {
    throw new Error(
      "Statistical windows must contain at least one match.",
    );
  }

  if (
    input.sourceFixtureIds.length !==
    input.matches
  ) {
    throw new Error(
      "Statistical window fixture IDs must exactly match the sample size.",
    );
  }

  const uniqueFixtureIds =
    new Set(
      input.sourceFixtureIds.map(
        (id) => {
          assertNonEmpty(
            id,
            "Source fixture ID",
          );

          return id.trim();
        },
      ),
    );

  if (
    uniqueFixtureIds.size !==
    input.sourceFixtureIds.length
  ) {
    throw new Error(
      "Statistical windows cannot contain duplicate fixture IDs.",
    );
  }

  assertCount(
    input.goalsFor,
    "Goals for",
  );

  assertCount(
    input.goalsAgainst,
    "Goals against",
  );

  const matchCounts: Array<
    [string, number]
  > = [
    [
      "Scored matches",
      input.scoredMatches,
    ],

    [
      "Conceded matches",
      input.concededMatches,
    ],

    [
      "Clean sheets",
      input.cleanSheets,
    ],

    [
      "Failed to score",
      input.failedToScore,
    ],

    [
      "BTTS matches",
      input.bttsMatches,
    ],

    [
      "Over 1.5 matches",
      input.over15Matches,
    ],

    [
      "Over 2.5 matches",
      input.over25Matches,
    ],

    [
      "Over 3.5 matches",
      input.over35Matches,
    ],
  ];

  for (
    const [
      label,
      value,
    ]
    of matchCounts
  ) {
    assertCount(
      value,
      label,
    );

    if (
      value >
      input.matches
    ) {
      throw new Error(
        `${label} cannot exceed the statistical sample size.`,
      );
    }
  }

  assertOptionalMetric(
    input.xgFor,
    "xG for",
  );

  assertOptionalMetric(
    input.xgAgainst,
    "xG against",
  );

  assertOptionalMetric(
    input.shotsFor,
    "Shots for",
  );

  assertOptionalMetric(
    input.shotsAgainst,
    "Shots against",
  );

  assertOptionalMetric(
    input.shotsOnTargetFor,
    "Shots on target for",
  );

  assertOptionalMetric(
    input.shotsOnTargetAgainst,
    "Shots on target against",
  );

  const observed =
    timestamp(
      input.observedAt,
      "Statistical observation time",
    );

  if (
    observed > cutoff
  ) {
    throw new Error(
      "Statistical evidence observed after the prediction cutoff cannot be used.",
    );
  }

  if (
    observed >= kickoff
  ) {
    throw new Error(
      "Post-kickoff statistical evidence cannot be used.",
    );
  }
}

export function validateMarketEvidenceSnapshot(
  input:
    MarketEvidenceSnapshot,
): MarketEvidenceSnapshot {
  if (
    input.evidenceVersion !==
    MARKET_EVIDENCE_VERSION
  ) {
    throw new Error(
      "Unsupported market evidence version.",
    );
  }

  assertNonEmpty(
    input.fixtureId,
    "Fixture ID",
  );

  assertNonEmpty(
    input.home.teamId,
    "Home team ID",
  );

  assertNonEmpty(
    input.away.teamId,
    "Away team ID",
  );

  assertNonEmpty(
    input.home.teamName,
    "Home team name",
  );

  assertNonEmpty(
    input.away.teamName,
    "Away team name",
  );

  if (
    input.home.teamId ===
    input.away.teamId
  ) {
    throw new Error(
      "Home and away teams must be different.",
    );
  }

  if (
    input.home.side !==
    "home"
  ) {
    throw new Error(
      "Home evidence must use side=home.",
    );
  }

  if (
    input.away.side !==
    "away"
  ) {
    throw new Error(
      "Away evidence must use side=away.",
    );
  }

  const cutoff =
    timestamp(
      input.cutoffAt,
      "Evidence cutoff",
    );

  const kickoff =
    timestamp(
      input.kickoffAt,
      "Fixture kickoff",
    );

  if (
    cutoff >= kickoff
  ) {
    throw new Error(
      "Market evidence cutoff must be before kickoff.",
    );
  }

  validateStatWindow(
    input.home.recent,
    "recent",
    cutoff,
    kickoff,
  );

  validateStatWindow(
    input.away.recent,
    "recent",
    cutoff,
    kickoff,
  );

  if (
    input.home.venue
  ) {
    validateStatWindow(
      input.home.venue,
      "home",
      cutoff,
      kickoff,
    );
  }

  if (
    input.away.venue
  ) {
    validateStatWindow(
      input.away.venue,
      "away",
      cutoff,
      kickoff,
    );
  }

  const factorIdentities =
    new Set<string>();

  for (
    const factor
    of input.verifiedFactors
  ) {
    assertNonEmpty(
      factor.description,
      "Market factor description",
    );

    assertNonEmpty(
      factor.source,
      "Market factor source",
    );

    if (
      factor.relevantTo.length ===
      0
    ) {
      throw new Error(
        "Verified market factors must identify at least one relevant market.",
      );
    }

    if (
      new Set(
        factor.relevantTo,
      ).size !==
      factor.relevantTo.length
    ) {
      throw new Error(
        "Verified market factor relevance cannot contain duplicates.",
      );
    }

    const observed =
      timestamp(
        factor.observedAt,
        "Market factor observation time",
      );

    if (
      observed > cutoff
    ) {
      throw new Error(
        "Market factor observed after the prediction cutoff cannot be used.",
      );
    }

    if (
      observed >= kickoff
    ) {
      throw new Error(
        "Post-kickoff market factors cannot be used.",
      );
    }

    const identity = [
      factor.kind,
      factor.side,
      factor.source
        .trim()
        .toLowerCase(),
      factor.description
        .trim()
        .toLowerCase(),
    ].join("|");

    if (
      factorIdentities.has(
        identity,
      )
    ) {
      throw new Error(
        "Duplicate verified market evidence is not allowed.",
      );
    }

    factorIdentities.add(
      identity,
    );
  }

  return input;
}
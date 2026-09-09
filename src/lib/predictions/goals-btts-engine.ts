import {
  validateMarketEvidenceSnapshotV02,
  type MarketEvidenceSnapshotV02,
  type MarketFactorEffect,
  type TeamStatWindow,
} from "./market-evidence-v0.2";

export const GOALS_BTTS_ENGINE_VERSION =
  "dictaziq-goals-btts-v0.1" as const;

export type MarketDecisionStatus =
  | "qualified"
  | "lean"
  | "no_pick";

export type GoalsSelection =
  | "over"
  | "under"
  | null;

export type BttsSelection =
  | "yes"
  | "no"
  | null;

export type EvidenceDecision<
  TSelection,
> = {
  status:
    MarketDecisionStatus;

  selection:
    TSelection;

  supportingSignals:
    string[];

  opposingSignals:
    string[];

  calibratedProbability:
    null;
};

export type GoalsBttsAnalysisInput = {
  evidence:
    MarketEvidenceSnapshotV02;

  /*
   * Comes from rating-gap v0.2.
   *
   * This may SUPPORT O2.5 analysis,
   * but cannot independently create
   * an O2.5 selection.
   */
  ratingMismatchCandidate:
    boolean;
};

export type GoalsBttsAnalysisResult = {
  engineVersion:
    typeof GOALS_BTTS_ENGINE_VERSION;

  validationStatus:
    "experimental";

  fixtureId:
    string;

  sampleAdequate:
    boolean;

  goals15:
    EvidenceDecision<
      GoalsSelection
    >;

  goals25:
    EvidenceDecision<
      GoalsSelection
    >;

  goals35:
    EvidenceDecision<
      GoalsSelection
    >;

  btts:
    EvidenceDecision<
      BttsSelection
    >;

  calibratedProbabilities:
    false;
};

function rate(
  count: number,
  matches: number,
): number {
  return count / matches;
}

function goalsPerMatch(
  window:
    TeamStatWindow,
): number {
  return (
    window.goalsFor +
    window.goalsAgainst
  ) / window.matches;
}

function averageFixtureGoals(
  evidence:
    MarketEvidenceSnapshotV02,
): number {
  return (
    goalsPerMatch(
      evidence.home.recent,
    ) +
    goalsPerMatch(
      evidence.away.recent,
    )
  ) / 2;
}

function averageXgTotal(
  evidence:
    MarketEvidenceSnapshotV02,
): number | null {
  const home =
    evidence.home.recent;

  const away =
    evidence.away.recent;

  if (
    home.xgFor === null ||
    home.xgAgainst === null ||
    away.xgFor === null ||
    away.xgAgainst === null
  ) {
    return null;
  }

  const expectedHome =
    (
      home.xgFor /
        home.matches +
      away.xgAgainst /
        away.matches
    ) / 2;

  const expectedAway =
    (
      away.xgFor /
        away.matches +
      home.xgAgainst /
        home.matches
    ) / 2;

  return (
    expectedHome +
    expectedAway
  );
}

function addSignal(
  condition: boolean,
  collection: string[],
  description: string,
): void {
  if (condition) {
    collection.push(
      description,
    );
  }
}

function applyFactorEffects(
  evidence:
    MarketEvidenceSnapshotV02,

  market:
    | "goals"
    | "btts",

  supportingSignals:
    string[],

  opposingSignals:
    string[],
): void {
  for (
    const factor
    of evidence.verifiedFactors
  ) {
    const effect:
      MarketFactorEffect | undefined =
      factor.effects.find(
        (candidate) =>
          candidate.market ===
          market,
      );

    if (!effect) {
      continue;
    }

    const description =
      `${factor.kind}: ${factor.description}`;

    if (
      effect.direction ===
      "supports"
    ) {
      supportingSignals.push(
        description,
      );
    } else if (
      effect.direction ===
      "suppresses"
    ) {
      opposingSignals.push(
        description,
      );
    }
  }
}

function resolveDecision<
  TPositive,
  TNegative,
>(
  positiveSelection:
    TPositive,

  negativeSelection:
    TNegative,

  support:
    string[],

  opposition:
    string[],

  qualifiedMinimum: number,

  leanMinimum: number,

  sampleAdequate: boolean,
): EvidenceDecision<
  | TPositive
  | TNegative
  | null
> {
  if (!sampleAdequate) {
    return {
      status:
        "no_pick",

      selection:
        null,

      supportingSignals:
        support,

      opposingSignals:
        opposition,

      calibratedProbability:
        null,
    };
  }

  const margin =
    support.length -
    opposition.length;

  if (
    support.length >=
      qualifiedMinimum &&
    margin >= 2
  ) {
    return {
      status:
        "qualified",

      selection:
        positiveSelection,

      supportingSignals:
        support,

      opposingSignals:
        opposition,

      calibratedProbability:
        null,
    };
  }

  if (
    opposition.length >=
      qualifiedMinimum &&
    margin <= -2
  ) {
    return {
      status:
        "qualified",

      selection:
        negativeSelection,

      supportingSignals:
        support,

      opposingSignals:
        opposition,

      calibratedProbability:
        null,
    };
  }

  if (
    support.length >=
      leanMinimum &&
    margin >= 2
  ) {
    return {
      status:
        "lean",

      selection:
        positiveSelection,

      supportingSignals:
        support,

      opposingSignals:
        opposition,

      calibratedProbability:
        null,
    };
  }

  if (
    opposition.length >=
      leanMinimum &&
    margin <= -2
  ) {
    return {
      status:
        "lean",

      selection:
        negativeSelection,

      supportingSignals:
        support,

      opposingSignals:
        opposition,

      calibratedProbability:
        null,
    };
  }

  return {
    status:
      "no_pick",

    selection:
      null,

    supportingSignals:
      support,

    opposingSignals:
      opposition,

    calibratedProbability:
      null,
  };
}

function venueRate(
  window:
    TeamStatWindow | null,
  key:
    | "over15Matches"
    | "over25Matches"
    | "over35Matches"
    | "bttsMatches",
): number | null {
  if (
    !window ||
    window.matches < 3
  ) {
    return null;
  }

  return rate(
    window[key],
    window.matches,
  );
}

function evaluateGoals15(
  evidence:
    MarketEvidenceSnapshotV02,

  sampleAdequate:
    boolean,
): EvidenceDecision<
  GoalsSelection
> {
  const support:
    string[] = [];

  const opposition:
    string[] = [];

  const home =
    evidence.home.recent;

  const away =
    evidence.away.recent;

  const homeRate =
    rate(
      home.over15Matches,
      home.matches,
    );

  const awayRate =
    rate(
      away.over15Matches,
      away.matches,
    );

  addSignal(
    homeRate >= 0.7,
    support,
    "Home recent Over 1.5 rate >= 70%.",
  );

  addSignal(
    awayRate >= 0.7,
    support,
    "Away recent Over 1.5 rate >= 70%.",
  );

  addSignal(
    homeRate <= 0.4,
    opposition,
    "Home recent Over 1.5 rate <= 40%.",
  );

  addSignal(
    awayRate <= 0.4,
    opposition,
    "Away recent Over 1.5 rate <= 40%.",
  );

  const averageGoals =
    averageFixtureGoals(
      evidence,
    );

  addSignal(
    averageGoals >= 2.4,
    support,
    "Combined recent match-goal profile >= 2.4.",
  );

  addSignal(
    averageGoals <= 1.8,
    opposition,
    "Combined recent match-goal profile <= 1.8.",
  );

  const homeVenue =
    venueRate(
      evidence.home.venue,
      "over15Matches",
    );

  const awayVenue =
    venueRate(
      evidence.away.venue,
      "over15Matches",
    );

  addSignal(
    homeVenue !== null &&
      homeVenue >= 0.67,
    support,
    "Home venue Over 1.5 profile >= 67%.",
  );

  addSignal(
    awayVenue !== null &&
      awayVenue >= 0.67,
    support,
    "Away venue Over 1.5 profile >= 67%.",
  );

  addSignal(
    homeVenue !== null &&
      homeVenue <= 0.33,
    opposition,
    "Home venue Over 1.5 profile <= 33%.",
  );

  addSignal(
    awayVenue !== null &&
      awayVenue <= 0.33,
    opposition,
    "Away venue Over 1.5 profile <= 33%.",
  );

  applyFactorEffects(
    evidence,
    "goals",
    support,
    opposition,
  );

  return resolveDecision(
    "over",
    "under",
    support,
    opposition,
    4,
    3,
    sampleAdequate,
  );
}

function evaluateGoals25(
  evidence:
    MarketEvidenceSnapshotV02,

  ratingMismatchCandidate:
    boolean,

  sampleAdequate:
    boolean,
): EvidenceDecision<
  GoalsSelection
> {
  const support:
    string[] = [];

  const opposition:
    string[] = [];

  const home =
    evidence.home.recent;

  const away =
    evidence.away.recent;

  const homeOver =
    rate(
      home.over25Matches,
      home.matches,
    );

  const awayOver =
    rate(
      away.over25Matches,
      away.matches,
    );

  const homeScoring =
    rate(
      home.scoredMatches,
      home.matches,
    );

  const awayScoring =
    rate(
      away.scoredMatches,
      away.matches,
    );

  const homeConceding =
    rate(
      home.concededMatches,
      home.matches,
    );

  const awayConceding =
    rate(
      away.concededMatches,
      away.matches,
    );

  addSignal(
    homeOver >= 0.6,
    support,
    "Home recent Over 2.5 rate >= 60%.",
  );

  addSignal(
    awayOver >= 0.6,
    support,
    "Away recent Over 2.5 rate >= 60%.",
  );

  addSignal(
    homeOver <= 0.4,
    opposition,
    "Home recent Over 2.5 rate <= 40%.",
  );

  addSignal(
    awayOver <= 0.4,
    opposition,
    "Away recent Over 2.5 rate <= 40%.",
  );

  addSignal(
    homeScoring >= 0.7 &&
      awayScoring >= 0.7,
    support,
    "Both teams score in at least 70% of recent matches.",
  );

  addSignal(
    homeConceding >= 0.6 &&
      awayConceding >= 0.6,
    support,
    "Both teams concede in at least 60% of recent matches.",
  );

  const averageGoals =
    averageFixtureGoals(
      evidence,
    );

  addSignal(
    averageGoals >= 2.8,
    support,
    "Combined recent match-goal profile >= 2.8.",
  );

  addSignal(
    averageGoals <= 2.2,
    opposition,
    "Combined recent match-goal profile <= 2.2.",
  );

  const homeVenue =
    venueRate(
      evidence.home.venue,
      "over25Matches",
    );

  const awayVenue =
    venueRate(
      evidence.away.venue,
      "over25Matches",
    );

  addSignal(
    homeVenue !== null &&
      homeVenue >= 0.6,
    support,
    "Home venue Over 2.5 profile >= 60%.",
  );

  addSignal(
    awayVenue !== null &&
      awayVenue >= 0.6,
    support,
    "Away venue Over 2.5 profile >= 60%.",
  );

  addSignal(
    homeVenue !== null &&
      homeVenue <= 0.4,
    opposition,
    "Home venue Over 2.5 profile <= 40%.",
  );

  addSignal(
    awayVenue !== null &&
      awayVenue <= 0.4,
    opposition,
    "Away venue Over 2.5 profile <= 40%.",
  );

  const xg =
    averageXgTotal(
      evidence,
    );

  addSignal(
    xg !== null &&
      xg >= 2.6,
    support,
    "Cross-adjusted recent xG profile >= 2.6.",
  );

  addSignal(
    xg !== null &&
      xg <= 2.1,
    opposition,
    "Cross-adjusted recent xG profile <= 2.1.",
  );

  /*
   * Rating mismatch only contributes when
   * BOTH teams satisfy a basic scoring test.
   *
   * Therefore a D >= 150 fixture involving
   * a non-scoring side cannot receive Over
   * 2.5 from the rating gap alone.
   */
  addSignal(
    ratingMismatchCandidate &&
      homeScoring >= 0.6 &&
      awayScoring >= 0.6,
    support,
    "Large rating mismatch plus both teams' minimum scoring qualification.",
  );

  applyFactorEffects(
    evidence,
    "goals",
    support,
    opposition,
  );

  return resolveDecision(
    "over",
    "under",
    support,
    opposition,
    5,
    4,
    sampleAdequate,
  );
}

function evaluateGoals35(
  evidence:
    MarketEvidenceSnapshotV02,

  sampleAdequate:
    boolean,
): EvidenceDecision<
  GoalsSelection
> {
  const support:
    string[] = [];

  const opposition:
    string[] = [];

  const home =
    evidence.home.recent;

  const away =
    evidence.away.recent;

  const homeOver =
    rate(
      home.over35Matches,
      home.matches,
    );

  const awayOver =
    rate(
      away.over35Matches,
      away.matches,
    );

  addSignal(
    homeOver >= 0.5,
    support,
    "Home recent Over 3.5 rate >= 50%.",
  );

  addSignal(
    awayOver >= 0.5,
    support,
    "Away recent Over 3.5 rate >= 50%.",
  );

  addSignal(
    homeOver <= 0.3,
    opposition,
    "Home recent Over 3.5 rate <= 30%.",
  );

  addSignal(
    awayOver <= 0.3,
    opposition,
    "Away recent Over 3.5 rate <= 30%.",
  );

  const averageGoals =
    averageFixtureGoals(
      evidence,
    );

  addSignal(
    averageGoals >= 3.6,
    support,
    "Combined recent match-goal profile >= 3.6.",
  );

  addSignal(
    averageGoals <= 2.8,
    opposition,
    "Combined recent match-goal profile <= 2.8.",
  );

  const homeVenue =
    venueRate(
      evidence.home.venue,
      "over35Matches",
    );

  const awayVenue =
    venueRate(
      evidence.away.venue,
      "over35Matches",
    );

  addSignal(
    homeVenue !== null &&
      homeVenue >= 0.5,
    support,
    "Home venue Over 3.5 profile >= 50%.",
  );

  addSignal(
    awayVenue !== null &&
      awayVenue >= 0.5,
    support,
    "Away venue Over 3.5 profile >= 50%.",
  );

  addSignal(
    homeVenue !== null &&
      homeVenue <= 0.3,
    opposition,
    "Home venue Over 3.5 profile <= 30%.",
  );

  addSignal(
    awayVenue !== null &&
      awayVenue <= 0.3,
    opposition,
    "Away venue Over 3.5 profile <= 30%.",
  );

  applyFactorEffects(
    evidence,
    "goals",
    support,
    opposition,
  );

  return resolveDecision(
    "over",
    "under",
    support,
    opposition,
    5,
    4,
    sampleAdequate,
  );
}

function evaluateBtts(
  evidence:
    MarketEvidenceSnapshotV02,

  sampleAdequate:
    boolean,
): EvidenceDecision<
  BttsSelection
> {
  const support:
    string[] = [];

  const opposition:
    string[] = [];

  const home =
    evidence.home.recent;

  const away =
    evidence.away.recent;

  const homeScoring =
    rate(
      home.scoredMatches,
      home.matches,
    );

  const awayScoring =
    rate(
      away.scoredMatches,
      away.matches,
    );

  const homeConceding =
    rate(
      home.concededMatches,
      home.matches,
    );

  const awayConceding =
    rate(
      away.concededMatches,
      away.matches,
    );

  const homeBtts =
    rate(
      home.bttsMatches,
      home.matches,
    );

  const awayBtts =
    rate(
      away.bttsMatches,
      away.matches,
    );

  const homeFailed =
    rate(
      home.failedToScore,
      home.matches,
    );

  const awayFailed =
    rate(
      away.failedToScore,
      away.matches,
    );

  const homeClean =
    rate(
      home.cleanSheets,
      home.matches,
    );

  const awayClean =
    rate(
      away.cleanSheets,
      away.matches,
    );

  addSignal(
    homeScoring >= 0.8,
    support,
    "Home team scores in at least 80% of recent matches.",
  );

  addSignal(
    awayScoring >= 0.8,
    support,
    "Away team scores in at least 80% of recent matches.",
  );

  addSignal(
    homeConceding >= 0.6,
    support,
    "Home team concedes in at least 60% of recent matches.",
  );

  addSignal(
    awayConceding >= 0.6,
    support,
    "Away team concedes in at least 60% of recent matches.",
  );

  addSignal(
    homeBtts >= 0.6,
    support,
    "Home recent BTTS rate >= 60%.",
  );

  addSignal(
    awayBtts >= 0.6,
    support,
    "Away recent BTTS rate >= 60%.",
  );

  addSignal(
    homeFailed <= 0.2 &&
      awayFailed <= 0.2,
    support,
    "Both teams fail to score in no more than 20% of recent matches.",
  );

  addSignal(
    homeScoring <= 0.6,
    opposition,
    "Home team scoring frequency <= 60%.",
  );

  addSignal(
    awayScoring <= 0.6,
    opposition,
    "Away team scoring frequency <= 60%.",
  );

  addSignal(
    homeBtts <= 0.4,
    opposition,
    "Home recent BTTS rate <= 40%.",
  );

  addSignal(
    awayBtts <= 0.4,
    opposition,
    "Away recent BTTS rate <= 40%.",
  );

  addSignal(
    homeFailed >= 0.4,
    opposition,
    "Home failed-to-score rate >= 40%.",
  );

  addSignal(
    awayFailed >= 0.4,
    opposition,
    "Away failed-to-score rate >= 40%.",
  );

  addSignal(
    homeClean >= 0.4,
    opposition,
    "Home clean-sheet rate >= 40%.",
  );

  addSignal(
    awayClean >= 0.4,
    opposition,
    "Away clean-sheet rate >= 40%.",
  );

  const homeVenue =
    venueRate(
      evidence.home.venue,
      "bttsMatches",
    );

  const awayVenue =
    venueRate(
      evidence.away.venue,
      "bttsMatches",
    );

  addSignal(
    homeVenue !== null &&
      homeVenue >= 0.6,
    support,
    "Home venue BTTS rate >= 60%.",
  );

  addSignal(
    awayVenue !== null &&
      awayVenue >= 0.6,
    support,
    "Away venue BTTS rate >= 60%.",
  );

  addSignal(
    homeVenue !== null &&
      homeVenue <= 0.4,
    opposition,
    "Home venue BTTS rate <= 40%.",
  );

  addSignal(
    awayVenue !== null &&
      awayVenue <= 0.4,
    opposition,
    "Away venue BTTS rate <= 40%.",
  );

  applyFactorEffects(
    evidence,
    "btts",
    support,
    opposition,
  );

  return resolveDecision(
    "yes",
    "no",
    support,
    opposition,
    5,
    4,
    sampleAdequate,
  );
}

export function evaluateGoalsAndBtts(
  input:
    GoalsBttsAnalysisInput,
): GoalsBttsAnalysisResult {
  const evidence =
    validateMarketEvidenceSnapshotV02(
      input.evidence,
    );

  /*
   * Minimum real sample before any market
   * selection can be surfaced.
   */
  const sampleAdequate =
    evidence.home.recent.matches >=
      5 &&
    evidence.away.recent.matches >=
      5;

  return {
    engineVersion:
      GOALS_BTTS_ENGINE_VERSION,

    validationStatus:
      "experimental",

    fixtureId:
      evidence.fixtureId,

    sampleAdequate,

    goals15:
      evaluateGoals15(
        evidence,
        sampleAdequate,
      ),

    goals25:
      evaluateGoals25(
        evidence,
        input.ratingMismatchCandidate,
        sampleAdequate,
      ),

    goals35:
      evaluateGoals35(
        evidence,
        sampleAdequate,
      ),

    btts:
      evaluateBtts(
        evidence,
        sampleAdequate,
      ),

    calibratedProbabilities:
      false,
  };
}
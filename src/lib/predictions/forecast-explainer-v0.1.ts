export const FORECAST_EXPLAINER_VERSION_V01 =
  "dictaziq-forecast-explainer-v0.1" as const;

export type PublicForecastV01 =
  | "home"
  | "draw"
  | "away";

export type PublicConfidenceV01 =
  | "high"
  | "medium"
  | "low"
  | "very_low";

export type PublicMatchProfileV01 =
  | "true_parity"
  | "directional_parity"
  | "unstable_parity"
  | "stable_advantage"
  | "reinforced_advantage"
  | "challenged_advantage"
  | "dominant_advantage"
  | "prior_only";

export type PublicCoverageV01 =
  | "full"
  | "result_only"
  | "prior_result_only";

export type PublicScoringArchetypeV01 =
  | "open_parity"
  | "closed_parity"
  | "mixed_parity"
  | "open_mismatch"
  | "closed_mismatch"
  | "mixed_mismatch"
  | "insufficient";

export type PublicGoalsSignalV01 =
  | "over_2_5_support"
  | "under_2_5_support"
  | "conflict"
  | "none";

export type PublicBttsSignalV01 =
  | "yes_support"
  | "no_support"
  | "conflict"
  | "none";

export interface ForecastExplainerInputV01 {
  homeTeamName:
    string;

  awayTeamName:
    string;

  forecast:
    PublicForecastV01;

  confidence:
    PublicConfidenceV01;

  matchProfile:
    PublicMatchProfileV01;

  coverage:
    PublicCoverageV01;

  scoringArchetype:
    PublicScoringArchetypeV01;

  goalsSignal:
    PublicGoalsSignalV01;

  bttsSignal:
    PublicBttsSignalV01;
}

export interface ForecastExplanationV01 {
  version:
    typeof FORECAST_EXPLAINER_VERSION_V01;

  forecast:
    PublicForecastV01;

  forecastLabel:
    string;

  confidence:
    PublicConfidenceV01;

  profile:
    PublicMatchProfileV01;

  summary:
    string;

  reasons:
    readonly string[];

  evidenceNote:
    string;

  marketContext:
    readonly string[];

  calibratedProbability:
    null;
}

function nonEmpty(
  value:
    string,
  label:
    string,
): string {
  const cleaned =
    value.trim();

  if (
    cleaned.length ===
    0
  ) {
    throw new Error(
      `${label} cannot be empty.`,
    );
  }

  return cleaned;
}

function forecastLabel(
  input:
    ForecastExplainerInputV01,
): string {
  if (
    input.forecast ===
    "home"
  ) {
    return nonEmpty(
      input.homeTeamName,
      "Home team name",
    );
  }

  if (
    input.forecast ===
    "away"
  ) {
    return nonEmpty(
      input.awayTeamName,
      "Away team name",
    );
  }

  return "Draw";
}

function profileReason(
  profile:
    PublicMatchProfileV01,
  label:
    string,
): string {
  switch (
    profile
  ) {
    case "true_parity":
      return (
        "The matchup is classified as very closely balanced, " +
        "with neither side showing a meaningful overall separation."
      );

    case "directional_parity":
      return (
        "The matchup remains relatively close, but the model identifies " +
        `a measurable overall edge toward ${label}.`
      );

    case "unstable_parity":
      return (
        "The matchup is closely balanced and the underlying indicators " +
        "do not produce a fully stable directional picture."
      );

    case "stable_advantage":
      return (
        `The underlying team-strength evidence gives ${label} ` +
        "a clear and comparatively stable advantage."
      );

    case "reinforced_advantage":
      return (
        `The model identifies an advantage for ${label}, and the available ` +
        "performance direction reinforces that advantage."
      );

    case "challenged_advantage":
      return (
        `The model still identifies ${label} as the stronger side, but ` +
        "recent performance direction introduces caution around the advantage."
      );

    case "dominant_advantage":
      return (
        `The matchup is classified as a dominant advantage for ${label}, ` +
        "indicating a substantial underlying separation between the teams."
      );

    case "prior_only":
      return (
        "Match-specific strength evidence is unavailable, so the forecast " +
        "relies on the broader baseline information available to the model."
      );
  }
}

function confidenceReason(
  confidence:
    PublicConfidenceV01,
): string {
  switch (
    confidence
  ) {
    case "high":
      return (
        "The result-side evidence gives the model a high-confidence directional signal."
      );

    case "medium":
      return (
        "The result-side evidence gives the model a meaningful directional signal, " +
        "although some uncertainty remains."
      );

    case "low":
      return (
        "The result-side evidence provides only a modest directional signal, " +
        "so the forecast should be interpreted cautiously."
      );

    case "very_low":
      return (
        "Evidence coverage is limited and the forecast carries substantial uncertainty."
      );
  }
}

function scoringReason(
  archetype:
    PublicScoringArchetypeV01,
): string | null {
  switch (
    archetype
  ) {
    case "open_parity":
      return (
        "The scoring profile describes an open and competitive match environment."
      );

    case "closed_parity":
      return (
        "The scoring profile describes a closely matched but relatively controlled environment."
      );

    case "mixed_parity":
      return (
        "The scoring indicators are mixed despite the relatively close matchup."
      );

    case "open_mismatch":
      return (
        "The scoring evidence describes an open environment around the stronger-side advantage."
      );

    case "closed_mismatch":
      return (
        "The scoring evidence describes a comparatively controlled environment despite the team-strength separation."
      );

    case "mixed_mismatch":
      return (
        "The scoring indicators remain mixed despite the team-strength separation."
      );

    case "insufficient":
      return null;
  }
}

function goalsContext(
  signal:
    PublicGoalsSignalV01,
): string | null {
  switch (
    signal
  ) {
    case "over_2_5_support":
      return (
        "Available scoring evidence leans toward a higher-scoring match profile."
      );

    case "under_2_5_support":
      return (
        "Available scoring evidence leans toward a lower-scoring match profile."
      );

    case "conflict":
      return (
        "The available goals indicators conflict, so no single goals interpretation is presented."
      );

    case "none":
      return null;
  }
}

function bttsContext(
  signal:
    PublicBttsSignalV01,
): string | null {
  switch (
    signal
  ) {
    case "yes_support":
      return (
        "The available scoring evidence is supportive of both teams finding the net."
      );

    case "no_support":
      return (
        "The available scoring evidence leans against both teams finding the net."
      );

    case "conflict":
      return (
        "The both-teams-scoring indicators are conflicting."
      );

    case "none":
      return null;
  }
}

function evidenceNote(
  coverage:
    PublicCoverageV01,
): string {
  switch (
    coverage
  ) {
    case "full":
      return (
        "The explanation uses both result-side and available scoring evidence."
      );

    case "result_only":
      return (
        "Scoring evidence was insufficient, so this published forecast is based on result-side analysis only."
      );

    case "prior_result_only":
      return (
        "Match-specific evidence coverage is limited, so this forecast relies on broader baseline information."
      );
  }
}

function summaryText(
  label:
    string,
  profile:
    PublicMatchProfileV01,
): string {
  if (
    label ===
    "Draw"
  ) {
    if (
      profile ===
      "true_parity"
    ) {
      return (
        "Draw is the model forecast, with the matchup classified as closely balanced."
      );
    }

    return (
      "Draw is the model forecast, with the available evidence not producing a decisive team advantage."
    );
  }

  switch (
    profile
  ) {
    case "dominant_advantage":
      return (
        `${label} is the model forecast, with the matchup classified as a dominant advantage.`
      );

    case "reinforced_advantage":
      return (
        `${label} is the model forecast, with the underlying advantage reinforced by the available performance direction.`
      );

    case "stable_advantage":
      return (
        `${label} is the model forecast, supported by a clear and stable overall advantage.`
      );

    case "challenged_advantage":
      return (
        `${label} remains the model forecast, although the underlying advantage faces some conflicting performance evidence.`
      );

    case "directional_parity":
      return (
        `${label} is the model forecast in an otherwise relatively close matchup.`
      );

    case "unstable_parity":
      return (
        `${label} is the model forecast, but the closely matched contest carries elevated uncertainty.`
      );

    case "true_parity":
      return (
        `${label} is the model forecast, although the matchup remains very closely balanced.`
      );

    case "prior_only":
      return (
        `${label} is the model forecast, but match-specific evidence coverage is limited.`
      );
  }
}

export function explainForecastV01(
  input:
    ForecastExplainerInputV01,
): ForecastExplanationV01 {
  const homeTeamName =
    nonEmpty(
      input.homeTeamName,
      "Home team name",
    );

  const awayTeamName =
    nonEmpty(
      input.awayTeamName,
      "Away team name",
    );

  if (
    homeTeamName ===
    awayTeamName
  ) {
    throw new Error(
      "Home and away teams must be different.",
    );
  }

  const normalizedInput:
    ForecastExplainerInputV01 = {
      ...input,
      homeTeamName,
      awayTeamName,
    };

  const label =
    forecastLabel(
      normalizedInput,
    );

  const reasons:
    string[] = [
      profileReason(
        input.matchProfile,
        label,
      ),

      confidenceReason(
        input.confidence,
      ),
    ];

  const scoring =
    scoringReason(
      input.scoringArchetype,
    );

  if (
    scoring !==
    null
  ) {
    reasons.push(
      scoring,
    );
  }

  const marketContext:
    string[] = [];

  const goals =
    goalsContext(
      input.goalsSignal,
    );

  if (
    goals !==
    null
  ) {
    marketContext.push(
      goals,
    );
  }

  const btts =
    bttsContext(
      input.bttsSignal,
    );

  if (
    btts !==
    null
  ) {
    marketContext.push(
      btts,
    );
  }

  return {
    version:
      FORECAST_EXPLAINER_VERSION_V01,

    forecast:
      input.forecast,

    forecastLabel:
      label,

    confidence:
      input.confidence,

    profile:
      input.matchProfile,

    summary:
      summaryText(
        label,
        input.matchProfile,
      ),

    reasons,

    evidenceNote:
      evidenceNote(
        input.coverage,
      ),

    marketContext,

    calibratedProbability:
      null,
  };
}
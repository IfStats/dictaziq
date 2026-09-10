import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

import {
  fetchFixtureInjuries,
  fetchFixtureLineups,
} from "../src/providers/api-football/client";

const RUNNER_VERSION =
  "dictaziq-prematch-gpt-monitor-v0.3";

const REVISION_VERSION =
  "dictaziq-forecast-revision-v0.1";

const GPT_ENGINE_VERSION =
  "dictaziq-gpt-research-prediction-v0.1";

const OPENAI_MODEL =
  "gpt-5.6-luna";

const SAFETY_LOCK_SECONDS =
  120;

const SOFT_COOLDOWN_SECONDS =
  15 * 60;

type SqlClient =
  NeonQueryFunction<false, false>;

type JsonObject =
  Record<string, unknown>;

type Selection =
  | "home"
  | "draw"
  | "away";

type Confidence =
  | "high"
  | "medium"
  | "low"
  | "very_low";

type EvidenceGrade =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E";

type GoalsView =
  | "over_2_5"
  | "under_2_5"
  | "neutral";

type BttsView =
  | "yes"
  | "no"
  | "neutral";

type LineupState =
  | "unavailable"
  | "unconfirmed"
  | "confirmed";

type RevisionReason =
  | "scheduled_refresh"
  | "developing_news"
  | "confirmed_lineup"
  | "final_prematch";

type StructuredFact = {
  kind: string;
  side: "home" | "away" | "match";
  description: string;
  source: string;
  observedAt: string;
};

type ResearchSourceTier =
  | "official_primary"
  | "reputable_secondary"
  | "supplemental"
  | "prediction_tipster";

type ResearchSource = {
  url: string;
  title: string;
  tier: ResearchSourceTier;
  mayDriveForecast: boolean;
};

type ForecastState = {
  selection: Selection;
  confidence: Confidence;
  evidenceGrade: EvidenceGrade;
  goalsView: GoalsView;
  bttsView: BttsView;
  lineupState: LineupState;
};

type GptRawPrediction = {
  selection: Selection;
  confidence: Confidence;
  evidenceGrade: EvidenceGrade;
  goalsView: GoalsView;
  bttsView: BttsView;
  materialFactors: string[];
  reasoningSummary: string;
  contradictions: string[];
  missingInformation: string[];
};

type ResearchResult = {
  responseId: string;
  prediction: GptRawPrediction;
  sources: ResearchSource[];
};

function requestedDate(): string {
  const value =
    process.argv
      .slice(2)
      .find(
        (argument) =>
          !argument.startsWith("--"),
      ) ??
    new Date()
      .toISOString()
      .slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must use YYYY-MM-DD.");
  }

  return value;
}

function persistRequested(): boolean {
  return process.argv.includes("--persist");
}

function positiveIntegerFlag(
  name: string,
  fallback: number,
): number {
  const prefix = `--${name}=`;
  const argument =
    process.argv.find(
      (value) => value.startsWith(prefix),
    );

  if (!argument) {
    return fallback;
  }

  const value = Number(
    argument.slice(prefix.length),
  );

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `--${name} must be a positive integer.`,
    );
  }

  return value;
}

function optionalPositiveIntegerFlag(
  name: string,
): number | null {
  const prefix = `--${name}=`;
  const argument =
    process.argv.find(
      (value) => value.startsWith(prefix),
    );

  if (!argument) {
    return null;
  }

  const value = Number(
    argument.slice(prefix.length),
  );

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `--${name} must be a positive integer.`,
    );
  }

  return value;
}

function isRecord(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asRecord(value: unknown): JsonObject {
  return isRecord(value) ? value : {};
}

function textValue(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string"
    ? value.trim()
    : fallback;
}

function numberValue(
  value: unknown,
): number | null {
  const result = Number(value);
  return Number.isFinite(result)
    ? result
    : null;
}

function iso(value: unknown): string {
  const date =
    value instanceof Date
      ? value
      : new Date(String(value));

  assert.ok(
    Number.isFinite(date.getTime()),
    "Invalid timestamp.",
  );

  return date.toISOString();
}

function ms(value: unknown): number {
  return new Date(iso(value)).getTime();
}

async function databaseNow(
  sql: SqlClient,
): Promise<string> {
  const rows = await sql`
    SELECT clock_timestamp() AS now
  `;

  assert.equal(rows.length, 1);
  return iso(rows[0].now);
}

function selectionValue(value: unknown): Selection {
  const normalized =
    String(value).toLowerCase();

  if (
    normalized === "home" ||
    normalized === "draw" ||
    normalized === "away"
  ) {
    return normalized;
  }

  throw new Error(
    `Invalid forecast selection: ${String(value)}.`,
  );
}

function confidenceValue(
  value: unknown,
): Confidence {
  const normalized =
    String(value).toLowerCase();

  if (
    normalized === "high" ||
    normalized === "medium" ||
    normalized === "low" ||
    normalized === "very_low"
  ) {
    return normalized;
  }

  return "very_low";
}

function evidenceGradeValue(
  value: unknown,
): EvidenceGrade {
  const normalized =
    String(value).toUpperCase();

  if (
    normalized === "A" ||
    normalized === "B" ||
    normalized === "C" ||
    normalized === "D" ||
    normalized === "E"
  ) {
    return normalized;
  }

  return "E";
}

function goalsViewValue(
  value: unknown,
): GoalsView {
  if (
    value === "over_2_5" ||
    value === "under_2_5"
  ) {
    return value;
  }

  return "neutral";
}

function bttsViewValue(
  value: unknown,
): BttsView {
  if (
    value === "yes" ||
    value === "no"
  ) {
    return value;
  }

  return "neutral";
}

function lineupStateValue(
  value: unknown,
): LineupState {
  if (
    value === "confirmed" ||
    value === "unconfirmed"
  ) {
    return value;
  }

  return "unavailable";
}

function extractBaselineState(
  route: string,
  outputValue: unknown,
): ForecastState {
  const output = asRecord(outputValue);

  assert.ok(
    route === "mathematical" ||
      route === "gpt_research",
    `Unsupported authoritative route: ${route}.`,
  );

  return {
    selection: selectionValue(output.forecast),
    confidence: confidenceValue(output.confidence),
    evidenceGrade: evidenceGradeValue(
      output.evidenceGrade,
    ),
    goalsView: goalsViewValue(output.goalsView),
    bttsView: bttsViewValue(output.bttsView),
    lineupState: "unavailable",
  };
}

function extractRevisionState(
  row: JsonObject,
): ForecastState {
  const output = asRecord(
    row.latest_revision_output,
  );

  return {
    selection: selectionValue(
      row.latest_revision_selection,
    ),
    confidence: confidenceValue(
      row.latest_revision_confidence,
    ),
    evidenceGrade: evidenceGradeValue(
      row.latest_revision_evidence_grade,
    ),
    goalsView: goalsViewValue(output.goalsView),
    bttsView: bttsViewValue(output.bttsView),
    lineupState: lineupStateValue(
      row.latest_revision_lineup_state,
    ),
  };
}

function arrayOfRecords(
  value: unknown,
): JsonObject[] {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function previousFacts(
  snapshotValue: unknown,
): StructuredFact[] {
  const snapshot = asRecord(snapshotValue);
  const structured = asRecord(
    snapshot.structuredEvidence,
  );

  return arrayOfRecords(
    structured.facts,
  ).flatMap((fact) => {
    const kind = textValue(fact.kind);
    const description =
      textValue(fact.description);
    const source = textValue(fact.source);
    const observedAt =
      textValue(fact.observedAt);
    const sideValue = textValue(fact.side);

    if (
      !kind ||
      !description ||
      !source ||
      !observedAt
    ) {
      return [];
    }

    const side:
      "home" | "away" | "match" =
      sideValue === "home" ||
      sideValue === "away"
        ? sideValue
        : "match";

    return [{
      kind,
      side,
      description,
      source,
      observedAt,
    }];
  });
}

function previousSources(
  snapshotValue: unknown,
): ResearchSource[] {
  const snapshot = asRecord(snapshotValue);
  const web = asRecord(snapshot.webResearch);

  return arrayOfRecords(web.sources)
    .flatMap((source) => {
      const url = textValue(source.url);
      if (!url) return [];

      return [{
        url,
        title:
          textValue(source.title) || url,
        tier:
          classifySource(url),
        mayDriveForecast:
          classifySource(url) !==
          "prediction_tipster",
      }];
    });
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";

    for (
      const key
      of [...url.searchParams.keys()]
    ) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        key.toLowerCase() === "ref" ||
        key.toLowerCase() === "source"
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return value.trim();
  }
}

function hostname(value: string): string {
  try {
    return new URL(value)
      .hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return "";
  }
}

const OFFICIAL_DOMAINS = [
  "fifa.com",
  "uefa.com",
  "cafonline.com",
  "the-afc.com",
  "concacaf.com",
  "conmebol.com",
  "premierleague.com",
  "laliga.com",
  "bundesliga.com",
  "legaseriea.it",
  "ligue1.com",
  "thefa.com",
];

const REPUTABLE_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "espn.com",
  "skysports.com",
  "theathletic.com",
  "goal.com",
];

const TIPSTER_PATTERNS = [
  "betmines",
  "forebet",
  "predictz",
  "sportytrader",
  "windrawwin",
  "bettingexpert",
  "oddschecker",
  "footballtips",
  "soccertips",
  "prediction",
  "predictions",
  "betting",
];

function domainMatches(
  host: string,
  domain: string,
): boolean {
  return (
    host === domain ||
    host.endsWith(`.${domain}`)
  );
}

function classifySource(
  url: string,
): ResearchSourceTier {
  const host = hostname(url);
  const full = url.toLowerCase();

  if (
    TIPSTER_PATTERNS.some(
      (pattern) =>
        host.includes(pattern) ||
        full.includes(pattern),
    )
  ) {
    return "prediction_tipster";
  }

  if (
    OFFICIAL_DOMAINS.some(
      (domain) =>
        domainMatches(host, domain),
    )
  ) {
    return "official_primary";
  }

  if (
    REPUTABLE_DOMAINS.some(
      (domain) =>
        domainMatches(host, domain),
    )
  ) {
    return "reputable_secondary";
  }

  return "supplemental";
}

function confidenceRank(
  value: Confidence,
): number {
  return {
    very_low: 0,
    low: 1,
    medium: 2,
    high: 3,
  }[value];
}

function gradeRank(
  value: EvidenceGrade,
): number {
  return {
    E: 0,
    D: 1,
    C: 2,
    B: 3,
    A: 4,
  }[value];
}

function capConfidence(
  raw: Confidence,
  cap: Confidence,
): Confidence {
  return confidenceRank(raw) <=
    confidenceRank(cap)
    ? raw
    : cap;
}

function capGrade(
  raw: EvidenceGrade,
  cap: EvidenceGrade,
): EvidenceGrade {
  return gradeRank(raw) <=
    gradeRank(cap)
    ? raw
    : cap;
}

function applySourcePolicy(
  raw: GptRawPrediction,
  sources: ResearchSource[],
  lineupState: LineupState,
): GptRawPrediction {
  const official =
    sources.filter(
      (source) =>
        source.tier ===
        "official_primary",
    ).length;

  const reputable =
    sources.filter(
      (source) =>
        source.tier ===
        "reputable_secondary",
    ).length;

  const supplemental =
    sources.filter(
      (source) =>
        source.tier ===
        "supplemental",
    ).length;

  const authoritative =
    official + reputable;

  let confidenceCap: Confidence;
  let gradeCap: EvidenceGrade;

  if (
    lineupState === "confirmed" &&
    authoritative >= 2
  ) {
    confidenceCap = "high";
    gradeCap = "A";
  } else if (authoritative >= 2) {
    confidenceCap = "medium";
    gradeCap = "B";
  } else if (authoritative === 1) {
    confidenceCap = "low";
    gradeCap = "C";
  } else if (supplemental > 0) {
    confidenceCap = "very_low";
    gradeCap = "D";
  } else {
    confidenceCap = "very_low";
    gradeCap = "E";
  }

  return {
    ...raw,
    confidence:
      capConfidence(
        raw.confidence,
        confidenceCap,
      ),
    evidenceGrade:
      capGrade(
        raw.evidenceGrade,
        gradeCap,
      ),
  };
}

function isQuotaError(
  error: unknown,
): boolean {
  const text =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    text.includes("request limit") ||
    text.includes("requests limit") ||
    text.includes("upgrade your plan") ||
    text.includes("too many requests")
  );
}

function teamIdFromRecord(
  value: unknown,
): number | null {
  const root = asRecord(value);
  const team = asRecord(root.team);
  return numberValue(team.id);
}

function playerNameFromRecord(
  value: unknown,
): string {
  const root = asRecord(value);
  const player = asRecord(root.player);

  return (
    textValue(root.name) ||
    textValue(player.name) ||
    "Unknown player"
  );
}

function injuryDescription(
  value: unknown,
): string {
  const root = asRecord(value);
  const player = asRecord(root.player);

  const playerName =
    textValue(player.name) ||
    textValue(root.playerName) ||
    "Unknown player";

  const reason =
    textValue(root.reason) ||
    textValue(root.type) ||
    textValue(root.detail) ||
    "availability issue";

  return `${playerName}: ${reason}`;
}

function lineupFact(
  lineupValue: unknown,
  side: "home" | "away",
  observedAt: string,
): StructuredFact {
  const lineup = asRecord(lineupValue);
  const team = asRecord(lineup.team);
  const starters = Array.isArray(lineup.startXI)
    ? lineup.startXI
    : [];

  const names = starters
    .map(playerNameFromRecord)
    .filter(Boolean)
    .slice(0, 11);

  const formation =
    textValue(lineup.formation) ||
    "formation unavailable";

  return {
    kind: "lineup",
    side,
    description:
      `${textValue(team.name) || side} confirmed XI (${formation}): ${names.join(", ")}`,
    source: "api-football",
    observedAt,
  };
}

function factSignature(
  fact: StructuredFact,
): string {
  return [
    fact.kind.trim().toLowerCase(),
    fact.side,
    fact.description.trim().toLowerCase(),
    fact.source.trim().toLowerCase(),
  ].join("|");
}

function factsChanged(
  previous: StructuredFact[],
  current: StructuredFact[],
): boolean {
  const before = new Set(
    previous.map(factSignature),
  );

  const after = new Set(
    current.map(factSignature),
  );

  if (before.size !== after.size) {
    return true;
  }

  for (const value of after) {
    if (!before.has(value)) {
      return true;
    }
  }

  return false;
}

function authoritativeUrls(
  sources: ResearchSource[],
): Set<string> {
  return new Set(
    sources
      .filter(
        (source) =>
          source.tier ===
            "official_primary" ||
          source.tier ===
            "reputable_secondary",
      )
      .map((source) =>
        normalizeUrl(source.url),
      ),
  );
}

function newAuthoritativeSource(
  previous: ResearchSource[],
  current: ResearchSource[],
): boolean {
  const before = authoritativeUrls(previous);
  const after = authoritativeUrls(current);

  for (const value of after) {
    if (!before.has(value)) {
      return true;
    }
  }

  return false;
}

function changeList(
  previous: ForecastState,
  current: ForecastState,
): string[] {
  const changes: string[] = [];

  if (previous.selection !== current.selection) {
    changes.push(
      `Selection changed from ${previous.selection} to ${current.selection}.`,
    );
  }

  if (previous.confidence !== current.confidence) {
    changes.push(
      `Confidence changed from ${previous.confidence} to ${current.confidence}.`,
    );
  }

  if (
    previous.evidenceGrade !==
    current.evidenceGrade
  ) {
    changes.push(
      `Evidence grade changed from ${previous.evidenceGrade} to ${current.evidenceGrade}.`,
    );
  }

  if (previous.goalsView !== current.goalsView) {
    changes.push(
      `Goals view changed from ${previous.goalsView} to ${current.goalsView}.`,
    );
  }

  if (previous.bttsView !== current.bttsView) {
    changes.push(
      `BTTS view changed from ${previous.bttsView} to ${current.bttsView}.`,
    );
  }

  if (
    previous.lineupState !== "confirmed" &&
    current.lineupState === "confirmed"
  ) {
    changes.push(
      "Confirmed starting lineups became available for both teams.",
    );
  }

  return changes;
}

function determineReason(
  secondsToKickoff: number,
  previous: ForecastState,
  current: ForecastState,
  evidenceAdvanced: boolean,
): RevisionReason {
  if (
    previous.lineupState !== "confirmed" &&
    current.lineupState === "confirmed"
  ) {
    return "confirmed_lineup";
  }

  if (secondsToKickoff <= 15 * 60) {
    return "final_prematch";
  }

  if (evidenceAdvanced) {
    return "developing_news";
  }

  return "scheduled_refresh";
}

function extractResponseText(
  response: JsonObject,
): string {
  const direct = textValue(response.output_text);
  if (direct) return direct;

  const output = Array.isArray(response.output)
    ? response.output
    : [];

  for (const itemValue of output) {
    const item = asRecord(itemValue);
    const content = Array.isArray(item.content)
      ? item.content
      : [];

    for (const contentValue of content) {
      const contentItem = asRecord(contentValue);
      if (
        contentItem.type === "output_text" &&
        typeof contentItem.text === "string"
      ) {
        return contentItem.text;
      }
    }
  }

  throw new Error(
    "OpenAI response contained no structured output text.",
  );
}

function extractResearchSources(
  response: JsonObject,
): ResearchSource[] {
  const found = new Map<string, ResearchSource>();
  const output = Array.isArray(response.output)
    ? response.output
    : [];

  for (const itemValue of output) {
    const item = asRecord(itemValue);

    if (item.type !== "web_search_call") {
      continue;
    }

    const action = asRecord(item.action);
    const sources = Array.isArray(action.sources)
      ? action.sources
      : [];

    for (const sourceValue of sources) {
      const source = asRecord(sourceValue);
      const url = textValue(source.url);
      if (!url) continue;

      const normalized = normalizeUrl(url);
      const tier = classifySource(normalized);

      found.set(normalized, {
        url: normalized,
        title:
          textValue(source.title) ||
          hostname(normalized) ||
          normalized,
        tier,
        mayDriveForecast:
          tier !== "prediction_tipster",
      });
    }
  }

  return [...found.values()];
}

function validateGptPrediction(
  value: unknown,
): GptRawPrediction {
  const object = asRecord(value);

  const materialFactors =
    Array.isArray(object.materialFactors)
      ? object.materialFactors
          .map((item) => textValue(item))
          .filter(Boolean)
          .slice(0, 12)
      : [];

  const contradictions =
    Array.isArray(object.contradictions)
      ? object.contradictions
          .map((item) => textValue(item))
          .filter(Boolean)
          .slice(0, 10)
      : [];

  const missingInformation =
    Array.isArray(object.missingInformation)
      ? object.missingInformation
          .map((item) => textValue(item))
          .filter(Boolean)
          .slice(0, 10)
      : [];

  return {
    selection: selectionValue(object.selection),
    confidence: confidenceValue(object.confidence),
    evidenceGrade: evidenceGradeValue(
      object.evidenceGrade,
    ),
    goalsView: goalsViewValue(object.goalsView),
    bttsView: bttsViewValue(object.bttsView),
    materialFactors,
    reasoningSummary:
      textValue(object.reasoningSummary) ||
      "Research evidence was assessed before kickoff.",
    contradictions,
    missingInformation,
  };
}

async function researchFixture(input: {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  country: string | null;
  kickoffAt: string;
  cutoffAt: string;
  purpose: RevisionReason;
  facts: StructuredFact[];
}): Promise<ResearchResult> {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for GPT pre-match monitoring.",
    );
  }

  const prompt = [
    "You are the DictazIQ pre-match football research engine.",
    "Research the fixture using web search and return a fresh independent pre-match forecast.",
    "Use only information that could have been known before the supplied cutoff and kickoff.",
    "Do not use in-play, post-kickoff, or post-match evidence.",
    "Prefer official club, league, federation and competition sources, then reputable sports/news reporting.",
    "Betting, tipster and prediction sites must never be the primary basis for the forecast.",
    "Consider recent form, home/away form, goals, xG or shots where reliable, standings and opponent strength, injuries/suspensions, lineups/formations, rotation, rest/travel, manager comments and match importance.",
    "Do not treat each injury as an independent vote.",
    "You must choose HOME, DRAW or AWAY even when evidence is sparse; use very_low confidence and D/E evidence grade when appropriate.",
    "Do not output probabilities.",
    "Reasoning summary must contain conclusions only, not hidden chain-of-thought.",
    "",
    `Fixture: ${input.homeTeam} vs ${input.awayTeam}`,
    `Competition: ${input.competition}`,
    `Country: ${input.country ?? "unknown"}`,
    `Kickoff UTC: ${input.kickoffAt}`,
    `Evidence cutoff UTC: ${input.cutoffAt}`,
    `Purpose: ${input.purpose}`,
    "",
    "Structured facts already available:",
    JSON.stringify(input.facts),
  ].join("\n");

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        reasoning: {
          effort: "low",
        },
        tools: [
          {
            type: "web_search",
          },
        ],
        tool_choice: "required",
        include: [
          "web_search_call.action.sources",
        ],
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name:
              "dictaziq_prematch_monitor_v03",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                selection: {
                  type: "string",
                  enum: [
                    "home",
                    "draw",
                    "away",
                  ],
                },
                confidence: {
                  type: "string",
                  enum: [
                    "high",
                    "medium",
                    "low",
                    "very_low",
                  ],
                },
                evidenceGrade: {
                  type: "string",
                  enum: [
                    "A",
                    "B",
                    "C",
                    "D",
                    "E",
                  ],
                },
                goalsView: {
                  type: "string",
                  enum: [
                    "over_2_5",
                    "under_2_5",
                    "neutral",
                  ],
                },
                bttsView: {
                  type: "string",
                  enum: [
                    "yes",
                    "no",
                    "neutral",
                  ],
                },
                materialFactors: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
                reasoningSummary: {
                  type: "string",
                },
                contradictions: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
                missingInformation: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
              },
              required: [
                "selection",
                "confidence",
                "evidenceGrade",
                "goalsView",
                "bttsView",
                "materialFactors",
                "reasoningSummary",
                "contradictions",
                "missingInformation",
              ],
            },
          },
        },
      }),
      signal:
        AbortSignal.timeout(60_000),
    },
  );

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenAI Responses API failed (${response.status}): ${rawText}`,
    );
  }

  const responseObject =
    JSON.parse(rawText) as JsonObject;

  const outputText =
    extractResponseText(responseObject);

  const prediction =
    validateGptPrediction(
      JSON.parse(outputText),
    );

  const sources =
    extractResearchSources(
      responseObject,
    );

  if (sources.length === 0) {
    throw new Error(
      "GPT research response used no attributable web sources.",
    );
  }

  return {
    responseId:
      textValue(responseObject.id) ||
      "unknown",
    prediction,
    sources,
  };
}

async function main() {
  const date = requestedDate();
  const persist = persistRequested();
  const windowMinutes =
    positiveIntegerFlag(
      "window-minutes",
      180,
    );
  const limit =
    optionalPositiveIntegerFlag("limit");

  if (windowMinutes > 2880) {
    throw new Error(
      "--window-minutes cannot exceed 2880.",
    );
  }

  const sql: SqlClient =
    neon(getDatabaseUrl());

  const runStartedAt =
    await databaseNow(sql);

  console.log(
    "DictazIQ Authoritative GPT Pre-Match Monitor",
  );
  console.log(`Runner: ${RUNNER_VERSION}`);
  console.log(`Date: ${date}`);
  console.log(
    `Mode: ${persist ? "PERSIST" : "READ ONLY"}`,
  );
  console.log(
    `Window: ${windowMinutes} minutes`,
  );
  console.log(
    `Limit: ${limit ?? "ALL"}`,
  );

  const rows = await sql`
    SELECT
      route.baseline_prediction_id,
      route.fixture_id,
      route.route,
      route.route_reason,
      route.model_version,
      route.input_cutoff_at
        AS baseline_input_cutoff_at,
      route.published_at
        AS baseline_published_at,
      route.input_snapshot
        AS baseline_input_snapshot,
      route.output
        AS baseline_output,

      fixture.provider_id,
      fixture.kickoff_at,
      fixture.status,

      competition.name
        AS competition_name,
      competition.country
        AS competition_country,

      home.id
        AS home_team_id,
      home.name
        AS home_team_name,
      away.id
        AS away_team_id,
      away.name
        AS away_team_name,

      home_mapping.source_team_id
        AS home_api_team_id,
      away_mapping.source_team_id
        AS away_api_team_id,

      latest_revision.id
        AS latest_revision_id,
      latest_revision.revision_number
        AS latest_revision_number,
      latest_revision.input_cutoff_at
        AS latest_revision_input_cutoff_at,
      latest_revision.published_at
        AS latest_revision_published_at,
      latest_revision.selection
        AS latest_revision_selection,
      latest_revision.confidence
        AS latest_revision_confidence,
      latest_revision.evidence_grade
        AS latest_revision_evidence_grade,
      latest_revision.lineup_state
        AS latest_revision_lineup_state,
      latest_revision.input_snapshot
        AS latest_revision_input_snapshot,
      latest_revision.output
        AS latest_revision_output,

      clock_timestamp()
        AS checked_at

    FROM public.production_forecast_baselines_v01
      AS route

    JOIN public.fixtures
      AS fixture
      ON fixture.id =
        route.fixture_id

    JOIN public.seasons
      AS season
      ON season.id =
        fixture.season_id

    JOIN public.competitions
      AS competition
      ON competition.id =
        season.competition_id

    JOIN public.teams
      AS home
      ON home.id =
        fixture.home_team_id

    JOIN public.teams
      AS away
      ON away.id =
        fixture.away_team_id

    LEFT JOIN public.team_source_mappings
      AS home_mapping
      ON home_mapping.team_id =
        fixture.home_team_id
      AND home_mapping.source =
        'api-football'
      AND home_mapping.is_verified =
        true

    LEFT JOIN public.team_source_mappings
      AS away_mapping
      ON away_mapping.team_id =
        fixture.away_team_id
      AND away_mapping.source =
        'api-football'
      AND away_mapping.is_verified =
        true

    LEFT JOIN LATERAL (
      SELECT
        revision.*

      FROM public.forecast_revisions
        AS revision

      WHERE revision.baseline_prediction_id =
        route.baseline_prediction_id

        AND revision.is_demo =
          false

        AND revision.published_at
          IS NOT NULL

        AND revision.input_cutoff_at <
          fixture.kickoff_at

        AND revision.generated_at <
          fixture.kickoff_at

        AND revision.published_at <
          fixture.kickoff_at

      ORDER BY
        revision.revision_number DESC,
        revision.published_at DESC

      LIMIT 1
    ) AS latest_revision
      ON true

    WHERE fixture.is_demo =
      false

      AND fixture.provider =
        'api-football'

      AND fixture.status =
        'scheduled'

      AND (
        fixture.kickoff_at
        AT TIME ZONE 'UTC'
      )::date =
        ${date}::date

      AND fixture.kickoff_at >
        ${runStartedAt}::timestamptz

      AND fixture.kickoff_at <=
        ${runStartedAt}::timestamptz +
        (${windowMinutes} * INTERVAL '1 minute')

    ORDER BY
      fixture.kickoff_at,
      fixture.provider_id
  `;

  const candidates =
    limit === null
      ? rows
      : rows.slice(0, limit);

  console.log(
    `Authoritative fixtures in monitoring window: ${rows.length}`,
  );
  console.log(
    `Fixtures selected this run: ${candidates.length}`,
  );

  let providerQuotaExhausted = false;
  let gptCalls = 0;
  let materialRevisions = 0;
  let suppressed = 0;
  let inserted = 0;
  let published = 0;
  let skipped = 0;
  let providerDeferred = 0;
  let researchFailed = 0;

  for (const rawRow of candidates) {
    const row = rawRow as JsonObject;

    console.log("");
    console.log(
      "========================================",
    );
    console.log(
      `${row.home_team_name} vs ${row.away_team_name}`,
    );
    console.log(
      `Route: ${String(row.route).toUpperCase()}`,
    );
    console.log(
      `Baseline model: ${row.model_version}`,
    );

    const kickoffAt = iso(row.kickoff_at);
    const checkedAt =
      await databaseNow(sql);
    const secondsToKickoff =
      Math.floor(
        (ms(kickoffAt) - ms(checkedAt)) /
          1000,
      );

    console.log(`Kickoff: ${kickoffAt}`);
    console.log(
      `Seconds to kickoff: ${secondsToKickoff}`,
    );

    if (
      secondsToKickoff <=
      SAFETY_LOCK_SECONDS
    ) {
      console.log(
        "SKIP: fixture is inside the 2-minute pre-kickoff safety lock.",
      );
      skipped += 1;
      continue;
    }

    const hasRevision =
      row.latest_revision_id !== null &&
      row.latest_revision_id !== undefined;

    const active = hasRevision
      ? extractRevisionState(row)
      : extractBaselineState(
          String(row.route),
          row.baseline_output,
        );

    const activePublishedAt = hasRevision
      ? iso(row.latest_revision_published_at)
      : iso(row.baseline_published_at);

    const previousInputSnapshot = hasRevision
      ? row.latest_revision_input_snapshot
      : row.baseline_input_snapshot;

    const priorFacts =
      previousFacts(previousInputSnapshot);
    const priorSources =
      previousSources(previousInputSnapshot);

    console.log(
      `ACTIVE: ${active.selection.toUpperCase()} / ${active.confidence} / ${active.evidenceGrade}`,
    );
    console.log(
      `Active revision: ${hasRevision ? row.latest_revision_number : "BASELINE"}`,
    );

    let injuries: unknown[] = [];
    let lineups: unknown[] = [];
    let providerObservedAt = checkedAt;

    if (!providerQuotaExhausted) {
      try {
        const apiFixtureId =
          Number(row.provider_id);

        if (!Number.isInteger(apiFixtureId)) {
          throw new Error(
            "Fixture has invalid API-Football provider id.",
          );
        }

        const results =
          await Promise.all([
            fetchFixtureInjuries(apiFixtureId),
            fetchFixtureLineups(apiFixtureId),
          ]);

        injuries = results[0] as unknown[];
        lineups = results[1] as unknown[];
        providerObservedAt =
          await databaseNow(sql);
      } catch (error) {
        if (isQuotaError(error)) {
          providerQuotaExhausted = true;
          providerDeferred += 1;
          console.log(
            "API-Football: QUOTA EXHAUSTED — provider polling disabled for the remainder of this monitor run.",
          );
        } else {
          providerDeferred += 1;
          console.log(
            `API-Football: DEFERRED — ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } else {
      providerDeferred += 1;
      console.log(
        "API-Football: SKIPPED — quota circuit breaker is active.",
      );
    }

    const homeApiTeamId =
      numberValue(row.home_api_team_id);
    const awayApiTeamId =
      numberValue(row.away_api_team_id);

    const homeLineup =
      homeApiTeamId === null
        ? undefined
        : lineups.find(
            (lineup) =>
              teamIdFromRecord(lineup) ===
              homeApiTeamId,
          );

    const awayLineup =
      awayApiTeamId === null
        ? undefined
        : lineups.find(
            (lineup) =>
              teamIdFromRecord(lineup) ===
              awayApiTeamId,
          );

    const homeStarters =
      homeLineup
        ? arrayOfRecords(
            asRecord(homeLineup).startXI,
          ).length
        : 0;

    const awayStarters =
      awayLineup
        ? arrayOfRecords(
            asRecord(awayLineup).startXI,
          ).length
        : 0;

    const bothConfirmed =
      homeStarters >= 11 &&
      awayStarters >= 11;

    const lineupState: LineupState =
      bothConfirmed
        ? "confirmed"
        : lineups.length > 0
          ? "unconfirmed"
          : "unavailable";

    const newFacts: StructuredFact[] = [];

    for (const injury of injuries) {
      const teamId = teamIdFromRecord(injury);
      let side: "home" | "away" | "match" =
        "match";

      if (
        homeApiTeamId !== null &&
        teamId === homeApiTeamId
      ) {
        side = "home";
      } else if (
        awayApiTeamId !== null &&
        teamId === awayApiTeamId
      ) {
        side = "away";
      }

      newFacts.push({
        kind: "availability",
        side,
        description:
          injuryDescription(injury),
        source: "api-football",
        observedAt: providerObservedAt,
      });
    }

    if (homeLineup && homeStarters >= 11) {
      newFacts.push(
        lineupFact(
          homeLineup,
          "home",
          providerObservedAt,
        ),
      );
    }

    if (awayLineup && awayStarters >= 11) {
      newFacts.push(
        lineupFact(
          awayLineup,
          "away",
          providerObservedAt,
        ),
      );
    }

    const mergedFactsMap =
      new Map<string, StructuredFact>();

    for (
      const fact
      of [...priorFacts, ...newFacts]
    ) {
      mergedFactsMap.set(
        factSignature(fact),
        fact,
      );
    }

    const facts =
      [...mergedFactsMap.values()]
        .slice(0, 50);

    console.log(
      `Structured facts: ${facts.length}`,
    );
    console.log(
      `API injuries: ${injuries.length}`,
    );
    console.log(
      `API lineup records: ${lineups.length}`,
    );
    console.log(
      `Confirmed both XI: ${bothConfirmed ? "YES" : "NO"}`,
    );

    const provisionalPurpose:
      RevisionReason =
      bothConfirmed &&
      active.lineupState !== "confirmed"
        ? "confirmed_lineup"
        : secondsToKickoff <= 15 * 60
          ? "final_prematch"
          : "scheduled_refresh";

    const researchCutoff =
      await databaseNow(sql);

    console.log(
      `Purpose: ${provisionalPurpose}`,
    );
    console.log("GPT research: START");

    let research: ResearchResult;

    try {
      gptCalls += 1;
      research = await researchFixture({
        homeTeam:
          String(row.home_team_name),
        awayTeam:
          String(row.away_team_name),
        competition:
          String(row.competition_name),
        country:
          row.competition_country === null
            ? null
            : String(row.competition_country),
        kickoffAt,
        cutoffAt: researchCutoff,
        purpose: provisionalPurpose,
        facts,
      });
    } catch (error) {
      researchFailed += 1;
      skipped += 1;
      console.log(
        `GPT research failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const completedAt =
      await databaseNow(sql);

    if (
      ms(completedAt) >=
      ms(kickoffAt) -
        SAFETY_LOCK_SECONDS * 1000
    ) {
      skipped += 1;
      console.log(
        "SKIP: research completed inside the 2-minute safety lock; result discarded.",
      );
      continue;
    }

    const rawPrediction =
      research.prediction;
    const policyPrediction =
      applySourcePolicy(
        rawPrediction,
        research.sources,
        lineupState,
      );

    const proposed: ForecastState = {
      selection:
        policyPrediction.selection,
      confidence:
        policyPrediction.confidence,
      evidenceGrade:
        policyPrediction.evidenceGrade,
      goalsView:
        policyPrediction.goalsView,
      bttsView:
        policyPrediction.bttsView,
      lineupState,
    };

    console.log(
      `GPT RAW: ${rawPrediction.selection.toUpperCase()} / ${rawPrediction.confidence} / ${rawPrediction.evidenceGrade}`,
    );
    console.log(
      `POLICY: ${proposed.selection.toUpperCase()} / ${proposed.confidence} / ${proposed.evidenceGrade}`,
    );

    const official =
      research.sources.filter(
        (source) =>
          source.tier ===
          "official_primary",
      ).length;
    const reputable =
      research.sources.filter(
        (source) =>
          source.tier ===
          "reputable_secondary",
      ).length;
    const tipster =
      research.sources.filter(
        (source) =>
          source.tier ===
          "prediction_tipster",
      ).length;

    console.log(
      `Web sources: ${research.sources.length}`,
    );
    console.log(`Official: ${official}`);
    console.log(
      `Reputable secondary: ${reputable}`,
    );
    console.log(`Tipster: ${tipster}`);

    const evidenceAdvanced =
      factsChanged(priorFacts, facts) ||
      newAuthoritativeSource(
        priorSources,
        research.sources,
      );

    const changes =
      changeList(active, proposed);

    /*
     * Hard revisions must be evidence-backed.
     *
     * A newly confirmed XI is itself authoritative
     * structured evidence and always bypasses the
     * cooldown. A 1X2 selection change may also
     * bypass the cooldown, but only when the
     * evidence set advanced. This prevents normal
     * GPT/web-search stochasticity from changing a
     * published forecast when no new authoritative
     * information exists.
     */
    const confirmedLineupTrigger =
      active.lineupState !==
        "confirmed" &&
      proposed.lineupState ===
        "confirmed";

    const selectionChanged =
      active.selection !==
        proposed.selection;

    const hardTrigger =
      confirmedLineupTrigger ||
      (
        selectionChanged &&
        evidenceAdvanced
      );

    const softForecastChange =
      active.confidence !==
        proposed.confidence ||
      active.evidenceGrade !==
        proposed.evidenceGrade ||
      active.goalsView !==
        proposed.goalsView ||
      active.bttsView !==
        proposed.bttsView;

    const secondsSinceActivePublication =
      Math.max(
        0,
        Math.floor(
          (ms(completedAt) -
            ms(activePublishedAt)) /
            1000,
        ),
      );

    const cooldownSatisfied =
      secondsSinceActivePublication >=
      SOFT_COOLDOWN_SECONDS;

    const finalPrematch =
      secondsToKickoff <= 15 * 60;

    const softTrigger =
      !hardTrigger &&
      softForecastChange &&
      evidenceAdvanced &&
      (
        cooldownSatisfied ||
        finalPrematch
      );

    const shouldRevise =
      changes.length > 0 &&
      (hardTrigger || softTrigger);

    console.log(
      `Evidence advanced: ${evidenceAdvanced ? "YES" : "NO"}`,
    );
    console.log(
      `Hard trigger: ${hardTrigger ? "YES" : "NO"}`,
    );
    console.log(
      `Soft trigger: ${softTrigger ? "YES" : "NO"}`,
    );

    if (!shouldRevise) {
      suppressed += 1;
      console.log(
        "NO REVISION: materiality gate suppressed update.",
      );

      if (changes.length === 0) {
        console.log(
          "- No forecast field changed.",
        );
      } else if (
        !hardTrigger &&
        !evidenceAdvanced
      ) {
        console.log(
          "- Soft change had no new structured or authoritative evidence.",
        );
      } else if (
        !hardTrigger &&
        !cooldownSatisfied &&
        !finalPrematch
      ) {
        console.log(
          "- Soft revision suppressed by 15-minute revision cooldown.",
        );
      }

      continue;
    }

    materialRevisions += 1;

    const reason =
      determineReason(
        secondsToKickoff,
        active,
        proposed,
        evidenceAdvanced,
      );

    console.log("REVISION REQUIRED:");
    for (const change of changes) {
      console.log(`- ${change}`);
    }

    const nextRevisionNumber =
      hasRevision
        ? Number(
            row.latest_revision_number,
          ) + 1
        : 1;

    const inputSnapshot: JsonObject = {
      runnerVersion:
        RUNNER_VERSION,
      authoritativeRoute: {
        baselinePredictionId:
          String(
            row.baseline_prediction_id,
          ),
        route:
          String(row.route),
        routeReason:
          String(row.route_reason),
        modelVersion:
          String(row.model_version),
      },
      fixture: {
        id: String(row.fixture_id),
        provider: "api-football",
        providerId:
          String(row.provider_id),
        homeTeam:
          String(row.home_team_name),
        awayTeam:
          String(row.away_team_name),
        competition:
          String(row.competition_name),
        country:
          row.competition_country === null
            ? null
            : String(
                row.competition_country,
              ),
        kickoffAt,
      },
      purpose: reason,
      previousActiveForecast: active,
      structuredEvidence: {
        providerQuotaExhausted,
        facts,
      },
      webResearch: {
        responseId:
          research.responseId,
        model: OPENAI_MODEL,
        sources:
          research.sources,
      },
      sourcePolicy: {
        official,
        reputableSecondary:
          reputable,
        tipster,
      },
      researchCompletedAt:
        completedAt,
    };

    const output: JsonObject = {
      engine: "gpt_research",
      engineVersion:
        GPT_ENGINE_VERSION,
      forecast:
        proposed.selection,
      selection:
        proposed.selection,
      confidence:
        proposed.confidence,
      evidenceGrade:
        proposed.evidenceGrade,
      goalsView:
        proposed.goalsView,
      bttsView:
        proposed.bttsView,
      lineupState:
        proposed.lineupState,
      materialFactors:
        policyPrediction.materialFactors,
      reasoningSummary:
        policyPrediction.reasoningSummary,
      contradictions:
        policyPrediction.contradictions,
      missingInformation:
        policyPrediction.missingInformation,
      probability: null,
      calibratedProbability: null,
      modelOverride: false,
      sourcePolicy: {
        official,
        reputableSecondary:
          reputable,
        tipster,
      },
    };

    const inputSha256 =
      canonicalSha256(inputSnapshot);
    const outputSha256 =
      canonicalSha256(output);

    console.log(
      `Input SHA: ${inputSha256}`,
    );
    console.log(
      `Output SHA: ${outputSha256}`,
    );

    if (!persist) {
      console.log(
        "READ ONLY: revision not persisted.",
      );
      continue;
    }

    const finalDbNow =
      await databaseNow(sql);

    if (
      ms(finalDbNow) >=
      ms(kickoffAt) -
        SAFETY_LOCK_SECONDS * 1000
    ) {
      skipped += 1;
      console.log(
        "SKIP: database clock entered safety lock before insert.",
      );
      continue;
    }

    const insertRows: JsonObject[] = await sql`
      INSERT INTO public.forecast_revisions (
        baseline_prediction_id,
        fixture_id,
        is_demo,
        revision_number,
        revision_version,
        reason,
        engine,
        engine_version,
        lineup_state,
        kickoff_at,
        input_cutoff_at,
        selection,
        confidence,
        evidence_grade,
        material_changes,
        input_sha256,
        output_sha256,
        input_snapshot,
        output
      )
      VALUES (
        ${String(
          row.baseline_prediction_id,
        )}::uuid,
        ${String(
          row.fixture_id,
        )}::uuid,
        false,
        ${nextRevisionNumber},
        ${REVISION_VERSION},
        ${reason},
        'gpt_research',
        ${GPT_ENGINE_VERSION},
        ${proposed.lineupState},
        ${kickoffAt}::timestamptz,
        ${completedAt}::timestamptz,
        ${proposed.selection},
        ${proposed.confidence},
        ${proposed.evidenceGrade},
        ${JSON.stringify(changes)}::jsonb,
        ${inputSha256},
        ${outputSha256},
        ${JSON.stringify(
          inputSnapshot,
        )}::jsonb,
        ${JSON.stringify(output)}::jsonb
      )

      RETURNING
        id,
        revision_number,
        generated_at
    `;

    assert.equal(
      insertRows.length,
      1,
      "Revision insert did not return exactly one row.",
    );

    inserted += 1;

    const revisionId =
      String(insertRows[0].id);

    console.log(
      `REVISION INSERTED: ${revisionId}`,
    );

    const publishRows: JsonObject[] = await sql`
      UPDATE public.forecast_revisions

      SET published_at =
        clock_timestamp()

      WHERE id =
        ${revisionId}::uuid

        AND published_at
          IS NULL

      RETURNING
        id,
        published_at
    `;

    assert.equal(
      publishRows.length,
      1,
      "Revision publication failed.",
    );

    published += 1;

    console.log(
      `REVISION PUBLISHED: ${iso(
        publishRows[0].published_at,
      )}`,
    );
  }

  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    "PRE-MATCH MONITOR V0.3 SUMMARY",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Authoritative fixtures available: ${rows.length}`,
  );
  console.log(
    `Fixtures scanned: ${candidates.length}`,
  );
  console.log(
    `GPT research calls: ${gptCalls}`,
  );
  console.log(
    `Material revisions: ${materialRevisions}`,
  );
  console.log(
    `Suppressed updates: ${suppressed}`,
  );
  console.log(
    `Revisions inserted: ${inserted}`,
  );
  console.log(
    `Revisions published: ${published}`,
  );
  console.log(
    `Provider-deferred fixtures: ${providerDeferred}`,
  );
  console.log(
    `GPT research failures: ${researchFailed}`,
  );
  console.log(`Skipped: ${skipped}`);
  console.log(
    `API-Football quota circuit breaker: ${providerQuotaExhausted ? "ACTIVE" : "NOT TRIGGERED"}`,
  );

  if (!persist) {
    console.log(
      "READ ONLY COMPLETE: no revisions were written.",
    );
  } else {
    console.log(
      "Authoritative pre-match monitoring complete.",
    );
  }
}

main().catch((error: unknown) => {
  console.error("");
  console.error(
    error instanceof Error
      ? `Authoritative pre-match monitor failed: ${error.message}`
      : "Authoritative pre-match monitor failed.",
  );
  process.exitCode = 1;
});

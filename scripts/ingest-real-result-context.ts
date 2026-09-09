import "./load-env";

import assert from "node:assert/strict";

import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "../src/lib/env/database";

import {
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

import {
  buildFootballDataResultContext,
  ResultContextEvidenceUnavailableError,
} from "../src/lib/predictions/football-data-result-context";

import {
  evaluateResultContextV02,
} from "../src/lib/predictions/result-context-v0.2";

const FOOTBALL_DATA_SOURCE =
  "football-data.org";

const MODEL_VERSION =
  "dictaziq-prematch-markets-v0.1";

function requestedDate():
  string {
  const value =
    process.argv[2]?.trim() ??
    "2026-09-09";

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      "Date must use YYYY-MM-DD.",
    );
  }

  return value;
}

function iso(
  value: unknown,
): string {
  const date =
    value instanceof Date
      ? new Date(
          value.getTime(),
        )
      : new Date(
          String(
            value,
          ),
        );

  assert.ok(
    Number.isFinite(
      date.getTime(),
    ),
    "Invalid timestamp.",
  );

  return date.toISOString();
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  const result =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      result,
    ) ||
    result <= 0
  ) {
    throw new Error(
      `${label} must be a positive integer.`,
    );
  }

  return result;
}

async function main() {
  const date =
    requestedDate();

  const sql =
    neon(
      getDatabaseUrl(),
    );

  const fixtures =
    await sql`
      SELECT DISTINCT ON (
        fixture.id
      )
        fixture.id,
        fixture.provider_id,
        fixture.kickoff_at,

        season.label
          AS season_label,

        home.id
          AS home_team_id,

        home.name
          AS home_team_name,

        home_fd.source_team_id
          AS home_football_data_id,

        away_team.id
          AS away_team_id,

        away_team.name
          AS away_team_name,

        away_fd.source_team_id
          AS away_football_data_id,

        prediction.id
          AS prediction_id,

        prediction.output
          AS prediction_output

      FROM public.fixtures
        AS fixture

      JOIN public.seasons
        AS season
        ON season.id =
          fixture.season_id

      JOIN public.teams
        AS home
        ON home.id =
          fixture.home_team_id

      JOIN public.teams
        AS away_team
        ON away_team.id =
          fixture.away_team_id

      JOIN public.team_source_mappings
        AS home_fd
        ON home_fd.team_id =
          home.id

        AND home_fd.source =
          ${FOOTBALL_DATA_SOURCE}

        AND home_fd.is_verified =
          true

      JOIN public.team_source_mappings
        AS away_fd
        ON away_fd.team_id =
          away_team.id

        AND away_fd.source =
          ${FOOTBALL_DATA_SOURCE}

        AND away_fd.is_verified =
          true

      JOIN public.predictions
        AS prediction
        ON prediction.fixture_id =
          fixture.id

      JOIN public.model_versions
        AS model
        ON model.id =
          prediction.model_version_id

      WHERE fixture.is_demo =
        false

        AND fixture.status =
          'scheduled'

        AND (
          fixture.kickoff_at
          AT TIME ZONE 'UTC'
        )::date =
          ${date}::date

        AND model.version =
          ${MODEL_VERSION}

        AND prediction.output
          #>> '{result,requiresContext}' =
          'true'

      ORDER BY
        fixture.id,
        prediction.generated_at DESC
    `;

  assert.ok(
    fixtures.length > 0,
    "No context-required fixtures found.",
  );

  console.log(
    `Context-required fixtures: ${fixtures.length}`,
  );

  let inserted =
    0;

  let existing =
    0;

  let unavailable =
    0;

  for (
    const fixture
    of fixtures
  ) {
    console.log("");
    console.log(
      "========================================",
    );

    console.log(
      `${fixture.home_team_name} vs ${fixture.away_team_name}`,
    );

    const kickoffAt =
      iso(
        fixture.kickoff_at,
      );

    console.log(
      `Kickoff: ${kickoffAt}`,
    );

    if (
      Date.now() >=
      Date.parse(
        kickoffAt,
      )
    ) {
      console.log(
        "NO CONTEXT: kickoff has passed.",
      );

      unavailable += 1;

      continue;
    }

    const seasonYear =
      Number(
        fixture.season_label,
      );

    if (
      !Number.isInteger(
        seasonYear,
      )
    ) {
      throw new Error(
        `Invalid season label: ${fixture.season_label}`,
      );
    }

    let evidence;

    try {
      evidence =
        await buildFootballDataResultContext({
          fixtureId:
            String(
              fixture.id,
            ),

          kickoffAt,

          seasonYear,

          home: {
            canonicalTeamId:
              String(
                fixture.home_team_id,
              ),

            canonicalName:
              String(
                fixture.home_team_name,
              ),

            footballDataTeamId:
              positiveInteger(
                fixture.home_football_data_id,
                "Home football-data.org team ID",
              ),
          },

          away: {
            canonicalTeamId:
              String(
                fixture.away_team_id,
              ),

            canonicalName:
              String(
                fixture.away_team_name,
              ),

            footballDataTeamId:
              positiveInteger(
                fixture.away_football_data_id,
                "Away football-data.org team ID",
              ),
          },
        });
    } catch (
      error: unknown
    ) {
      if (
        error instanceof
        ResultContextEvidenceUnavailableError
      ) {
        console.log(
          `NO CONTEXT: ${error.message}`,
        );

        unavailable +=
          1;

        continue;
      }

      throw error;
    }

    /*
     * We persist three independent raw evidence
     * categories, all neutral.
     *
     * Direction is calculated by the result
     * engine, not baked into evidence storage.
     */
    const contexts = [
      {
        kind:
          "recent_form",

        description:
          [
            "Verified recent W/D/L form.",
            `Home ${evidence.home.recent.record.wins}W-`,
            `${evidence.home.recent.record.draws}D-`,
            `${evidence.home.recent.record.losses}L;`,
            `Away ${evidence.away.recent.record.wins}W-`,
            `${evidence.away.recent.record.draws}D-`,
            `${evidence.away.recent.record.losses}L.`,
          ].join(
            " ",
          ),

        evidence: {
          contractVersion:
            evidence.version,

          fixtureId:
            evidence.fixtureId,

          home:
            evidence.home.recent,

          away:
            evidence.away.recent,
        },
      },

      {
        kind:
          "home_away_form",

        description:
          evidence.home.venue &&
          evidence.away.venue
            ? [
                "Verified venue-specific W/D/L form.",
                `Home-at-home ${evidence.home.venue.record.wins}W-`,
                `${evidence.home.venue.record.draws}D-`,
                `${evidence.home.venue.record.losses}L;`,
                `Away-away ${evidence.away.venue.record.wins}W-`,
                `${evidence.away.venue.record.draws}D-`,
                `${evidence.away.venue.record.losses}L.`,
              ].join(
                " ",
              )
            : "Venue-specific form sample is incomplete.",

        evidence: {
          contractVersion:
            evidence.version,

          fixtureId:
            evidence.fixtureId,

          home:
            evidence.home.venue,

          away:
            evidence.away.venue,
        },
      },

      {
        kind:
          "rest_schedule",

        description:
          `Verified whole-day kickoff-to-kickoff rest: home=${evidence.home.restDays}, away=${evidence.away.restDays}.`,

        evidence: {
          contractVersion:
            evidence.version,

          fixtureId:
            evidence.fixtureId,

          home: {
            restDays:
              evidence.home.restDays,

            lastMatchKickoffAt:
              evidence.home.lastMatchKickoffAt,
          },

          away: {
            restDays:
              evidence.away.restDays,

            lastMatchKickoffAt:
              evidence.away.lastMatchKickoffAt,
          },

          calculation:
            "floor((fixture kickoff - previous match kickoff) / 86400000)",
        },
      },
    ] as const;

    for (
      const context
      of contexts
    ) {
      /*
       * Do not persist a fake venue factor when
       * one side lacks the required venue sample.
       */
      if (
        context.kind ===
          "home_away_form" &&
        (
          !evidence.home.venue ||
          !evidence.away.venue
        )
      ) {
        console.log(
          "VENUE CONTEXT: insufficient sample; not persisted.",
        );

        continue;
      }

      const sourceEvidenceId =
        [
          FOOTBALL_DATA_SOURCE,
          "result-context",
          fixture.id,
          context.kind,
        ].join(
          ":",
        );

      const identityPayload = {
        fixtureId:
          String(
            fixture.id,
          ),

        kind:
          context.kind,

        side:
          "neutral",

        description:
          context.description,

        source:
          FOOTBALL_DATA_SOURCE,

        sourceEvidenceId,

        evidence:
          context.evidence,
      };

      const evidenceSha256 =
        canonicalSha256(
          identityPayload,
        );

      const rows =
        await sql`
          INSERT INTO public.context_evidence_snapshots (
            fixture_id,
            kind,
            side,
            description,
            source,
            source_evidence_id,
            evidence_sha256,
            is_demo,
            observed_at,
            evidence
          )
          VALUES (
            ${String(
              fixture.id,
            )}::uuid,

            ${context.kind},

            'neutral',

            ${context.description},

            ${FOOTBALL_DATA_SOURCE},

            ${sourceEvidenceId},

            ${evidenceSha256},

            false,

            ${evidence.observedAt}::timestamptz,

            ${JSON.stringify(
              context.evidence,
            )}::jsonb
          )

          ON CONFLICT (
            fixture_id,
            evidence_sha256
          )
          DO NOTHING

          RETURNING
            id
        `;

      if (
        rows.length ===
        1
      ) {
        inserted += 1;

        console.log(
          `CONTEXT INSERTED | ${context.kind} | id=${rows[0].id}`,
        );
      } else {
        existing += 1;

        console.log(
          `CONTEXT EXISTING | ${context.kind}`,
        );
      }
    }

    const predictionOutput =
      fixture.prediction_output as
        Record<
          string,
          unknown
        >;

    const resultOutput =
      predictionOutput.result as
        Record<
          string,
          unknown
        >;

    const ratingGap =
      Number(
        resultOutput.ratingGap,
      );

    assert.ok(
      Number.isInteger(
        ratingGap,
      ),
      "Draft rating gap is invalid.",
    );

    const evaluation =
      evaluateResultContextV02({
        ratingGap,

        home: {
          recent:
            evidence.home
              .recent
              .record,

          venue:
            evidence.home
              .venue
              ?.record ??
            null,

          restDays:
            evidence.home
              .restDays,
        },

        away: {
          recent:
            evidence.away
              .recent
              .record,

          venue:
            evidence.away
              .venue
              ?.record ??
            null,

          restDays:
            evidence.away
              .restDays,
        },
      });

    console.log("");

    console.log(
      `RESULT CONTEXT | status=${evaluation.status} | selection=${evaluation.selection}`,
    );

    for (
      const signal
      of evaluation.signals
    ) {
      console.log(
        [
          signal.kind,
          `side=${signal.side}`,
          signal.description,
        ].join(
          " | ",
        ),
      );
    }

    console.log(
      "Prediction changed: NO",
    );
  }

  console.log("");
  console.log(
    "========================================",
  );

  console.log(
    `Context inserted: ${inserted}`,
  );

  console.log(
    `Context existing: ${existing}`,
  );

  console.log(
    `Fixtures unavailable: ${unavailable}`,
  );

  console.log(
    "Predictions changed: 0",
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
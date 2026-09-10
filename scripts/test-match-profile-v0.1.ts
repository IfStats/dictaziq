import assert from "node:assert/strict";

import {
  evaluateMatchProfileV01,
  MATCH_PROFILE_MODEL_VERSION_V01,
} from "../src/lib/predictions/match-profile-v0.1";

const SOURCE =
  "footballdatabase.com";

const DATES = [
  "2026-08-16",
  "2026-08-23",
  "2026-08-30",
  "2026-09-06",
];

function team(
  teamId: string,
  teamName: string,
  ratings: number[],
) {
  return {
    teamId,
    teamName,

    asOfDate:
      "2026-09-10",

    snapshots:
      ratings.map(
        (
          rating,
          index,
        ) => ({
          rating,

          snapshotDate:
            DATES[index],

          source:
            SOURCE,
        }),
      ),
  };
}

function currentOnly(
  teamId: string,
  teamName: string,
  rating: number,
) {
  return {
    teamId,
    teamName,

    asOfDate:
      "2026-09-10",

    snapshots: [
      {
        rating,

        snapshotDate:
          "2026-09-06",

        source:
          SOURCE,
      },
    ],
  };
}

function main() {
  /*
   * TRUE PARITY
   *
   * Current D = +2.
   * No usable trajectory.
   */
  const trueParity =
    evaluateMatchProfileV01({
      country:
        "England",

      competitionName:
        "Premier League",

      home:
        currentOnly(
          "home-parity",
          "Home Parity",
          1802,
        ),

      away:
        currentOnly(
          "away-parity",
          "Away Parity",
          1800,
        ),
    });

  assert.equal(
    trueParity.currentRatingGap,
    2,
  );

  assert.equal(
    trueParity.gapClass,
    "micro_parity",
  );

  assert.equal(
    trueParity.profile,
    "true_parity",
  );

  assert.equal(
    trueParity.forecast,
    "draw",
  );

  /*
   * EGYPT MICRO PARITY
   *
   * League behaviour reinforces Draw and
   * supplies Under 2.5 support.
   */
  const egypt =
    evaluateMatchProfileV01({
      country:
        "Egypt",

      competitionName:
        "Premier League",

      home:
        currentOnly(
          "egypt-home",
          "Egypt Home",
          1503,
        ),

      away:
        currentOnly(
          "egypt-away",
          "Egypt Away",
          1500,
        ),
    });

  assert.equal(
    egypt.profile,
    "true_parity",
  );

  assert.equal(
    egypt.forecast,
    "draw",
  );

  assert.equal(
    egypt.leagueAgreement,
    "reinforces",
  );

  assert.equal(
    egypt.marketSignals.goals,
    "under_2_5_support",
  );

  /*
   * DIRECTIONAL PARITY
   *
   * D = +25.
   * Current ratings are close but directional.
   */
  const directionalParity =
    evaluateMatchProfileV01({
      country:
        "England",

      competitionName:
        "Premier League",

      home:
        currentOnly(
          "direction-home",
          "Direction Home",
          1825,
        ),

      away:
        currentOnly(
          "direction-away",
          "Direction Away",
          1800,
        ),
    });

  assert.equal(
    directionalParity.currentRatingGap,
    25,
  );

  assert.equal(
    directionalParity.gapClass,
    "small_parity",
  );

  assert.equal(
    directionalParity.profile,
    "directional_parity",
  );

  assert.equal(
    directionalParity.forecast,
    "home",
  );

  /*
   * UNSTABLE SMALL PARITY
   *
   * Home currently +25,
   * but home is falling and away is rising.
   */
  const unstableParity =
    evaluateMatchProfileV01({
      country:
        "England",

      competitionName:
        "Premier League",

      home:
        team(
          "unstable-home",
          "Unstable Home",
          [
            1900,
            1875,
            1850,
            1825,
          ],
        ),

      away:
        team(
          "unstable-away",
          "Unstable Away",
          [
            1710,
            1740,
            1770,
            1800,
          ],
        ),
    });

  assert.equal(
    unstableParity.currentRatingGap,
    25,
  );

  assert.equal(
    unstableParity.profile,
    "unstable_parity",
  );

  assert.equal(
    unstableParity.trajectoryInteraction,
    "conflicting",
  );

  /*
   * STABLE ADVANTAGE
   *
   * D = +100.
   * Same trajectory rate.
   */
  const stableAdvantage =
    evaluateMatchProfileV01({
      country:
        "England",

      competitionName:
        "Premier League",

      home:
        team(
          "stable-home",
          "Stable Home",
          [
            1770,
            1780,
            1790,
            1800,
          ],
        ),

      away:
        team(
          "stable-away",
          "Stable Away",
          [
            1670,
            1680,
            1690,
            1700,
          ],
        ),
    });

  assert.equal(
    stableAdvantage.currentRatingGap,
    100,
  );

  assert.equal(
    stableAdvantage.profile,
    "stable_advantage",
  );

  assert.equal(
    stableAdvantage.trajectoryInteraction,
    "stable",
  );

  /*
   * REINFORCED ADVANTAGE
   *
   * D = +100.
   * Higher-rated home rising,
   * lower-rated away falling.
   */
  const reinforced =
    evaluateMatchProfileV01({
      country:
        "England",

      competitionName:
        "Premier League",

      home:
        team(
          "reinforced-home",
          "Reinforced Home",
          [
            1740,
            1760,
            1780,
            1800,
          ],
        ),

      away:
        team(
          "reinforced-away",
          "Reinforced Away",
          [
            1760,
            1740,
            1720,
            1700,
          ],
        ),
    });

  assert.equal(
    reinforced.profile,
    "reinforced_advantage",
  );

  assert.equal(
    reinforced.trajectoryInteraction,
    "confirming",
  );

  /*
   * CHALLENGED ADVANTAGE
   *
   * Current D = +100,
   * but stronger side is falling
   * while weaker side rises.
   */
  const challenged =
    evaluateMatchProfileV01({
      country:
        "England",

      competitionName:
        "Premier League",

      home:
        team(
          "challenged-home",
          "Challenged Home",
          [
            1860,
            1840,
            1820,
            1800,
          ],
        ),

      away:
        team(
          "challenged-away",
          "Challenged Away",
          [
            1640,
            1660,
            1680,
            1700,
          ],
        ),
    });

  assert.equal(
    challenged.currentRatingGap,
    100,
  );

  assert.equal(
    challenged.profile,
    "challenged_advantage",
  );

  assert.equal(
    challenged.trajectoryInteraction,
    "conflicting",
  );

  /*
   * DOMINANT ADVANTAGE
   *
   * Today's Fenerbahçe/Roma-type gap.
   *
   * D = -163.
   */
  const dominantAway =
    evaluateMatchProfileV01({
      country:
        "World",

      competitionName:
        "UEFA Champions League",

      home:
        currentOnly(
          "fenerbahce",
          "Fenerbahçe",
          1702,
        ),

      away:
        currentOnly(
          "roma",
          "AS Roma",
          1865,
        ),
    });

  assert.equal(
    dominantAway.currentRatingGap,
    -163,
  );

  assert.equal(
    dominantAway.gapClass,
    "major_advantage",
  );

  assert.equal(
    dominantAway.profile,
    "dominant_advantage",
  );

  assert.equal(
    dominantAway.forecast,
    "away",
  );

  /*
   * Today's PSV/Shakhtar-type gap.
   *
   * D = +166.
   */
  const dominantHome =
    evaluateMatchProfileV01({
      country:
        "World",

      competitionName:
        "UEFA Champions League",

      home:
        currentOnly(
          "psv",
          "PSV Eindhoven",
          1832,
        ),

      away:
        currentOnly(
          "shakhtar",
          "Shakhtar Donetsk",
          1666,
        ),
    });

  assert.equal(
    dominantHome.currentRatingGap,
    166,
  );

  assert.equal(
    dominantHome.profile,
    "dominant_advantage",
  );

  assert.equal(
    dominantHome.forecast,
    "home",
  );

  /*
   * SWING LEAGUE
   *
   * A normal mathematical advantage remains,
   * but league reliability challenges it.
   */
  const slovenia =
    evaluateMatchProfileV01({
      country:
        "Slovenia",

      competitionName:
        "PrvaLiga",

      home:
        currentOnly(
          "slovenia-home",
          "Slovenia Home",
          1700,
        ),

      away:
        currentOnly(
          "slovenia-away",
          "Slovenia Away",
          1600,
        ),
    });

  assert.equal(
    slovenia.currentRatingGap,
    100,
  );

  assert.equal(
    slovenia.profile,
    "challenged_advantage",
  );

  assert.equal(
    slovenia.gapReliability,
    "reduced",
  );

  /*
   * PRIOR ONLY
   *
   * Every fixture can still receive a forecast
   * while Match Profile clearly records that
   * no rating relationship exists.
   */
  const priorOnly =
    evaluateMatchProfileV01({
      country:
        null,

      competitionName:
        null,

      home: {
        teamId:
          "unknown-home",

        teamName:
          "Unknown Home",

        asOfDate:
          "2026-09-10",

        snapshots: [],
      },

      away: {
        teamId:
          "unknown-away",

        teamName:
          "Unknown Away",

        asOfDate:
          "2026-09-10",

        snapshots: [],
      },
    });

  assert.equal(
    priorOnly.profile,
    "prior_only",
  );

  assert.equal(
    priorOnly.gapClass,
    "unavailable",
  );

  assert.equal(
    priorOnly.currentRatingGap,
    null,
  );

  assert.equal(
    priorOnly.forecast,
    "home",
  );

  assert.equal(
    priorOnly.evidenceGrade,
    "E",
  );

  /*
   * Integrity requirements.
   */
  const outputs = [
    trueParity,
    egypt,
    directionalParity,
    unstableParity,
    stableAdvantage,
    reinforced,
    challenged,
    dominantAway,
    dominantHome,
    slovenia,
    priorOnly,
  ];

  for (
    const output
    of outputs
  ) {
    assert.equal(
      output.modelVersion,
      MATCH_PROFILE_MODEL_VERSION_V01,
    );

    assert.equal(
      output.calibratedProbability,
      null,
    );

    assert.equal(
      output.recommendationStatus,
      "not_evaluated",
    );

    assert.equal(
      output.components
        .outcome
        .calibratedProbability,
      null,
    );

    assert.equal(
      output.components
        .ratingInteraction
        .calibratedProbability,
      null,
    );
  }

  /*
   * Verify Match Profile did not secretly
   * alter current ratings.
   */
  assert.equal(
    dominantAway
      .components
      .ratingInteraction
      .home
      .currentRating,
    1702,
  );

  assert.equal(
    dominantAway
      .components
      .ratingInteraction
      .away
      .currentRating,
    1865,
  );

  console.log(
    `PASS: ${MATCH_PROFILE_MODEL_VERSION_V01}`,
  );

  console.log(
    "PASS: 0-4 rating differences classify as mathematical parity.",
  );

  console.log(
    "PASS: 5-49 rating differences classify as directional or unstable parity.",
  );

  console.log(
    "PASS: 50-149 advantages distinguish stable, reinforced and challenged states.",
  );

  console.log(
    "PASS: 150+ rating differences classify as dominant advantages when not challenged.",
  );

  console.log(
    "PASS: rating trajectory can challenge or reinforce an advantage without changing ratings.",
  );

  console.log(
    "PASS: swing-league behaviour can challenge reliability without reversing the mathematical gap.",
  );

  console.log(
    "PASS: prior-only fixtures remain explicitly separated from rating-driven fixtures.",
  );

  console.log(
    "PASS: no probability is fabricated.",
  );

  console.log(
    "PASS: no betting recommendation is generated.",
  );

  console.log("");

  console.log(
    `TRUE PARITY: D=${trueParity.currentRatingGap} | ${trueParity.profile}`,
  );

  console.log(
    `DIRECTIONAL PARITY: D=${directionalParity.currentRatingGap} | ${directionalParity.profile}`,
  );

  console.log(
    `REINFORCED: D=${reinforced.currentRatingGap} | ${reinforced.profile}`,
  );

  console.log(
    `CHALLENGED: D=${challenged.currentRatingGap} | ${challenged.profile}`,
  );

  console.log(
    `Fenerbahçe vs Roma: D=${dominantAway.currentRatingGap} | ${dominantAway.forecast.toUpperCase()} | ${dominantAway.profile}`,
  );

  console.log(
    `PSV vs Shakhtar: D=${dominantHome.currentRatingGap} | ${dominantHome.forecast.toUpperCase()} | ${dominantHome.profile}`,
  );
}

main();
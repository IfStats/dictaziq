import assert from "node:assert/strict";

import {
  compareStructuralStrengthV01,
  evaluateStructuralTeamStrengthV01,
  STRUCTURAL_STRENGTH_MODEL_VERSION_V01,
} from "../src/lib/predictions/structural-strength-v0.1";

const SOURCE =
  "footballdatabase.com";

function snapshot(
  rating: number,
  snapshotDate: string,
) {
  return {
    rating,
    snapshotDate,
    source:
      SOURCE,
  };
}

function main() {
  /*
   * Six weekly snapshots spanning exactly
   * 35 days are sufficient.
   *
   * Ratings:
   * 1800
   * 1810
   * 1820
   * 1830
   * 1840
   * 1850
   *
   * Median:
   * (1820 + 1830) / 2 = 1825
   */
  const strongTeam =
    evaluateStructuralTeamStrengthV01({
      teamId:
        "team-strong",

      teamName:
        "Strong Team",

      asOfDate:
        "2026-09-10",

      ratings: [
        snapshot(
          1800,
          "2026-08-02",
        ),

        snapshot(
          1810,
          "2026-08-09",
        ),

        snapshot(
          1820,
          "2026-08-16",
        ),

        snapshot(
          1830,
          "2026-08-23",
        ),

        snapshot(
          1840,
          "2026-08-30",
        ),

        snapshot(
          1850,
          "2026-09-06",
        ),
      ],
    });

  assert.equal(
    strongTeam.status,
    "available",
  );

  assert.equal(
    strongTeam.structuralRating,
    1825,
  );

  assert.equal(
    strongTeam.historySampleSize,
    6,
  );

  assert.equal(
    strongTeam.historySpanDays,
    35,
  );

  assert.equal(
    strongTeam.minimumRating,
    1800,
  );

  assert.equal(
    strongTeam.maximumRating,
    1850,
  );

  assert.equal(
    strongTeam.ratingRange,
    50,
  );

  /*
   * Five snapshots are insufficient.
   */
  const insufficientSample =
    evaluateStructuralTeamStrengthV01({
      teamId:
        "team-short",

      teamName:
        "Short History",

      asOfDate:
        "2026-09-10",

      ratings: [
        snapshot(
          1600,
          "2026-08-09",
        ),

        snapshot(
          1610,
          "2026-08-16",
        ),

        snapshot(
          1620,
          "2026-08-23",
        ),

        snapshot(
          1630,
          "2026-08-30",
        ),

        snapshot(
          1640,
          "2026-09-06",
        ),
      ],
    });

  assert.equal(
    insufficientSample.status,
    "unavailable",
  );

  assert.equal(
    insufficientSample.structuralRating,
    null,
  );

  /*
   * Six observations that are too tightly
   * compressed in time are also insufficient.
   */
  const insufficientSpan =
    evaluateStructuralTeamStrengthV01({
      teamId:
        "team-compressed",

      teamName:
        "Compressed History",

      asOfDate:
        "2026-09-10",

      ratings: [
        snapshot(
          1600,
          "2026-08-12",
        ),

        snapshot(
          1602,
          "2026-08-17",
        ),

        snapshot(
          1604,
          "2026-08-22",
        ),

        snapshot(
          1606,
          "2026-08-27",
        ),

        snapshot(
          1608,
          "2026-09-01",
        ),

        snapshot(
          1610,
          "2026-09-06",
        ),
      ],
    });

  assert.equal(
    insufficientSpan.status,
    "unavailable",
  );

  assert.equal(
    insufficientSpan.structuralRating,
    null,
  );

  /*
   * Structural matchup:
   *
   * Home median = 1825
   * Away median = 1725
   *
   * S = +100
   *
   * Structural advantage for home.
   */
  const matchup =
    compareStructuralStrengthV01(
      {
        teamId:
          "home-team",

        teamName:
          "Home Team",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1800,
            "2026-08-02",
          ),

          snapshot(
            1810,
            "2026-08-09",
          ),

          snapshot(
            1820,
            "2026-08-16",
          ),

          snapshot(
            1830,
            "2026-08-23",
          ),

          snapshot(
            1840,
            "2026-08-30",
          ),

          snapshot(
            1850,
            "2026-09-06",
          ),
        ],
      },

      {
        teamId:
          "away-team",

        teamName:
          "Away Team",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1700,
            "2026-08-02",
          ),

          snapshot(
            1710,
            "2026-08-09",
          ),

          snapshot(
            1720,
            "2026-08-16",
          ),

          snapshot(
            1730,
            "2026-08-23",
          ),

          snapshot(
            1740,
            "2026-08-30",
          ),

          snapshot(
            1750,
            "2026-09-06",
          ),
        ],
      },
    );

  assert.equal(
    matchup.structuralGap,
    100,
  );

  assert.equal(
    matchup.absoluteStructuralGap,
    100,
  );

  assert.equal(
    matchup.relationship,
    "home_advantage",
  );

  /*
   * Persistent parity.
   */
  const parity =
    compareStructuralStrengthV01(
      {
        teamId:
          "elite-a",

        teamName:
          "Elite A",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            2000,
            "2026-08-02",
          ),

          snapshot(
            2010,
            "2026-08-09",
          ),

          snapshot(
            2020,
            "2026-08-16",
          ),

          snapshot(
            2030,
            "2026-08-23",
          ),

          snapshot(
            2040,
            "2026-08-30",
          ),

          snapshot(
            2050,
            "2026-09-06",
          ),
        ],
      },

      {
        teamId:
          "elite-b",

        teamName:
          "Elite B",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1980,
            "2026-08-02",
          ),

          snapshot(
            1990,
            "2026-08-09",
          ),

          snapshot(
            2000,
            "2026-08-16",
          ),

          snapshot(
            2010,
            "2026-08-23",
          ),

          snapshot(
            2020,
            "2026-08-30",
          ),

          snapshot(
            2030,
            "2026-09-06",
          ),
        ],
      },
    );

  assert.equal(
    parity.structuralGap,
    20,
  );

  assert.equal(
    parity.relationship,
    "structural_parity",
  );

  /*
   * This is the City-Arsenal-type concept:
   *
   * a small structural separation does NOT mean
   * the clubs are weak.
   *
   * Their absolute structural levels remain
   * visible separately.
   */
  assert.equal(
    parity.home.structuralRating,
    2025,
  );

  assert.equal(
    parity.away.structuralRating,
    2005,
  );

  /*
   * Strong structural away advantage.
   */
  const strongAway =
    compareStructuralStrengthV01(
      {
        teamId:
          "home-low",

        teamName:
          "Home Low",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1500,
            "2026-08-02",
          ),

          snapshot(
            1510,
            "2026-08-09",
          ),

          snapshot(
            1520,
            "2026-08-16",
          ),

          snapshot(
            1530,
            "2026-08-23",
          ),

          snapshot(
            1540,
            "2026-08-30",
          ),

          snapshot(
            1550,
            "2026-09-06",
          ),
        ],
      },

      {
        teamId:
          "away-high",

        teamName:
          "Away High",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1750,
            "2026-08-02",
          ),

          snapshot(
            1760,
            "2026-08-09",
          ),

          snapshot(
            1770,
            "2026-08-16",
          ),

          snapshot(
            1780,
            "2026-08-23",
          ),

          snapshot(
            1790,
            "2026-08-30",
          ),

          snapshot(
            1800,
            "2026-09-06",
          ),
        ],
      },
    );

  assert.equal(
    strongAway.structuralGap,
    -250,
  );

  assert.equal(
    strongAway.relationship,
    "strong_away_advantage",
  );

  /*
   * One unavailable side means no fabricated
   * structural matchup.
   */
  const incompletePair =
    compareStructuralStrengthV01(
      {
        teamId:
          "known",

        teamName:
          "Known Team",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1700,
            "2026-08-02",
          ),

          snapshot(
            1710,
            "2026-08-09",
          ),

          snapshot(
            1720,
            "2026-08-16",
          ),

          snapshot(
            1730,
            "2026-08-23",
          ),

          snapshot(
            1740,
            "2026-08-30",
          ),

          snapshot(
            1750,
            "2026-09-06",
          ),
        ],
      },

      {
        teamId:
          "unknown",

        teamName:
          "Unknown Team",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1600,
            "2026-09-06",
          ),
        ],
      },
    );

  assert.equal(
    incompletePair.relationship,
    "insufficient_pair",
  );

  assert.equal(
    incompletePair.structuralGap,
    null,
  );

  /*
   * Future information must never enter the
   * structural calculation.
   */
  assert.throws(
    () =>
      evaluateStructuralTeamStrengthV01({
        teamId:
          "future-test",

        teamName:
          "Future Test",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1700,
            "2026-09-13",
          ),
        ],
      }),
    /after the as-of date/,
  );

  /*
   * Duplicate weekly snapshot dates rejected.
   */
  assert.throws(
    () =>
      evaluateStructuralTeamStrengthV01({
        teamId:
          "duplicate-test",

        teamName:
          "Duplicate Test",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1700,
            "2026-09-06",
          ),

          snapshot(
            1710,
            "2026-09-06",
          ),
        ],
      }),
    /Duplicate structural rating snapshot date/,
  );

  /*
   * Mixed rating providers rejected.
   */
  assert.throws(
    () =>
      evaluateStructuralTeamStrengthV01({
        teamId:
          "source-test",

        teamName:
          "Source Test",

        asOfDate:
          "2026-09-10",

        ratings: [
          snapshot(
            1700,
            "2026-08-30",
          ),

          {
            rating:
              1710,

            snapshotDate:
              "2026-09-06",

            source:
              "another-provider",
          },
        ],
      }),
    /same source/,
  );

  const results = [
    strongTeam,
    insufficientSample,
    insufficientSpan,
    matchup.home,
    matchup.away,
    parity.home,
    parity.away,
    strongAway.home,
    strongAway.away,
  ];

  for (
    const result
    of results
  ) {
    assert.equal(
      result.modelVersion,
      STRUCTURAL_STRENGTH_MODEL_VERSION_V01,
    );

    assert.equal(
      result.calibratedProbability,
      null,
    );

    assert.equal(
      result.recommendationStatus,
      "not_evaluated",
    );
  }

  const matchups = [
    matchup,
    parity,
    strongAway,
    incompletePair,
  ];

  for (
    const result
    of matchups
  ) {
    assert.equal(
      result.calibratedProbability,
      null,
    );

    assert.equal(
      result.recommendationStatus,
      "not_evaluated",
    );
  }

  console.log(
    `PASS: ${STRUCTURAL_STRENGTH_MODEL_VERSION_V01}`,
  );

  console.log(
    "PASS: structural strength requires sufficient historical depth.",
  );

  console.log(
    "PASS: six weekly snapshots spanning 35 days qualify.",
  );

  console.log(
    "PASS: median historical rating provides the slow-moving structural rating.",
  );

  console.log(
    "PASS: insufficient history remains unavailable instead of being fabricated.",
  );

  console.log(
    "PASS: structural matchup identifies persistent parity and structural advantage.",
  );

  console.log(
    "PASS: absolute team strength remains visible even when the structural gap is small.",
  );

  console.log(
    "PASS: future snapshots are rejected.",
  );

  console.log(
    "PASS: duplicate snapshot dates are rejected.",
  );

  console.log(
    "PASS: mixed rating providers are rejected.",
  );

  console.log(
    "PASS: no calibrated probabilities are fabricated.",
  );

  console.log(
    "PASS: structural strength does not itself create betting recommendations.",
  );

  console.log("");

  console.log(
    `Elite parity example: ${parity.home.structuralRating} vs ${parity.away.structuralRating} | S=${parity.structuralGap} | ${parity.relationship}`,
  );

  console.log(
    `Structural advantage example: ${matchup.home.structuralRating} vs ${matchup.away.structuralRating} | S=${matchup.structuralGap} | ${matchup.relationship}`,
  );
}

main();
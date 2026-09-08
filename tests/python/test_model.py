import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "services" / "predictions"))

from model import predict  # noqa: E402


class PredictionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = {
            "id": "demo-upcoming",
            "competition_id": "demo-league",
            "home_team_id": "demo-home",
            "away_team_id": "demo-away",
            "kickoff_at": "2026-09-12T19:00:00Z",
            "is_demo": True,
        }
        self.cutoff = "2026-09-08T00:00:00Z"

        # Synthetic test inputs; no claim of real sporting history.
        self.history = [
            {
                "id": f"demo-history-{index}",
                "competition_id": "demo-league",
                "home_team_id": (
                    "demo-home" if index % 2 == 0 else "demo-other-home"
                ),
                "away_team_id": (
                    "demo-away" if index % 3 == 0 else "demo-other-away"
                ),
                "home_goals": index % 4,
                "away_goals": (index // 2) % 3,
                "finished_at": (
                    f"2026-07-{index % 28 + 1:02d}T18:00:00Z"
                ),
                "available_at": "2026-08-01T00:00:00Z",
                "status": "finished",
                "regulation_confirmed": True,
                "is_demo": True,
            }
            for index in range(60)
        ]

    def test_market_consistency(self):
        result = predict(self.fixture, self.history, self.cutoff)
        markets = result["markets"]

        self.assertAlmostEqual(sum(markets["1x2"].values()), 1.0)

        for name in ("btts", "goals_1.5", "goals_2.5", "goals_3.5"):
            self.assertAlmostEqual(sum(markets[name].values()), 1.0)

        for market in markets.values():
            for probability in market.values():
                self.assertGreaterEqual(probability, 0)
                self.assertLessEqual(probability, 1)

        self.assertGreaterEqual(
            markets["goals_1.5"]["over"],
            markets["goals_2.5"]["over"],
        )
        self.assertGreaterEqual(
            markets["goals_2.5"]["over"],
            markets["goals_3.5"]["over"],
        )

    def test_unavailable_evidence_cannot_change_prediction(self):
        baseline = predict(self.fixture, self.history, self.cutoff)

        future_result = {
            **self.history[0],
            "id": "future-result",
            "finished_at": "2026-09-09T20:00:00Z",
            "available_at": "2026-09-09T21:00:00Z",
            "home_goals": 20,
        }
        late_arriving_result = {
            **self.history[0],
            "id": "late-arriving-result",
            "available_at": "2026-09-09T21:00:00Z",
            "home_goals": 20,
        }
        real_record = {
            **self.history[0],
            "id": "real-record",
            "is_demo": False,
            "home_goals": 20,
        }

        changed = predict(
            self.fixture,
            self.history + [
                future_result,
                late_arriving_result,
                real_record,
            ],
            self.cutoff,
        )
        self.assertEqual(baseline, changed)

    def test_insufficient_history_is_suppressed(self):
        with self.assertRaisesRegex(ValueError, "insufficient"):
            predict(self.fixture, self.history[:4], self.cutoff)

    def test_kickoff_cutoff_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "precede kickoff"):
            predict(
                self.fixture,
                self.history,
                self.fixture["kickoff_at"],
            )

    def test_duplicate_history_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            predict(
                self.fixture,
                self.history + [self.history[0]],
                self.cutoff,
            )


if __name__ == "__main__":
    unittest.main()
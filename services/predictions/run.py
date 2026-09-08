import hashlib
import json
import math
import sys
from pathlib import Path

from model import (
    MODEL_VERSION,
    MIN_LEAGUE_MATCHES,
    MIN_VENUE_MATCHES,
    PRIOR_MATCHES,
    MAX_GOALS,
    predict,
)


def reject_constant(value):
    raise ValueError(f"Invalid JSON numeric constant: {value}")


def main():
    request = json.load(sys.stdin, parse_constant=reject_constant)

    result = predict(
        request["fixture"],
        request["history"],
        request["cutoff"],
    )

    for market in result["markets"].values():
        for probability in market.values():
            if (
                not math.isfinite(probability)
                or probability < 0
                or probability > 1
            ):
                raise ValueError("Invalid model probability.")

    for market_name in ("1x2", "btts", "goals_1.5", "goals_2.5", "goals_3.5"):
        total = sum(result["markets"][market_name].values())

        if not math.isclose(total, 1.0, abs_tol=1e-9):
            raise ValueError("Outcome probabilities do not sum to one.")

    # Normalize line endings so Windows/Linux checkouts have the same hash.
    model_source = Path(__file__).with_name("model.py").read_text(
        encoding="utf-8"
    )

    canonical_input = json.dumps(
        request,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )

    envelope = {
        "model_version": MODEL_VERSION,
        "code_sha256": hashlib.sha256(
            model_source.encode("utf-8")
        ).hexdigest(),
        "input_sha256": hashlib.sha256(
            canonical_input.encode("utf-8")
        ).hexdigest(),
        "configuration": {
            "minimum_league_matches": MIN_LEAGUE_MATCHES,
            "minimum_venue_matches": MIN_VENUE_MATCHES,
            "prior_matches": PRIOR_MATCHES,
            "maximum_goals": MAX_GOALS,
            "validation_status": "experimental",
        },
        "prediction": result,
    }

    json.dump(envelope, sys.stdout, allow_nan=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError) as error:
        print(f"Prediction rejected: {error}", file=sys.stderr)
        sys.exit(1)
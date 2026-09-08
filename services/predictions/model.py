"""DictazIQ experimental football baseline. Standard library only."""

from datetime import datetime, timezone
from math import exp, isfinite

MODEL_VERSION = "football-poisson-v0.1.0"
MIN_LEAGUE_MATCHES = 30
MIN_VENUE_MATCHES = 5
PRIOR_MATCHES = 5
MAX_GOALS = 30


def parse_time(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if result.tzinfo is None:
        raise ValueError("All timestamps must include a timezone.")

    return result.astimezone(timezone.utc)


def poisson_probabilities(rate):
    values = [exp(-rate)]

    for goals in range(1, MAX_GOALS + 1):
        values.append(values[-1] * rate / goals)

    return values


def predict(fixture, history, cutoff):
    cutoff_time = parse_time(cutoff)

    if cutoff_time >= parse_time(fixture["kickoff_at"]):
        raise ValueError("Pre-match input cutoff must precede kickoff.")

    if fixture["home_team_id"] == fixture["away_team_id"]:
        raise ValueError("A fixture must contain two different teams.")

    eligible = []
    seen = set()

    for match in history:
        # Prevent mixing competitions or synthetic and real evidence.
        if match["competition_id"] != fixture["competition_id"]:
            continue

        if match["is_demo"] != fixture["is_demo"]:
            continue

        if match["id"] == fixture["id"]:
            continue

        if match["status"] != "finished":
            continue

        if not match["regulation_confirmed"]:
            continue

        # A result must both exist and have been available by the cutoff.
        if parse_time(match["finished_at"]) >= cutoff_time:
            continue

        if parse_time(match["available_at"]) > cutoff_time:
            continue

        if match["id"] in seen:
            raise ValueError("Duplicate historical fixture input.")

        for field in ("home_goals", "away_goals"):
            value = match[field]

            if type(value) is not int or value < 0:
                raise ValueError("Historical goals must be nonnegative integers.")

        seen.add(match["id"])
        eligible.append(match)

    eligible.sort(key=lambda match: (match["finished_at"], match["id"]))

    home_history = [
        match for match in eligible
        if match["home_team_id"] == fixture["home_team_id"]
    ]
    away_history = [
        match for match in eligible
        if match["away_team_id"] == fixture["away_team_id"]
    ]

    if (
        len(eligible) < MIN_LEAGUE_MATCHES
        or len(home_history) < MIN_VENUE_MATCHES
        or len(away_history) < MIN_VENUE_MATCHES
    ):
        raise ValueError(
            "Prediction suppressed: insufficient league or venue history."
        )

    league_home = sum(m["home_goals"] for m in eligible) / len(eligible)
    league_away = sum(m["away_goals"] for m in eligible) / len(eligible)

    if league_home <= 0 or league_away <= 0:
        raise ValueError("Prediction suppressed: unusable league scoring rates.")

    def smoothed_average(matches, field, league_average):
        return (
            sum(match[field] for match in matches)
            + PRIOR_MATCHES * league_average
        ) / (len(matches) + PRIOR_MATCHES)

    home_attack = (
        smoothed_average(home_history, "home_goals", league_home)
        / league_home
    )
    home_defence = (
        smoothed_average(home_history, "away_goals", league_away)
        / league_away
    )
    away_attack = (
        smoothed_average(away_history, "away_goals", league_away)
        / league_away
    )
    away_defence = (
        smoothed_average(away_history, "home_goals", league_home)
        / league_home
    )

    home_rate = league_home * home_attack * away_defence
    away_rate = league_away * away_attack * home_defence

    if any(
        not isfinite(rate) or rate <= 0 or rate > 8
        for rate in (home_rate, away_rate)
    ):
        raise ValueError("Prediction suppressed: scoring rates outside support.")

    home_distribution = poisson_probabilities(home_rate)
    away_distribution = poisson_probabilities(away_rate)

    cells = [
        (home, away, home_probability * away_probability)
        for home, home_probability in enumerate(home_distribution)
        for away, away_probability in enumerate(away_distribution)
    ]

    retained_mass = sum(probability for _, _, probability in cells)

    if 1 - retained_mass > 1e-8:
        raise ValueError("Prediction suppressed: excessive score-grid tail.")

    # Normalize the tiny omitted tail consistently across all markets.
    cells = [
        (home, away, probability / retained_mass)
        for home, away, probability in cells
    ]

    def probability_where(condition):
        return sum(
            probability
            for home, away, probability in cells
            if condition(home, away)
        )

    home_win = probability_where(lambda home, away: home > away)
    draw = probability_where(lambda home, away: home == away)
    away_win = probability_where(lambda home, away: home < away)
    btts = probability_where(lambda home, away: home > 0 and away > 0)

    markets = {
        "1x2": {"home": home_win, "draw": draw, "away": away_win},
        "double_chance": {
            "home_or_draw": home_win + draw,
            "home_or_away": home_win + away_win,
            "draw_or_away": draw + away_win,
        },
        "btts": {"yes": btts, "no": 1 - btts},
    }

    for threshold in (1.5, 2.5, 3.5):
        over = probability_where(
            lambda home, away: home + away > threshold
        )
        markets[f"goals_{threshold}"] = {
            "over": over,
            "under": 1 - over,
        }

    best_home, best_away, best_probability = max(
        cells, key=lambda cell: cell[2]
    )

    return {
        "model_version": MODEL_VERSION,
        "validation_status": "experimental",
        "fixture_id": fixture["id"],
        "is_demo": fixture["is_demo"],
        "input_cutoff_at": cutoff_time.isoformat(),
        "input_fixture_ids": [match["id"] for match in eligible],
        "sample_sizes": {
            "league": len(eligible),
            "home_team_at_home": len(home_history),
            "away_team_away": len(away_history),
        },
        # These are model estimates, not provider-supplied xG statistics.
        "model_estimated_goals": {
            "home": home_rate,
            "away": away_rate,
        },
        "markets": markets,
        "most_likely_score": {
            "home": best_home,
            "away": best_away,
            "probability": best_probability,
        },
        "omitted_tail_mass": max(0.0, 1 - retained_mass),
    }
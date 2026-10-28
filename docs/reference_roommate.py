# Reference module for a future FastAPI backend (brief Appendix A2). NOT used by the website.
# The demo backend in js/local-api-roommates.js uses js/lib-core.js, which gives the same numbers.
# Rounding is HALF UP: Python's round() rounds halves to even, so floor(x + 0.5) is used instead.
import math

QUIZ_WEIGHTS = [25, 25, 15, 15, 10, 10]  # sleep, tidy, noise, study, visitors, food


def roommate_score(a: list[int], b: list[int]) -> int:
    """100 - sum(weight * |a - b|) / 2, rounded HALF UP."""
    loss = sum(w * abs(a[i] - b[i]) / 2 for i, w in enumerate(QUIZ_WEIGHTS))
    return int(math.floor(100 - loss + 0.5))


def valid_answers(x: object) -> bool:
    return isinstance(x, list) and len(x) == 6 and all(isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 2 for v in x)

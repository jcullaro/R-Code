"""Robinhood integration — STUB, not yet connected.

Plan (to be wired up when the user provides credentials/API access):

- Robinhood's official public API currently covers crypto trading only. Equities and
  options access in third-party tools generally goes through the unofficial
  `robin_stocks` library (username/password + MFA/device token). Verify the current
  official API surface before building — if Robinhood has shipped an official
  equities/options API by then, prefer it.
- Credentials must come from environment variables (ROBINHOOD_USERNAME,
  ROBINHOOD_PASSWORD / token) — never committed to this repo.
- Read-only first: positions + option marks to replace the hand-maintained numbers in
  config/portfolio.yaml and the Yahoo quotes in daily_check.py for held options.
- No order placement from this codebase. The agent proposes; the human executes
  trades in the Robinhood app.
"""


class RobinhoodClient:
    def __init__(self) -> None:
        raise NotImplementedError(
            "Robinhood API not connected yet — see module docstring for the plan."
        )

    def get_positions(self) -> list[dict]:
        """Return current stock + option positions with live marks."""
        raise NotImplementedError

    def get_option_mark(self, ticker: str, expiry: str, strike: float, opt_type: str) -> float:
        """Return the current mark for a specific option contract."""
        raise NotImplementedError

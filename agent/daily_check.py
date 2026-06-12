"""Daily portfolio tracker.

Pulls quotes for everything in config/watchlist.yaml, evaluates alert triggers,
checks held options against the roll/profit-take rules in config/portfolio.yaml,
and prints a markdown report. Exits 0 always; writes the report to the path given
as argv[1] if provided (used by the GitHub Actions cron), and writes
`alerts_fired=true|false` to $GITHUB_OUTPUT when running in Actions.

Quotes come from Yahoo Finance (yfinance). When the Robinhood API is connected,
agent/robinhood_client.py should replace it for option marks.
"""

import os
import sys
from datetime import date, datetime
from pathlib import Path

import yaml

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


def load_yaml(name: str) -> dict:
    with open(CONFIG_DIR / name) as f:
        return yaml.safe_load(f)


def fetch_quotes(tickers: list[str]) -> dict[str, dict]:
    """Return {ticker: {price, high_52w}} for tickers Yahoo knows about."""
    try:
        import yfinance as yf
    except ImportError:
        print("WARNING: yfinance not installed (pip install -r requirements.txt); "
              "price-based alerts skipped.", file=sys.stderr)
        return {}
    quotes = {}
    for t in tickers:
        try:
            hist = yf.Ticker(t).history(period="1y")
            if hist.empty:
                continue
            quotes[t] = {
                "price": float(hist["Close"].iloc[-1]),
                "high_52w": float(hist["High"].max()),
            }
        except Exception as e:  # network errors, delistings — skip, don't crash the cron
            print(f"WARNING: quote fetch failed for {t}: {e}", file=sys.stderr)
    return quotes


def check_watchlist(watchlist: dict, quotes: dict) -> list[str]:
    alerts = []
    default_pullback = watchlist["global_rules"]["default_buy_on_pullback_pct"]
    for bucket_name, bucket in watchlist["buckets"].items():
        for entry in bucket.get("tickers", []):
            t = entry["ticker"]
            q = quotes.get(t)
            if not q:
                continue
            price, high = q["price"], q["high_52w"]
            off_high = (high - price) / high * 100 if high else 0

            if entry.get("buy_below") and price <= entry["buy_below"]:
                alerts.append(f"**BUY trigger** {t} at {price:.2f} <= buy_below {entry['buy_below']} ({bucket_name})")
            if entry.get("trim_above") and price >= entry["trim_above"]:
                alerts.append(f"**TRIM trigger** {t} at {price:.2f} >= trim_above {entry['trim_above']} ({bucket_name})")
            pullback = entry.get("buy_on_pullback_pct") or default_pullback
            if not entry.get("held") and off_high >= pullback:
                alerts.append(
                    f"**PULLBACK entry window** {t} is {off_high:.1f}% off its 52w high "
                    f"(threshold {pullback}%, {bucket_name}) — review for a tranche"
                )
    return alerts


def check_held_options(portfolio: dict, rules: dict) -> list[str]:
    alerts = []
    today = date.today()
    for opt in portfolio.get("options", []):
        label = f"{opt['ticker']} {opt.get('description', 'option')}"
        if opt.get("expiry"):
            dte = (datetime.strptime(opt["expiry"], "%Y-%m-%d").date() - today).days
            if dte < rules["option_roll_review_days"]:
                alerts.append(f"**ROLL review** {label}: {dte} days to expiry (< {rules['option_roll_review_days']})")
        else:
            alerts.append(f"**DATA gap** {label}: no expiry set in portfolio.yaml — fill from Robinhood")
        if (opt.get("pnl_pct") or 0) >= rules["option_profit_take_pct"]:
            alerts.append(
                f"**PROFIT-TAKE rule live** {label}: up {opt['pnl_pct']}% — "
                "trim or roll up to recover initial premium (STRATEGY.md)"
            )
    return alerts


def build_report(portfolio: dict, watchlist: dict, quotes: dict, alerts: list[str], dial: dict) -> str:
    lines = [f"# Daily check — {date.today().isoformat()}", ""]
    lines.append(f"**Macro dial:** {dial['level']} (score {dial['score']:+d}) — "
                 f"target deployment {dial['deploy_low_pct']}-{dial['deploy_high_pct']}% of liquid")
    lines.append("")
    if alerts:
        lines.append(f"## Alerts ({len(alerts)})")
        lines += [f"- {a}" for a in alerts]
    else:
        lines.append("## Alerts\n\nNone fired.")
    lines.append("\n## Watchlist snapshot")
    lines.append("| Ticker | Price | % off 52w high | Held |")
    lines.append("|---|---|---|---|")
    for bucket in watchlist["buckets"].values():
        for entry in bucket.get("tickers", []):
            q = quotes.get(entry["ticker"])
            if not q:
                continue
            off = (q["high_52w"] - q["price"]) / q["high_52w"] * 100
            lines.append(f"| {entry['ticker']} | {q['price']:.2f} | {off:.1f}% | {'✅' if entry.get('held') else ''} |")
    lines.append(f"\nLiquid capital: ${portfolio['cash']['liquid_usd']:,.0f}")
    return "\n".join(lines)


def main() -> None:
    from macro_dial import compute_dial, load_macro

    portfolio = load_yaml("portfolio.yaml")
    watchlist = load_yaml("watchlist.yaml")
    dial = compute_dial(load_macro())

    tickers = [e["ticker"] for b in watchlist["buckets"].values() for e in b.get("tickers", [])]
    quotes = fetch_quotes(tickers)

    alerts = check_watchlist(watchlist, quotes) + check_held_options(
        portfolio, watchlist["global_rules"]
    )
    report = build_report(portfolio, watchlist, quotes, alerts, dial)
    print(report)

    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(report)
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a") as f:
            f.write(f"alerts_fired={'true' if alerts else 'false'}\n")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()

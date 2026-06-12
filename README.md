# R-Code — AI Infrastructure Portfolio Agent

A Claude Code-driven portfolio management agent for a high-conviction, options-leveraged
AI infrastructure strategy (~$150k "play money", Altimeter/ARK-style concentrated bets
expressed mostly through long-dated options/LEAPS, traded on Robinhood).

> **Not financial advice.** This is personal tooling for tracking, research, and
> decision support. All trades are placed by the human.

## How it works

| Component | What it does |
|---|---|
| `docs/STRATEGY.md` | The investment thesis, position-sizing rules, and macro exposure framework |
| `config/portfolio.yaml` | Current positions (options + cash) — source of truth for what's held |
| `config/watchlist.yaml` | Thesis buckets, candidate tickers, and per-ticker buy/trim triggers |
| `config/macro.yaml` | The macro "exposure dial" (LOW / LOW-MEDIUM / MEDIUM / HIGH) and its indicator scores |
| `agent/daily_check.py` | Daily tracker: pulls prices, evaluates alert rules, emits a markdown report |
| `agent/macro_dial.py` | Computes the exposure level + target capital deployment from indicator scores |
| `agent/robinhood_client.py` | Stub for Robinhood pricing/positions (connected later, when you provide API access) |
| `.github/workflows/daily-check.yml` | Cron job: runs the daily check every weekday, opens a GitHub issue when alerts fire |
| `.claude/commands/daily-check.md` | `/daily-check` — run the tracker + summarize, in a Claude session |
| `.claude/commands/weekly-research.md` | `/weekly-research` — deep research sweep, updates macro dial + journal |
| `journal/` | Dated research reports and decision log |

## Operating rhythm

- **Daily (automated):** the GitHub Action runs `agent/daily_check.py`. If any buy/trim/roll
  trigger fires, it opens an issue titled `[ALERT] ...` so it shows up in notifications.
- **Weekly (Claude session):** run `/weekly-research`. Claude does a deep research sweep
  across the watchlist + macro indicators, updates `config/macro.yaml`, writes a journal
  entry, and proposes concrete trades (which the human approves and executes).
- **Ad hoc:** run `/daily-check` in any session for an on-demand portfolio readout.

## Setup

```bash
pip install -r requirements.txt
python agent/daily_check.py          # prints the report
python agent/macro_dial.py           # prints current exposure level + deployment target
```

Price data comes from Yahoo Finance via `yfinance` (free, no key). Once the Robinhood
API is connected, `agent/robinhood_client.py` becomes the source for option marks and
live positions.

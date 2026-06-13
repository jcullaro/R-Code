---
description: Run the daily portfolio tracker and summarize alerts
---

Run the daily portfolio check:

1. `pip install -r requirements.txt` if needed, then run `python agent/daily_check.py`.
2. Summarize the output for the user: macro dial level, any alerts that fired, and the
   watchlist snapshot. Lead with the alerts.
3. For each fired alert, check recent news for that ticker (web search) to see whether
   the move is noise or thesis-relevant, and say which you think it is.
4. If an alert implies an action (buy tranche, trim, roll), state the concrete proposed
   trade and how it fits the sizing rules in docs/STRATEGY.md — but do not present it
   as executed. The user places all trades in Robinhood.
5. If any `DATA gap` alerts fired, remind the user which fields in
   config/portfolio.yaml still need exact contract details from Robinhood.

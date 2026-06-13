---
description: Weekly deep research sweep — macro dial update, watchlist review, trade proposals
---

Run the weekly research cycle. Use deep research (the deep-research skill if available,
otherwise thorough web search) and cite sources in the journal entry.

## 1. Macro dial update

Research current readings for each indicator in `config/macro.yaml`:
- Latest CPI / inflation trend and next print date
- Fed policy direction (recent FOMC, dot plot, market-implied path)
- 10Y yield level and regime
- Geopolitical risk (Iran conflict status, oil, anything new)
- AI capex cycle health: hyperscaler capex guidance, GPU lead times, new power/data-center
  deals, Trainium/custom-silicon news
- Market technicals: breadth, VIX, leadership

Score each −1/0/+1, update `config/macro.yaml` (scores, notes, as_of), and run
`python agent/macro_dial.py` to get the new exposure level.

## 2. Portfolio review

For each held position in `config/portfolio.yaml`: news, earnings dates, thesis check.
Apply the rules in docs/STRATEGY.md (profit-take at +100%, roll review under 9 months,
thesis-break exits).

## 3. Watchlist refresh

- For each watchlist ticker: anything thesis-changing this week?
- Set/refresh the absolute `buy_below` / `trim_above` levels in `config/watchlist.yaml`
  based on current prices and the macro dial (tighter buys when dial is LOW).
- SpaceX: check IPO status, pricing, lockup dates. Update the space bucket when it lists.
- Flag any new candidate tickers that fit the buckets (especially red-state energy IPPs
  and neoclouds), with a one-paragraph case.

## 4. Output

- Write `journal/YYYY-MM-DD-weekly.md`: macro read + dial change, position reviews,
  proposed trades with sizing (per STRATEGY.md rules), and sources.
- Update config files as described above.
- Commit everything with message `weekly research YYYY-MM-DD`.
- End by presenting the user a short list of **proposed trades** (ticker, instrument,
  size, trigger/limit) and what changed on the dial. The user executes in Robinhood;
  nothing is auto-traded.

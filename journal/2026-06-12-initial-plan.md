# 2026-06-12 — Initial plan & system setup

First entry. The agent scaffold was built today; this records the starting state and
the immediate action items. Numbers are approximations from memory — reconcile against
Robinhood before acting.

## Starting state

- NAV ~$150k (grown from $25k). High-risk mandate, LEAPS as leverage, Robinhood.
- Held: ~$30k SNOW LEAPS (+~100%, ~June 2027 expiry), ~$35k AMZN calls (+~20%),
  ~$100k liquid. (Note: 30+35+100 = $165k vs. the stated ~$150k — reconcile.)
- External: Anthropic exposure via spouse equity (correlation constraint, see STRATEGY.md).

## Macro dial: LOW-MEDIUM (score −1)

Hot CPI this month (inflation_trend −1), Iran war resolution unclear (geopolitical −1),
AI capex cycle intact (+1), Fed/rates/technicals unscored until the first weekly
research run. LOW-MEDIUM → deploy 25–45% of the ~$100k liquid (≈$25–45k), in tranches,
into weakness.

## Immediate action items

1. **SNOW profit-take rule is live** (+100%): decide trim vs. roll-up to recover the
   ~$15k initial premium. First weekly research run should price both choices.
2. **Fill exact contracts into `config/portfolio.yaml`** (strikes, expiries, counts,
   cost bases) from Robinhood. AMZN expiry matters for the 9-month roll rule.
3. **First `/weekly-research` run:** score the three TODO macro indicators, set
   `buy_below` levels across the watchlist, verify SpaceX IPO status, and propose the
   first 1–2 deployment tranches consistent with LOW-MEDIUM.
4. **Robinhood API:** user will connect when ready; until then portfolio.yaml is
   maintained by hand.

## Standing decisions made today

- SpaceX: no IPO chase; entry only on ≥20% post-IPO pullback, lockup expiry, or a
  market flush. One 10% tranche, common stock.
- Energy bucket prefers TX-based IPPs (VST, NRG, TLN-with-PA-caveat); speculative
  nuclear (OKLO) small-size only.
- Neoclouds + spec nuclear capped at 20% NAV combined.
- No added pure-play LLM-lab exposure (Anthropic via spouse); AMZN+Anthropic counted
  as one correlated bet.

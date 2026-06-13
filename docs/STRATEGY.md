# Investment Strategy

*Last reviewed: 2026-06-12. This document is the agent's constitution — the weekly
research process can propose edits to it, but changes require explicit human sign-off.*

## Mandate

- **Capital:** ~$150k of high-risk "play money" (grown from $25k). Loss of this capital
  is acceptable; the goal is asymmetric upside, not capital preservation.
- **Style:** Concentrated, high-conviction, thesis-driven (Altimeter/ARK-style).
  Leverage comes from **long-dated options (LEAPS, 12+ months to expiry)**, not margin.
- **Broker:** Robinhood. All option pricing should ultimately come from Robinhood marks
  (API connection pending — see `agent/robinhood_client.py`).

## Core thesis

The AI movement is in a multi-year buildout. Long-running coding/agentic workloads will
drive compute demand far beyond today's training-dominated demand, which compounds into
**energy demand**. We want exposure to **every layer of the AI infrastructure stack**:

1. **Hyperscale clouds** — AMZN is the anchor (AWS + Trainium custom silicon + the
   Anthropic compute relationship). MSFT/GOOGL/ORCL as alternates.
2. **Neoclouds** — GPU-native clouds (CoreWeave/CRWV, Nebius/NBIS, IREN, APLD).
   Higher beta, higher blowup risk — size accordingly.
3. **Compute supply chain** — NVDA, AVGO, TSM, MU, VRT (power/cooling).
4. **Energy / power generation** — the bottleneck trade. Preference: independent power
   producers **headquartered/operating in low-regulation, Republican-led states**
   (TX first): VST, NRG, TLN. Note: TLN is Houston-HQ'd but its crown-jewel nuclear
   asset (Susquehanna + the AWS campus deal) is in PA — acceptable, flag it. Speculative
   nuclear (OKLO, SMR) only in small size.
5. **Data platforms riding AI workloads** — SNOW (held).
6. **Space / orbital data centers** — expressed through **SpaceX** when public.
   Rule: do NOT chase the IPO. Enter on a pullback (see triggers below).

### Constraints & correlations

- **Anthropic exposure already exists via spouse's equity.** Avoid stacking more
  pure-play LLM-lab exposure. Note that AMZN itself carries embedded Anthropic exposure
  (investor + Trainium anchor customer) — acceptable, but it means the AMZN + Anthropic
  combo is one correlated bet; don't let it exceed the concentration cap below.
- Everything in this portfolio is one macro trade (AI capex). A capex digestion phase
  hits all buckets at once. The macro dial (below) is the only real hedge.

## Position sizing & risk rules

| Rule | Value |
|---|---|
| Max per underlying (premium at risk + stock) | 25% of NAV |
| Max single new option entry | 10% of NAV per tranche |
| Neocloud + speculative nuclear bucket combined | ≤ 20% of NAV |
| Minimum cash floor (never deployed) | 10% of NAV |
| LEAPS minimum time to expiry at entry | 12 months |
| Roll review trigger | < 9 months to expiry |
| Profit-taking trigger | At +100% on an option position: trim or roll up to recover initial premium, let the rest ride |
| Entry preference | Scale in 2–3 tranches on red days / pullbacks ≥ 10% from highs; never market-buy the full size at once |
| Exit on thesis break | Sell regardless of price (e.g., hyperscaler capex guidance cuts, neocloud customer concentration blowup) |

## Macro exposure dial

Deployment of liquid capital is governed by `config/macro.yaml`. Six indicators are
scored −1 / 0 / +1 by the weekly research run; the sum maps to an exposure level:

| Score sum | Level | Target deployment of liquid capital |
|---|---|---|
| ≤ −3 | LOW | 0–25% |
| −2 to 0 | LOW-MEDIUM | 25–45% |
| +1 to +3 | MEDIUM | 45–70% |
| ≥ +4 | HIGH | 70–90% |

Indicators: inflation trend (CPI prints), Fed policy direction, 10Y yield regime,
geopolitical risk (currently: Iran conflict resolution unclear), AI capex cycle health
(hyperscaler guidance, GPU lead times, power deal announcements), and market technicals
(breadth/VIX).

**Current stance (2026-06-12): LOW-MEDIUM** — hot CPI print this month, Iran war
end ambiguous. Deploy slowly into weakness; keep dry powder for a real flush.

## SpaceX entry plan

- Watch IPO status via weekly research (status, pricing, lockup schedule).
- **No entry at IPO or in the first euphoria phase.**
- Entry triggers (any of): ≥ 20% pullback from post-IPO closing high; first lockup
  expiry; or a broad-market LOW-dial flush that drags it down.
- Initial size: one 10% tranche, stock (options chains on fresh IPOs are thin/expensive).
- This is also the orbital-data-center expression — no separate position needed there.

## Current positions snapshot (2026-06-12)

- ~$30k Snowflake (SNOW) LEAPS, ~June 2027 expiry, **up ~100% → profit-taking rule is
  live on this position** (first action item for the weekly run).
- ~$35k Amazon (AMZN) options, up ~20% — hold, verify time-to-expiry vs. the 9-month roll rule.
- ~$100k liquid. At LOW-MEDIUM that means roughly **$25–45k deployable now**, staged
  in tranches; the rest waits for the dial to improve or for forced-seller prices.

*(Exact contracts — strikes, expiries, counts — need to be filled into
`config/portfolio.yaml` from Robinhood; values above are approximations from memory.)*

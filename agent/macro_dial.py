"""Macro exposure dial: maps indicator scores in config/macro.yaml to an
exposure level and a target deployment band for liquid capital.

Bands are defined in docs/STRATEGY.md and must stay in sync with it.
"""

from pathlib import Path

import yaml

CONFIG = Path(__file__).resolve().parent.parent / "config" / "macro.yaml"

# (min_score_inclusive, level, deploy_low_pct, deploy_high_pct), checked top-down
BANDS = [
    (4, "HIGH", 70, 90),
    (1, "MEDIUM", 45, 70),
    (-2, "LOW-MEDIUM", 25, 45),
    (-999, "LOW", 0, 25),
]


def load_macro(path: Path = CONFIG) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def compute_dial(macro: dict) -> dict:
    indicators = macro["indicators"]
    score = sum(ind["score"] for ind in indicators.values())
    for min_score, level, lo, hi in BANDS:
        if score >= min_score:
            return {
                "as_of": macro["as_of"],
                "score": score,
                "level": level,
                "deploy_low_pct": lo,
                "deploy_high_pct": hi,
                "indicators": {k: v["score"] for k, v in indicators.items()},
            }
    raise AssertionError("unreachable")


def format_report(dial: dict, liquid_usd: float | None = None) -> str:
    lines = [
        f"Macro dial as of {dial['as_of']}: score {dial['score']:+d} -> **{dial['level']}**",
        f"Target deployment of liquid capital: {dial['deploy_low_pct']}-{dial['deploy_high_pct']}%",
    ]
    if liquid_usd:
        lo = liquid_usd * dial["deploy_low_pct"] / 100
        hi = liquid_usd * dial["deploy_high_pct"] / 100
        lines.append(f"On ${liquid_usd:,.0f} liquid: ${lo:,.0f} - ${hi:,.0f}")
    lines.append("Indicators: " + ", ".join(f"{k}={v:+d}" for k, v in dial["indicators"].items()))
    return "\n".join(lines)


if __name__ == "__main__":
    portfolio_path = CONFIG.parent / "portfolio.yaml"
    liquid = None
    if portfolio_path.exists():
        with open(portfolio_path) as f:
            liquid = yaml.safe_load(f).get("cash", {}).get("liquid_usd")
    print(format_report(compute_dial(load_macro()), liquid))

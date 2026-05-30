#!/usr/bin/env python3
"""Compute the OpenPM roadmap score from its markdown checklists.

Parses ``road_to_perfection.md``:
  * the scorecard table (section weights + *declared* per-area score), and
  * every ``## <Letter>. ...`` section's checklist items (``[x]`` / ``[~]`` / ``[ ]``).

Area score   = (#[x] + 0.5*#[~]) / #items * 100, rounded to the nearest 5.
Overall      = Σ (area_score * weight) / 100.

Emits a per-area table, a drift warning when the declared scorecard value
differs from the computed value by > 5 points, and the overall total.

Usage:
    python scripts/score.py [road_to_perfection.md]   # default: ./road_to_perfection.md
Exit code 1 if any area drifts > 5 (handy as a CI / pre-commit gate).
"""

from __future__ import annotations

import re
import sys

# `| A. Cockpit-Layout (Single Page) | 10 % | 80 / 100 | … |`
SCORECARD_RE = re.compile(
    r"^\|\s*([A-Z])\.\s*(.*?)\s*\|\s*(\d+)\s*%\s*\|\s*(\d+)\s*/\s*100\s*\|"
)
SECTION_RE = re.compile(r"^##\s+([A-Z])\.\s+(.*)$")
ITEM_RE = re.compile(r"^\s*-\s*\[([ x~])\]")


def round5(x: float) -> int:
    return int(round(x / 5.0) * 5)


def parse(text: str):
    lines = text.splitlines()

    # 1. Scorecard: weight + declared score per area letter.
    scorecard: dict[str, dict] = {}
    in_table = False
    for line in lines:
        m = SCORECARD_RE.match(line)
        if m:
            letter, name, weight, declared = m.groups()
            scorecard[letter] = {
                "name": name,
                "weight": int(weight),
                "declared": int(declared),
            }
            in_table = True
        elif in_table and not line.strip().startswith("|"):
            in_table = False  # left the scorecard table

    # 2. Checklist items per section (a section runs to the next `## ` header).
    counts: dict[str, dict] = {}
    current: str | None = None
    for line in lines:
        sec = SECTION_RE.match(line)
        if sec:
            current = sec.group(1)
            counts.setdefault(current, {"x": 0, "~": 0, " ": 0})
            continue
        if line.startswith("## "):  # a non-lettered `## N.` heading ends the section
            current = None
            continue
        if current is not None:
            im = ITEM_RE.match(line)
            if im:
                counts[current][im.group(1)] += 1
    return scorecard, counts


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "road_to_perfection.md"
    try:
        text = open(path, encoding="utf-8").read()
    except OSError as exc:
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return 2

    scorecard, counts = parse(text)
    if not scorecard:
        print("no scorecard table found", file=sys.stderr)
        return 2

    total = 0.0
    drift = []
    print(f"{'Area':<32}{'computed':>10}{'declared':>10}  items")
    print("-" * 70)
    for letter in sorted(scorecard):
        meta = scorecard[letter]
        c = counts.get(letter, {"x": 0, "~": 0, " ": 0})
        n = c["x"] + c["~"] + c[" "]
        computed = round5((c["x"] + 0.5 * c["~"]) / n * 100) if n else meta["declared"]
        total += computed * meta["weight"] / 100.0
        flag = ""
        if n and abs(computed - meta["declared"]) > 5:
            flag = "  <-- DRIFT"
            drift.append(letter)
        label = f"{letter}. {meta['name']}"[:31]
        items = f"{c['x']}x/{c['~']}~/{c[' ']} of {n}" if n else "(no checklist)"
        print(f"{label:<32}{computed:>8}/100{meta['declared']:>8}/100  {items}{flag}")

    print("-" * 70)
    print(f"{'GESAMT':<32}{round(total):>8}/100")
    if drift:
        print(
            f"\n⚠ drift > 5 in: {', '.join(drift)} "
            "(update the scorecard table or the checklists)",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

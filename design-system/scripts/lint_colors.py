#!/usr/bin/env python3
"""Colour-role lint for the design system and the app.

  python3 scripts/lint_colors.py   # exit 1 on any problem

Checks:
 1. Pure shapes use -fill tokens. A rule whose `background`, `fill`, `stroke` or `border-color`
    is a bare semantic ink (var(--A|B|C|D|ok|warn)) or a strong mix of one (>= 30%) is flagged,
    unless the same rule sets a text colour (so it is a fill that carries text: a chip, a
    Snapshot, a solid button) or its selector is in INK_FILL_OK below.
 2. Semantic colours stay distinct. Every pair among the fills (A–D, ok, warn, danger) must be at
    least Delta E 15 apart in both themes, so "success" never reads as "direction C".
 3. No stale hard-coded values of retired colours in the app.
"""
import json, math, pathlib, re, sys

ds = pathlib.Path(__file__).resolve().parent.parent
app = ds.parent / "Vellum-Lumen.html"
problems = []

INK = r"^\s*var\((?:--[\w-]+,\s*)?(?:var\()?--(?:A|B|C|D|ok|warn)\)\)?\s*(?:!important)?\s*$"
STRONG_MIX = r"color-mix\(in srgb,\s*var\((?:--[\w-]+,\s*)?(?:var\()?--(?:A|B|C|D|ok|warn)\)\)?\s*(?:[3-9]\d|100)%"
SHAPE_PROP = re.compile(r"(?<![-\w])(background(?:-color)?|fill|stroke|border-color)\s*:\s*([^;}]*)")
TEXT_PROP = re.compile(r"(?<![-\w])color\s*:")
# Fills that carry text or that must stay the ink on purpose (reviewed by hand).
INK_FILL_OK = re.compile(r"\.chip\b|\.vl-chip\b|snapshot|\.print\b|is-snapshot|\.edition|\.letter|::selection")

def css_blocks():
    yield "design-system/components/bundle.css", (ds / "components" / "bundle.css").read_text()
    src = app.read_text()
    for m in list(re.finditer(r"<style>(.*?)</style>", src, re.S))[:2]:
        yield "Vellum-Lumen.html", m.group(1)

for name, css in css_blocks():
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        sel = m.group(1).strip().split("\n")[-1].strip()
        body = m.group(2)
        if INK_FILL_OK.search(sel) or sel.startswith("@") or re.match(r"^[\d%,\s]+$|^(from|to)$", sel):
            continue
        for prop, val in SHAPE_PROP.findall(body):
            if re.search(INK, val) or re.search(STRONG_MIX, val):
                if TEXT_PROP.search(body):
                    continue  # a fill that carries its own text: keep the ink
                problems.append(f"{name}: `{sel[:70]}` uses an ink for {prop} ({val.strip()[:50]}); use the -fill token")

# 2. distinctness
def lab(h):
    def lin(x):
        x /= 255
        return x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4
    r, g, b = [lin(int(h[i:i + 2], 16)) for i in (1, 3, 5)]
    X = (r * .4124 + g * .3576 + b * .1805) / .95047; Y = r * .2126 + g * .7152 + b * .0722; Z = (r * .0193 + g * .1192 + b * .9505) / 1.08883
    f = lambda t: t ** (1 / 3) if t > .008856 else 7.787 * t + 16 / 116
    return (116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z)))
tok = {t["name"]: t["value"] for t in json.loads((ds / "tokens.json").read_text())["color"]["tokens"]}
fills = ["A-fill", "B-fill", "C-fill", "D-fill", "ok-fill", "warn-fill", "danger"]
for theme in ("light", "dark"):
    vals = {n: (tok[n][theme] if isinstance(tok[n], dict) else tok[n]) for n in fills if n in tok}
    names = list(vals)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = vals[names[i]], vals[names[j]]
            if a.startswith("#") and b.startswith("#"):
                d = math.dist(lab(a), lab(b))
                if d < 15:
                    problems.append(f"tokens.json ({theme}): {names[i]} {a} and {names[j]} {b} are only Delta E {d:.1f} apart (need 15)")

# 3. retired values
for old in ("#247A50", "#2A9A62"):
    n = len(re.findall(re.escape(old), app.read_text(), re.I))
    if n:
        problems.append(f"Vellum-Lumen.html: retired colour {old} still appears {n} time(s)")

if problems:
    print(f"{len(problems)} colour problem(s):")
    for p in problems:
        print("  " + p)
    sys.exit(1)
print("colour roles OK")

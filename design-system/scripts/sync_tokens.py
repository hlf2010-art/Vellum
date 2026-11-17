#!/usr/bin/env python3
"""Generate tokens.css from tokens.json (the source of truth).

  python3 scripts/sync_tokens.py          # rewrite tokens.css
  python3 scripts/sync_tokens.py --check  # exit 1 if tokens.css is out of date (use in CI)

Layout of the output:
  :root, [data-theme="<first>"] { colours, shadows }   one block per theme
  :root { spacing, radius, every other token family, --font-*, --text-* }
  .<style> { ... }                                     one class per type style
  @font-face { ... }                                   one per font file
"""
import json, pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent
tokens = json.loads((root / "tokens.json").read_text())
themes = [t["id"] for t in tokens["color"]["themes"]]
TYPE_KEYS = ("fontSize", "lineHeight", "fontWeight", "letterSpacing")
SKIP = {"name", "version", "meta", "color", "type", "shadow"}


def note(text):
    text = " ".join(str(text or "").split()).replace("*/", "* /")
    return f" /* {text} */" if text else ""


def theme_value(tok, theme):
    v = tok["value"]
    return v if isinstance(v, str) else v.get(theme, v[themes[0]])


def family_of(style, group):
    return style.get("family") or group.get("family") or "ui"


out = [f'/* {tokens.get("name", "Design system")} — generated from tokens.json */']

for i, theme in enumerate(themes):
    sel = f':root, [data-theme="{theme}"]' if i == 0 else f'[data-theme="{theme}"]'
    out.append(sel + " {")
    for fam in ("color", "shadow"):
        for tok in tokens.get(fam, {}).get("tokens", []):
            out.append(f'  --{tok["name"]}: {theme_value(tok, theme)};' + (note(tok.get("usage")) if i == 0 else ""))
    out.append("}")

out.append(":root {")
for fam in ("spacing", "radius"):
    for tok in tokens.get(fam, {}).get("tokens", []):
        out.append(f'  --{tok["name"]}: {tok["value"]};' + note(tok.get("usage")))
for fam, body in tokens.items():
    if fam in SKIP or fam in ("spacing", "radius") or not isinstance(body, dict) or "tokens" not in body:
        continue
    for tok in body["tokens"]:
        out.append(f'  --{tok["name"]}: {tok["value"]};' + note(tok.get("usage")))
for key, stack in tokens["type"]["families"].items():
    out.append(f"  --font-{key}: {stack};")
for group in tokens["type"]["groups"]:
    for st in group["styles"]:
        fam = family_of(st, group)
        out.append(f'  --text-{st["name"]}: {st.get("fontWeight", 400)} {st["fontSize"]}/{st.get("lineHeight", "1.4")} var(--font-{fam});' + note(st.get("usage")))
out.append("}")

for group in tokens["type"]["groups"]:
    for st in group["styles"]:
        out.append(f'.{st["name"]} {{')
        out.append(f"  font-family: var(--font-{family_of(st, group)});")
        out.append(f'  font-size: {st["fontSize"]};')
        out.append(f'  line-height: {st.get("lineHeight", "1.4")};')
        out.append(f'  font-weight: {st.get("fontWeight", 400)};')
        out.append(f'  letter-spacing: {st.get("letterSpacing", "0")};')
        out.append("}")

for font in tokens["type"].get("fonts", []):
    path = font["file"] if "/" in font["file"] else f'fonts/{font["file"]}'
    out += ["@font-face {", f'  font-family: "{font["family"]}";', f'  src: url("{path}") format("woff2");',
            f'  font-weight: {font.get("weight", "400")};', f'  font-style: {font.get("style", "normal")};',
            "  font-display: swap;", "}"]

css = "\n".join(out) + "\n"
target = root / "tokens.css"
if "--check" in sys.argv:
    same = target.exists() and target.read_text() == css
    print("tokens.css is up to date" if same else "tokens.css is OUT OF DATE: run python3 scripts/sync_tokens.py")
    sys.exit(0 if same else 1)
changed = not target.exists() or target.read_text() != css
target.write_text(css)
print("tokens.css regenerated" if changed else "tokens.css already up to date")

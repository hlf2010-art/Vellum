#!/usr/bin/env python3
"""Keep tokens.css in step with tokens.json (the source of truth).

  python3 scripts/sync_tokens.py          # rewrite token values in tokens.css from tokens.json
  python3 scripts/sync_tokens.py --check  # exit 1 if any value differs (use in CI)

Only the value of each `--name: value;` declaration is touched; comments and layout stay.
"""
import json, re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
tokens = json.loads((root / "tokens.json").read_text())
css_path = root / "tokens.css"
css = css_path.read_text()
themes = [t["id"] for t in tokens["color"]["themes"]]

def theme_value(tok, theme):
    v = tok["value"]
    return v if isinstance(v, str) else v.get(theme, v[themes[0]])

# Split tokens.css into the per-theme colour blocks and the shared block.
blocks = list(re.finditer(r'(?P<sel>[^{}]+)\{(?P<body>[^{}]*)\}', css))
expected = {}  # (block index) -> {name: value}
for i, m in enumerate(blocks):
    sel = m.group("sel")
    theme = next((t for t in themes if f'data-theme="{t}"' in sel), None)
    want = {}
    if theme:
        for fam in ("color", "shadow"):
            for tok in tokens.get(fam, {}).get("tokens", []):
                want[tok["name"]] = theme_value(tok, theme)
    elif sel.strip().startswith(":root"):
        for fam in ("spacing", "radius"):
            for tok in tokens.get(fam, {}).get("tokens", []):
                want[tok["name"]] = tok["value"]
        for key, stack in tokens["type"]["families"].items():
            want[f"font-{key}"] = stack
    if want:
        expected[i] = want

diffs, out, last = [], [], 0
for i, m in enumerate(blocks):
    out.append(css[last:m.start("body")])
    body = m.group("body")
    if i in expected:
        def fix(d, want=expected[i]):
            name, val = d.group(1), d.group(2).strip()
            if name in want and val != want[name]:
                diffs.append((m.group("sel").strip()[:40], name, val, want[name]))
                return f"--{name}: {want[name]};"
            return d.group(0)
        body = re.sub(r'--([A-Za-z0-9_.-]+):\s*([^;]+);', fix, body)
        missing = [n for n in expected[i] if f"--{n}:" not in body]
        if missing:
            diffs.append((m.group("sel").strip()[:40], ",".join(missing), "(missing)", "add"))
            body = body.rstrip() + "".join(f"\n  --{n}: {expected[i][n]};" for n in missing) + "\n"
    out.append(body)
    last = m.end("body")
out.append(css[last:])

for sel, name, old, new in diffs:
    print(f"{re.sub(r"/\*.*?\*/","",sel,flags=re.S).strip()[:40]:40s} --{name}: {old} -> {new}")
if "--check" in sys.argv:
    sys.exit(1 if diffs else 0)
css_path.write_text("".join(out))
print(f"{len(diffs)} value(s) updated" if diffs else "tokens.css already matches tokens.json")

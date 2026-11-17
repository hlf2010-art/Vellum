#!/usr/bin/env python3
"""Write every colour token from tokens.json into the app's theme blocks (Vellum-Lumen.html).

  python3 scripts/sync_app.py          # update the app
  python3 scripts/sync_app.py --check  # exit 1 if the app's colours differ from tokens.json

The app has three theme blocks: the light `:root{`, the dark
`@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){`, and `:root[data-theme="dark"]{`.
In each one, an existing `--name:value;` gets the token's value for that theme, and a missing token
is added on its own line before `color-scheme`. Nothing else in the app is touched.
"""
import json, pathlib, re, sys

ds = pathlib.Path(__file__).resolve().parent.parent
app = ds.parent / "Vellum-Lumen.html"
tokens = json.loads((ds / "tokens.json").read_text())
themes = [t["id"] for t in tokens["color"]["themes"]]
colors = tokens["color"]["tokens"]

src = app.read_text()
BLOCKS = [
    ("light", re.compile(r"\n:root\{\n(.*?)\n\s*color-scheme:light;\n\}", re.S)),
    ("dark", re.compile(r'@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{\n(.*?)\n\s*color-scheme:dark\}\}', re.S)),
    ("dark", re.compile(r':root\[data-theme="dark"\]\{\n(.*?)\n\s*color-scheme:dark\}', re.S)),
]

# Tokens the app must always declare, even if missing: every semantic ink and its -fill.
ADD = re.compile(r"^(A|B|C|D|ok|warn|danger)(-fill|-ink)?$")

def value(tok, theme):
    v = tok["value"]
    return v if isinstance(v, str) else v.get(theme, v[themes[0]])

def norm(v):
    return v.strip().lower().replace(" ", "")

changes = []
out = src
for theme, pat in BLOCKS:
    m = pat.search(out)
    if not m:
        sys.exit(f"sync_app: could not find the {theme} theme block in {app.name}")
    body = m.group(1)
    new = body
    missing = []
    for tok in colors:
        name, val = tok["name"], value(tok, theme)
        decl = re.compile(r"(--" + re.escape(name) + r":)([^;]+);")
        hit = decl.search(new)
        if hit:
            if norm(hit.group(2)) != norm(val):
                changes.append(f"{theme}: --{name} {hit.group(2)} -> {val}")
                new = new[:hit.start(2)] + val + new[hit.end(2):]
        elif ADD.search(name):
            missing.append(f"--{name}:{val};")
            changes.append(f"{theme}: add --{name}:{val}")
        # Other tokens the app doesn't declare (crew inks, note paper) are design-system only: the app
        # styles those parts with its own scoped variables, so they are not added here.
    if missing:
        new = new + "\n  " + " ".join(missing)
    out = out[:m.start(1)] + new + out[m.end(1):]

if "--check" in sys.argv:
    print("app colours match tokens.json" if not changes else "app colours are OUT OF DATE:\n  " + "\n  ".join(changes))
    sys.exit(1 if changes else 0)
app.write_text(out)
print("\n".join(changes) if changes else "app colours already match tokens.json")

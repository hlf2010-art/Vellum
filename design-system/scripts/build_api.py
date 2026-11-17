#!/usr/bin/env python3
"""Generate api/tokens.md and api/components/*.md from tokens.json and components/index.d.ts.

  python3 scripts/build_api.py          # rewrite api/
  python3 scripts/build_api.py --check  # exit 1 if api/ is out of date (use in CI)
"""
import json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
tokens = json.loads((root / "tokens.json").read_text())
dts = (root / "components" / "index.d.ts").read_text()
out = {}


def cell(s):
    return " ".join(str(s or "").split()).replace("|", "\\|")


# ── tokens.md ────────────────────────────────────────────────────────────────
themes = [t["id"] for t in tokens["color"]["themes"]]
md = ["<!-- Generated from tokens.json by scripts/build_api.py. Edit tokens.json, not this file. -->", "# Tokens", "",
      "Every token, one section per family. In CSS use `var(--name)`; type styles are also shorthands (`font: var(--text-body)`) and classes (`.body`).", ""]
groups = {}
for tok in tokens["color"]["tokens"]:
    groups.setdefault(tok.get("group", ""), []).append(tok)
for g, toks in groups.items():
    md += [f"## Colour · {g}" if g else "## Colour", "", "| token | " + " | ".join(themes) + " | usage |", "| --- | " + " | ".join("---" for _ in themes) + " | --- |"]
    for t in toks:
        v = t["value"]
        vals = [v if isinstance(v, str) else v.get(th, v[themes[0]]) for th in themes]
        md.append(f'| `--{t["name"]}` | ' + " | ".join(cell(x) for x in vals) + f' | {cell(t.get("usage"))} |')
    md.append("")
md += ["## Type", "", "| style | size / leading | weight | tracking | family | usage |", "| --- | --- | --- | --- | --- | --- |"]
for grp in tokens["type"]["groups"]:
    for st in grp["styles"]:
        fam = st.get("family") or grp.get("family") or "ui"
        md.append(f'| `{st["name"]}` | {st["fontSize"]} / {st.get("lineHeight", "1.4")} | {st.get("fontWeight", 400)} | {st.get("letterSpacing", "0")} | {fam} | {cell(st.get("usage"))} |')
md.append("")
for fam, body in tokens.items():
    if fam in ("name", "version", "meta", "color", "type") or not isinstance(body, dict) or "tokens" not in body:
        continue
    multi = any(not isinstance(t["value"], str) for t in body["tokens"])
    title = fam[0].upper() + re.sub(r"([A-Z])", r" \1", fam[1:]).lower()
    md += [f"## {title}", ""]
    if multi:
        md += ["| token | " + " | ".join(themes) + " | usage |", "| --- | " + " | ".join("---" for _ in themes) + " | --- |"]
    else:
        md += ["| token | value | usage |", "| --- | --- | --- |"]
    for t in body["tokens"]:
        v = t["value"]
        vals = [v] if not multi else [v if isinstance(v, str) else v.get(th, v[themes[0]]) for th in themes]
        md.append(f'| `--{t["name"]}` | ' + " | ".join(f"`{cell(x)}`" for x in vals) + f' | {cell(t.get("usage"))} |')
    md.append("")
out["api/tokens.md"] = "\n".join(md)

# ── components ───────────────────────────────────────────────────────────────
ifaces = {}
for m in re.finditer(r"export interface (\w+)\s*\{", dts):
    i, depth = m.end(), 1
    while depth:
        depth += {"{": 1, "}": -1}.get(dts[i], 0)
        i += 1
    ifaces[m.group(1)] = dts[m.end():i - 1]


def members(body):
    """Split an interface body into (name, type, note), respecting nesting and JSDoc."""
    res, buf, depth, note, i = [], "", 0, "", 0
    while i < len(body):
        if body.startswith("/**", i):
            j = body.index("*/", i)
            note = " ".join(body[i + 3:j].replace("*", " ").split())
            i = j + 2
            continue
        c = body[i]
        if c in "{([<":
            depth += 1
        elif c in "})]>" and not (c == ">" and body[i - 1] == "="):
            depth -= 1
        nxt = body[i + 1:].lstrip()[:1]
        if (c == ";" or (c == "\n" and nxt != "|" and not buf.rstrip().endswith("|"))) and depth == 0:
            if buf.strip():
                mm = re.match(r"\s*('?[\w-]+'?)(\??)\s*:\s*(.+)", buf.strip(), re.S)
                if mm:
                    res.append((mm.group(1).strip("'"), " ".join(mm.group(3).split()), note))
                note = ""
            buf = ""
        else:
            buf += c
        i += 1
    return res


for cdir in sorted((root / "components").iterdir()):
    pv = cdir / "preview.html"
    name = cdir.name
    if not pv.exists() or f"function {name}(p" not in dts:
        continue
    group = (re.search(r'group="([^"]+)"', pv.read_text().splitlines()[0]) or [None, ""])[1]
    readme = (cdir / "README.md").read_text() if (cdir / "README.md").exists() else ""
    first = re.split(r"(?<=\.)\s", readme.strip().split("\n")[0])[0] if readme else ""
    iface = f"{name}Props"
    lines = ["<!-- Generated from components/index.d.ts by scripts/build_api.py. -->", f"# {name}", "", cell(first), "",
             f"`Vellum.{name}` · {group}", "", "## Use", "", "```jsx", f"<Vellum.Root><Vellum.{name} /></Vellum.Root>", "```", ""]
    if iface in ifaces:
        lines += [f"## Props ({iface})", "", "| prop | type | note |", "| --- | --- | --- |"]
        lines += [f"| `{n}` | `{cell(t)}` | {cell(no)} |" for n, t, no in members(ifaces[iface])]
        lines.append("")
    lines += ["## More", "", f"Long-form usage: `components/{name}/README.md`.", ""]
    out[f"api/components/{name}.md"] = "\n".join(lines)

stale = [p for p, s in out.items() if not (root / p).exists() or (root / p).read_text() != s]
if "--check" in sys.argv:
    print("api/ is up to date" if not stale else "api/ is OUT OF DATE: " + ", ".join(stale))
    sys.exit(1 if stale else 0)
for p in stale:
    (root / p).parent.mkdir(parents=True, exist_ok=True)
    (root / p).write_text(out[p])
print(f"{len(stale)} file(s) written" if stale else "api/ already up to date")

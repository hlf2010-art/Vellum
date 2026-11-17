#!/usr/bin/env python3
"""Rebuild the component nav and sections of index.html from components/*/preview.html.

  python3 scripts/build_gallery.py          # rewrite index.html
  python3 scripts/build_gallery.py --check  # exit 1 if index.html is out of date

Group and height come from each preview's first line (<!-- @dsCard group="…" height=… -->);
the one-line summary is the first sentence of the component's README.md.
"""
import html, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
ORDER = ["Board", "Lineage", "Crew", "Actions", "Canvas chrome", "Controls", "Feedback"]
comps = []
for d in sorted((root / "components").iterdir()):
    pv = d / "preview.html"
    if not pv.exists() or d.name == "Cover":
        continue
    first = pv.read_text().splitlines()[0]
    group = (re.search(r'group="([^"]+)"', first) or [None, "Other"])[1]
    height = int((re.search(r"height=(\d+)", first) or [None, "200"])[1])
    readme = (d / "README.md").read_text() if (d / "README.md").exists() else ""
    para = readme.strip().split("\n\n")[0].replace("\n", " ")
    sent = re.split(r"(?<=[.!?])\s", para)[0]
    sent = re.sub(r"[*`]", "", sent)
    comps.append((group, d.name, height, sent))
comps.sort(key=lambda c: (ORDER.index(c[0]) if c[0] in ORDER else len(ORDER), c[0]))

nav = ['<li><a href="#top">Overview</a></li>']
secs = []
last = None
for group, name, height, sent in comps:
    if group != last:
        nav.append(f'<li class="nav-g">{html.escape(group)}</li>')
        last = group
    nav.append(f'<li><a href="#{name}">{name}</a></li>')
    secs.append(f'''<section class="comp" id="{name}">
  <div class="comp-hd"><h2>{name}</h2><span class="grp">{html.escape(group)}</span></div>
  <p class="sum">{html.escape(sent)}</p>
  <iframe data-src="components/{name}/preview.html" style="height:{height + 8}px" title="{name} preview" loading="lazy"></iframe>
  <p class="links"><a href="components/{name}/README.md">Guidelines</a><a href="api/components/{name}.md">Props</a><a href="components/{name}/preview.html">Open preview</a></p>
</section>''')

page = (root / "index.html").read_text()
out = re.sub(r'(<nav aria-label="Components"><ul>).*?(</ul></nav>)', lambda m: m.group(1) + "".join(nav) + m.group(2), page, count=1, flags=re.S)
start = out.index('<section class="comp"')
end = out.index("</main>")
out = out[:start] + "\n".join(secs) + "\n" + out[end:]
target = root / "index.html"
if "--check" in sys.argv:
    ok = target.read_text() == out
    print("index.html is up to date" if ok else "index.html is OUT OF DATE: run python3 scripts/build_gallery.py")
    sys.exit(0 if ok else 1)
changed = target.read_text() != out
target.write_text(out)
print(f"index.html rebuilt: {len(comps)} components" if changed else "index.html already up to date")

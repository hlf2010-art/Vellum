from pathlib import Path
import re,json
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
original=(ROOT/'MOD WORK - Fable Decision Canvas.html').read_text()
fonts=re.search(r'<style id="gpFonts">.*?</style>',original,re.S)[0]
packed=json.JSONDecoder().raw_decode(original.split('const PACKED_MEDIA=',1)[1])[0]
study=json.loads((HERE.parent/'study.json').read_text())
encode=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
html=(HERE/'index.html').read_text().replace('<!-- FONTS -->',fonts).replace('/* STYLES */',(HERE/'workflow.css').read_text()).replace('/* DATA */','const STUDY='+encode(study)+';\nconst MEDIA='+encode(packed)+';').replace('/* APP */',(HERE/'workflow.js').read_text())
output=ROOT/'MOD WORK - Fable Decision Workflow.html'
output.write_text(html)
print(output)

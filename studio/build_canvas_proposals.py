"""Embed proposal UI in both current standalone canvases, preserving other edits."""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
START, END = '/* BEGIN CANVAS PROPOSALS */', '/* END CANVAS PROPOSALS */'
CSS_START, CSS_END = '/* BEGIN CANVAS PROPOSAL STYLES */', '/* END CANVAS PROPOSAL STYLES */'
script = '\n'.join((HERE / name).read_text() for name in ('canvas-proposal-model.js', 'canvas-proposals.js'))
styles = (HERE / 'canvas-proposals.css').read_text()
for name in ('MOD WORK - Codex Edition.html', 'MOD WORK - Redesign.html'):
    path = ROOT / name
    html = path.read_text()
    html = re.sub(re.escape(START) + r'.*?' + re.escape(END) + '\n?', '', html, flags=re.S)
    html = re.sub(re.escape(CSS_START) + r'.*?' + re.escape(CSS_END) + '\n?', '', html, flags=re.S)
    anchor = 'installTimeline();hydrateIcons();paintLanguage();render();'
    assert html.count(anchor) == 1, name
    html = html.replace(anchor, START + '\n' + script + '\n' + END + '\n' + anchor)
    html = html.replace('</style>', CSS_START + '\n' + styles + '\n' + CSS_END + '\n</style>', 1)
    bridge = "const api=frame.contentWindow;if(!api?.canvasDock)throw Error('Copilot could not load. Your draft is saved.');"
    assert html.count(bridge) == 1, name
    if bridge + '\n  installCanvasProposals(api);' not in html:
        html = html.replace(bridge, bridge + '\n  installCanvasProposals(api);')
    path.write_text(html)
    print(path)

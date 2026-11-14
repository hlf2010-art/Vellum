"""Add Glass Studio presentation to the current standalone prototypes without rebuilding their embedded workflow."""
from pathlib import Path
import json
import re
import base64

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CSS_START, CSS_END = '/* BEGIN GLASS STUDIO STYLES */', '/* END GLASS STUDIO STYLES */'
JS_START, JS_END = '/* BEGIN GLASS STUDIO */', '/* END GLASS STUDIO */'
fonts_path = HERE / 'glass-fonts.css'
if not fonts_path.exists():
    reference = Path('/Users/jordan/Downloads/Vellum-Glass.html').read_text()
    fonts = re.findall(r'@font-face\s*\{[^}]*\}', reference)
    assert fonts, 'The supplied reference must contain its offline fonts.'
    fonts_path.write_text('\n'.join(fonts) + '\n')
styles = fonts_path.read_text() + '\n' + (HERE / 'glass-studio.css').read_text()
script = 'const GLASS_STUDY_CSS=' + json.dumps(fonts_path.read_text() + '\n' + (HERE / 'glass-study.css').read_text(), ensure_ascii=False) + ';\n' + (HERE / 'glass-studio.js').read_text()
for name in ('MOD WORK - Codex Edition.html', 'MOD WORK - Redesign.html'):
    path = ROOT / name
    html = path.read_text()
    for start, end in ((CSS_START, CSS_END), (JS_START, JS_END)):
        html = re.sub(re.escape(start) + r'.*?' + re.escape(end) + '\n?', '', html, flags=re.S)
    anchor = 'installTimeline();hydrateIcons();paintLanguage();render();'
    assert html.count(anchor) == 1, name
    html = html.replace(anchor, JS_START + '\n' + script + '\n' + JS_END + '\n' + anchor)
    html = html.replace('</style>', CSS_START + '\n' + styles + '\n' + CSS_END + '\n</style>', 1)
    html = html.replace("if(!localStorage.getItem(prefix+'.copilotOpen'))copilotOpen=innerWidth>=760;", "if(!localStorage.getItem(prefix+'.copilotOpen'))copilotOpen=false;")
    # An unloaded iframe document can lose its body between localization passes.
    html = html.replace("refresh();observer.observe(doc.body,", "refresh();if(doc.body)observer.observe(doc.body,")
    # Apply the same unload guard inside the embedded document, preserving all workflow data and logic.
    embedded = re.search(r'const studyData\s*=\s*([\"\'])([A-Za-z0-9+/=]+)\1', html)
    assert embedded, name
    study = base64.b64decode(embedded.group(2)).decode()
    guarded = study.replace('refresh();observer.observe(doc.body,', 'refresh();if(doc.body)observer.observe(doc.body,')
    guarded = guarded.replace("const scope=new URLSearchParams(location.search).get('space')||'main';", "const scope='main';")
    guarded = guarded.replace('{state.ui.theme=e.data.mode;', '{if(state)state.ui.theme=e.data.mode;')
    guarded = guarded.replace('refreshControls();renderTrace();renderCopilot()', 'refreshControls();if(state){renderTrace();renderCopilot()}')
    if study != guarded:
        html = html[:embedded.start(2)] + base64.b64encode(guarded.encode()).decode() + html[embedded.end(2):]
    source_init = "const frame=$('studyFrame');if(!frame.srcdoc)frame.srcdoc=new TextDecoder().decode(Uint8Array.from(atob(studyData),c=>c.charCodeAt(0)));"
    guarded_init = "const frame=$('studyFrame');if(!frame.srcdoc){frame.inert=true;frame.setAttribute('aria-busy','true');frame.srcdoc=new TextDecoder().decode(Uint8Array.from(atob(studyData),c=>c.charCodeAt(0)));}"
    html = html.replace(source_init, guarded_init)
    enable = "frame.contentDocument.body.classList.add('canvas-dock');"
    if enable + "frame.inert=false;" not in html:
        html = html.replace(enable, enable + "frame.inert=false;frame.removeAttribute('aria-busy');")
    bridge = '  installCanvasProposals(api);'
    assert html.count(bridge) == 1, name
    if bridge + '\n  installGlassStudy(api);' not in html:
        html = html.replace(bridge, bridge + '\n  installGlassStudy(api);')
    # Fill the existing same-origin document synchronously, avoiding an empty
    # srcdoc navigation and its premature startup observers.
    for frame_name in ('frame', 'studyFrame'):
        assignment = frame_name + '.srcdoc=new TextDecoder().decode(Uint8Array.from(atob(studyData),c=>c.charCodeAt(0)));'
        replacement = frame_name + '.studyHTML=new TextDecoder().decode(Uint8Array.from(atob(studyData),c=>c.charCodeAt(0)));' + frame_name + '.contentDocument.open();' + frame_name + '.contentDocument.write(' + frame_name + '.studyHTML);' + frame_name + '.contentDocument.close();'
        html = html.replace(assignment, replacement)
        html = html.replace('if(!' + frame_name + '.srcdoc)', 'if(!' + frame_name + '.studyHTML)')
    html = html.replace('if(!studyFrame.studyHTML)studyFrame.studyHTML=', 'if(!studyFrame.studyHTML){studyFrame.studyHTML=')
    html = re.sub(r'studyFrame\.contentDocument\.close\(\);(?!\})', 'studyFrame.contentDocument.close();}', html)
    path.write_text(html)
    print(path)

#!/usr/bin/env python3
import base64, concurrent.futures, datetime, difflib, hashlib, json, os, re, shutil, sqlite3, subprocess, threading, uuid, webbrowser
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import quote
from urllib.error import HTTPError

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
SITE=ROOT/'MOD WORK - Creator Journey.html'
CACHE=Path.home()/'Library/Application Support/InfiniteCanvas/Journey'
CACHE.mkdir(parents=True,exist_ok=True)
REPO='hualinfeng2023/mod-work'
PORT=59634
SOURCE=json.loads((HERE/'notion-seed.json').read_text())
DB=CACHE/'history.sqlite'
FILES=[
 ['docs/agent-history/mod-work-player-selector-scope-2026-10-12.md'],
 ['docs/agent-history/photo-identity-gate-20261013.md','fit-studio/README.md'],
 ['fit-studio/src/AutoFitWorkspace.jsx','fit-studio/src/ClothingFit.jsx'],
 ['docs/agent-history/2026-11-03-accessory-runtime-channel-fit.md'],
 ['docs/agent-history/interaction-flow-five-fixes-2026-10-09.md','docs/agent-history/2026-11-03-write-result-redesign.md'],
 ['docs/2026-11-10-undo-model-proposal.md']]
STAGES=['Orient & find','Prepare inputs','Make & adjust','Inspect & stage','Write & verify','Recover & iterate']
lock=threading.Lock()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
def digest(s):return hashlib.sha256(s.encode()).hexdigest()
def gh(endpoint):
    p=subprocess.run([shutil.which('gh') or '/opt/homebrew/bin/gh','api','repos/'+REPO+'/'+endpoint],capture_output=True,timeout=45)
    if p.returncode:raise ValueError('GitHub file or revision unavailable. Check branch and gh authentication.')
    return json.loads(p.stdout)
def evidence(k,txt,version,url,stages,provider):
    return dict(key=k,text=txt[:120000],hash=digest(txt),revision=version,url=url,stages=stages,provider=provider)
def notion(pid,token):
    def get(path):
        with urlopen(Request('https://api.notion.com/v1/'+path,headers={'Authorization':'Bearer '+token,'Notion-Version':'2022-06-28'}),timeout=25) as r:return json.load(r)
    meta=get('pages/'+pid);lines=[]
    def children(b,depth):
        if depth>24:raise ValueError('Notion nesting limit reached; previous snapshot retained.')
        cursor=''
        while True:
            data=get('blocks/'+b+'/children?page_size=100'+cursor)
            for item in data['results']:
                typ=item['type'];part=item.get(typ,{})
                val=''.join(t.get('plain_text','') for t in part.get('rich_text',[])) or part.get('title','')
                if val:lines.append(val)
                if item['has_children'] and typ not in ('child_page','child_database'):children(item['id'],depth+1)
            if not data['has_more']:break
            cursor='&start_cursor='+quote(data['next_cursor'])
    children(pid,0)
    return '\n'.join(lines),meta['last_edited_time']
def db():return sqlite3.connect(DB,timeout=20)
def last():
    with db() as c:
        row=c.execute('select payload from runs order by id desc limit 1').fetchone()
    return json.loads(row[0]) if row else None
def store(r):
    with db() as c:c.execute('insert into runs(payload) values(?)',(json.dumps(r),))
def init():
    with db() as c:c.execute('create table if not exists runs(id integer primary key,payload text not null)')
    if last():return
    b=json.loads((HERE/'baseline.json').read_text())
    n=evidence(SOURCE['id'],SOURCE['text'],SOURCE['retrieved'],'https://www.notion.so/'+SOURCE['id'].replace('-',''),[1,2,3,4],'Notion · connected snapshot')
    b['sources'].append(n);b['pages']=[{'id':SOURCE['id'],'stages':n['stages']}];store(b)
session_token=""
def refresh(branch,pages,token,connected=None):
    old=last();previous={e['key']:e for e in old['sources']};entries=[];errors=[]
    sha=gh('commits/'+quote(branch,safe=''))['sha']
    def fetch(arg):
        i,path=arg
        d=gh('contents/'+path+'?ref='+sha)
        if d.get('encoding')!='base64':raise ValueError('Unsupported file size')
        return evidence(path,base64.b64decode(d['content']).decode(),sha,'https://github.com/'+REPO+'/blob/'+sha+'/'+path,[i],'GitHub')
    args=[(i,p) for i,paths in enumerate(FILES) for p in paths]
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        jobs=[pool.submit(fetch,a) for a in args]
        for (_,path),job in zip(args,jobs):
            try:entries.append(job.result())
            except Exception:errors.append(path+' · unavailable; last evidence retained');entries.extend([previous[path]] if path in previous else [])
    for page in pages:
        pid=page['id']
        try:
            if connected and pid==connected['id']:
                entries.append(evidence(pid,connected['text'],connected['revision'],'https://www.notion.so/'+pid.replace('-',''),page['stages'],'Notion · connected snapshot'))
                continue
            if not token:raise ValueError('Connect a Notion integration to check for newer edits')
            txt,ver=notion(pid,token);entries.append(evidence(pid,txt,ver,'https://www.notion.so/'+pid.replace('-',''),page['stages'],'Notion API'))
        except Exception as e:
            errors.append(pid+' · '+(str(e) if isinstance(e,(ValueError,HTTPError)) else 'Notion unavailable'))
            if pid in previous:entries.append(dict(previous[pid],stages=page['stages']))
    changes=[]
    for e in entries:
        prev=previous.get(e['key'])
        if not prev or prev['hash']!=e['hash'] or prev['stages']!=e['stages']:
            kind='New source' if not prev else 'First API baseline' if e['provider']!=prev['provider'] and e['provider']=='Notion API' else 'Evidence changed'
            diff=list(difflib.unified_diff((prev or {}).get('text','').splitlines(),e['text'].splitlines(),n=2,lineterm=''))
            changes.append(dict(key=e['key'],kind=kind,stages=sorted(set(e['stages']+(prev or {}).get('stages',[]))),diff='\n'.join(diff[:100])[:8500] or 'Stage assignment changed.'))
    for k,e in previous.items():
        if k not in {v['key'] for v in entries}:changes.append(dict(key=k,kind='Removed from selection',stages=e['stages'],diff='Earlier evidence remains in the previous snapshot.'))
    r=dict(time=now(),branch=branch,revision=sha,sources=entries,errors=errors,changes=changes,pages=pages);store(r);return r
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def send(self,data,mime='application/json',status=200):
        raw=data if isinstance(data,bytes) else json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if self.headers.get('Host')!=f'127.0.0.1:{PORT}':return self.send({},status=403)
        if self.path=='/':return self.send(SITE.read_bytes(),'text/html; charset=utf-8')
        if self.path=='/connection':return self.send({'configured':bool(session_token or os.getenv('NOTION_TOKEN'))})
        if self.path=='/history':
            with db() as c:return self.send([dict(id=i,time=r['time'],branch=r['branch']) for i,p in c.execute('select id,payload from runs order by id desc') for r in [json.loads(p)]])
        if re.fullmatch('/snapshot/\d+',self.path):
            with db() as c:
                row=c.execute('select payload from runs where id=?',(int(self.path.split('/')[-1]),)).fetchone()
            if row:return self.send(row[0].encode())
        self.send({},status=404)
    def do_POST(self):
        global session_token
        if self.path not in ('/refresh','/disconnect') or self.headers.get('Origin')!=f'http://127.0.0.1:{PORT}' or self.headers.get('Host')!=f'127.0.0.1:{PORT}' or self.headers.get('X-Journey')!='refresh':return self.send({},status=403)
        if not lock.acquire(False):return self.send({'error':'Refresh already running'},status=409)
        try:
            if self.path=='/disconnect':
                session_token=''
                return self.send({'disconnected':True})
            size=int(self.headers.get('Content-Length',0))
            if size>24000:raise ValueError('Request too large')
            body=json.loads(self.rfile.read(size));branch=body['branch'].strip()
            if not re.fullmatch(r'[\w./-]{1,180}',branch):raise ValueError('Invalid branch')
            pages=body['pages']
            if len(pages)>16:raise ValueError('Select up to 16 pages')
            for p in pages:
                p['id']=str(uuid.UUID(p['id']));assert all(isinstance(i,int) and 0<=i<6 for i in p['stages'])
            supplied=body.get('token','')
            result=refresh(branch,pages,supplied or session_token or os.getenv('NOTION_TOKEN',''))
            if supplied and any(not any(msg.startswith(pg['id']) for msg in result['errors']) for pg in pages):
                session_token=supplied
            self.send(result)
        except Exception as e:self.send({'error':str(e) or 'Invalid selection'},status=400)
        finally:lock.release()
if __name__=='__main__':
    init();ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()

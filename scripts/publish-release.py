# -*- coding: utf-8 -*-
"""Publish verified local macOS installers to the system repository."""
import argparse,hashlib,json,os,pathlib,subprocess,urllib.request,urllib.error,urllib.parse
root=pathlib.Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version']
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--commit',required=True,help='Exact pushed source commit (40 hex characters)')
parser.add_argument('--notes-file',required=True,help='Reviewed UTF-8 release notes for this version')
args=parser.parse_args()
if len(args.commit)!=40 or any(c not in '0123456789abcdef' for c in args.commit):raise SystemExit('Use an exact commit SHA')
release_notes=pathlib.Path(args.notes_file).read_text()
if not release_notes.strip():raise SystemExit('Release notes are empty')
source_repo=pathlib.Path(os.environ.get('ZHIYE_REPOSITORIES',str(root.parent/'web-notes-repositories')))/'system'
# Refuse to publish installers against stale source staging.
source_files=[p for folder in ['src','server','electron','scripts','.github'] for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
source_files += [root/name for name in ['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','eslint.config.js','.gitignore','README.md']]
for file in source_files:
    relative=file.relative_to(root).as_posix()
    committed=subprocess.run(['git','-C',str(source_repo),'show',args.commit+':'+relative],capture_output=True)
    if committed.returncode or committed.stdout!=file.read_bytes():raise SystemExit('Source differs from release commit: '+relative)
repo='Jianglllri/Notess'
files=[root/'release'/f'Zhiye-Notes-{version}-arm64.{ext}' for ext in ['dmg','pkg']]
for f in files:
    if not f.is_file(): raise SystemExit('Missing installer: '+f.name)
checksum=root/'release'/'SHA256SUMS.txt'
checksum.write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in files))
files.append(checksum)
git=next(p for p in ['/opt/homebrew/bin/git','/usr/local/bin/git','/usr/bin/git'] if pathlib.Path(p).exists())
p=subprocess.run([git,'credential','fill'],input='protocol=https\nhost=github.com\npath='+repo+'.git\n\n',text=True,capture_output=True,env={**os.environ,'GIT_TERMINAL_PROMPT':'0'},timeout=15)
token=dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line).get('password')
if not token: raise SystemExit('No available GitHub credential')
base='https://api.github.com/repos/'+repo
headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'Zhiye-release'}
def request(url,method='GET',data=None,ctype='application/json'):
    if isinstance(data,dict): data=json.dumps(data).encode()
    req=urllib.request.Request(url,data=data,method=method,headers={**headers,'Content-Type':ctype})
    try:
        with urllib.request.urlopen(req,timeout=600) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f'GitHub request failed: {method} HTTP {e.code}') from None
remote=request(base+'/commits/'+args.commit)
if remote['sha']!=args.commit:raise SystemExit('Source commit is not available on GitHub')
releases=request(base+'/releases')
release=next((r for r in releases if r['tag_name']=='v'+version),None)
if release and not release['draft']: raise SystemExit('Version already published; refusing to overwrite.')
if not release:
    release=request(base+'/releases','POST',{'tag_name':'v'+version,'target_commitish':args.commit,'name':'枝叶学习笔记 '+version,'draft':True,'prerelease':False,'body':release_notes})
print('Release draft ready',release['id'],flush=True)
for f in files:
    existing=next((a for a in request(base+'/releases/'+str(release['id']))['assets'] if a['name']==f.name),None)
    if existing:
        digest='sha256:'+hashlib.sha256(f.read_bytes()).hexdigest()
        if existing['size']==f.stat().st_size and existing.get('digest')==digest:
            print('Verified existing asset',f.name,flush=True);continue
        raise SystemExit('Asset differs; inspect draft before retrying: '+f.name)
    print('Uploading',f.name,flush=True)
    result=request('https://uploads.github.com/repos/'+repo+'/releases/'+str(release['id'])+'/assets?name='+urllib.parse.quote(f.name),'POST',f.read_bytes(),'application/octet-stream')
    if result['size']!=f.stat().st_size or result.get('digest')!='sha256:'+hashlib.sha256(f.read_bytes()).hexdigest(): raise SystemExit('Uploaded checksum mismatch')
    print('Uploaded',f.name,flush=True)
result=request(base+'/releases/'+str(release['id']),'PATCH',{'draft':False,'make_latest':'true'})
print('Published',result['html_url'],flush=True)

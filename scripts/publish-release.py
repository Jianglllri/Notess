"""Publish verified local macOS installers to the system repository."""
import hashlib,json,os,pathlib,subprocess,urllib.request,urllib.error,urllib.parse
root=pathlib.Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version']
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
releases=request(base+'/releases')
release=next((r for r in releases if r['tag_name']=='v'+version),None)
if release and not release['draft']: raise SystemExit('Version already published; refusing to overwrite.')
if not release:
    release=request(base+'/releases','POST',{'tag_name':'v'+version,'target_commitish':'main','name':'枝叶学习笔记 '+version+' · 首个正式版','draft':True,'prerelease':False,'body':'首个正式版本，适用于 Apple 芯片 Mac。\n\n- Markdown 即时编辑、代码高亮与数学公式\n- 项目文件夹、标签及文件夹/笔记反复移动\n- 可视化思维导图和流程图：拖拽、节点缩放、连线及撤销重做\n- 仅本地或本地 + GitHub 模式，公开与私密笔记分仓同步\n- 外部题库云端保存导入清单，本地下载正文\n- GitHub 导入与笔记更新、每两天确认上传提醒\n- 随机考试、Markdown / HTML 导出与 ZIP 备份\n- 应用启动及运行期间每 6 小时检查新版，在应用内提示下载安装\n\n下载 DMG 或 PKG 任选一种。下载后退出旧应用再覆盖安装，本地笔记保留。安装包使用 ad-hoc 签名，尚未经过 Apple Developer ID 签名和公证，macOS 可能提示无法验证开发者。\n\n更新提醒从 1.0.0 开始提供，当前下载安装由用户操作，不会静默替换软件。'})
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

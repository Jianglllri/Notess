#!/usr/bin/env python3
"""Prepare local repository content and importable workspaces. Never pushes or commits."""
import hashlib, json, re, subprocess, uuid, zipfile
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT/'repository-work'
OUT=ROOT/'deliverables'/'organized-notes'
NOW=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def git(repo,*args):return subprocess.check_output(['git','-C',str(repo),*args])
def uid(value):return str(uuid.uuid5(uuid.NAMESPACE_URL,value))
def decoded(raw,fallback):
 m=re.match(r'^<!-- zhiye:(.+) -->\n',raw)
 if m:
  try:return json.loads(m[1]),raw[m.end():]
  except ValueError:pass
 heading=re.search(r'^# (.+)$',raw,re.M)
 return {'title':(heading[1] if heading else fallback),'tags':[]},raw
def encoded(meta,body):return '<!-- zhiye:'+json.dumps(meta,ensure_ascii=False,separators=(',',':')).replace('-->','--\\u003e')+' -->\n'+body
ALG={'1BFS':'广度优先搜索 BFS','2动态规划':'动态规划','3滑动窗口和双指针':'滑动窗口与双指针','4二分查找':'二分查找','5前缀和':'前缀和','6栈':'栈与单调栈','7回溯':'回溯算法','8并查集':'并查集','9贪心':'贪心算法','10DFS':'深度优先搜索 DFS','11链表':'链表','12拒绝采样':'拒绝采样','13数学':'数学与快速幂','14字符串':'字符串','15图论':'图论','16 树':'树与二叉树','17 差分数组':'差分数组','!笔试acm模式':'笔试 ACM 输入输出'}
def classification(path,visibility):
 parts=path.parts;stem=path.stem
 if visibility=='private':
  folder={'01_Work_Experience':'工作经历','02_Archive':'个人归档','03_LearningLog':'学习日志'}.get(parts[0],'个人资料')
  return stem,['私密笔记',folder,*parts[1:-1]],['私密',folder]
 if 'Leetcode' in parts:
  
  group='基础与输入输出'
  if stem in ['1BFS','10DFS','7回溯']:group='搜索与回溯'
  elif stem in ['6栈','8并查集','11链表','14字符串','16 树','哈希表']:group='数据结构'
  elif stem in ['2动态规划','9贪心']:group='动态规划与贪心'
  elif stem in ['3滑动窗口和双指针','4二分查找','5前缀和','17 差分数组']:group='数组与区间'
  elif stem in ['12拒绝采样','13数学']:group='数学与概率'
  elif stem=='15图论':group='图论'
  return ALG.get(stem,stem),['公开笔记','算法面试',group],['算法','面试']
 if '八股文' in parts:return stem,['公开笔记','面试知识','AI 与推荐'],['面试','AI']
 if 'AI_Basics' in parts:return re.sub(r'^\d+_','',stem),['公开笔记','学习基础','人工智能'],['学习','AI']
 if '03_Review' in parts:return stem,['公开笔记','学习复盘'],['复盘']
 return stem,['公开笔记',*parts[:-1]],[]
def make_workspace(visibility,records):
 folders={};notes=[];repo='https://github.com/Jianglllri/notes-'+visibility
 for path,meta,body,old,sha in records:
  parent=None
  for i,name in enumerate(meta.get('folderPath',[])):
   key='/'.join(meta['folderPath'][:i+1]);fid=uid(visibility+'/folder/'+key)
   folders.setdefault(key,{'id':fid,'name':name,'parentId':parent,'createdAt':NOW});parent=fid
  note={'id':uid(repo+'/'+path),'title':meta['title'],'content':body,'folderId':parent,'folderPath':meta.get('folderPath',[]),'tags':meta.get('tags',[]),'visibility':visibility,'pinned':meta.get('pinned',False),'createdAt':NOW,'updatedAt':NOW,'deletedAt':meta.get('deletedAt')}
  if meta.get('source'):
   note['source']={**meta['source'],'baseContent':body}
   source=meta['source'];note['sourceUrl']=source['url']+'/blob/'+source['branch']+'/'+source['path']
  if not sha and not meta.get('source') and path.startswith('imports/RiddleGo/agent-interview-300/'):
   note['sourceUrl']='https://github.com/Jianglllri/Notess/blob/main/imports/agent-interview-300/'+path.split('imports/RiddleGo/agent-interview-300/',1)[1]
  if sha:
   original,original_body=decoded(old,Path(path).stem)
   baseline={k:original[k] for k in ['title','tags','visibility','deletedAt','folderPath','pinned','source','referenceOnly'] if k in original}
   note['github']={'url':repo,'branch':'main','path':path,'sha':sha,'format':'md','transport':'file','syncedAt':NOW,'baseSnapshot':encoded(baseline,original_body),'baseContent':original_body}
   note['sourceUrl']=repo+'/blob/main/'+path
  notes.append(note)
 return {'schemaVersion':1,'id':uid(repo+'/organized-workspace'),'notes':notes,'folders':list(folders.values()),'assets':[],'updatedAt':NOW,'lastBackupAt':NOW}
def main():
 OUT.mkdir(parents=True,exist_ok=True);report={'preparedAt':NOW,'published':False,'repositories':{}}
 all_records={}
 for visibility in ['public','private']:
  repo=BASE/('notes-'+visibility);records=[];mapping=[]
  tracked=git(repo,'ls-tree','-r','--name-only','-z','HEAD').decode().split('\0')
  for filename in tracked:
   if not filename.lower().endswith(('.md','.markdown','.txt')):continue
   path=Path(filename);old=git(repo,'show','HEAD:'+filename).decode();original,body=decoded(old,path.stem)
   title,folders,tags=classification(path,visibility)
   meta={**original,'title':title,'tags':list(dict.fromkeys(original.get('tags',[])+tags)),'visibility':visibility,'folderPath':folders,'pinned':original.get('pinned',False)}
   (repo/path).write_text(encoded(meta,body))
   sha=git(repo,'rev-parse','HEAD:'+filename).decode().strip();records.append((filename,meta,body,old,sha))
   mapping.append({'path':filename,'title':title,'folderPath':folders,'tags':meta['tags']})
  all_records[visibility]=records
  report['repositories'][visibility]={'personalNotes':len(records),'pathsUnchanged':True,'classification':mapping}
 # Verify origin by Git blob identity, never infer it from a similar title.
 tree=json.loads((BASE/'source-tree.json').read_text());source_files={f['path']:f for f in tree['tree'] if f['type']=='blob'}
 source_repo='https://github.com/RiddleGo/agent-interview-300'
 # The tree API sha is a tree id, not a commit. Resolve the branch to a commit separately.
 commit=json.loads((BASE/'source-commit.json').read_text())['sha']
 system=BASE/'system';entries=[];unmatched=[]
 for file in sorted((system/'imports'/'agent-interview-300').rglob('*.md')):
  path=file.relative_to(system/'imports'/'agent-interview-300').as_posix();raw=file.read_bytes();sha=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest();remote=source_files.get(path)
  body=raw.decode();oldmeta,body=decoded(body,Path(path).stem)
  title=oldmeta['title'];folders=['外部资料','Agent 面试 300 题',*Path(path).parts[:-1]]
  meta={'title':title,'tags':['AI','面试','导入资料'],'visibility':'public','folderPath':folders,'pinned':False}
  target='imports/RiddleGo/agent-interview-300/'+path
  if remote and remote['sha']==sha:
   meta.update(source={'url':source_repo,'branch':'main','path':path,'sha':sha,'commit':commit},referenceOnly=True)
   entries.append({'path':target,'mode':'reference','record':encoded(meta,'')})
  else:
   unmatched.append(target);dest=BASE/'notes-public'/target;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(encoded(meta,body))
  all_records['public'].append((target,meta,body,'',None))
 public=BASE/'notes-public';(public/'.zhiye').mkdir(exist_ok=True)
 (public/'.zhiye'/'imports.json').write_text(json.dumps({'version':1,'entries':entries},ensure_ascii=False,indent=2)+'\n')
 private=BASE/'notes-private';(private/'.zhiye').mkdir(exist_ok=True)
 (private/'.zhiye'/'imports.json').write_text('{"version":1,"entries":[]}\n')
 report['references']={'matched':len(entries),'keptFullCopies':len(unmatched),'unmatchedPaths':unmatched,'sourceCommit':commit,'systemOriginalsRetained':True}
 for visibility,records in all_records.items():
  workspace=make_workspace(visibility,records)
  with zipfile.ZipFile(OUT/('notes-'+visibility+'-organized.zip'),'w',zipfile.ZIP_DEFLATED) as z:
   z.writestr('workspace.json',json.dumps(workspace,ensure_ascii=False,separators=(',',':')))
   for n in workspace['notes']:z.writestr('notes/'+n['id']+'.md',n['content'])
  # Private inventory remains in a separate local file; it is not copied to public or system repos.
  (OUT/('notes-'+visibility+'-classification.json')).write_text(json.dumps(report['repositories'][visibility],ensure_ascii=False,indent=2))
  print(visibility,len(workspace['notes']),'notes',len(workspace['folders']),'folders')
 # Aggregate report contains only counts and public source paths.
 for value in report['repositories'].values():value.pop('classification')
 (OUT/'preparation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print('verified references',len(entries),'full copies retained',len(unmatched),'no remote writes')
if __name__=='__main__':main()

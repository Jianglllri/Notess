import {configureImport} from '../lib/importPolicy';
import {getRepositories} from '../lib/repositories';
import {importCloudRepository} from '../lib/cloudSync';
import {useRef,useState} from 'react';
import type {ChangeEvent} from 'react';
import {ArchiveIcon,BookOpenIcon,DownloadSimpleIcon,FileTextIcon,LinkIcon} from '@phosphor-icons/react';
import {Modal} from './Modal';
import type {Workspace} from '../types';
import {newNote} from '../lib/workspace';
import {importMarkdownZip,parseArxivId,fetchArxivPaper,paperNoteTemplate,type ImportedZipItem} from '../lib/importMenu';
import {folderLabel} from '../lib/folders';
import {decodeNote,importGithub,parseGithub,DEFAULT_REPO} from '../lib/github';
import {mergeRemote} from '../lib/sync';
export function ImportMenu({workspace,update,onImported,onNotice,onBackup}:{workspace:Workspace;update:(fn:(w:Workspace)=>Workspace)=>boolean;onImported:(id:string)=>void;onNotice:(msg:string)=>void;onBackup:(w:Workspace)=>void}) {
 const mdInput=useRef<HTMLInputElement>(null);
 const zipInput=useRef<HTMLInputElement>(null);
 const [mode,setMode]=useState<'link'|'paper'|null>(null);
 const [url,setUrl]=useState('');
 const [policy,setPolicy]=useState<'reference'|'full'>('reference');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [targetFolder,setTargetFolder]=useState<string|null>(null);
 function close(){if(!busy){setMode(null);setUrl('');setMessage('');}}
 function addNotes(items:{title:string;content:string;tags?:string[];visibility?:'public'|'private'}[]){
  const notes=items.map(item=>({...newNote(targetFolder),...item}));
  if(!update(w=>({...w,notes:[...w.notes,...notes.map(n=>({...n,folderId:w.folders.some(f=>f.id===n.folderId)?n.folderId:null}))]})))throw new Error('本地保存失败。');
  onImported(notes[0].id);onNotice(`已导入 ${notes.length} 篇笔记。`);
 }
 function addZipItems(items:ImportedZipItem[]){
  if(items.length+workspace.notes.length>1000)throw new Error('导入后将超过 1000 篇笔记。');
  const now=new Date().toISOString();
  let firstId='';
  if(!update(w=>{
   const folders=[...w.folders];
   const notes=items.map(item=>{
    let parentId:string|null=w.folders.some(f=>f.id===targetFolder)?targetFolder:null;
    for(const segment of item.path){
     const name=segment.trim().slice(0,60);
     if(!name)continue;
     let folder=folders.find(f=>f.name===name&&(f.parentId||null)===parentId);
     if(!folder){folder={id:crypto.randomUUID(),name,parentId,createdAt:now};folders.push(folder);}
     parentId=folder.id;
    }
    return {...newNote(parentId),title:item.title,content:item.content,tags:item.tags||[],visibility:item.visibility};
   });
   if(notes[0])firstId=notes[0].id;
   if(folders.length>200)throw new Error('导入后文件夹超过 200 个，请先整理或减少 ZIP 内目录层级。');
   return {...w,folders,notes:[...w.notes,...notes]};
  }))throw new Error('本地保存失败。');
  onImported(firstId);onNotice(`已导入 ${items.length} 篇笔记，并按目录整理到文件夹。`);
 }
 async function readMd(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.target.files??[]);event.target.value='';
  if(!files.length)return;
  setBusy(true);setMessage('');
  try{
   if(files.length+workspace.notes.length>1000)throw new Error('导入后将超过 1000 篇笔记。');
   const items=await Promise.all(files.map(async file=>{
    if(!/\.(md|markdown|txt)$/i.test(file.name)||file.size>1_000_000)throw new Error('只支持不超过 1 MB 的 Markdown 或文本文件。');
    const content=await file.text();
    const fallback=file.name.replace(/\.[^.]+$/,'').slice(0,200)||'未命名笔记';
    const decoded=decodeNote(content,fallback);
    return {title:decoded.title,content:decoded.content,tags:decoded.tags,visibility:decoded.visibility};
   }));
   addNotes(items);
  }catch(e){const error=e instanceof Error?e.message:'导入失败。';setMessage(error);onNotice(error);}
  finally{setBusy(false);}
 }
 async function readZip(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  setBusy(true);setMessage('');
  try{
   const items=await importMarkdownZip(file);
   if(items.kind==='backup')onBackup(items.workspace);else addZipItems(items.items);
  }catch(e){const error=e instanceof Error?e.message:'导入失败。';setMessage(error);onNotice(error);}
  finally{setBusy(false);}
 }
 async function importLink(){
  setBusy(true);setMessage('');
  try{
   const config=getRepositories(),parsed=parseGithub(url),repo=`https://github.com/${parsed.owner}/${parsed.repo}`;
   const visibility=repo.toLowerCase()===config.private.toLowerCase()?'private':repo.toLowerCase()===config.public.toLowerCase()?'public':undefined;
   const progress=(done:number,total:number)=>setMessage(`正在导入 ${done}/${total} 篇…`);
   const docs=visibility?await importCloudRepository(repo,visibility==='private'?config.privateBranch:config.publicBranch,visibility,workspace.notes,'',progress):await importGithub(url,'',progress);
   let stats='';
   if(!update(w=>{const merged=mergeRemote(w,docs,visibility?repo:DEFAULT_REPO);stats=`新增 ${merged.added} 篇，更新 ${merged.updated} 篇，冲突 ${merged.conflicts} 篇。重复导入不会重复添加。`;return visibility?merged.workspace:configureImport(w,merged.workspace,docs,policy);}))throw new Error('本地保存失败。');
   onNotice(stats);close();
  }catch(e){const error=e instanceof Error?e.message:'导入失败。';setMessage(error);onNotice(error);}
  finally{setBusy(false);}
 }
 async function importPaper(){
  setBusy(true);setMessage('');
  try{
   const id=parseArxivId(url);
   const meta=await fetchArxivPaper(id);
   addNotes([paperNoteTemplate(meta)]);
   close();
  }catch(e){const error=e instanceof Error?e.message:'导入失败。';setMessage(error);onNotice(error);}
  finally{setBusy(false);}
 }
 return <>
  <details className="import-menu"><summary className="sidebar-action-icon" aria-label="导入" title="导入 Markdown / ZIP / 链接 / 论文"><DownloadSimpleIcon size={17}/></summary>
   <div className="import-menu-items" onClick={event=>{const menu=(event.currentTarget as HTMLElement).parentElement;if(menu instanceof HTMLDetailsElement)menu.open=false;}}>
    <label className="import-target" onClick={e=>e.stopPropagation()}><span>导入到</span><select value={targetFolder??''} onChange={e=>setTargetFolder(e.target.value||null)}><option value="">未分类</option>{workspace.folders.map(f=><option key={f.id} value={f.id}>{folderLabel(workspace.folders,f.id)}</option>)}</select></label>
    <button disabled={busy} onClick={()=>mdInput.current?.click()}><FileTextIcon size={14}/>导入 Markdown</button>
    <button disabled={busy} onClick={()=>zipInput.current?.click()}><ArchiveIcon size={14}/>导入 ZIP</button>
    <button disabled={busy} onClick={()=>{setMode('link');setUrl('');setMessage('');}}><LinkIcon size={14}/>导入链接</button>
    <button disabled={busy} onClick={()=>{setMode('paper');setUrl('');setMessage('');}}><BookOpenIcon size={14}/>导入论文（arXiv）</button>
   </div>
  </details>
  <input className="hidden-input" ref={mdInput} type="file" accept=".md,.markdown,.txt" multiple aria-label="选择 Markdown 文件" onChange={event=>void readMd(event)}/>
  <input className="hidden-input" ref={zipInput} type="file" accept=".zip" aria-label="选择 ZIP 文件" onChange={event=>void readZip(event)}/>
  <Modal open={mode==='link'} title="导入链接" description="支持 GitHub / vscode.dev 链接，按项目与目录整理。公开仓库可直接导入；私密仓库请在「备份与同步」配置后，从编辑栏「工具 ··· → 导入文档」导入。" onClose={close}>
   <div className="study-form"><label>链接地址<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://github.com/owner/repo"/></label><label>外部资料同步方式<select value={policy} disabled={busy} onChange={e=>setPolicy(e.target.value as 'reference'|'full')}><option value="reference">来源清单：云端存链接，本地下载正文</option><option value="full">完整同步：正文也上传到笔记仓库</option></select></label><p role="status">{message}</p><div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={close}>取消</button><button className="primary-button" disabled={busy||!url} onClick={()=>void importLink()}>{busy?'导入中…':'导入'}</button></div></div>
  </Modal>
  <Modal open={mode==='paper'} title="导入论文（arXiv）" description="粘贴 arXiv 链接或编号，自动抓取标题、作者、年份和摘要，生成论文笔记模板。" onClose={close}>
   <div className="study-form"><label>arXiv 链接或编号<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://arxiv.org/abs/2103.00000 或 2103.00000"/></label><p role="status">{message}</p><div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={close}>取消</button><button className="primary-button" disabled={busy||!url} onClick={()=>void importPaper()}>{busy?'抓取中…':'生成笔记模板'}</button></div></div>
  </Modal>
 </>;
}

import { useCloudMode } from '../hooks/useCloudMode';
import {useState} from 'react';
import type {Note, Workspace} from '../types';
import {newNote, summary} from '../lib/workspace';
import {StudyTools} from './StudyTools';
export function MemoFeed({workspace, notes, label, update, openNote, syncStatus, pull, openMenu, query, setQuery}: {
  query:string;setQuery:(s:string)=>void; workspace:Workspace; notes:Note[]; label:string; update:(fn:(w:Workspace)=>Workspace)=>boolean;
  openNote:(id:string)=>void; syncStatus:string; pull:()=>Promise<void>; openMenu:()=>void;
}) {
  const cloud=useCloudMode();
  const [draft,setDraft]=useState(''); const [limit,setLimit]=useState(30);
  function save() {
    if (!draft.trim()) return;
    const tags = [...new Set(Array.from(draft.matchAll(/(?:^|\s)#([^\s#]+)/g),m=>m[1]).filter(t=>t.length<=40))].slice(0,30);
    const note = {...newNote(),title:draft.trim().split('\n')[0].replace(/^#+\s*/, '').slice(0,80),content:draft,tags};
    if(update(w=>({...w, notes:[note,...w.notes]}))) setDraft('');
  }
  const dates = new Set(workspace.notes.filter(n=>!n.deletedAt).map(n=>n.createdAt.slice(0,10)));
  return <section className="memo-feed">
    <header className="feed-header"><div><button className="mobile-menu" onClick={openMenu}>☰ 分类</button><span className="feed-eyebrow">记录 · 连接 · 温故知新</span><h1>{label === '全部笔记' ? '把今天的想法留下来' : label}</h1><p>每一条记录，都在构建你的知识。</p></div><span className="feed-counter"><b>{workspace.notes.filter(n=>!n.deletedAt).length}</b> 篇笔记 · {dates.size} 天记录</span></header>
    <div className="quick-memo"><textarea aria-label="快速记录" placeholder="此刻有什么想法？写下一条笔记。用 #标签 连接知识，长文可以打开编辑器继续整理。" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();save();}}} /><footer><span>⌘ / Ctrl + Enter 保存到本机</span><button className="primary-button" disabled={!draft.trim()} onClick={save}>记下来</button></footer></div>
    {cloud&&<div className="feed-sync"><div><strong>↗ GitHub 笔记库</strong><small role="status">{syncStatus}</small></div><button onClick={()=>void pull()}>刷新笔记库</button></div>}
    <StudyTools workspace={workspace} selected={null} update={update}/>
    <input className="feed-search" aria-label="搜索卡片笔记" placeholder="搜索标题、正文或标签…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(30);}} /><div className="feed-section"><h2>{label}</h2><span>{notes.length} 条 · 最近修改</span></div>
    <div className="memo-grid">{notes.slice(0,limit).map(note=><article className="memo-card" key={note.id}><header><time>{new Date(note.updatedAt).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time><span>{note.pinned?'置顶':note.github?'GitHub':'本地'}</span></header><button className="memo-open" onClick={()=>openNote(note.id)}><h3>{note.title}</h3><p>{summary(note.content).slice(0,260)}</p></button><footer><div>{note.tags.slice(0,3).map(tag=><span className="memo-tag" key={tag}>#{tag}</span>)}{!note.tags.length&&<span className="memo-category">{workspace.folders.find(f=>f.id===note.folderId)?.name || '随手记'}</span>}</div><button onClick={()=>openNote(note.id)}>编辑 ↗</button></footer></article>)}</div>
    {!notes.length&&<p className="feed-empty">还没有笔记，写下第一条记录，或导入一个 GitHub 文档库。</p>}
    {notes.length>limit&&<button className="load-more" onClick={()=>setLimit(v=>v+30)}>再看 30 条</button>}
  </section>;
}

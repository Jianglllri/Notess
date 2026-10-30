import {useState} from 'react';
import type {Workspace} from '../types';
import {markdownTitle} from '../lib/markdownTitle';
export function TitleRepair({workspace,update}:{workspace:Workspace;update:(fn:(w:Workspace)=>Workspace)=>boolean}) {
 const [open,setOpen]=useState(false),[selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState('');
 const candidates=open?workspace.notes.filter(n=>!n.deletedAt).map(n=>({id:n.id,before:n.title,after:markdownTitle(n.content)})).filter(n=>n.after&&n.after!==n.before):[];
 function apply(){
  const changes=new Map(candidates.filter(n=>selected.includes(n.id)).map(n=>[n.id,n]));
  const ok=update(w=>({...w,notes:w.notes.map(n=>{const c=changes.get(n.id);return c&&c.before===n.title&&c.after===markdownTitle(n.content)?{...n,title:c.after!,updatedAt:new Date().toISOString()}:n;})}));
  if(ok){setSelected([]);setMessage('已保存选中的标题，正文未修改。');}else setMessage('保存失败，请重试。');
 }
 return <section><button className="text-button" onClick={()=>{setOpen(!open);setSelected([]);setMessage('');}}>整理笔记标题{open?'（收起）':''}</button>{open&&<>
 <p>根据正文标题列出建议。请勾选需要修复的笔记；手动命名的笔记可保持原名。</p>
 <div style={{maxHeight:240,overflow:'auto'}}>{candidates.map(n=><label key={n.id} style={{display:'block',padding:6}}><input type="checkbox" checked={selected.includes(n.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,n.id]:ids.filter(id=>id!==n.id))}/>{n.before} → {n.after}</label>)}</div>
 {!candidates.length&&<p>没有发现与正文标题不同的笔记。</p>}
 <button className="secondary-button" disabled={!selected.length} onClick={apply}>修复选中的 {selected.length} 个标题</button><p role="status">{message}</p></>}</section>;
}

import { useCloudMode } from '../hooks/useCloudMode';
import { useEffect, useRef, useState } from 'react';
import type { Note, Workspace } from '../types';
import { encodeNote } from '../lib/github';
import { noteDestination, getSessionToken } from '../lib/repositories';
import { publishCloudNote, markCloudPublished } from '../lib/cloudSync';
import { needsUpload, nextCheck, TWO_DAYS } from '../lib/schedule';
import { Modal } from './Modal';
export function SyncReminder({workspace, update, ready}: {workspace:Workspace; update:(fn:(w:Workspace)=>Workspace)=>boolean; ready:boolean}) {
  const cloud=useCloudMode();
  const current = useRef(workspace); current.current = workspace;
  const [open,setOpen] = useState(false);
  const [items,setItems] = useState<Note[]>([]);
  const [chosen,setChosen] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  const [token,setToken] = useState('');
  const [message,setMessage] = useState('');
  const [due,setDue] = useState(0);
  const key = `zhiye-sync-check:${workspace.id}`;
  function defer() {
    const date = Date.now() + TWO_DAYS;
    try { localStorage.setItem(key,String(date)); } catch { setMessage('无法保存检查时间，下次启动可能再次提醒。'); }
    setDue(date);
  }
  function check(manual = true) {
    if(!cloud)return;
    const pending = current.current.notes.filter(n=>needsUpload(n,noteDestination(n).url));
    setItems(pending); setChosen(pending.map(n=>n.id)); setMessage(''); setOpen(manual || pending.length > 0); defer();
  }
  useEffect(()=>{
    let date = Date.now() + TWO_DAYS;
    try { date = nextCheck(localStorage.getItem(key),Date.now()); localStorage.setItem(key,String(date)); } catch { /* In-memory schedule still works. */ }
    setDue(date);
  },[key]);
  useEffect(()=>{
    if (!cloud || !due || !ready || open || busy) return;
    const tick = ()=>{if(Date.now()>=due) check(false);};
    tick(); const timer=setInterval(tick,60000); window.addEventListener('focus',tick);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',tick);};
    // The current workspace is read from a ref; changing a note must not reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[cloud,due,ready,open,busy]);
  async function upload() {
    setBusy(true); const results:string[]=[]; const completed:string[]=[];
    for(const note of items.filter(n=>chosen.includes(n.id))) {
      const latest=current.current.notes.find(n=>n.id===note.id);
      if(!latest || encodeNote(latest)!==encodeNote(note)) {results.push(`${note.title}：检查后又有修改，请重新检查。`);continue;}
      try {
        const github=await publishCloudNote(note,token);
        if(!update(w=>markCloudPublished(w,note.id,github))) throw new Error('已上传，但本地关联未保存，请刷新检查。');
        completed.push(note.id);results.push(`${note.title}：${note.deletedAt ? '删除记录已同步' : note.syncMode!=='full' && note.source && note.content===note.source.baseContent ? '来源清单已同步（未上传正文）' : '已更新'}。`);
      } catch(error) {results.push(`${note.title}：${error instanceof Error?error.message:'更新失败'}`);}
      setMessage(results.join('\n'));
    }
    setItems(prev=>prev.filter(n=>!completed.includes(n.id)));setChosen(prev=>prev.filter(id=>!completed.includes(id)));
    setToken('');setBusy(false);defer();
  }
  if(!cloud)return null;
  return <><div className="sync-reminder"><button onClick={()=>check()} disabled={busy}>同步新增 / 修改 / 删除</button><small>每 2 天提醒 · 确认后上传</small>{due>0&&<small>下次：{new Date(due).toLocaleString('zh-CN')}</small>}</div>
    <Modal open={open} title="同步笔记变更到 GitHub？" description="根据文档 public / private 分别上传到配置的公开 / 私密笔记仓库。仅在你确认后同步所选变更。删除状态会让其他设备将笔记移入回收站；远端冲突会停止该篇更新。" onClose={()=>{if(!busy){setOpen(false);setToken('');defer();}}}>
      <p>{items.length?`发现 ${items.length} 条新增、修改或删除记录，请选择要上传的内容。`:'没有待上传笔记。'}</p>
      <div className="upload-checklist">{items.map(note=><label key={note.id}><input type="checkbox" disabled={busy} checked={chosen.includes(note.id)} onChange={e=>setChosen(ids=>e.target.checked?[...ids,note.id]:ids.filter(id=>id!==note.id))}/><span>{note.deletedAt ? '【删除】' : note.syncMode!=='full' && note.source && note.content===note.source.baseContent ? '【来源链接】' : note.github ? '【修改 / 恢复】' : '【新增】'} [{note.visibility || 'public'}] {note.title||'未命名笔记'}</span></label>)}</div>
      {items.length>0&&<><p>选择来源清单且未修改的内容只写入对应仓库的 .zhiye/imports.json 导入清单，保存来源链接和版本；个人新增、修改的内容同步正文。文件夹、标题、标签、置顶和删除 / 恢复状态一起同步。删除记录保留在 GitHub 的 Markdown 元数据中，不物理删除远端文件；另一端启动或刷新后生效。本地图片附件请另外导出 ZIP 备份。</p><label>GitHub Token（桌面版可使用已有登录）<input type="password" autoComplete="off" value={token} disabled={busy} onChange={e=>setToken(e.target.value)}/></label><a className="text-button" href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer">如何获取 Token（需要 Contents 读写权限）</a></>}
      <pre className="upload-results" role="status">{message}</pre><div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={()=>{setOpen(false);setToken('');defer();}}>两天后再提醒</button><button className="primary-button" disabled={busy||!chosen.length||(!window.zhiye&&!token&&!getSessionToken())||!ready} onClick={()=>void upload()}>{busy?'正在更新…':'确认更新到 GitHub'}</button></div>
    </Modal></>;
}

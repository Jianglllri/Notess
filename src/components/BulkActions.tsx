import {useState} from 'react';
import type {Workspace} from '../types';
import {bulkMove,bulkTrash,selectionContents,isAllSelected} from '../lib/bulk';
import type {Selection} from '../lib/bulk';
import {folderLabel} from '../lib/folders';
import {Modal} from './Modal';
import {ArrowCounterClockwiseIcon,CheckSquareIcon,FolderIcon,TrashIcon,XIcon} from '@phosphor-icons/react';
export function BulkActions({workspace,selection,update,clear,onSelectAll,onInvert}:{workspace:Workspace;selection:Selection;update:(fn:(w:Workspace)=>Workspace)=>boolean;clear:()=>void;onSelectAll:()=>void;onInvert:()=>void}) {
 const [mode,setMode]=useState<'move'|'delete'|null>(null),[target,setTarget]=useState(''),[error,setError]=useState('');
 const expanded=selectionContents(workspace,selection);const active=workspace.notes.filter(n=>expanded.notes.has(n.id)&&!n.deletedAt).length;
 const hasSelection=selection.notes.length>0||selection.folders.length>0;
 const allSelected=isAllSelected(workspace,selection);
 const expandedCount=expanded.notes.size>0||expanded.folders.size>0;
 function apply(){try{if(update(w=>mode==='move'?bulkMove(w,selection,target||null):bulkTrash(w,selection))){setMode(null);clear();}}catch(e){setError(e instanceof Error?e.message:'操作失败');}}
 return <div className="bulk-actions">
  <div className="bulk-summary">已选 <strong>{expanded.notes.size}</strong> 篇 · <strong>{expanded.folders.size}</strong> 个目录</div>
  <div className="bulk-buttons">
   <button disabled={allSelected} onClick={onSelectAll} title="全选"><CheckSquareIcon size={13} />全选</button>
   <button onClick={onInvert} title="反选"><ArrowCounterClockwiseIcon size={13} />反选</button>
   <button disabled={!hasSelection} onClick={clear} title="清空"><XIcon size={13} />清空</button>
   <button disabled={!expandedCount} onClick={()=>{setError('');setTarget('');setMode('move');}} title="移动"><FolderIcon size={13} />移动</button>
   <button className="bulk-delete" disabled={!expandedCount} onClick={()=>{setError('');setMode('delete');}} title="删除"><TrashIcon size={13} />删除</button>
  </div>
  <Modal open={mode!==null} title={mode==='move'?'批量移动':'批量移入回收站'} description={`包含 ${expanded.folders.size} 个文件夹、${active} 篇未删除笔记。父子重复选择只处理一次。`} onClose={()=>setMode(null)}>
   {mode==='move'?<label>移动到<select className="form-input" value={target} onChange={e=>setTarget(e.target.value)}><option value="">顶层 / 未分类</option>{workspace.folders.filter(f=>!expanded.folders.has(f.id)).map(f=><option key={f.id} value={f.id}>{folderLabel(workspace.folders,f.id)}</option>)}</select></label>:<p>删除所选文件夹及其子目录，笔记保留在回收站。恢复后可重新分类。未关联云端的笔记只在本地删除，无需上传；已关联云端的删除记录确认同步后在其他设备生效。</p>}
   <p role="alert">{error}</p><div className="modal-actions"><button onClick={()=>setMode(null)}>取消</button><button className={mode==='delete'?'danger-button':'primary-button'} onClick={apply}>确认{mode==='delete'?'删除':'移动'}</button></div></Modal>
 </div>;
}

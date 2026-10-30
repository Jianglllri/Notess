import {useState} from 'react';
import type {Workspace} from '../types';
import {Modal} from './Modal';
import {changeImportMode} from '../lib/importPolicy';
export function ImportLibrary({workspace,update,reimport}:{workspace:Workspace;update:(fn:(w:Workspace)=>Workspace)=>boolean;reimport:(url:string)=>void}) {
 const [open,setOpen]=useState(false),[error,setError]=useState('');
 const groups=new Map<string,typeof workspace.notes>();
 for(const n of open?workspace.notes:[])if(n.source){const key=`${n.source.url}/tree/${n.source.branch}`;groups.set(key,[...(groups.get(key)||[]),n]);}
 function change(ids:string[],mode:'reference'|'full'){try{if(!update(w=>changeImportMode(w,ids,mode)))throw new Error('本地保存失败，请重试。');setError('已更新本地同步方式，确认上传后云端生效。');}catch(e){setError(e instanceof Error?e.message:'修改失败');}}
 return <><button className="text-button" onClick={()=>setOpen(true)}>管理来源清单</button><Modal open={open} title="来源清单与正文同步" description="清单保存在公开／私密仓库各自的 .zhiye/imports.json。本地保留正文，新设备获取仓库后按清单下载对应文件。" onClose={()=>setOpen(false)}>
 <p>清单模式仅记录来源、文件路径和版本。正文经过修改会上传完整副本，避免丢失修改。完整同步不再自动跟随原仓库正文更新。文件夹只负责分类，移动文件不会自动改变同步方式。</p>
 <p>来源删除、转为私密或无法访问时，新设备不能凭链接恢复正文；已有本地内容会保留。清单恢复已记录的文件，来源新增文件请点“重新扫描导入”。</p>
 {!groups.size&&<p>还没有来源记录，可从“导入文档”添加。</p>}
 {[...groups].map(([url,ns])=><section className="import-project" key={url}><strong>{url.replace('https://github.com/','')}</strong><p>{ns.length} 篇 · 清单方式 {ns.filter(n=>n.syncMode!=='full').length} · 完整方式 {ns.filter(n=>n.syncMode==='full').length} · 回收站 {ns.filter(n=>n.deletedAt).length}</p><div className="bulk-buttons"><button onClick={()=>change(ns.map(n=>n.id),'reference')}>改为清单方式</button><button onClick={()=>change(ns.map(n=>n.id),'full')}>改为完整方式</button><button onClick={()=>{setOpen(false);reimport(url);}}>重新扫描导入</button></div><details><summary>逐篇设置</summary>{ns.map(n=><label className="import-entry" key={n.id}><span>{n.title}{n.deletedAt?'（已删除）':''}</span><select aria-label={`${n.title}的同步方式`} value={n.syncMode||'reference'} onChange={e=>change([n.id],e.target.value as 'reference'|'full')}><option value="reference">来源清单{n.source&&n.content!==n.source.baseContent?'（修改上传正文）':''}</option><option value="full">完整正文</option></select></label>)}</details></section>)}
 <p role="status">{error}</p><p>从完整方式改回清单后，历史正文及 Git 历史不会被自动清除。删除文档通过删除记录同步，不直接清除 GitHub 历史。</p>
 </Modal></>;
}

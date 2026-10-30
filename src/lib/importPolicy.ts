import type {Workspace} from '../types';
import type {ImportedDoc} from './github';
import {sourceKey} from './sync';
export function configureImport(before:Workspace,after:Workspace,docs:ImportedDoc[],mode:'reference'|'full'):Workspace {
 const keys=new Set(docs.map(d=>sourceKey(d.source||d.github)));
 let result={...after,notes:after.notes.map(n=>n.source&&keys.has(sourceKey(n.source))?{...n,syncMode:mode,updatedAt:new Date().toISOString()}:n)};
 if(mode!=='reference')return result;
 const freshRoots=after.folders.filter(f=>!f.parentId&&!before.folders.some(old=>old.id===f.id));
 if(!freshRoots.length)return result;
 let root=after.folders.find(f=>!f.parentId&&f.name==='来源清单');
 if(!root){root={id:crypto.randomUUID(),name:'来源清单',parentId:null,createdAt:new Date().toISOString()};result={...result,folders:[...result.folders,root]};}
 return {...result,folders:result.folders.map(f=>freshRoots.some(r=>r.id===f.id)&&f.id!==root!.id?{...f,parentId:root!.id}:f)};
}
export function changeImportMode(w:Workspace,ids:string[],mode:'reference'|'full'):Workspace {
 const selected=w.notes.filter(n=>ids.includes(n.id));
 if(mode==='full'&&selected.some(n=>n.source?.missing&&!n.content))throw Error('部分来源正文尚未下载，不能把空内容作为完整副本上传。请先恢复来源或导入备份。');
 if(mode==='reference'&&selected.some(n=>!n.source||n.source.missing||n.content!==n.source.baseContent))throw Error('部分文档没有可验证来源，或正文已修改。为保留修改，请保持完整同步；可重新导入来源作为独立资料。');
 return {...w,notes:w.notes.map(n=>ids.includes(n.id)?{...n,syncMode:mode,updatedAt:new Date().toISOString()}:n)};
}

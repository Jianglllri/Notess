import type {Workspace} from '../types';
import {MAX_WORKSPACE_BYTES} from './workspace';
const sizes=new WeakMap<Workspace,number>();
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
export function rememberWorkspaceSize(workspace:Workspace){sizes.set(workspace,bytes(workspace));return workspace;}
export function editContent(workspace:Workspace,id:string,content:string):Workspace {
 if(content.length>1_000_000)throw Error('单篇笔记超过 1 MB 字符上限，请拆分笔记。');
 const note=workspace.notes.find(n=>n.id===id);if(!note||note.deletedAt)throw Error('无法编辑这篇笔记。');
 const updatedAt=new Date().toISOString();
 const nextNote={...note,content,updatedAt};
 const size=(sizes.get(workspace)??bytes(workspace))-bytes(note)+bytes(nextNote)-bytes(workspace.updatedAt)+bytes(updatedAt);
 if(size>MAX_WORKSPACE_BYTES)throw Error('笔记库超过 50 MB，请导出备份并整理附件或回收站。');
 const result={...workspace,updatedAt,notes:workspace.notes.map(n=>n.id===id?nextNote:n)};
 sizes.set(result,size);return result;
}

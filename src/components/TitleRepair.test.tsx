// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {TitleRepair} from './TitleRepair';
import {createWorkspace} from '../lib/workspace';
it('previews title changes, requires explicit selection and preserves unselected custom titles',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let workspace=createWorkspace();workspace.notes=workspace.notes.slice(0,2).map((n,i)=>({...n,title:i?'手动命名':'uuid',content:'# 阶段考试'}));
 const before=structuredClone(workspace);
 const update=vi.fn(fn=>{workspace=fn(workspace);return true;});
 try{
 await act(()=>root.render(<TitleRepair workspace={workspace} update={update}/>));
 await act(()=>host.querySelector('button')!.click());
 expect(host.textContent).toContain('uuid → 阶段考试');
 expect(host.querySelectorAll('input:checked')).toHaveLength(0);
 const apply=()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.startsWith('修复选中的'))!;
 expect(apply().disabled).toBe(true);
 await act(()=>host.querySelector<HTMLInputElement>('input')!.click());
 await act(()=>apply().click());
 expect(workspace.notes[0].title).toBe('阶段考试');
 expect(workspace.notes[0].content).toBe(before.notes[0].content);
 expect(workspace.notes[1]).toEqual(before.notes[1]);
 }finally{await act(()=>root.unmount());host.remove();}
});

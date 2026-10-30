// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {createWorkspace} from '../lib/workspace';
import {publishCloudNote} from '../lib/cloudSync';
import App from '../App';
const state=vi.hoisted(()=>({workspace:null as unknown}));
vi.mock('../hooks/useWorkspace',()=>({useWorkspace:()=>({workspace:state.workspace,status:'saved',error:'',update:(fn:(w:unknown)=>unknown)=>{state.workspace=fn(state.workspace);return true;},edit:vi.fn(),retry:vi.fn(),getCurrent:()=>state.workspace,syncStatus:'',pull:vi.fn()})}));
vi.mock('../lib/cloudSync',async original=>({...await original<typeof import('../lib/cloudSync')>(),publishCloudNote:vi.fn()}));
vi.mock('./RichEditor',()=>({RichEditor:()=>null}));
it('clears local-only imports without requesting a token or publishing in cloud mode',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();
 const workspace=createWorkspace();workspace.notes=[{...workspace.notes[0],deletedAt:new Date().toISOString()}];state.workspace=workspace;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 async function click(text:string){const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.includes(text));expect(button).toBeTruthy();await act(()=>button!.click());}
 try{
 await act(()=>root.render(<App/>));await click('回收站');await click('清空回收站');
 const dialog=document.querySelector('[role="dialog"]')!;expect(dialog.textContent).toContain('本次无需联网、Token');
 expect(dialog.querySelector('input[type="password"]')).toBeNull();
 const confirm=Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='确认清空')!;expect(confirm.disabled).toBe(false);
 await act(()=>confirm.click());expect((state.workspace as typeof workspace).notes).toHaveLength(0);expect(publishCloudNote).not.toHaveBeenCalled();
 }finally{await act(()=>root.unmount());host.remove();}
});

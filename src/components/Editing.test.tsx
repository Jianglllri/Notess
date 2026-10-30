// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Root} from 'react-dom/client';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {BulkActions} from './BulkActions';
import {FlowTool} from './FlowTool';
import {createWorkspace} from '../lib/workspace';
import {flowBlocks,parseFlow} from '../lib/flow';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(()=>root.unmount());host.remove();});
async function click(text:string){const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text);expect(button).toBeTruthy();await act(()=>button!.click());}
it('batch deletion is cancellable and confirms before deleting descendants',async()=>{
 let workspace=createWorkspace();const clear=vi.fn();const update=vi.fn(fn=>{workspace=fn(workspace);return true;});
 await act(()=>root.render(<BulkActions workspace={workspace} selection={{notes:[],folders:['learning']}} update={update} clear={clear} onSelectAll={vi.fn()} onInvert={vi.fn()}/>));
 await click('删除');await click('取消');expect(update).not.toHaveBeenCalled();
 await click('删除');await click('确认删除');expect(update).toHaveBeenCalledTimes(1);expect(workspace.notes.filter(n=>n.deletedAt)).toHaveLength(2);expect(clear).toHaveBeenCalled();
});
it('flow insertion supports undo and saves a parseable graph without replacing surrounding prose',async()=>{
 const save=vi.fn((content:string)=>!!content);await act(()=>root.render(<FlowTool content="前文" readOnly={false} onSave={save}/>));
 await click('流程图');await click('＋处理步骤');await click('撤销');await click('重做');await click('保存流程图');
 const content=save.mock.calls[0][0];expect(content).toContain('前文');expect(parseFlow(flowBlocks(content)[0].body).nodes.length).toBeGreaterThan(1);
});

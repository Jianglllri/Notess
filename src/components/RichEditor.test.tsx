// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {RichEditor} from './RichEditor';
const mock=vi.hoisted(()=>({input:undefined as undefined|((text:string)=>void),value:'',destroy:vi.fn(),disabled:vi.fn()}));
vi.mock('vditor',()=>({default:class {
 constructor(_host:HTMLElement,options:{value:string;input:(text:string)=>void;after:()=>void}){mock.value=options.value;mock.input=options.input;queueMicrotask(options.after);}
 getValue(){return mock.value;}
 setValue(text:string){mock.value=text;}
 disabled(){mock.disabled();}
 destroy(){mock.destroy();}
}}));
it('rejects oversized input without losing the current editor body and applies external updates',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const onChange=vi.fn(),acceptChange=(s:string)=>s.length<10;
 try{
 await act(()=>root.render(<RichEditor value="原文" readOnly={false} onChange={onChange} acceptChange={acceptChange}/>));
 await act(()=>mock.input!('x'.repeat(20)));expect(onChange).not.toHaveBeenCalled();expect(mock.value).toBe('原文');
 await act(()=>mock.input!('修改'));expect(onChange).toHaveBeenCalledWith('修改');
 await act(()=>root.render(<RichEditor value="远端更新" readOnly={false} onChange={onChange} acceptChange={acceptChange}/>));expect(mock.value).toBe('远端更新');
 }finally{await act(()=>root.unmount());host.remove();}
 expect(mock.destroy).toHaveBeenCalled();
});

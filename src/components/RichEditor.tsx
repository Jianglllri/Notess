import { useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlowView } from './FlowView';
import { parseFlow } from '../lib/flow';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
export function RichEditor({ value, readOnly, onChange, acceptChange }: { value: string; readOnly: boolean; onChange: (s: string) => void; acceptChange: (s: string) => boolean }) {
  const host = useRef<HTMLDivElement>(null); const editor = useRef<Vditor | undefined>(undefined);
  const callbacks = useRef({ onChange, acceptChange }); callbacks.current = { onChange, acceptChange };
  const ready = useRef(false);
  const emitted = useRef(value);
  const current = useRef(value); current.current = value;
  useEffect(() => {
    let disposed = false; let initialized = false;
    const mount = document.createElement('div'); host.current!.appendChild(mount);
    const v = new Vditor(mount, { value: current.current, mode: 'ir', tab: '    ', placeholder: '直接写 Markdown：输入 ```python 后回车开始代码块', undoDelay: 0, height: '100%', cache: { enable: false }, cdn: './vditor', lang: 'zh_CN',
      toolbar: ['headings', 'bold', 'italic', 'strike', '|', 'list', 'ordered-list', 'check', 'outdent', 'indent', 'quote', 'code', 'inline-code', 'link', 'table', 'insert-before', 'insert-after', '|', 'undo', 'redo'],
      customRenders: [{language:'zhiye-flow',render:element=>{const code=element.querySelector('code.language-zhiye-flow');if(!code)return;try{const graph=parseFlow(code.textContent || '');element.innerHTML=renderToStaticMarkup(<FlowView graph={graph}/>);}catch{code.textContent='流程图格式无效，请在源码模式检查；原文未修改。';}}}],
      preview: { hljs: { enable: true, style: 'github', lineNumber: true }, math: { engine: 'KaTeX' } },
      input: text => { if (disposed) return; if (callbacks.current.acceptChange(text)) { emitted.current = text; callbacks.current.onChange(text); } else v.setValue(current.current); },
      after: () => { initialized = true; if (disposed) { v.destroy(); return; } ready.current = true; if (v.getValue() !== current.current) v.setValue(current.current); if (readOnly) v.disabled(); },
    }); editor.current = v;
    return () => { disposed = true; ready.current = false; if (initialized) {
      const text = v.getValue();
      if (!readOnly && text !== current.current && callbacks.current.acceptChange(text)) callbacks.current.onChange(text);
      v.destroy();
    } mount.remove(); editor.current = undefined; };
  }, [readOnly]);
  useEffect(() => { const v = editor.current; if (ready.current && v && value !== emitted.current && v.getValue() !== value) { emitted.current = value; v.setValue(value); } }, [value]);
  return <div className="rich-editor" ref={host} />;
}

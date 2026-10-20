import { useState } from 'react';
import { Modal } from './Modal';
import { MindMapView } from './MindMapView';
import { mindBlocks, mindLayout, parseMind, saveMind, type MindBlock, type MindNode } from '../lib/mindmap';
export function MindMapTool({ content, readOnly, onSave }: { content: string; readOnly: boolean; onSave: (content: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [original, setOriginal] = useState('');
  const [block, setBlock] = useState<MindBlock | null>(null);
  const [root, setRoot] = useState<MindNode>({ name: '中心主题', children: [] });
  const [path, setPath] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<MindNode[]>([]);
  const [ready, setReady] = useState(true);
  const current = path.reduce((node, index) => node.children[index], root);
  function load(index: number, source: string) {
    const next = mindBlocks(source)[index] ?? null; setBlock(next); setPath([]); setHistory([]); setError('');
    try { setRoot(next ? parseMind(next.body) : { name: '中心主题', children: [{ name: '分支一', children: [] }, { name: '分支二', children: [] }] }); setReady(true); }
    catch (e) { setReady(false); setError((e as Error).message); }
  }
  function edit(fn: (node: MindNode, tree: MindNode) => void) {
    const tree = structuredClone(root); const node = path.reduce((n, index) => n.children[index], tree);
    fn(node, tree); setHistory(h => [...h.slice(-29), root]); setRoot(tree); setError('');
  }
  return <><button className="text-button mindmap-trigger" disabled={readOnly} onClick={() => { setOriginal(content); load(mindBlocks(content).length ? 0 : -1, content); setOpen(true); }}>思维导图</button>
    <Modal open={open} onClose={() => setOpen(false)} title="可视化思维导图" description="点击节点编辑文字，添加或删除分支。保存后插入笔记末尾，已有导图在原位置更新。" >
      <div className="mindmap-editor">
        <label>编辑导图 <select aria-label="选择思维导图" value={block ? mindBlocks(original).findIndex(b => b.start === block.start) : -1} onChange={e => load(Number(e.target.value), original)}><option value={-1}>新建导图</option>{mindBlocks(original).map((b, i) => <option key={b.start} value={i}>导图 {i + 1}</option>)}</select></label>
        {ready && <><div className="mindmap-node-controls"><label>节点文字 <input aria-label="节点文字" value={current.name} maxLength={120} onChange={e => edit(node => { node.name = e.target.value; })} /></label>
        <button disabled={path.length >= 5 || mindLayout(root).nodes.length >= 80} onClick={() => { const index = current.children.length; edit(node => node.children.push({ name: '新分支', children: [] })); setPath([...path, index]); }}>＋子节点</button>
        <button disabled={!path.length} onClick={() => { edit((_node, tree) => { const parent = path.slice(0, -1).reduce((n, i) => n.children[i], tree); parent.children.splice(path[path.length - 1], 1); }); setPath(path.slice(0, -1)); }}>删除分支</button>
        <button disabled={!history.length} onClick={() => { setRoot(history[history.length - 1]); setHistory(h => h.slice(0, -1)); setPath([]); }}>撤销</button></div>
        <MindMapView root={root} selected={path.join('.')} onSelect={setPath} /></>}
        {error && <p role="alert">{error}</p>}
        <div className="mindmap-footer"><button className="secondary-button" onClick={() => setOpen(false)}>取消</button><button className="primary-button" disabled={!ready || readOnly} onClick={() => { try { if (onSave(saveMind(content, original, block, root))) setOpen(false); else setError('保存失败，请检查笔记容量或保存状态。'); } catch (e) { setError((e as Error).message); } }}>保存到笔记</button></div>
      </div>
    </Modal></>;
}

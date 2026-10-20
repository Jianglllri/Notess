export type MindNode = { name: string; children: MindNode[] };
export type MindBlock = { start: number; end: number; raw: string; body: string };
export function mindBlocks(content: string): MindBlock[] {
  // Consume every fence, including ordinary code, so examples inside code aren't edited.
  const blocks: MindBlock[] = [];
  const pattern = /^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*(?:\n|$)/gm;
  for (const match of content.matchAll(pattern)) {
    if (!/^(markmap|mindmap)\s*$/.test(match[2])) continue;
    blocks.push({ start: match.index!, end: match.index! + match[0].length, raw: match[0], body: match[3] });
  }
  return blocks;
}
export function parseMind(body: string): MindNode {
  const stack: MindNode[] = []; let root: MindNode | undefined; let count = 0;
  for (const line of body.split('\n').filter(line => line.trim())) {
    const match = /^(#{1,6}) (.+)$/.exec(line);
    if (!match || ++count > 80) throw new Error('目前可视化编辑支持最多 80 个节点、6 层标题的导图。此图格式暂不支持，原文不会被修改。');
    const depth = match[1].length;
    if (depth > stack.length + 1 || (depth === 1 && root)) throw new Error('导图需要一个中心主题，标题层级不能跳级。');
    const node: MindNode = { name: match[2], children: [] };
    if (depth === 1) root = node; else stack[depth - 2].children.push(node);
    stack[depth - 1] = node; stack.length = depth;
  }
  if (!root) throw new Error('导图没有中心主题。');
  return root;
}
export function serializeMind(root: MindNode): string {
  const lines: string[] = [];
  function visit(node: MindNode, depth: number) {
    if (depth > 6 || lines.length >= 80) throw new Error('导图最多 80 个节点、6 层。');
    const name = node.name.replace(/[\r\n]/g, ' ').trim();
    if (!name || name.length > 120) throw new Error('节点文字需要 1–120 个字符。');
    lines.push(`${'#'.repeat(depth)} ${name}`); node.children.forEach(child => visit(child, depth + 1));
  }
  visit(root, 1); return `\`\`\`markmap\n${lines.join('\n')}\n\`\`\`\n`;
}
export function saveMind(content: string, original: string, block: MindBlock | null, root: MindNode): string {
  if (content !== original) throw new Error('笔记已在其他位置更新，请关闭导图后重新打开，避免覆盖新内容。');
  const encoded = serializeMind(root);
  return block ? content.slice(0, block.start) + encoded + content.slice(block.end) : `${content.trimEnd()}\n\n${encoded}`;
}
export function mindLayout(root: MindNode) {
  const nodes: { node: MindNode; path: number[]; x: number; y: number; parent?: number }[] = [];
  let row = 0;
  function visit(node: MindNode, path: number[], parent?: number): number {
    const index = nodes.length; nodes.push({ node, path, x: 20 + path.length * 210, y: 0, parent });
    const ys = node.children.map((child, i) => visit(child, [...path, i], index));
    const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : 20 + row++ * 64;
    nodes[index].y = y; return y;
  }
  visit(root, []);
  return { nodes, width: Math.max(...nodes.map(n => n.x)) + 190, height: Math.max(120, row * 64 + 20) };
}

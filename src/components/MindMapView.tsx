import { mindLayout, type MindNode } from '../lib/mindmap';
export function MindMapView({ root, selected, onSelect }: { root: MindNode; selected?: string; onSelect?: (path: number[]) => void }) {
  const { nodes, width, height } = mindLayout(root);
  return <div style={{ overflow: 'auto', maxHeight: 460 }}><svg role={onSelect ? 'group' : 'img'} aria-label={`思维导图：${root.name}`} width={width} height={height} style={{ display: 'block', maxWidth: 'none' }}>
    {nodes.map((n, i) => n.parent !== undefined && <path key={`edge-${i}`} d={`M ${nodes[n.parent].x + 170} ${nodes[n.parent].y + 20} C ${n.x - 20} ${nodes[n.parent].y + 20}, ${n.x - 20} ${n.y + 20}, ${n.x} ${n.y + 20}`} fill="none" stroke="#8cafa0" strokeWidth="2" />)}
    {nodes.map(n => <g key={n.path.join('.')} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={n.node.name} onClick={() => onSelect?.(n.path)} onKeyDown={e => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(n.path); } }} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
      <title>{n.node.name}</title><rect x={n.x} y={n.y} width="170" height="40" rx="8" fill={selected === n.path.join('.') ? '#d6eee0' : '#f3f7f4'} stroke="#5c8b73" strokeWidth={selected === n.path.join('.') ? 2 : 1} />
      <text x={n.x + 85} y={n.y + 25} textAnchor="middle" fill="#243c30" fontSize="13">{n.node.name.length > 14 ? `${n.node.name.slice(0, 13)}…` : n.node.name}</text>
    </g>)}
  </svg></div>;
}

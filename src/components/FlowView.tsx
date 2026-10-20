import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { nodeSize } from '../lib/flow';
import type { FlowGraph, FlowNode } from '../lib/flow';
type Props={graph:FlowGraph;selected?:string;zoom?:number;onSelect?:(id:string)=>void;onMove?:(id:string,x:number,y:number,finished:boolean)=>void;onResize?:(id:string,width:number,height:number,finished:boolean)=>void;onConnect?:(from:string,to:string)=>void;onEdit?:()=>void;};
export function FlowView({graph,selected,zoom=1,onSelect,onMove,onResize,onConnect,onEdit}:Props){
 const marker=useId().replace(/:/g,'');const svg=useRef<SVGSVGElement>(null);
 const drag=useRef<{id:string;x:number;y:number;width:number;height:number;px:number;py:number;kind:'move'|'resize'|'connect'}|null>(null);
 const [connection,setConnection]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
 const width=Math.max(860,...graph.nodes.map(n=>n.x+nodeSize(n).width+60)),height=Math.max(420,...graph.nodes.map(n=>n.y+nodeSize(n).height+80));
 function point(event:PointerEvent){const matrix=svg.current!.getScreenCTM();const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix!.inverse());return {x:p.x,y:p.y};}
 function down(event:PointerEvent<SVGGElement>,node:FlowNode,kind:'move'|'resize'|'connect'='move'){
  if(!onMove)return;event.preventDefault();event.stopPropagation();onSelect?.(node.id);event.currentTarget.setPointerCapture(event.pointerId);
  const p=point(event);drag.current={id:node.id,x:node.x,y:node.y,...nodeSize(node),px:p.x,py:p.y,kind};
 }
 function move(event:PointerEvent<SVGGElement>,finished=false){
  const d=drag.current;if(!d)return;event.stopPropagation();const p=point(event);
  if(d.kind==='connect'){
   setConnection(finished?null:{x1:d.x+d.width,y1:d.y+d.height/2,x2:p.x,y2:p.y});
   if(finished){const target=[...graph.nodes].reverse().find(n=>p.x>=n.x&&p.x<=n.x+nodeSize(n).width&&p.y>=n.y&&p.y<=n.y+nodeSize(n).height);if(target)onConnect?.(d.id,target.id);}
  }else if(d.kind==='resize')onResize?.(d.id,d.width+p.x-d.px,d.height+p.y-d.py,finished);
  else onMove?.(d.id,Math.max(0,Math.min(3000,d.x+p.x-d.px)),Math.max(0,Math.min(3000,d.y+p.y-d.py)),finished);
  if(finished)drag.current=null;
 }
 function cancel(event:PointerEvent<SVGGElement>){event.stopPropagation();const d=drag.current,n=graph.nodes.find(n=>n.id===d?.id);if(d&&n){if(d.kind==='move')onMove?.(n.id,n.x,n.y,true);if(d.kind==='resize')onResize?.(n.id,nodeSize(n).width,nodeSize(n).height,true);}drag.current=null;setConnection(null);}
 return <div className="flow-canvas" style={{overflow:'auto',maxHeight:onSelect?'min(54vh, 440px)':480}}><svg ref={svg} width={width*zoom} height={height*zoom} viewBox={`0 0 ${width} ${height}`} role={onSelect?'group':'img'} aria-label="流程图画布" style={{display:'block',maxWidth:'none',touchAction:'none'}}>
 <defs><marker id={marker} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#537f68"/></marker></defs>
 {graph.edges.map(e=>{
  const a=graph.nodes.find(n=>n.id===e.from)!,b=graph.nodes.find(n=>n.id===e.to)!,as=nodeSize(a),bs=nodeSize(b);
  const down=b.y>a.y+as.height+26,backward=b.x<=a.x&&!down;
  const sx=down?a.x+as.width/2:a.x+as.width,sy=down?a.y+as.height:a.y+as.height/2,tx=down?b.x+bs.width/2:b.x,ty=down?b.y:b.y+bs.height/2;
  const bend=backward?Math.max(a.y+as.height,b.y+bs.height)+46:0;
  const path=backward?`M${sx},${sy} C${sx+65},${bend} ${tx-65},${bend} ${tx},${ty}`:down?`M${sx},${sy} C${sx},${(sy+ty)/2} ${tx},${(sy+ty)/2} ${tx},${ty}`:`M${sx},${sy} C${(sx+tx)/2},${sy} ${(sx+tx)/2},${ty} ${tx},${ty}`;
  return <g key={e.id} role={onSelect?'button':undefined} aria-label={`连线 ${a.label} 到 ${b.label} ${e.label}`} tabIndex={onSelect?0:undefined} onClick={()=>onSelect?.(e.id)} onDoubleClick={onEdit} onKeyDown={event=>{if(event.key==='Enter')onSelect?.(e.id);}} style={{cursor:onSelect?'pointer':'default'}}><path d={path} fill="none" stroke="transparent" strokeWidth="16"/><path d={path} fill="none" stroke={selected===e.id?'#ba6c2d':'#537f68'} strokeWidth={selected===e.id?3:2} markerEnd={`url(#${marker})`}/><text x={(sx+tx)/2} y={backward?bend-18:(sy+ty)/2-8} textAnchor="middle" fontSize="13" fill="#365c45" paintOrder="stroke" stroke="white" strokeWidth="4">{e.label}</text></g>;
 })}
 {connection&&<line {...connection} stroke="#537f68" strokeDasharray="5 4" pointerEvents="none"/>}
 {graph.nodes.map(n=>{const {width:w,height:h}=nodeSize(n),chars=Math.max(3,Math.floor((w*(n.shape==='decision'?.55:1)-24)/13)),maxLines=Math.max(1,Math.floor((h*(n.shape==='decision'?.55:1)-12)/18));const text=Array.from(n.label),lines=Array.from({length:Math.min(maxLines,Math.ceil(text.length/chars))},(_,i)=>text.slice(i*chars,(i+1)*chars).join(''));if(text.length>chars*maxLines)lines[lines.length-1]=lines.at(-1)!.slice(0,-1)+'…';return <g key={n.id} role={onSelect?'button':undefined} aria-label={`节点 ${n.label}`} tabIndex={onSelect?0:undefined} onClick={()=>onSelect?.(n.id)} onDoubleClick={onEdit} onPointerDown={e=>down(e,n)} onPointerMove={e=>move(e)} onPointerUp={e=>move(e,true)} onPointerCancel={cancel} onKeyDown={e=>{if(e.key==='Enter')onSelect?.(n.id);if(onMove&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();onMove(n.id,Math.max(0,Math.min(3000,n.x+(e.key==='ArrowLeft'?-10:e.key==='ArrowRight'?10:0))),Math.max(0,Math.min(3000,n.y+(e.key==='ArrowUp'?-10:e.key==='ArrowDown'?10:0))),true);}}} style={{cursor:onMove?'move':'default'}}>
 <title>{n.label}</title>{n.shape==='decision'?<polygon points={`${n.x+w/2},${n.y} ${n.x+w},${n.y+h/2} ${n.x+w/2},${n.y+h} ${n.x},${n.y+h/2}`} fill={selected===n.id?'#d7eee0':'#f4f8f5'} stroke="#537f68" strokeWidth={selected===n.id?3:1.5}/>:<rect x={n.x} y={n.y} width={w} height={h} rx={n.shape==='terminal'?h/2:6} fill={selected===n.id?'#d7eee0':'#f4f8f5'} stroke="#537f68" strokeWidth={selected===n.id?3:1.5}/>}
 <text textAnchor="middle" fontSize="13" fill="#263e30" pointerEvents="none">{lines.map((line,i)=><tspan key={i} x={n.x+w/2} y={n.y+h/2+(i-(lines.length-1)/2)*18+5}>{line}</tspan>)}</text>
 {onConnect&&<g onPointerDown={e=>down(e,n,'connect')} onPointerMove={e=>move(e)} onPointerUp={e=>move(e,true)} onPointerCancel={cancel}><title>从这里拖到另一个节点连线</title><circle cx={n.x+w} cy={n.y+h/2} r="7" fill="#fff" stroke="#537f68" strokeWidth="2" style={{cursor:'crosshair'}}/></g>}
 {onResize&&selected===n.id&&<g role="button" aria-label={`缩放节点 ${n.label}`} tabIndex={0} onPointerDown={e=>down(e,n,'resize')} onPointerMove={e=>move(e)} onPointerUp={e=>move(e,true)} onPointerCancel={cancel} onKeyDown={e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.stopPropagation();e.preventDefault();onResize(n.id,w+(e.key==='ArrowLeft'?-10:e.key==='ArrowRight'?10:0),h+(e.key==='ArrowUp'?-10:e.key==='ArrowDown'?10:0),true);}}}><title>拖动右下角调整宽高，方向键微调</title><rect x={n.x+w-8} y={n.y+h-8} width="16" height="16" rx="3" fill="#287451" stroke="white" strokeWidth="2" style={{cursor:'nwse-resize'}}/></g>}
 </g>;})}
 </svg></div>;
}

import { useRef } from 'react';
export function PaneResize({label, width, setWidth}: {label:string;width:number;setWidth:(width:number)=>void}) {
  const start=useRef({x:0,width:0});
  return <div className="pane-resize" role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={160} aria-valuemax={420} aria-valuenow={width} tabIndex={0}
    onPointerDown={event=>{start.current={x:event.clientX,width};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();}}
    onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))setWidth(Math.max(160,Math.min(420,start.current.width+event.clientX-start.current.x)));}}
    onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
    onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setWidth(Math.max(160,Math.min(420,width+(event.key==='ArrowLeft'?-20:20))));}}}
    onDoubleClick={()=>setWidth(220)} />;
}

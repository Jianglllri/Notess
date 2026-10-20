import { z } from 'zod';
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const graphSchema=z.object({version:z.literal(1),nodes:z.array(z.object({id,label:z.string().max(120),shape:z.enum(['process','decision','terminal']),width:z.number().finite().min(80).max(600).optional(),height:z.number().finite().min(40).max(360).optional(),x:z.number().finite().min(0).max(3000),y:z.number().finite().min(0).max(3000)}).strict()).max(80),edges:z.array(z.object({id,from:id,to:id,label:z.string().max(80)}).strict()).max(200)}).strict().superRefine((g,ctx)=>{
  const ids=new Set(g.nodes.map(n=>n.id));
  if(new Set([...g.nodes,...g.edges].map(item=>item.id)).size!==g.nodes.length+g.edges.length || ids.size!==g.nodes.length || new Set(g.edges.map(e=>e.id)).size!==g.edges.length || g.edges.some(e=>!ids.has(e.from)||!ids.has(e.to)))ctx.addIssue({code:'custom',message:'节点或连线无效'});
});
export type FlowGraph=z.infer<typeof graphSchema>;
export type FlowNode=FlowGraph['nodes'][number];
export function parseFlow(body:string):FlowGraph {return graphSchema.parse(JSON.parse(body));}
export function flowBlocks(content:string){
  return [...content.matchAll(/^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*(?:\n|$)/gm)].filter(m=>m[2].trim()==='zhiye-flow').map(m=>({start:m.index!,end:m.index!+m[0].length,body:m[3]}));
}
export function saveFlow(content:string,original:string,index:number,graph:FlowGraph){
  if(content!==original)throw new Error('笔记已更新，请关闭流程图后重新打开，避免覆盖新内容。');
  const data=JSON.stringify(graphSchema.parse(graph)).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
  const block=flowBlocks(original)[index]; const value='```zhiye-flow\n'+data+'\n```\n';
  return block?content.slice(0,block.start)+value+content.slice(block.end):content.trimEnd()+'\n\n'+value;
}
export function removeFlowNode(graph:FlowGraph,id:string):FlowGraph {return {...graph,nodes:graph.nodes.filter(n=>n.id!==id),edges:graph.edges.filter(e=>e.from!==id&&e.to!==id)};}
export function exampleFlow():FlowGraph{return {version:1,nodes:[{id:'start',label:'开始',shape:'terminal',x:70,y:80},{id:'step',label:'处理步骤',shape:'process',x:320,y:80},{id:'decision',label:'是否满足条件？',shape:'decision',x:570,y:80},{id:'end',label:'结束',shape:'terminal',x:570,y:280}],edges:[{id:'e1',from:'start',to:'step',label:''},{id:'e2',from:'step',to:'decision',label:''},{id:'e3',from:'decision',to:'end',label:'是'},{id:'e4',from:'decision',to:'step',label:'否'}]};}

export function nodeSize(node:FlowNode){return {width:node.width ?? 160,height:node.height ?? 64};}
export function resizeFlowNode(graph:FlowGraph,id:string,width:number,height:number):FlowGraph {return {...graph,nodes:graph.nodes.map(n=>n.id===id?{...n,width:Math.round(Math.max(80,Math.min(600,width))),height:Math.round(Math.max(40,Math.min(360,height)))}:n)};}

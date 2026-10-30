const {spawn}=require('node:child_process');
const path=require('node:path');
const base='http://127.0.0.1:5174';
let starting;
async function probe(){try{const response=await fetch(base+'/health',{headers:{'x-zhiye-local':'1'},signal:AbortSignal.timeout(600)});return (await response.json()).service==='zhiye-local-v1';}catch{return false;}}
async function ensureService(){
 if(await probe())return;
 if(!starting)starting=(async()=>{
  const child=spawn(process.execPath,[path.join(__dirname,'local-service.mjs')],{detached:true,stdio:'ignore',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  child.on('error',()=>{});child.unref();
  for(let attempt=0;attempt<40;attempt++){await new Promise(resolve=>setTimeout(resolve,100));if(await probe())return;}
  throw Error('无法启动本机共享笔记库，请检查 5174 端口与 ~/.zhiye-notes 的读写权限。');
 })().finally(()=>{starting=undefined;});
 return starting;
}
async function requestLocal(operation,input){
 if(!['workspace','revision','migrate'].includes(operation))throw Error('不支持的本机接口');
 await ensureService();
 const response=await fetch(base+'/'+operation,{method:input===undefined?'GET':'POST',headers:{'x-zhiye-local':'1','Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(30000)});
 return {status:response.status,data:await response.json()};
}
module.exports={requestLocal};

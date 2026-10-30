import {createServer} from 'node:http';
import {mkdir,readFile,open,rename} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve,extname,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateWorkspace, MAX_BACKUP_BYTES} from '../src/lib/workspace';
import {migrateWorkspace} from './migration';
import type {Workspace} from '../src/types';

const directory=process.env.ZHIYE_DATA_DIR || join(homedir(),'.zhiye-notes');
const staticRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const port=Number(process.env.ZHIYE_SERVICE_PORT || 5174);
type State={revision:number;workspace:Workspace|null;migrations:string[]};
let state:State={revision:0,workspace:null,migrations:[]};
let serial=Promise.resolve();
await mkdir(join(directory,'backups'),{recursive:true,mode:0o700});
try { const parsed=JSON.parse(await readFile(join(directory,'workspace.json'),'utf8')); if(!Number.isSafeInteger(parsed.revision)||parsed.revision<0||!Array.isArray(parsed.migrations))throw Error('损坏的笔记库');state={...parsed,workspace:validateWorkspace(parsed.workspace)}; }
catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
async function atomic(file:string,value:unknown){
  const temporary=file+'.'+randomUUID()+'.tmp';const handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
  await rename(temporary,file);
}
async function commit(next:State){
  if(state.workspace)await atomic(join(directory,'backups','previous.json'),state);
  await atomic(join(directory,'workspace.json'),next);state=next;
}
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const send=(status:number,value:unknown)=>{res.writeHead(status);res.end(JSON.stringify(value));};
  const host=`127.0.0.1:${port}`;
  if(req.headers.host!==host || (req.headers.origin && req.headers.origin!==`http://${host}`)){send(403,{error:'不允许的访问来源'});return;}
  if(req.url?.startsWith('/__local/'))req.url=req.url.replace('/__local/','/');
  if(!['/health','/revision','/workspace','/migrate'].includes(req.url || '')){
    if(req.method!=='GET'){send(405,{error:'请求方法无效'});return;}
    try{
      const pathname=decodeURIComponent(new URL(req.url || '/',`http://${host}`).pathname);
      const file=resolve(staticRoot,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(staticRoot+sep))throw Error('无效路径');
      const bytes=await readFile(file);
      const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.json':'application/json'};
      res.setHeader('Content-Type',types[extname(file)] || 'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);
    }catch{send(404,{error:'页面未构建，请运行 npm run build 或启动新版 App'});}
    return;
  }
  // Custom header plus no CORS prevents arbitrary websites reading or writing local notes.
  if(req.headers['x-zhiye-local']!=='1'){send(403,{error:'不允许的访问来源'});return;}
  if(req.url==='/health'&&req.method==='GET'){send(200,{service:'zhiye-local-v1'});return;}
  if(req.url==='/revision'&&req.method==='GET'){send(200,{revision:state.revision});return;}
  if(req.url==='/workspace'&&req.method==='GET'){send(200,state.workspace?{revision:state.revision,workspace:state.workspace}:null);return;}
  if(!['/workspace','/migrate'].includes(req.url||'')||req.method!=='POST'){send(404,{error:'未找到接口'});return;}
  try{
    let size=0;const chunks:Buffer[]=[];
    for await(const chunk of req){size+=chunk.length;if(size>MAX_BACKUP_BYTES){send(413,{error:'笔记库超过大小限制'});return;}chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString());
    const run=async()=>{
      if(req.url==='/migrate'){
        if(typeof input.clientId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.clientId))throw Error('迁移标识无效');
        if(!state.migrations.includes(input.clientId)){
          const incoming= input.workspace ? validateWorkspace(input.workspace):null;
          if(incoming)await atomic(join(directory,'backups',`migration-${input.clientId}.json`),incoming);
          const workspace=incoming?migrateWorkspace(state.workspace,incoming):state.workspace;
          if(workspace)await commit({revision:state.revision+1,workspace,migrations:[...state.migrations,input.clientId]});
        }
        send(200,state.workspace?{revision:state.revision,workspace:state.workspace}:null);return;
      }
      if(input.expectedRevision!==state.revision){send(409,{error:'另一窗口已更新笔记库，请保留当前修改后重新载入。'});return;}
      if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||state.revision===Number.MAX_SAFE_INTEGER)throw Error('版本无效');
      const workspace=validateWorkspace(input.workspace);
      await commit({...state,revision:state.revision+1,workspace});send(200,{revision:state.revision});
    };
    const pending=serial.then(run);serial=pending.catch(()=>{});await pending;
  }catch(error){send(400,{error:error instanceof Error?error.message:'本机保存失败'});}
});
server.listen(port,'127.0.0.1');

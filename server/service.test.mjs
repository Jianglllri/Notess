import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const now=new Date().toISOString();
const workspace={schemaVersion:1,id:'test',notes:[{id:'n',title:'测试',content:'原文',folderId:null,tags:[],pinned:false,createdAt:now,updatedAt:now,deletedAt:null}],folders:[],assets:[],updatedAt:now,lastBackupAt:null};
test('shared storage: migration, CAS concurrency, backups, origin boundaries and restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zhiye-test-'));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 let child;
 const start=async()=>{child=spawn(process.env.ZHIYE_TEST_EXEC || process.execPath,[process.env.ZHIYE_TEST_SERVICE || 'electron/local-service.mjs'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',ZHIYE_DATA_DIR:dir,ZHIYE_SERVICE_PORT:String(port)},stdio:'pipe'});for(let i=0;i<60;i++){try{const r=await call('health');if(r.status===200)return;}catch{/* Waiting for the server to bind. */}await new Promise(r=>setTimeout(r,50));}throw Error('service failed');};
 const call=(path,input,headers={})=>fetch(`http://127.0.0.1:${port}/${path}`,{method:input?'POST':'GET',headers:{'x-zhiye-local':'1',...headers},...(input?{body:JSON.stringify(input)}:{})});
 const stop=async()=>{const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;};
 try{
 await start();assert.equal(await (await call('workspace')).json(),null);
 let migrated=await (await call('migrate',{clientId:'browser-a',workspace})).json();assert.equal(migrated.workspace.notes.length,1);
 await call('migrate',{clientId:'browser-a',workspace});assert.equal((await (await call('revision')).json()).revision,migrated.revision);
 await call('migrate',{clientId:'browser-b',workspace});migrated=await (await call('workspace')).json();assert.equal(migrated.workspace.notes.length,1);
 const results=await Promise.all(['甲','乙'].map(content=>call('workspace',{expectedRevision:migrated.revision,workspace:{...workspace,notes:[{...workspace.notes[0],content}]}})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=await (await call('workspace')).json();assert.equal((await call('workspace',{expectedRevision:saved.revision,workspace:{bad:true}})).status,400);
 assert.equal((await call('workspace',undefined,{'Origin':'https://evil.example'})).status,403);
 assert.equal((await fetch(`http://127.0.0.1:${port}/workspace`)).status,403);
 assert.equal(JSON.parse(await readFile(join(dir,'backups/migration-browser-a.json'),'utf8')).notes[0].content,'原文');
 await stop();await start();assert.deepEqual(await (await call('workspace')).json(),saved);
 const divergent={...workspace,notes:[{...workspace.notes[0],content:'另一个浏览器原有内容'}]};
 const merged=await (await call('migrate',{clientId:'browser-c',workspace:divergent})).json();assert.equal(merged.workspace.notes.length,2);assert.ok(merged.workspace.notes.some(n=>n.content==='另一个浏览器原有内容'));
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});

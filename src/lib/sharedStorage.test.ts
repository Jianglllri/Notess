// @vitest-environment node
import 'fake-indexeddb/auto';
import {deleteDB,openDB} from 'idb';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createWorkspace} from './workspace';
beforeEach(async()=>{vi.resetModules();await deleteDB('zhiye-notes-v1');});
afterEach(async()=>{vi.unstubAllGlobals();await deleteDB('zhiye-notes-v1');});
function client(){
 const values=new Map<string,string>();
 vi.stubGlobal('window',{location:{hostname:'127.0.0.1',port:'5173'}});
 vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v)});
}
it('migrates legacy notes once per client session and reads subsequent changes from shared storage',async()=>{
 client();const legacy=createWorkspace();const database=await openDB('zhiye-notes-v1',1,{upgrade(db){db.createObjectStore('workspace');}});
 await database.put('workspace',{revision:12,workspace:legacy},'main');database.close();
 const current={revision:5,workspace:createWorkspace()};
 const request=vi.fn(async(url:string,options:RequestInit)=>{
  if(url.endsWith('/migrate'))expect(JSON.parse(options.body as string).workspace).toEqual(legacy);
  return {status:200,json:async()=>url.endsWith('/revision')?{revision:current.revision}:current};
 });vi.stubGlobal('fetch',request);
 const storage=await import('./storage');expect(await storage.loadWorkspace()).toEqual(current);
 current.revision++;current.workspace.notes[0].content='来自 App 的更新';
 expect(await storage.loadSharedUpdate(5)).toEqual(current);expect(await storage.loadSharedUpdate(6)).toBeNull();
 await storage.loadWorkspace();expect(request.mock.calls.filter(([url])=>url.endsWith('/migrate'))).toHaveLength(1);
 const reopened=await openDB('zhiye-notes-v1',1);expect((await reopened.get('workspace','main')).workspace).toEqual(legacy);reopened.close();
});
it('does not silently write into IndexedDB when the shared service is down; conflicts are explicit',async()=>{
 client();vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));
 const storage=await import('./storage');await expect(storage.saveWorkspace(createWorkspace(),0)).rejects.toThrow('offline');
 expect(await indexedDB.databases()).toHaveLength(0);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:409,json:async()=>({})}));
 await expect(storage.saveWorkspace(createWorkspace(),0)).rejects.toBeInstanceOf(storage.StorageConflictError);
});

import {it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
function desktop(){
 const handlers=new Map<string,(event:object,input:unknown)=>Promise<unknown>>();
 const mainFrame={url:pathToFileURL(resolve('dist/index.html')).href};
 const webContents={mainFrame,setWindowOpenHandler:vi.fn(),on:vi.fn()};
 const dialog=vi.fn().mockResolvedValue({response:1});
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({private:false})});
 const spawn=vi.fn(()=>{
  const child=new EventEmitter(),stdout=new EventEmitter();
  return Object.assign(child,{stdout,stderr:{resume(){}},kill(){},stdin:{end(){queueMicrotask(()=>{stdout.emit('data','password=test-only\n');child.emit('close',0);});}}});
 });
 const electron={app:{getPath:()=>'/tmp',whenReady:()=>({then:(fn:()=>void)=>fn()}),on:vi.fn()},BrowserWindow:class {webContents=webContents;loadFile(){}},shell:{openExternal:vi.fn()},dialog:{showMessageBox:dialog},ipcMain:{handle:(name:string,fn:(event:object,input:unknown)=>Promise<unknown>)=>handlers.set(name,fn)}};
 vm.runInNewContext(readFileSync('electron/main.cjs','utf8'),{require:(name:string)=>name==='electron'?electron:name==='node:child_process'?{spawn}:name==='./policy.cjs'?require('../../electron/policy.cjs'):require(name),__dirname:resolve('electron'),process:{env:{},platform:'darwin'},setTimeout,clearTimeout,URL,fetch,AbortSignal});
 const event={sender:webContents,senderFrame:mainFrame};
 const config={mode:'cloud',system:'https://github.com/a/system',public:'https://github.com/a/public',private:'https://github.com/a/private',publicBranch:'main',privateBranch:'main'};
 const call=(name:string,input:unknown,from=event)=>handlers.get(name)!(from,input);
 return {call,event,config,dialog,fetch,spawn};
}
it('does not grant IPC authority to another file frame or a cancelled native configuration',async()=>{
 const d=desktop();await expect(d.call('configure-repositories',d.config,{...d.event,senderFrame:{url:'file:///tmp/evil.html'}})).rejects.toThrow();expect(d.dialog).not.toHaveBeenCalled();
 d.dialog.mockResolvedValue({response:0});await expect(d.call('configure-repositories',d.config)).rejects.toThrow('已取消');
 await expect(d.call('github-request',{path:'/repos/a/public',method:'GET',body:''})).rejects.toThrow();expect(d.spawn).not.toHaveBeenCalled();
});
it('checks actual privacy in the main process and blocks writes when the user cancels',async()=>{
 const d=desktop();await d.call('configure-repositories',d.config);
 const req={path:'/repos/a/public/contents/a.md',method:'PUT',body:JSON.stringify({branch:'main',content:btoa('<!-- zhiye:{"visibility":"public"} -->\na')})};
 d.fetch.mockResolvedValue({ok:true,json:async()=>({private:true})});await expect(d.call('github-request',req)).rejects.toThrow('隐私状态');
 d.fetch.mockResolvedValue({ok:true,json:async()=>({private:false})});d.dialog.mockResolvedValue({response:0});await expect(d.call('github-request',req)).rejects.toThrow('取消');
 expect(d.fetch.mock.calls.every(call=>!call[1]?.method)).toBe(true);
});

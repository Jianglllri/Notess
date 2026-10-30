const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {existsSync} = require('node:fs');
const gitBinary = ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'].find(existsSync);
const {configuration,authorize}=require('./policy.cjs');
const {pathToFileURL}=require('node:url');
const entryURL=pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
let approvedConfig;
const approvedTrees=new Map(),approvedCommits=new Set();
let mainWindow;
function trusted(event){if(!mainWindow || event.sender!==mainWindow.webContents || event.senderFrame!==mainWindow.webContents.mainFrame || event.senderFrame.url.split('#')[0]!==entryURL)throw Error('不可信页面');}
ipcMain.handle('local-workspace', async (event, {operation,input}) => {
  trusted(event);
  return require('./local-client.cjs').requestLocal(operation,input);
});
let configuring=false;
ipcMain.handle('configure-repositories', async (event, input) => {
  trusted(event);
  const config=configuration(input);
  if(JSON.stringify(config)===JSON.stringify(approvedConfig))return;
  if(config.mode==='local'){approvedTrees.clear();approvedCommits.clear();approvedConfig=config;return;}
  if(configuring)throw Error('请完成正在显示的仓库授权');
  configuring=true;
  try{
    const result=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['取消','允许本次连接'],defaultId:0,cancelId:0,title:'连接 GitHub 仓库',message:'允许枝叶使用本机 GitHub 登录连接这些仓库？',detail:`公开：${config.public || '未配置'}\n私密：${config.private || '未配置'}\n系统（只读）：${config.system}\n写入还需单独确认。`});
    trusted(event);if(result.response!==1)throw Error('已取消仓库授权');approvedTrees.clear();approvedCommits.clear();approvedConfig=config;
  }finally{configuring=false;}
});
function credential(repository) {
  return new Promise((resolve, reject) => {
    const child = spawn(gitBinary, ['credential', 'fill'], {cwd:app.getPath('home'), env: {...process.env, GIT_TERMINAL_PROMPT:'0', GCM_INTERACTIVE:'Never'}, stdio:['pipe','pipe','pipe']});
    let output = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('GitHub 登录读取超时，请在连接窗口填写 Token。')); }, 10000);
    child.stdout.on('data', bytes => { output += bytes; });
    child.stderr.resume();
    child.on('error', () => {clearTimeout(timer); reject(new Error('无法读取 GitHub 登录，请在连接窗口填写 Token。'));});
    child.on('close', code => { clearTimeout(timer); const password = output.split('\n').find(line => line.startsWith('password='))?.slice(9); if (code || !password) reject(new Error('本机没有可用的 GitHub 登录，请在连接窗口填写 Token。')); else resolve(password); });
    child.stdin.end('protocol=https\nhost=github.com\npath=' + repository + '.git\n\n');
  });
}
ipcMain.handle('github-request', async (event, request) => {
  trusted(event);
  const config=approvedConfig;
  const {target,role}=authorize(config,request);
  const payload=request.method==='GET'?null:JSON.parse(request.body);
  if(request.method==='POST'&&request.path.endsWith('/git/commits')&&approvedTrees.get(`${target}:${payload.tree}`)!==payload.parents[0])throw Error('提交树未经授权');
  if(request.method==='PATCH'&&!approvedCommits.has(`${target}:${payload.sha}`))throw Error('提交未经授权');
  const write=request.method!=='GET';
  let token; try { token = await credential(new URL(target).pathname.slice(1)); } catch (error) { if(write) throw error; }
  const headers={...(token?{Authorization:`Bearer ${token}`} : {}),Accept:'application/vnd.github+json','Content-Type':'application/json'};
  let treeParent;
  if(write){
    const metaResponse=await fetch('https://api.github.com/repos'+new URL(target).pathname,{headers,signal:AbortSignal.timeout(30000),redirect:'error'});
    if(!metaResponse.ok)throw Error('无法验证目标仓库隐私状态');
    const meta=await metaResponse.json();if(meta.private!==(role==='private'))throw Error('目标仓库隐私状态不匹配，已停止上传');
    if(request.method==='POST'&&request.path.endsWith('/git/trees')){
      const base='https://api.github.com/repos'+new URL(target).pathname;
      const refResponse=await fetch(base+'/git/ref/heads/'+config[role+'Branch'].split('/').map(encodeURIComponent).join('/'),{headers,signal:AbortSignal.timeout(30000),redirect:'error'});
      if(!refResponse.ok)throw Error('无法验证当前分支');
      treeParent=(await refResponse.json()).object.sha;
      const commitResponse=await fetch(base+'/git/commits/'+treeParent,{headers,signal:AbortSignal.timeout(30000),redirect:'error'});
      if(!commitResponse.ok||(await commitResponse.json()).tree.sha!==payload.base_tree)throw Error('提交未基于当前分支，已停止');
    }
    if(request.method==='PUT'||request.path.endsWith('/git/trees')){
    const result=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['取消','确认上传'],defaultId:0,cancelId:0,title:'GitHub 写入确认',message:`确认写入${role==='private'?'私密':'公开'}笔记仓库？`,detail:`${target}\n${request.method} ${request.path}`});
    trusted(event);if(result.response!==1||approvedConfig!==config)throw Error('上传已取消或配置已变化');
    }
    if(approvedConfig!==config)throw Error('配置已变化，上传停止');
  }
  const response = await fetch('https://api.github.com' + request.path, {method:request.method,redirect:'error',signal:AbortSignal.timeout(30000),headers,...(write?{body:request.body}:{})});
  if (!response.ok) throw new Error(`GitHub 请求失败 (${response.status})，请检查权限或刷新远端版本。`);
  const result=await response.json();
  if(request.method==='POST'&&request.path.endsWith('/git/trees'))approvedTrees.set(`${target}:${result.sha}`,treeParent);
  if(request.method==='POST'&&request.path.endsWith('/git/commits'))approvedCommits.add(`${target}:${result.sha}`);
  return result;
});
function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 940, minWidth: 850, minHeight: 650, title: '枝叶学习笔记', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  mainWindow=win;
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

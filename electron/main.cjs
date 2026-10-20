const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {existsSync} = require('node:fs');
const gitBinary = ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'].find(existsSync);
let allowedRepositories = new Set();
ipcMain.handle('configure-repositories', (event, urls) => {
  if (!event.senderFrame?.url.startsWith('file://') || !Array.isArray(urls) || urls.length > 3 || !urls.every(url => typeof url === 'string' && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url))) throw new Error('仓库配置无效。');
  allowedRepositories = new Set(urls.map(url => new URL(url).pathname.toLowerCase()));
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
  const match = typeof request.path === 'string' && request.path.match(/^\/repos(\/[\w.-]+\/[\w.-]+)(?:\/(.*))?(?:\?.*)?$/);
  if (!event.senderFrame?.url.startsWith('file://') || !match || !allowedRepositories.has(match[1].toLowerCase()) || !['GET','PUT'].includes(request.method) || typeof request.body !== 'string' || request.body.length > 16_000_000 || request.path.includes('#') || request.path.includes('..')) throw new Error('不允许的 GitHub 请求。');
  const suffix=match[2] || '';
  if (request.method==='PUT' && (!suffix.startsWith('contents/') || request.path.includes('?'))) throw new Error('不允许的 GitHub 写入。');
  if (request.method==='GET' && suffix && !/^(contents\/|git\/(trees|blobs)\/|commits\/|branches\/|releases\/)/.test(suffix)) throw new Error('不允许的 GitHub 读取。');
  let token; try { token = await credential(match[1].slice(1)); } catch (error) { if(request.method!=='GET') throw error; }
  const response = await fetch('https://api.github.com' + request.path, {method:request.method, signal:AbortSignal.timeout(30000), headers:{...(token?{Authorization:`Bearer ${token}`} : {}), Accept:'application/vnd.github+json', 'Content-Type':'application/json'}, ...(request.method==='PUT'?{body:request.body}:{})});
  if (!response.ok) throw new Error(`GitHub 请求失败 (${response.status})，请检查权限或刷新远端版本。`);
  return response.json();
});
function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 940, minWidth: 850, minHeight: 650, title: '枝叶学习笔记', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

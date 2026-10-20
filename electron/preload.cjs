const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('zhiye', {configureRepositories: urls => ipcRenderer.invoke('configure-repositories', urls), githubRequest: (path, method, body) => ipcRenderer.invoke('github-request', {path, method, body})});

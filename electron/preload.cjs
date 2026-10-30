const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('zhiye', {localWorkspace: (operation,input) => ipcRenderer.invoke('local-workspace',{operation,input}), configureRepositories: urls => ipcRenderer.invoke('configure-repositories', urls), githubRequest: (path, method, body) => ipcRenderer.invoke('github-request', {path, method, body})});

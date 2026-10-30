import {exportBackupInWorker} from './backupExport';
self.onmessage=async event=>{try{self.postMessage(await exportBackupInWorker(event.data));}catch(error){self.postMessage({error:error instanceof Error?error.message:'备份失败'});}};

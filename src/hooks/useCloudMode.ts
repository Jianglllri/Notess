import { useSyncExternalStore } from 'react';
import { cloudEnabled } from '../lib/repositories';
function subscribe(callback:()=>void){window.addEventListener('zhiye-repositories-changed',callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener('zhiye-repositories-changed',callback);window.removeEventListener('storage',callback);};}
export function useCloudMode(){return useSyncExternalStore(subscribe,cloudEnabled,()=>false);}

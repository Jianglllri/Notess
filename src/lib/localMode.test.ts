import { afterEach, describe,it,expect,vi } from 'vitest';
import { cloudEnabled, DEFAULT_REPOSITORIES, validateRepositories } from './repositories';
import { publishCloudNote } from './cloudSync';
import { githubRequest } from './github';
import { newNote } from './workspace';
afterEach(()=>vi.unstubAllGlobals());
describe('local only mode',()=>{
 it('persists explicit local mode while migrating older settings to cloud mode',()=>{expect(validateRepositories({...DEFAULT_REPOSITORIES,mode:'local'}).mode).toBe('local');expect(validateRepositories({...DEFAULT_REPOSITORIES,mode:undefined}).mode).toBe('cloud');});
 it('prevents uploads before any network call, including direct transport writes',async()=>{vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({...DEFAULT_REPOSITORIES,mode:'local'})});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(cloudEnabled()).toBe(false);await expect(publishCloudNote(newNote())).rejects.toThrow('仅本地');await expect(githubRequest('/repos/owner/repo/contents/n.md','token',{method:'PUT'})).rejects.toThrow('仅本地');expect(fetch).not.toHaveBeenCalled();});
});

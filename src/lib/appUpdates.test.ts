import { afterEach, expect, it, vi } from 'vitest';
import { fetchAppRelease, isNewerVersion, parseRelease } from './appUpdates';
const release = { tag_name: 'v0.4.6', draft: false, prerelease: false, body: '更新说明', assets: ['dmg', 'pkg'].map(ext => ({ name: `Zhiye-Notes-0.4.6-arm64.${ext}`, state: 'uploaded', size: 100, browser_download_url: `https://github.com/Jianglllri/Notess/releases/download/v0.4.6/Zhiye-Notes-0.4.6-arm64.${ext}` })) };
afterEach(() => vi.unstubAllGlobals());
it('compares numeric versions without prompting on equal or older versions', () => {
 expect(isNewerVersion('0.4.10','0.4.9')).toBe(true);
 expect(isNewerVersion('v1.0.0','0.99.99')).toBe(true);
 expect(isNewerVersion('0.4.6','0.4.6')).toBe(false);
 expect(isNewerVersion('0.4.5','0.4.6')).toBe(false);
 expect(isNewerVersion('0.5.0-beta','0.4.6')).toBe(false);
});
it('accepts complete releases and rejects drafts, prereleases and missing or untrusted downloads',()=>{
 expect(parseRelease(release).version).toBe('0.4.6');
 for (const override of [{draft:true},{prerelease:true},{assets:[]},{tag_name:'../../evil'},{assets:[{...release.assets[0],browser_download_url:'https://example.com/app.dmg'}]}]) expect(()=>parseRelease({...release,...override})).toThrow();
});
it('distinguishes no release from a network or permission failure',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:404})));
 expect(await fetchAppRelease()).toBeNull();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:403})));
 await expect(fetchAppRelease()).rejects.toThrow('请求受限');
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
 await expect(fetchAppRelease()).rejects.toThrow('offline');
});

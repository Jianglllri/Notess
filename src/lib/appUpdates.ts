import { getRepositories } from './repositories';
export const RELEASES_URL = 'https://github.com/Jianglllri/Notess/releases/latest';
export const RELEASE_API = 'https://api.github.com/repos/Jianglllri/Notess/releases/latest';
export interface AppRelease { version: string; url: string; notes: string; dmg: string; pkg: string }
export function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) => /^v?\d+\.\d+\.\d+$/.test(v) ? v.replace(/^v/, '').split('.').map(Number) : null;
  const a = parse(remote), b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function parseRelease(data: unknown, repository=getRepositories().system): AppRelease {
  if (!data || typeof data !== 'object') throw new Error('版本信息格式不正确。');
  const d = data as Record<string, unknown>;
  if (d.draft !== false || d.prerelease !== false || typeof d.tag_name !== 'string' || !/^v\d+\.\d+\.\d+$/.test(d.tag_name) || !Array.isArray(d.assets)) throw new Error('未找到可安装的正式版本。');
  const version = d.tag_name.slice(1);
  const assets = d.assets;
  const asset = (ext: string) => {
    const name = `Zhiye-Notes-${version}-arm64.${ext}`;
    const url = `${repository}/releases/download/${d.tag_name}/${name}`;
    return assets.some(a => a && typeof a === 'object' && a.name === name && a.state === 'uploaded' && a.size > 0 && a.browser_download_url === url) ? url : '';
  };
  const dmg = asset('dmg'), pkg = asset('pkg');
  if (!dmg && !pkg) throw new Error('新版安装包尚未准备好，请稍后重试。');
  return { version, url: `${repository}/releases/tag/${d.tag_name}`, notes: typeof d.body === 'string' ? d.body.slice(0, 12000) : '', dmg, pkg };
}
export async function fetchAppRelease(): Promise<AppRelease | null> {
  const response = await fetch(`https://api.github.com/repos/${new URL(getRepositories().system).pathname.slice(1)}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub 请求受限，请稍后再试。' : '暂时无法获取版本，请检查网络后重试。');
  return parseRelease(await response.json());
}

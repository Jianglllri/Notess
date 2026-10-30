// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {MarkdownPreview} from './MarkdownPreview';

it('indexes rendered headings, skips code, jumps to duplicate titles and updates on note changes', async () => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const scroll=vi.fn();HTMLElement.prototype.scrollIntoView=scroll;
  await act(async()=>root.render(<MarkdownPreview assets={[]} showToc content={'# 标题\n\n## 重复\n\n## 重复\n\n```md\n# 不是标题\n```\n\n下划线标题\n---'} />));
  const links=host.querySelectorAll<HTMLAnchorElement>('nav a');
  expect(Array.from(links).map(a=>a.textContent)).toEqual(['标题','重复','重复','下划线标题']);
  expect(links[1].hash).not.toBe(links[2].hash);
  await act(async()=>links[2].click());
  expect(scroll).toHaveBeenCalledWith({behavior:'instant',block:'start'});
  expect(document.activeElement?.id).toBe(decodeURIComponent(links[2].hash.slice(1)));
  await act(async()=>root.render(<MarkdownPreview assets={[]} showToc content="没有标题的正文" />));
  expect(host.querySelector('nav')).toBeNull();
  await act(async()=>root.unmount());host.remove();
});

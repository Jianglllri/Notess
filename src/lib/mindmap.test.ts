import { describe, expect, it } from 'vitest';
import { mindBlocks, mindLayout, parseMind, saveMind, serializeMind } from './mindmap';
const tree = {name:'复习 <script>',children:[{name:'概念',children:[]},{name:'例题',children:[{name:'答案',children:[]}]}]};
describe('visual mind maps', () => {
  it('round trips the entire tree and keeps surrounding notes when edited', () => {
    const encoded=serializeMind(tree); const source=`前文\n\n${encoded}\n后文`;
    const block=mindBlocks(source)[0]; expect(parseMind(block.body)).toEqual(tree);
    const next={...tree,name:'新主题'};
    expect(saveMind(source,source,block,next)).toBe(`前文\n\n${serializeMind(next)}\n后文`);
  });
  it('finds multiple maps but skips examples within ordinary fences', () => {
    const source='````markdown\n'+serializeMind(tree)+'````\n'+serializeMind(tree)+serializeMind(tree);
    expect(mindBlocks(source)).toHaveLength(2);
  });
  it('refuses to overwrite changes that happened while the dialog was open', () => {
    expect(()=>saveMind('changed','old',null,tree)).toThrow('其他位置更新');
  });
  it('rejects unsupported formats, skipped depths, extra roots and excessive nodes', () => {
    for (const body of ['- list','# A\n### C','# A\n# B','# A\n'+Array(80).fill('## B').join('\n')]) expect(()=>parseMind(body)).toThrow();
    expect(()=>serializeMind({name:'',children:[]})).toThrow();
    expect(()=>serializeMind({name:'a'.repeat(121),children:[]})).toThrow();
  });
  it('keeps code-like labels within the fence and lays out every node', () => {
    expect(parseMind(mindBlocks(serializeMind({name:'```',children:[]}))[0].body).name).toBe('```');
    const layout=mindLayout(tree); expect(layout.nodes).toHaveLength(4);
    expect(layout.nodes[0].y).toBe((layout.nodes[1].y+layout.nodes[2].y)/2);
  });
});

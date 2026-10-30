import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
// Generated assets are disposable. Never serve stale, unhardened entry points.
rmSync('public/vditor', {recursive:true,force:true});
mkdirSync('public/vditor/dist', { recursive: true });
cpSync('node_modules/vditor/dist', 'public/vditor/dist', { recursive: true });
for (const entry of ['index','method']) {
  const input=`node_modules/vditor/dist/${entry}.js`;
  let code=readFileSync(input,'utf8');
  for(const name of ['chartRender','wavedromRender','plantumlRender']) {
    const pattern=new RegExp(`var ${name} = function \\([^]*?\\n};`);
    if(!pattern.test(code))throw Error(`Vditor changed: audit ${entry}/${name} before upgrading`);
    code=code.replace(pattern,`var ${name} = function () { /* Disabled: executable or remote diagrams. Keep code as text. */ };`);
  }
  const unsafe='return Function("\\"use strict\\";return (".concat(text, ")"))();';
  if(!code.includes(unsafe))throw Error('Vditor evaluator changed: audit dependency');
  code=code.replace(unsafe,'return JSON.parse(text);');
  mkdirSync('node_modules/.zhiye-vditor',{recursive:true});
  writeFileSync(`node_modules/.zhiye-vditor/${entry}.js`,code);
  writeFileSync(`public/vditor/dist/${entry}.js`,code);
  writeFileSync(`public/vditor/dist/${entry}.min.js`,code);
}

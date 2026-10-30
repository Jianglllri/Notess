import {it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {configuration,authorize}=require('../../electron/policy.cjs');
const config=configuration({mode:'cloud',system:'https://github.com/a/system',public:'https://github.com/a/public',private:'https://github.com/a/private',publicBranch:'main',privateBranch:'main'});
it('rejects path normalization escapes, unapproved repos, system writes and local-mode writes',()=>{
 for(const path of ['/repos/a/public/contents/%2e%2e/private','/repos/a/public/contents/%2F..%2Fprivate','/repos/a/public/../private','/repos/a/public\\/contents/a','/repos/a/public/contents/a#x','/repos/a/other/contents/a'])expect(()=>authorize(config,{path,method:'GET',body:''})).toThrow();
 const request={path:'/repos/a/public/contents/a.md',method:'PUT',body:JSON.stringify({branch:'main',content:btoa('<!-- zhiye:{"visibility":"public"} -->\na')})};
 expect(authorize(config,request).role).toBe('public');expect(()=>authorize({...config,mode:'local'},request)).toThrow();
 expect(()=>authorize(config,{...request,path:'/repos/a/system/contents/a.md'})).toThrow();
 expect(()=>authorize(config,{...request,body:JSON.stringify({branch:'secret',content:'YQ=='})})).toThrow();
 expect(()=>configuration({...config,public:'https://github.com/a/..'})).toThrow();
});
it('compiled editor diagram entry points neither execute payloads nor contact external renderers',()=>{
 const code=readFileSync('public/vditor/dist/index.js','utf8');
 const context=vm.createContext({executed:false});
 for(const name of ['chartRender','wavedromRender','plantumlRender']){
  const functionText=code.match(new RegExp(`var ${name} = function \\([^]*?\\};`))![0];
  vm.runInContext(functionText,context);
  vm.runInContext(`${name}({querySelectorAll(){executed=true;throw Error('must not parse')}})`,context);
 }
 expect(context.executed).toBe(false);expect(code).not.toContain('return Function(');expect(code).not.toContain('www.plantuml.com');
 const html=readFileSync('index.html','utf8');expect(html).toContain("object-src 'none'");expect(html).not.toContain("'unsafe-eval'");
});

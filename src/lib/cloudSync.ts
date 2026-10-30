import { z } from 'zod';
import type { GithubBinding, Note, Workspace } from '../types';
import type { ImportedDoc } from './github';
import { decodeNote, encodeNote, gitBlobSha, publishGithubAtomic, githubRequest, importGithub, parseGithub, publishGithub, readGithubFile, readSource } from './github';
import { cloudEnabled, noteDestination } from './repositories';
import type { Visibility } from './repositories';
import { sourceKey } from './sync';
export const MANIFEST_PATH='.zhiye/imports.json';
const entrySchema=z.object({path:z.string().min(1).max(1000).refine(p=>!p.split('/').some(s=>!s||s==='.'||s==='..')),mode:z.enum(['reference','copy']),record:z.string().max(40000).optional(),fileSha:z.string().max(100).optional()}).strict();
const manifestSchema=z.object({version:z.literal(1),entries:z.array(entrySchema).max(1000)}).strict().superRefine((m,ctx)=>{if(new Set(m.entries.map(e=>e.path)).size!==m.entries.length || m.entries.some(e=>e.mode==='reference'&&(!e.record||!decodeNote(e.record,e.path).source||!decodeNote(e.record,e.path).referenceOnly)))ctx.addIssue({code:'custom',message:'导入清单包含重复或无效记录'});});
export type ImportManifest=z.infer<typeof manifestSchema>;
export function parseManifest(raw:string):ImportManifest {return manifestSchema.parse(JSON.parse(raw));}
export async function checkRepository(url:string,visibility:Visibility,token=''){
 if(!url)throw new Error(`尚未配置${visibility==='private'?'私密':'公开'}笔记仓库。`);
 const p=parseGithub(url),meta=await githubRequest(`/repos/${p.owner}/${p.repo}`,token);
 if(meta.private!==(visibility==='private'))throw new Error(`仓库实际为${meta.private?'private':'public'}，与文档的 ${visibility} 设置不符，已停止同步。`);
 return meta;
}
async function manifestFile(url:string,branch:string,token:string){const file=await readGithubFile(url,branch,MANIFEST_PATH,token);return {sha:file?.sha,manifest:file?parseManifest(file.content):{version:1 as const,entries:[]}};}
export function putEntry(manifest:ImportManifest,entry:ImportManifest['entries'][number]){return manifestSchema.parse({...manifest,entries:[...manifest.entries.filter(e=>e.path!==entry.path),entry].sort((a,b)=>a.path.localeCompare(b.path))});}
function serializeManifest(manifest:ImportManifest){const raw=JSON.stringify(manifest,null,2);if(new TextEncoder().encode(raw).length>900000)throw new Error('导入清单超过 900 KB，请拆分仓库后再同步。');return raw;}
export async function publishCloudNote(note:Note,token=''):Promise<GithubBinding>{
 if(!cloudEnabled())throw new Error('当前为仅本地模式，未上传任何内容。');
 const target=noteDestination(note);
 if(note.deletedAt && (!note.github || note.github.format!=='md'))throw new Error('这篇笔记没有云端关联，无需上传删除记录。');
 if(note.deletedAt && (note.github!.url.toLowerCase()!==target.url.toLowerCase() || note.github!.branch!==target.branch))throw new Error('原云端仓库或分支与当前设置不同，请恢复原配置后同步删除；不会在新仓库创建删除记录。');
 await checkRepository(target.url,target.visibility,token);
 const g=note.github?.url.toLowerCase()===target.url.toLowerCase()&&note.github.branch===target.branch?note.github:undefined;
 const origin=note.source?parseGithub(note.source.url):null;
 const path=g?.path || (origin?`imports/${origin.owner}/${origin.repo}/${note.source!.path}`:`notes/${note.id}.md`);
 const snapshot=encodeNote({...note,visibility:target.visibility});
 const decoded=decodeNote(snapshot,path),referenceOnly=!!decoded.referenceOnly;
 const {sha,manifest}=await manifestFile(target.url,target.branch,token);
 const previous=manifest.entries.find(e=>e.path===path);
 if(previous?.mode==='reference' && previous.record===snapshot)return {url:target.url,branch:target.branch,path,sha:sha!,format:'md',transport:'manifest',syncedAt:new Date().toISOString(),baseSnapshot:snapshot,baseContent:note.content};
 const resumedCopy=g?.transport==='manifest' && previous?.mode==='copy' && previous.record===g.baseSnapshot && !!previous.fileSha;
 if(previous?.mode==='reference' && previous.record!==g?.baseSnapshot)throw new Error('云端导入记录已变化，请刷新并处理冲突后重试。');
 if(g?.transport==='manifest' && previous?.mode!=='reference' && !resumedCopy)throw new Error('云端导入记录已被移除或改为正文副本，请先刷新核对。');
 let resultSha:string;
 if(referenceOnly){
   let fileSha=previous?.fileSha;
   if(g?.transport!=='manifest'){
    const existing=await readGithubFile(target.url,target.branch,path,token);
    if(existing&&existing.sha!==g?.sha)throw new Error('云端同路径笔记已变化，不能直接改为来源引用。');
    fileSha=existing?.sha;
   }
   const next=putEntry(manifest,{path,mode:'reference',record:snapshot,...(fileSha?{fileSha}:{})});
   const result=await publishGithub(target.url,target.branch,MANIFEST_PATH,serializeManifest(next),token,sha);resultSha=result.content.sha;
 }else{
   const existing=await readGithubFile(target.url,target.branch,path,token);
   const expected=g?.transport==='manifest'?previous?.fileSha:g?.sha;
   if(previous?.mode==='reference'){
    resultSha=await gitBlobSha(snapshot);
    const next=putEntry(manifest,{path,mode:'copy',record:previous.record,fileSha:resultSha});
    await publishGithubAtomic(target.url,target.branch,[{path,content:snapshot,sha:expected},{path:MANIFEST_PATH,content:serializeManifest(next),sha}],token);
   }else if(existing?.content===snapshot) resultSha=existing.sha;
   else {const result=await publishGithub(target.url,target.branch,path,snapshot,token,expected);resultSha=result.content.sha;}

 }
 return {url:target.url,branch:target.branch,path,sha:resultSha,format:'md',transport:referenceOnly?'manifest':'file',syncedAt:new Date().toISOString(),baseSnapshot:snapshot,baseContent:note.content};
}
export function markCloudPublished(workspace:Workspace,id:string,github:GithubBinding):Workspace{
 const old=workspace.notes.find(n=>n.id===id)?.github;
 const moved=old && (old.url.toLowerCase()!==github.url.toLowerCase()||old.path!==github.path||old.branch!==github.branch);
 return {...workspace,...(moved?{ignoredSources:[...new Set([...(workspace.ignoredSources||[]),sourceKey(old)])]}:{}),notes:workspace.notes.map(n=>n.id===id?{...n,github,...(moved?{publications:[...(n.publications||[]),{url:old.url,branch:old.branch,path:old.path}].slice(-100)}:{})}:n)};
}
export async function importCloudRepository(url:string,branch:string,visibility:Visibility,notes:Note[],token='',progress?:(done:number,total:number)=>void):Promise<ImportedDoc[]>{
 const meta=await checkRepository(url,visibility,token);
 const {sha,manifest}=await manifestFile(url,branch,token);
 const cache=notes.filter(n=>n.github?.url.toLowerCase()===url.toLowerCase()&&n.github.branch===branch).map(n=>({path:n.github!.path,sha:n.github!.sha,content:n.github!.baseSnapshot || encodeNote(n),source:n.source,localContent:n.content}));
 // Legacy Markdown files remain readable. Reference entries take precedence at the same path.
 let docs:ImportedDoc[];
 try{docs=await importGithub(`${url}/tree/${branch}` ,token,progress,cache,undefined,manifest.entries.filter(e=>e.mode==='reference').map(e=>e.path));}
 catch(error){if(meta.size===0 && error instanceof Error && /\((404|409)\)/.test(error.message))docs=[];else throw error;}
 const result=docs.filter(d=>!manifest.entries.some(e=>e.path===d.github.path&&e.mode==='reference')).map(d=>({...d,visibility}));
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(6,manifest.entries.length)},async()=>{
  while(cursor<manifest.entries.length){const entry=manifest.entries[cursor++];if(entry.mode!=='reference')continue;
   const decoded=decodeNote(entry.record!,entry.path);const source=decoded.source!;
   const local=cache.find(n=>n.path===entry.path);let body='';let resolved=source;
   try{body=local?.source?.sha===source.sha&&!local.source.missing?local.source.baseContent:await readSource(source,token);resolved={...source,baseContent:body};}
   catch{body=local?.localContent || '';resolved={...source,baseContent:local?.source?.baseContent || '',missing:true};}
   result.push({...decoded,content:body,source:resolved,visibility,category:'notes',sourceUrl:`${url}/blob/${branch}/${entry.path}`,github:{url,branch,path:entry.path,sha:sha!,format:'md',transport:'manifest',syncedAt:new Date().toISOString(),baseSnapshot:entry.record!,baseContent:body}});
  }
 }));return result;
}

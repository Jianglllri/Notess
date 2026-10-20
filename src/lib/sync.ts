import type { Workspace } from '../types';
import { newNote } from './workspace';
import { needsUpload } from './schedule';
import { DEFAULT_REPO } from './github';
import type { ImportedDoc } from './github';
export function sourceKey(g: {url:string;branch:string;path:string}) {
  return JSON.stringify([g.url.toLowerCase(), g.branch, g.path]);
}
export function mergeRemote(workspace: Workspace, docs: ImportedDoc[], destination=DEFAULT_REPO) {
  const result = { ...workspace, notes: [...workspace.notes], folders: [...workspace.folders] };
  let added = 0, updated = 0, conflicts = 0;
  const oldFolders = new Set<string>();
  for (const doc of docs) {
    if (workspace.ignoredSources?.includes(sourceKey(doc.github)) || workspace.ignoredSources?.includes(doc.sourceUrl)) continue;
    const repo = new URL(doc.github.url).pathname.slice(1);
    const segments = doc.github.path.split('/');
    const importedProject = doc.github.url.toLowerCase() === destination.toLowerCase() && segments[0] === 'imports' && segments.length > 2;
    const projectKey = importedProject ? repo + '/imports/' + segments[1] : repo;
    const projectName = importedProject ? segments[1] : repo;
    const dirs = (importedProject ? segments.slice(2,-1) : segments.slice(0,-1));
    const own = doc.github.url.toLowerCase() === destination.toLowerCase();
    const index = result.notes.findIndex(n => own ? (n.github?.url.toLowerCase() === destination.toLowerCase() && n.github.path === doc.github.path && n.github.branch === doc.github.branch) || (!!doc.source && (!n.github || n.github.url.toLowerCase()!==destination.toLowerCase()) && ((!!n.source && sourceKey(n.source)===sourceKey(doc.source) && (n.visibility || 'public')===(doc.visibility || 'public')) || n.sourceUrl===`${doc.source.url}/blob/${doc.source.branch}/${doc.source.path.split('/').map(encodeURIComponent).join('/')}`)) : n.sourceUrl === doc.sourceUrl || (!!n.source && n.source.url.toLowerCase()===doc.github.url.toLowerCase() && n.source.branch===doc.github.branch && n.source.path===doc.github.path));
    const needsFolders = own && !!doc.folderPath
      ? index < 0 || !needsUpload(result.notes[index],destination)
      : !doc.deletedAt && (index < 0 || (!result.notes[index].deletedAt && !result.notes[index].importFolderKey));
    let parentId: string | null = null;
    let key = projectKey;
    for (const [i,name] of (own && doc.folderPath ? doc.folderPath : [projectName,...dirs]).entries()) {
      if(i) key += '/' + name;
      if (!needsFolders) continue;
      let folder = result.folders.find(f=>own && doc.folderPath ? f.name===name && (f.parentId || null)===parentId : f.sourceKey===key);
      if(!folder){folder={id:crypto.randomUUID(),name:name.slice(0,60),parentId,sourceKey:key,createdAt:new Date().toISOString()};result.folders.push(folder);}
      parentId=folder.id;
    }

    if (index >= 0) {
      let local = result.notes[index];
      if(own && (local.visibility || 'public') !== (doc.visibility || 'public')) {conflicts++;continue;}
      if(!local.deletedAt && !local.importFolderKey && needsFolders && !local.folderPath) {if(local.folderId) oldFolders.add(local.folderId);local={...local,folderId:parentId,importFolderKey:key};result.notes[index]=local;}
      if (!own) {
        const source=doc.source || {url:doc.github.url,branch:doc.github.branch,path:doc.github.path,sha:doc.github.sha,baseContent:doc.content};
        if (!local.source) {
          result.notes[index]={...local,source}; updated++; continue;
        }
        if (local.deletedAt) continue;
        if (local.source.sha!==source.sha) {
          if (local.content!==local.source.baseContent) {conflicts++; continue;}
          result.notes[index]={...local,content:doc.content,source,updatedAt:new Date().toISOString()}; updated++;
        } else if(local.source.missing) {result.notes[index]={...local,content:local.content===local.source.baseContent ? doc.content : local.content,source};updated++;}
        continue;
      }
      if (local.github?.url.toLowerCase()!==destination.toLowerCase() && doc.source) {
        // A device may already have imported this same source independently.
        // Adopt the cloud identity without replacing that device's local changes.
        const adopted={...local,github:doc.github,source:local.source || doc.source};
        result.notes[index]=adopted;
        if(needsUpload(adopted,destination)) conflicts++; else updated++;
        continue;
      }
      if (local.github?.sha === doc.github.sha) {
        if(local.source?.missing && doc.source && !doc.source.missing) {result.notes[index]={...local,content:local.content===local.source.baseContent ? doc.content : local.content,source:doc.source};updated++;}
        if ((local.github.baseContent === undefined || local.github.baseSnapshot === undefined) && local.content === doc.content) result.notes[index] = {...local, github:doc.github};
        continue;
      }
      if (needsUpload(local,destination)) { conflicts++; continue; }
      result.notes[index] = {...local, title:doc.title, tags:doc.tags || [], deletedAt:doc.deletedAt || null, content: doc.content, github: doc.github, ...(doc.visibility?{visibility:doc.visibility}:{}), ...(doc.source?{source:doc.source}:{}), ...(doc.folderPath?{folderId:parentId,folderPath:doc.folderPath}:{}), ...(doc.pinned===undefined?{}:{pinned:doc.pinned}), updatedAt: new Date().toISOString()}; updated++; continue;
    }
    result.notes.push({...newNote(parentId), importFolderKey:key, title:doc.title, deletedAt:doc.deletedAt || null, content:doc.content, tags:doc.tags || [], sourceUrl:doc.sourceUrl, ...(doc.visibility?{visibility:doc.visibility}:{}), ...(doc.source?{source:doc.source}:!own?{source:{url:doc.github.url,branch:doc.github.branch,path:doc.github.path,sha:doc.github.sha,baseContent:doc.content}}:{}),...(doc.folderPath?{folderPath:doc.folderPath}:{}),...(doc.pinned===undefined?{}:{pinned:doc.pinned}),...(own ? {github:doc.github} : {})}); added++;
  }
  result.folders = result.folders.filter(f=>!oldFolders.has(f.id)||result.notes.some(n=>n.folderId===f.id)||result.folders.some(c=>c.parentId===f.id));
  return { workspace: result, added, updated, conflicts };
}

export function withFolderPaths(workspace:Workspace):Workspace {
  return {...workspace,notes:workspace.notes.map(note=>{
    const path:string[]=[]; let id=note.folderId; const visited=new Set<string>();
    while(id && !visited.has(id)){visited.add(id);const folder=workspace.folders.find(f=>f.id===id);if(!folder)break;path.unshift(folder.name);id=folder.parentId || null;}
    return {...note,folderPath:path};
  })};
}

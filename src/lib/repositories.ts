export type Visibility='public'|'private';
export interface RepositoryConfig {mode?:'local'|'cloud';system:string;public:string;private:string;publicBranch:string;privateBranch:string}
export const DEFAULT_REPOSITORIES:RepositoryConfig={mode:'cloud',system:'https://github.com/Jianglllri/Notess',public:'https://github.com/Jianglllri/notes-public',private:'https://github.com/Jianglllri/notes-private',publicBranch:'main',privateBranch:'main'};
export function repositoryUrl(value:string,optional=false){
 if(optional&&!value.trim())return '';
 const u=new URL(value.trim());const parts=u.pathname.split('/').filter(Boolean);
 if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||parts.length!==2||u.search||u.hash||!parts.every(p=>/^[\w.-]+$/.test(p)))throw new Error('请填写 GitHub 仓库主页链接。');
 return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/,'')}`;
}
export function validateRepositories(value:RepositoryConfig):RepositoryConfig{
 const result:RepositoryConfig={mode:value.mode==='local'?'local':'cloud',system:repositoryUrl(value.system),public:repositoryUrl(value.public,true),private:repositoryUrl(value.private,true),publicBranch:value.publicBranch.trim(),privateBranch:value.privateBranch.trim()};
 if(result.public&&result.private&&result.public.toLowerCase()===result.private.toLowerCase())throw new Error('公开与私密笔记必须使用不同仓库。');
 if(!result.publicBranch||!result.privateBranch||result.publicBranch.length>250||result.privateBranch.length>250)throw new Error('请填写有效分支名。');return result;
}
export function getRepositories():RepositoryConfig{try{return validateRepositories({...DEFAULT_REPOSITORIES,...JSON.parse(localStorage.getItem('zhiye-repositories')||'{}')});}catch{return {...DEFAULT_REPOSITORIES};}}
export async function configureDesktop(){const c=getRepositories();if(typeof window!=='undefined'&&window.zhiye?.configureRepositories)await window.zhiye.configureRepositories(c);}
export async function saveRepositories(config:RepositoryConfig){const c=validateRepositories(config);if(typeof window!=='undefined'&&window.zhiye?.configureRepositories)await window.zhiye.configureRepositories(c);localStorage.setItem('zhiye-repositories',JSON.stringify(c));window.dispatchEvent(new Event('zhiye-repositories-changed'));}
export function noteDestination(note:{visibility?:Visibility}){const c=getRepositories(),visibility=note.visibility||'public';return {url:c[visibility],branch:c[visibility==='private'?'privateBranch':'publicBranch'],visibility};}
export function isNotesRepository(url:string){return ['https://github.com/Jianglllri/Notess',getRepositories().public,getRepositories().private].filter(Boolean).some(r=>r.toLowerCase()===url.toLowerCase());}
let sessionToken='';
export function setSessionToken(value:string){sessionToken=value.trim();}
export function getSessionToken(){return sessionToken;}

export function cloudEnabled(){return getRepositories().mode!=='local';}

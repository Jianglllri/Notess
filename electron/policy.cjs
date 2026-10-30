/* eslint-disable no-control-regex -- Reject control characters at the IPC boundary. */
const repoURL = value => {
  if(typeof value!=='string'||!/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(value))throw Error('仓库链接无效');
  const u=new URL(value);
  if(u.href!==value||['.','..'].includes(u.pathname.split('/')[2]))throw Error('仓库链接无效');
  return value;
};
function configuration(input){
  if(!input||!['local','cloud'].includes(input.mode))throw Error('同步模式无效');
  const c={mode:input.mode,system:repoURL(input.system),public:input.public?repoURL(input.public):'',private:input.private?repoURL(input.private):'',publicBranch:input.publicBranch,privateBranch:input.privateBranch};
  if(c.public&&c.public.toLowerCase()===c.private.toLowerCase())throw Error('公开与私密仓库不能相同');
  for(const branch of [c.publicBranch,c.privateBranch])if(typeof branch!=='string'||!branch||branch.length>250||/[\x00-\x20~^:?*[\\]/.test(branch)||branch.includes('..'))throw Error('分支无效');
  return c;
}
function validateContent(content,role,path){
  if(path==='.zhiye/imports.json'){
    const manifest=JSON.parse(content);
    if(manifest.version!==1||!Array.isArray(manifest.entries))throw Error('无效导入清单');
    for(const entry of manifest.entries)if(entry.record)validateContent(entry.record,role,entry.path);
    return;
  }
  const match=content.match(/^<!-- zhiye:(.+) -->\n/);
  if(!match||JSON.parse(match[1]).visibility!==role)throw Error('正文隐私标记与目标仓库不符');
}
function authorize(config,request){
  if(!config||!request||typeof request.path!=='string'||typeof request.body!=='string'||request.body.length>16_000_000)throw Error('请求无效');
  const u=new URL('https://api.github.com'+request.path);
  if(u.origin!=='https://api.github.com'||u.pathname+u.search!==request.path||u.hash||/[\\\x00-\x20]/.test(request.path))throw Error('请求路径无效');
  const segments=u.pathname.split('/').slice(1).map(decodeURIComponent);
  if(segments.some(s=>!s||s.includes('%')||s==='.'||s==='..'||/[\\\x00-\x1f]/.test(s)||s.split('/').some(p=>p==='.'||p==='..')))throw Error('请求路径无效');
  const [repos,owner,repo,...rest]=segments;
  if(repos!=='repos'||!owner||!repo||owner.includes('/')||repo.includes('/'))throw Error('请求仓库无效');
  const target=`https://github.com/${owner}/${repo}`;
  const role=['public','private','system'].find(k=>config[k].toLowerCase()===target.toLowerCase());
  if(!role)throw Error('仓库未授权');
  const suffix=rest.join('/');
  if(request.method==='GET'){
    if(suffix&&!/^(contents\/|git\/(trees|blobs|ref|commits)\/|commits\/|branches\/|releases\/)/.test(suffix))throw Error('读取路径未授权');
    return {target,role};
  }
  if(config.mode!=='cloud'||role==='system')throw Error('当前目标禁止写入');
  const body=JSON.parse(request.body),branch=config[role+'Branch'];
  if(u.search)throw Error('写入路径无效');
  if(request.method==='PUT'&&suffix.startsWith('contents/')){
    if(body.branch!==branch||typeof body.content!=='string')throw Error('写入分支无效');
    validateContent(Buffer.from(body.content,'base64').toString('utf8'),role,rest.slice(1).join('/'));
  }else if(request.method==='POST'&&['git/trees','git/commits'].includes(suffix)){
    if(suffix==='git/trees'&&(!Array.isArray(body.tree)||body.tree.length>2||body.tree.some(f=>typeof f.path!=='string'||f.path.split('/').some(s=>!s||s==='.'||s==='..')||f.type!=='blob'||f.mode!=='100644'||typeof f.content!=='string')))throw Error('无效提交树');
    if(suffix==='git/trees')for(const f of body.tree)validateContent(f.content,role,f.path);
    if(suffix==='git/commits'&&(!/^[a-f0-9]{40}$/.test(body.tree)||!Array.isArray(body.parents)||body.parents.length!==1||!/^[a-f0-9]{40}$/.test(body.parents[0])))throw Error('无效提交');
  }else if(request.method==='PATCH'&&suffix===`git/refs/heads/${branch}`){
    if(body.force!==false||!/^[a-f0-9]{40}$/.test(body.sha))throw Error('禁止强制覆盖分支');
  }else throw Error('写入路径未授权');
  return {target,role};
}
module.exports={configuration,authorize};

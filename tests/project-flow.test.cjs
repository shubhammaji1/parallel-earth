const {test,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Store,Service,git,projectHistory,homeMarkup,parseHomeMessage}=require('../dist/index.js');
const roots=[];
async function fixture(){
  const base=path.resolve('artifacts/project-flow-tests');await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,'flow-'));roots.push(root);
  const repo=path.join(root,'my-project');await fs.mkdir(repo);
  await git(repo,['init']);await git(repo,['config','core.autocrlf','false']);await git(repo,['config','user.name','Flow Test']);await git(repo,['config','user.email','test@localhost']);
  await fs.writeFile(path.join(repo,'file.txt'),'original\n');await git(repo,['add','.']);await git(repo,['commit','-m','baseline']);
  const service=new Service(new Store(path.join(root,'storage'))),exp=await service.createExperiment(repo,'User experiment');
  return {root,repo,service,exp};
}
after(async()=>{for(const root of roots){assert.equal(path.dirname(root),path.resolve('artifacts/project-flow-tests'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}});
function fake(repo,name,created,complete=true){
  const id=randomUUID();return{id,name,repository:repo,baselineCommit:'a'.repeat(40),created,
  earths:complete?[{id:randomUUID(),experimentId:id,name:'Baseline',baseline:true,archived:false,sourceCommit:'a'.repeat(40),path:'/owned',created,runs:[]}]:[]};
}
test('history groups real projects, excludes incomplete attempts, and sorts newest first',()=>{
  const a=fake(path.resolve('shop'),'First','2026-10-26T00:00:00Z');
  const b=fake(path.resolve('shop'),'Latest','2026-10-27T00:00:00Z');
  const c=fake(path.resolve('other'),'Other','2026-10-25T00:00:00Z');
  const incomplete=fake(path.resolve('failed'),'Interrupted','2026-10-27T01:00:00Z',false);
  const history=projectHistory({version:1,experiments:[a,c,b,incomplete]});
  assert.equal(history.length,2);assert.equal(history[0].name,'shop');
  assert.deepEqual(history[0].experiments.map(e=>e.name),['Latest','First']);
  assert.deepEqual(projectHistory({version:1,experiments:[]}),[]);
});
test('home has a genuine empty state, escaped project cards and restrictive CSP',()=>{
  const empty=homeMarkup([],'safe-logo','vscode-webview:','nonce-123');
  assert.match(empty,/No projects yet/);assert.doesNotMatch(empty,/nanighar|development-demo/);
  assert.match(empty,/default-src &#39;none&#39;|default-src 'none'/);
  const e=fake('/project/<img src=x onerror=alert(1)>','<script>alert(1)</script>','2026-10-27T00:00:00Z');
  const page=homeMarkup([{repository:e.repository,name:'<svg onload=alert(1)>',experiments:[e]}],'safe-logo','vscode-webview:','nonce-123');
  assert.doesNotMatch(page,/<svg onload|<img src=x|<script>alert/);
  assert.ok(page.includes('\\u003cscript\\u003e'));assert.match(page,/nonce="nonce-123"/);
});
test('home messages accept only the explicit protocol',()=>{
  const id=randomUUID();assert.deepEqual(parseHomeMessage({action:'open',experimentId:id}),{action:'open',experimentId:id});
  assert.deepEqual(parseHomeMessage({action:'create'}),{action:'create'});
  for(const message of [{action:'exec',command:'bad'},{action:'open',experimentId:'../../escape'},{action:'create',extra:1},null,[],Object.assign(Object.create({action:'create'}),{unexpected:true})])assert.equal(parseHomeMessage(message),undefined);
});
test('removing history requires consent, retains dirty Earth files and never resurrects deleted records',async()=>{
  const f=await fixture(),earth=await f.service.createEarth(f.exp.id,'Keep my work');
  await fs.writeFile(path.join(earth.path,'file.txt'),'my edits\n');
  await assert.rejects(()=>f.service.deleteExperiment(f.exp.id,false),/confirmation/);
  await f.service.deleteExperiment(f.exp.id,true,true);
  assert.equal((await f.service.store.load()).experiments.length,0);
  assert.equal(await fs.readFile(path.join(earth.path,'file.txt'),'utf8'),'my edits\n');
  await f.service.recover();assert.equal((await f.service.store.load()).experiments.length,0);
  assert.equal(await fs.readFile(path.join(f.repo,'file.txt'),'utf8'),'original\n');
});
test('clean deletion preflights every Earth before removing baseline or alternatives',async()=>{
  const f=await fixture(),earth=await f.service.createEarth(f.exp.id,'Dirty alternative');
  await fs.writeFile(path.join(earth.path,'file.txt'),'preserve\n');
  await assert.rejects(()=>f.service.deleteExperiment(f.exp.id,true,false),/changed/);
  await fs.access(f.exp.earths[0].path);
  assert.equal((await f.service.store.load()).experiments[0].earths.length,2);
  await fs.writeFile(path.join(earth.path,'file.txt'),'original\n');
  await f.service.deleteExperiment(f.exp.id,true,false);
  assert.equal((await f.service.store.load()).experiments.length,0);
  await assert.rejects(()=>fs.access(earth.path));
  assert.equal(await fs.readFile(path.join(f.repo,'file.txt'),'utf8'),'original\n');
});
test('empty startup creates no automatic project or experiment',async()=>{
  const workspace=JSON.parse(await fs.readFile('artifacts/ParallelEarth.code-workspace','utf8'));
  assert.deepEqual(workspace.folders,[]);
  const prep=await fs.readFile('scripts/prepare-dev.cjs','utf8');
  assert.doesNotMatch(prep,/createExperiment|createEarth|git\(|fs\.cp/);
});


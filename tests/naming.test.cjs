const {test,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {slug,earthDirectory,isEarthPath,earthWorkspace,git,Store,Service,createWorktree,assertOwned}=require('../dist/index.js');
const roots=[];
async function temp(){const base=path.resolve('artifacts/naming-test-fixtures');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'naming-'));roots.push(root);return root;}
after(async()=>{for(const root of roots){assert.equal(path.dirname(root),path.resolve('artifacts/naming-test-fixtures'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}});
test('new folder names are readable, bounded and traversal-safe',()=>{
  const id=randomUUID();
  assert.equal(earthDirectory(path.resolve('nanighar'),'Test Change',id),'nanighar--test-change--'+id.slice(0,8));
  assert.equal(slug('../../CON: "a\\b"'),'con-a-b');
  assert.ok(slug('a'.repeat(200)).length<=28);
  const root=path.resolve('storage');
  assert.ok(isEarthPath(root,id,path.join(root,'earths',earthDirectory('nanighar','Test Change',id))));
  assert.ok(isEarthPath(root,id,path.join(root,'earths',id)));
  assert.equal(isEarthPath(root,id,path.join(root,'earths','../outside--'+id.slice(0,8))),false);
  assert.equal(isEarthPath(root,id,path.join(root,'earths','nanighar--other--00000000')),false);
});
test('workspace labels identify the Earth while preserving its existing UUID path',async()=>{
  const root=await temp(),id=randomUUID(),original=path.join(root,'earths',id);
  const earth={id,name:'Readable Earth',path:original};
  const file=await earthWorkspace(root,path.resolve('nanighar'),earth);
  const data=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(path.basename(file),'nanighar--readable-earth.code-workspace');
  assert.equal(data.folders[0].path,original);
  assert.match(data.folders[0].name,/Earth: Readable Earth/);
  assert.match(data.settings['window.title'],/ParallelEarth \| Readable Earth \| nanighar/);
  await assert.rejects(()=>fs.access(original)); // Generating labels does not move or create worktree files.
});
test('named worktrees retain Git ownership, recovery and cleanup compatibility',async()=>{
  const root=await temp(),repo=path.join(root,'shop');
  await fs.mkdir(repo);
  await git(repo,['init']);await git(repo,['config','core.autocrlf','false']);await git(repo,['config','user.name','Naming Test']);await git(repo,['config','user.email','test@localhost']);
  await fs.writeFile(path.join(repo,'readme.txt'),'original\n');await git(repo,['add','.']);await git(repo,['commit','-m','baseline']);
  const service=new Service(new Store(path.join(root,'storage'))),exp=await service.createExperiment(repo,'Folder naming');
  const earth=await service.createEarth(exp.id,'Test Change');
  assert.match(path.basename(earth.path),/^shop--test-change--[0-9a-f]{8}$/);
  await service.owned(earth);
  assert.match((await service.recover()).join('\n'),/registered/);
  // Original UUID directories remain valid for catalogs created by 0.1.0.
  const legacy=randomUUID(),legacyPath=await createWorktree(repo,service.store.root,legacy,exp.baselineCommit);
  await assertOwned(repo,service.store.root,legacy,legacyPath);
  await service.remove(earth,true);
  assert.equal(await fs.readFile(path.join(repo,'readme.txt'),'utf8'),'original\n');
});
test('F5 explicitly targets a blank workspace without a demo',async()=>{
  const config=JSON.parse(await fs.readFile('.vscode/launch.json','utf8')).configurations[0];
  assert.ok(config.args.some(a=>a.endsWith('/artifacts/ParallelEarth.code-workspace')));
  assert.ok(config.args.includes('--new-window'));
  assert.ok(config.args.every(a=>!a.includes('development-demo')));
  assert.ok(config.args.includes('--disable-extensions'));
  assert.ok(config.args.every(a=>!a.toLowerCase().includes('nanighar')));
  assert.equal(config.preLaunchTask,'npm: dev:prepare');
});
test('branding uses a real PNG and packaging no longer overwrites it',async()=>{
  const png=await fs.readFile('media/icon.png');
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
  assert.ok((await fs.stat('media/parallel-earth-logo.png')).size>1000);
  assert.doesNotMatch(await fs.readFile('scripts/icon.cjs','utf8'),/writeFileSync/);
});


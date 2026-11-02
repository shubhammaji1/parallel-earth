const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Service,Store,Runner,git,workingHash,compare}=require('../dist/index.js');
async function fixture(fn){
 const parent=path.resolve('artifacts/test-fixtures');await fs.mkdir(parent,{recursive:true});
 const root=await fs.realpath(await fs.mkdtemp(path.join(parent,'earth-v03-')));
 try{
  const repo=path.join(root,'repo');await fs.mkdir(repo);await git(repo,['init']);
  await git(repo,['config','user.name','Test']);await git(repo,['config','user.email','test@localhost']);await git(repo,['config','core.autocrlf','false']);
  await fs.writeFile(path.join(repo,'.gitignore'),'ignored/\n');await fs.writeFile(path.join(repo,'value.txt'),'original\n');await fs.writeFile(path.join(repo,'removed.txt'),'remove me');
  await fs.writeFile(path.join(repo,'check.cjs'),"const {test}=require('node:test');test('passes',()=>{});");
  await git(repo,['add','.']);await git(repo,['commit','-m','initial']);
  const service=new Service(new Store(path.join(root,'storage'))),exp=await service.createExperiment(repo,'Test'),earth=await service.createEarth(exp.id,'Alternative');
  await fn({repo,service,exp,earth});
 }finally{
  assert.equal(path.dirname(root),await fs.realpath(parent));assert.ok(path.basename(root).startsWith('earth-v03-'));
  await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
const options={approved:true,trusted:true,timeoutMs:10000,maxBytes:4096};
const command={program:'node',args:['--test','check.cjs'],label:'test'};
test('duplicate current Earth preserves committed, staged, unstaged, deleted and binary new files without changing source index',()=>fixture(async({service,exp,earth})=>{
 await fs.writeFile(path.join(earth.path,'value.txt'),'committed\n');await git(earth.path,['add','.']);await git(earth.path,['commit','-m','Earth commit']);
 await fs.writeFile(path.join(earth.path,'value.txt'),'staged\n');await git(earth.path,['add','.']);await fs.writeFile(path.join(earth.path,'value.txt'),'current\n');
 await fs.unlink(path.join(earth.path,'removed.txt'));await fs.writeFile(path.join(earth.path,'new binary.bin'),Buffer.from([0,255,0,128]));
 await fs.mkdir(path.join(earth.path,'ignored'));await fs.writeFile(path.join(earth.path,'ignored','secret'),'private');
 const indexBefore=await git(earth.path,['diff','--cached','--binary']);const head=await git(earth.path,['rev-parse','HEAD']);
 const copy=await service.duplicateCurrent(earth,'Copy');
 assert.equal(await fs.readFile(path.join(copy.path,'value.txt'),'utf8'),'current\n');assert.deepEqual(await fs.readFile(path.join(copy.path,'new binary.bin')),Buffer.from([0,255,0,128]));
 await assert.rejects(fs.access(path.join(copy.path,'removed.txt')));await assert.rejects(fs.access(path.join(copy.path,'ignored','secret')));
 assert.deepEqual(copy.runs,[]);assert.equal((await git(copy.path,['rev-parse','HEAD'])).trim(),exp.baselineCommit);
 assert.equal(await git(earth.path,['diff','--cached','--binary']),indexBefore);assert.equal(await git(earth.path,['rev-parse','HEAD']),head);
}));
test('bring back creates a reviewable branch, preserves dirty source files/index and refuses overwrite or changed preview',()=>fixture(async({repo,service,earth})=>{
 await fs.writeFile(path.join(repo,'value.txt'),'source staged\n');await git(repo,['add','.']);await fs.writeFile(path.join(repo,'value.txt'),'source dirty\n');
 const sourceHead=await git(repo,['rev-parse','HEAD']),sourceIndex=await git(repo,['diff','--cached','--binary']);
 await fs.writeFile(path.join(earth.path,'value.txt'),'alternative\n');await fs.writeFile(path.join(earth.path,'new.txt'),'new');
 const preview=await service.previewBringBack(earth);assert.match(preview.preview,/new.txt/);
 const commit=await service.bringBack(earth,'parallel-earth/review',preview);
 assert.equal((await git(repo,['rev-parse','parallel-earth/review'])).trim(),commit);
 assert.equal(await git(repo,['show','parallel-earth/review:value.txt']),'alternative\n');assert.equal(await git(repo,['show','parallel-earth/review:new.txt']),'new');
 assert.equal(await fs.readFile(path.join(repo,'value.txt'),'utf8'),'source dirty\n');assert.equal(await git(repo,['diff','--cached','--binary']),sourceIndex);assert.equal(await git(repo,['rev-parse','HEAD']),sourceHead);
 await assert.rejects(service.bringBack(earth,'parallel-earth/review',preview));assert.equal((await git(repo,['rev-parse','parallel-earth/review'])).trim(),commit);
 await fs.writeFile(path.join(earth.path,'new.txt'),'changed');await assert.rejects(service.bringBack(earth,'changed',preview),/changed after preview/);
 for(const branch of ['--bad','../escape','HEAD'])await assert.rejects(service.bringBack(earth,branch,preview));
}));
test('live comparison catches tracked, untracked-content and baseline changes; legacy evidence is unknown',()=>fixture(async({service,exp,earth})=>{
 const baseline=exp.earths[0],runner=new Runner();await fs.writeFile(path.join(earth.path,'new.txt'),'one');
 for(const e of [baseline,earth])await service.record(e,await runner.run(e.id,e.path,command,options));
 const load=async()=> (await service.store.load()).experiments[0];
 assert.equal((await service.report(await load())).earths[1].freshness,'CURRENT');
 const before=await workingHash(earth.path);await fs.writeFile(path.join(earth.path,'new.txt'),'two');assert.notEqual(await workingHash(earth.path),before);
 let report=await service.report(await load());assert.equal(report.earths[1].outcome,'STALE');assert.equal(report.earths[1].comparable,false);
 await fs.writeFile(path.join(earth.path,'new.txt'),'one');await fs.writeFile(path.join(baseline.path,'value.txt'),'baseline edited');
 report=await service.report(await load());assert.equal(report.earths[1].freshness,'CURRENT');assert.equal(report.earths[1].baselineFreshness,'STALE');assert.equal(report.earths[1].outcome,'STALE');
 const legacy=await load();legacy.earths[1].runs[0].changesHash='old-hash';report=await service.report(legacy);assert.equal(report.earths[1].freshness,'UNKNOWN');
 assert.equal(compare(legacy).earths[1].freshness,'NOT_CHECKED');
}));
test('a command that modifies files invalidates its own evidence even after files are restored',()=>fixture(async({service,earth})=>{
 await fs.writeFile(path.join(earth.path,'check.cjs'),"const {test}=require('node:test');test('mutates',()=>require('node:fs').writeFileSync('value.txt','mutated'));");
 const run=await new Runner().run(earth.id,earth.path,command,options);assert.equal(run.state,'PASSED');assert.equal(run.changedDuringRun,true);
 await fs.writeFile(path.join(earth.path,'value.txt'),'original\n');
 await service.record(earth,run);assert.equal((await service.freshness((await service.store.load()).experiments[0].earths[1]))[run.id],'STALE');
}));
test('release commands have matching handlers and context menus',async()=>{
 const pkg=JSON.parse(await fs.readFile('package.json','utf8')),code=await fs.readFile('src/extension.ts','utf8');assert.equal(pkg.version,'0.3.0');
 for(const command of ['bringChangesBack','duplicateEarth']){assert.ok(pkg.contributes.commands.some(c=>c.command==='parallelEarth.'+command));assert.ok(pkg.contributes.menus['view/item/context'].some(c=>c.command==='parallelEarth.'+command));assert.ok(code.includes('async '+command+'(item)'));}
});

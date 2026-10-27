const {test,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec=promisify(execFile);
const {Store,Service,Runner,git,resolveCommit,contained,patchPaths,applyPatch,validateCatalog,validateCommand,compare,markdown}=require('../dist/index.js');
const roots=[];
async function fixture(label='répo with space') {
  const base=path.resolve('artifacts/test-fixtures');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'parallel-earth-'));roots.push(root);
  const repo=path.join(root,label);await fs.mkdir(repo);
  await git(repo,['init']);await git(repo,['config','core.autocrlf','false']);await git(repo,['config','user.email','test@localhost']);await git(repo,['config','user.name','Test']);
  await fs.writeFile(path.join(repo,'value.txt'),'before\n');
  await fs.writeFile(path.join(repo,'.gitignore'),'node_modules/\n');
  await fs.writeFile(path.join(repo,'check.cjs'),"const {test}=require('node:test');const assert=require('node:assert/strict');test('value',()=>assert.equal(require('node:fs').readFileSync('value.txt','utf8'),'before\\n'));\n");
  await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({scripts:{test:'node --test check.cjs'}}));
  await git(repo,['add','.']);await git(repo,['commit','-m','fixture']);
  const service=new Service(new Store(path.join(root,'storage')));
  const exp=await service.createExperiment(repo,'Experiment');
  return {root,repo,service,exp,baseline:exp.earths[0]};
}
after(async()=>{
  for(const root of roots) {
    const absolute=path.resolve(root);
    // Only delete exact temporary directories created by this test process.
    assert.equal(path.dirname(absolute),path.resolve('artifacts/test-fixtures'));
    assert.ok(path.basename(absolute).startsWith('parallel-earth-'));
    await fs.rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
const opts={approved:true,trusted:true,timeoutMs:10000,maxBytes:65536};
const command={program:'node',args:['--test','check.cjs'],label:'test'};
test('path guards reject escapes and unsupported patch syntax',()=>{
  assert.equal(contained('/root/a','/root/ab'),false);
  for(const p of ['../escape','.git/config','folder\\evil','C:/evil','name.']) {
    assert.throws(()=>patchPaths('diff --git a/'+p+' b/'+p+'\n--- a/'+p+'\n+++ b/'+p+'\n@@ -1 +1 @@\n-a\n+b\n'));
  }
  assert.throws(()=>patchPaths('diff --git a/link b/link\nnew file mode 120000\n--- /dev/null\n+++ b/link\n+x'));
  assert.throws(()=>patchPaths('x'.repeat(1048577)));
});
test('command validation rejects shell metacharacters and traversal',()=>{
  for(const script of ['test & whoami','test;echo','$(whoami)','--ignore-scripts','test"'])assert.throws(()=>validateCommand({program:'npm',args:['run',script],label:'bad'}));
  assert.throws(()=>validateCommand({program:'node',args:['--test','../bad.js'],label:'bad'}));
  assert.throws(()=>validateCommand({program:'bash',args:['-c','echo'],label:'bad'}));
});
test('corrupted and future catalogs are refused without overwriting',async()=>{
  const f=await fixture();const file=path.join(f.service.store.root,'catalog.json');
  await fs.writeFile(file,'{bad');
  await assert.rejects(()=>f.service.store.load(),/corrupt/);
  assert.equal(await fs.readFile(file,'utf8'),'{bad');
  assert.throws(()=>validateCatalog({version:2,experiments:[]}));
});
test('real worktrees preserve dirty originals, support Unicode paths, names, persistence and recovery',async()=>{
  const f=await fixture();await fs.writeFile(path.join(f.repo,'value.txt'),'dirty original\n');await fs.writeFile(path.join(f.repo,'private.env'),'secret');
  const earth=await f.service.createEarth(f.exp.id,'Alternative');
  assert.equal(await fs.readFile(path.join(earth.path,'value.txt'),'utf8'),'before\n');
  await assert.rejects(()=>fs.access(path.join(earth.path,'private.env')));
  assert.equal(await fs.readFile(path.join(f.repo,'value.txt'),'utf8'),'dirty original\n');
  assert.equal((await git(earth.path,['symbolic-ref','-q','HEAD']).catch(()=>'')),'');
  await f.service.update(earth,{name:'Renamed'});await f.service.update(earth,{archived:true});
  const loaded=await new Store(f.service.store.root).load();assert.equal(loaded.experiments[0].earths[1].name,'Renamed');
  assert.equal(loaded.experiments[0].earths[1].archived,true);
  assert.match((await f.service.recover()).join('\n'),/registered/);
  assert.equal(await resolveCommit(f.repo,'HEAD'),f.exp.baselineCommit);
  await assert.rejects(()=>resolveCommit(f.repo,'--help'));
});
test('patch is checked then applied only inside the Earth; malformed patches are atomic failures',async()=>{
  const f=await fixture();const earth=await f.service.createEarth(f.exp.id,'Patch');
  const patch='diff --git a/value.txt b/value.txt\n--- a/value.txt\n+++ b/value.txt\n@@ -1 +1 @@\n-before\n+after\n';
  await applyPatch(earth.path,patch);
  assert.equal(await fs.readFile(path.join(earth.path,'value.txt'),'utf8'),'after\n');
  assert.equal(await fs.readFile(path.join(f.repo,'value.txt'),'utf8'),'before\n');
  await assert.rejects(()=>applyPatch(earth.path,patch));
  assert.equal(await fs.readFile(path.join(earth.path,'value.txt'),'utf8'),'after\n');
});
test('cleanup refuses dirty trees, baseline, wrong ownership, commits and absent consent',async()=>{
  const f=await fixture();const earth=await f.service.createEarth(f.exp.id,'Delete');
  await assert.rejects(()=>f.service.remove(earth,false),/confirmation/);
  await assert.rejects(()=>f.service.remove(f.baseline,true),/Baseline/);
  await assert.rejects(()=>f.service.owned({...earth,path:f.repo}),/Unknown/);
  await fs.writeFile(path.join(earth.path,'value.txt'),'keep');
  await assert.rejects(()=>f.service.remove(earth,true),/changed/);
  await fs.writeFile(path.join(earth.path,'value.txt'),'before\n');
  await f.service.remove(earth,true);await assert.rejects(()=>fs.access(earth.path));
  assert.equal(await fs.readFile(path.join(f.repo,'value.txt'),'utf8'),'before\n');
});
test('storage inside a repository is refused and symlink cleanup escape is blocked',async()=>{
  const f=await fixture();
  const nested=new Service(new Store(path.join(f.repo,'storage')));
  await assert.rejects(()=>nested.createExperiment(f.repo,'Bad'),/outside/);
  const earth=await f.service.createEarth(f.exp.id,'Link');
  const link=path.join(f.root,'linked-storage');
  try {await fs.symlink(f.service.store.root,link,process.platform==='win32'?'junction':'dir');}
  catch(e) {if(e.code==='EPERM')return;throw e;}
  await assert.rejects(()=>new Store(link).load(),/Symlink/);
  await assert.rejects(()=>f.service.owned({...earth,path:path.join(link,'earths',earth.id)}));
});
test('approved execution yields real pass, regression and NOT_RUN evidence',async()=>{
  const f=await fixture();const runner=new Runner();
  await assert.rejects(()=>runner.run(f.baseline.id,f.baseline.path,command,{...opts,approved:false}),/approval/);
  await assert.rejects(()=>runner.run(f.baseline.id,f.baseline.path,command,{...opts,trusted:false}),/Trust/);
  const baseline=await runner.run(f.baseline.id,f.baseline.path,command,opts);assert.equal(baseline.state,'PASSED');await f.service.record(f.baseline,baseline);
  const good=await f.service.createEarth(f.exp.id,'Good'),bad=await f.service.createEarth(f.exp.id,'Regression');
  await f.service.createEarth(f.exp.id,'Unverified');
  await f.service.record(good,await runner.run(good.id,good.path,command,opts));
  await fs.writeFile(path.join(bad.path,'value.txt'),'wrong\n');const failure=await runner.run(bad.id,bad.path,command,opts);
  assert.equal(failure.state,'FAILED');await f.service.record(bad,failure);
  const report=compare((await f.service.store.load()).experiments[0]);
  assert.deepEqual(report.earths.map(e=>e.outcome),['PASSED','PASSED','REGRESSION','NOT_RUN']);
  assert.match(markdown(report),/REGRESSION/);assert.ok(report.earths[2].latestRun.id);
  assert.equal(await fs.readFile(path.join(f.repo,'value.txt'),'utf8'),'before\n');
});
test('fingerprint mismatch and missing baseline remain INCONCLUSIVE',async()=>{
  const f=await fixture();const earth=await f.service.createEarth(f.exp.id,'Alternative');const runner=new Runner();
  await f.service.record(earth,await runner.run(earth.id,earth.path,command,opts));
  assert.equal(compare((await f.service.store.load()).experiments[0]).earths[1].outcome,'INCONCLUSIVE');
  await f.service.record(f.baseline,await runner.run(f.baseline.id,f.baseline.path,command,{...opts,timeoutMs:9000}));
  assert.equal(compare((await f.service.store.load()).experiments[0]).earths[1].outcome,'INCONCLUSIVE');
});
test('timeouts, cancellation, bounded output and npm Windows adapter execute for real',async()=>{
  const f=await fixture();const runner=new Runner();
  await fs.writeFile(path.join(f.baseline.path,'slow.cjs'),"require('node:test').test('slow',async()=>new Promise(r=>setTimeout(r,30000)));");
  const slow={program:'node',args:['--test','slow.cjs'],label:'slow'};
  assert.equal((await runner.run(f.baseline.id,f.baseline.path,slow,{...opts,timeoutMs:500})).state,'ERROR');
  const controller=new AbortController();
  const pending=runner.run(f.baseline.id,f.baseline.path,slow,{...opts,signal:controller.signal});
  setTimeout(()=>controller.abort(),700);
  assert.equal((await pending).state,'CANCELLED');
  await fs.writeFile(path.join(f.baseline.path,'large.cjs'),"console.log('x'.repeat(100000));");
  const large=await runner.run(f.baseline.id,f.baseline.path,{program:'node',args:['--test','large.cjs'],label:'output'},{...opts,maxBytes:4096});
  assert.equal(large.truncated,true);assert.ok(Buffer.byteLength(large.output)<=4096);
  const npm=await runner.run(f.baseline.id,f.baseline.path,{program:'npm',args:['run','test'],label:'test'},opts);
  assert.equal(npm.state,'PASSED',npm.output);
});
test('concurrency and atomic locking refuse competing mutation',async()=>{
  const f=await fixture();const lock=path.join(f.service.store.root,'catalog.lock');await fs.writeFile(lock,'busy');
  await assert.rejects(()=>f.service.createEarth(f.exp.id,'Blocked'),/busy/);await fs.unlink(lock);
  await fs.writeFile(path.join(f.baseline.path,'slow.cjs'),"require('node:test').test('slow',async()=>new Promise(r=>setTimeout(r,1000)));");
  const runner=new Runner();const pending=runner.run(f.baseline.id,f.baseline.path,{program:'node',args:['--test','slow.cjs'],label:'slow'},opts);
  await assert.rejects(()=>runner.run(f.baseline.id,f.baseline.path,command,opts),/Concurrency/);await pending;
});
test('creation journal recovers an orphaned worktree after simulated interrupted catalog write',async()=>{
  const f=await fixture();const earth=await f.service.createEarth(f.exp.id,'Recover me');
  await f.service.store.transaction(async catalog=>{catalog.experiments[0].earths=catalog.experiments[0].earths.filter(e=>e.id!==earth.id);});
  assert.match((await f.service.recover()).join('\n'),/Recovered: Recover me/);
  assert.equal((await f.service.store.load()).experiments[0].earths.length,2);
});




require('./build.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {Store,Service,Runner,git,compare,markdown}=require('../dist/index.js');
(async()=>{
  const artifact=path.resolve('artifacts');await fs.mkdir(artifact,{recursive:true});
  const root=await fs.mkdtemp(path.join(artifact,'booking-demo-'));
  const repo=path.join(root,'booking-repository');await fs.cp('examples/booking-reconciliation',repo,{recursive:true});
  await git(repo,['init']);await git(repo,['config','user.name','ParallelEarth Demo']);await git(repo,['config','user.email','demo@localhost']);
  await git(repo,['add','.']);await git(repo,['commit','-m','Booking baseline']);
  const service=new Service(new Store(path.join(root,'earth-storage')));
  const exp=await service.createExperiment(repo,'Booking reconciliation');
  const passing=await service.createEarth(exp.id,'A — Deduplicate correctly');
  const regression=await service.createEarth(exp.id,'B — Duplicate regression');
  const unverified=await service.createEarth(exp.id,'C — Not yet checked');
  for(const [earth,file]of [[passing,'passing.cts'],[regression,'regression.cts'],[unverified,'unverified.cts']])await fs.copyFile(path.join(repo,'alternatives',file),path.join(earth.path,'reconcile.cts'));
  const runner=new Runner(),command={program:'node',args:['--test','test/reconcile.test.cjs'],label:'booking-contracts'};
  // Invoking npm run demo explicitly authorizes only these three demo fixture check executions.
  for(const earth of [exp.earths[0],passing,regression])await service.record(earth,await runner.run(earth.id,earth.path,command,{approved:true,trusted:true,timeoutMs:10000,maxBytes:65536}));
  const current=(await service.store.load()).experiments[0],report=compare(current);
  assert.deepEqual(report.earths.map(e=>e.outcome),['PASSED','PASSED','REGRESSION','NOT_RUN']);
  const before=await fs.readFile(path.join(repo,'reconcile.cts'),'utf8');
  assert.equal(before,await fs.readFile('examples/booking-reconciliation/reconcile.cts','utf8'));
  await fs.writeFile(path.join(artifact,'booking-report.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(artifact,'booking-report.md'),markdown(report));
  await fs.writeFile(path.join(artifact,'demo-location.json'),JSON.stringify({root,repository:repo,storage:service.store.root,experimentId:exp.id},null,2));
  console.log('Real demo: '+report.earths.map(e=>e.name+': '+e.outcome).join('\n'));
  console.log('Demo retained at '+root);
})().catch(e=>{console.error(e);process.exitCode=1;});


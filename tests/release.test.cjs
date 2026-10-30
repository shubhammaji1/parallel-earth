const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {ExecutionQueue,compare,checkSeries,markdown,validateCommand,validateCatalog}=require('../dist/index.js');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function temp(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'earth-release-'));try{await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('independent queue instances serialize commands, release errors and cancel waiting work',()=>temp(async root=>{
 const a=new ExecutionQueue(root),b=new ExecutionQueue(root);let release,started;
 const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const first=a.execute('a',undefined,()=>{},async()=>{started();await gate;});await ready;
 let ran=false;const controller=new AbortController();
 const waiting=b.execute('b',controller.signal,()=>{},async()=>{ran=true;});
 await delay(30);assert.equal((await b.snapshot()).running.earthId,'a');controller.abort();
 await assert.rejects(waiting,/Cancelled/);assert.equal(ran,false);release();await first;
 await assert.rejects(a.execute('c',undefined,()=>{},async()=>{throw Error('failure');}),/failure/);
 assert.equal(await b.execute('d',undefined,()=>{},async()=>42),42);
 assert.deepEqual(await a.snapshot(),{running:undefined,queued:[]});
}));
test('shared queue serializes actual separate Node host processes',()=>temp(async root=>{
 const modulePath=path.resolve('dist/index.js'),worker=path.join(root,'worker.cjs');
 await fs.writeFile(worker,`const {ExecutionQueue}=require(${JSON.stringify(modulePath)});const fs=require('node:fs/promises');new ExecutionQueue(process.argv[2]).execute(process.argv[3],undefined,()=>{},async()=>{await fs.appendFile(process.argv[4],'start '+process.argv[3]+'\\n');await new Promise(r=>setTimeout(r,100));await fs.appendFile(process.argv[4],'end '+process.argv[3]+'\\n');}).catch(e=>{console.error(e);process.exitCode=1;});`);
 const log=path.join(root,'events');
 const launch=id=>new Promise((resolve,reject)=>{const child=fork(worker,[root,id,log],{stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('worker exit '+code)));});
 await Promise.all([launch('one'),launch('two'),launch('three')]);
 const lines=(await fs.readFile(log,'utf8')).trim().split('\n');assert.equal(lines.length,6);
 for(let i=0;i<6;i+=2)assert.equal(lines[i].replace('start','end'),lines[i+1]);
}));
const command={program:'npm',args:['run','test'],label:'test'};
function run(state,extra={}){return {id:randomUUID(),earthId:'a',state,command,fingerprint:'env',revision:'a'.repeat(40),changesHash:'hash',started:'2026-10-30T00:00:00.000Z',ended:'2026-10-30T00:00:01.000Z',durationMs:1000,exitCode:state==='PASSED'?0:1,limitation:'Exit status only',...extra};}
function earth(id,baseline,runs){return {id,name:id,baseline,path:'/earth/'+id,runs};}
test('repeats expose variation, incomplete evidence and changed revisions',()=>{
 const batchId=randomUUID();const series=[run('PASSED',{batchId,repeatIndex:1,repeatTotal:2}),run('FAILED',{batchId,repeatIndex:2,repeatTotal:2})];
 assert.equal(checkSeries(series).summary,'UNSTABLE');
 assert.equal(checkSeries(series.slice(0,1)).summary,'INCONCLUSIVE');
 assert.equal(checkSeries([series[0],{...series[1],revision:'b'.repeat(40)}]).summary,'INCONCLUSIVE');
 const baseline=[...series.map(r=>({...r,state:'PASSED'}))];
 const report=compare({id:'exp',name:'Test',repository:'/repo',baselineCommit:'a'.repeat(40),earths:[earth('base',true,baseline),earth('alt',false,series)]});
 assert.equal(report.earths[1].outcome,'UNSTABLE');assert.equal(report.earths[1].series.length,2);
 assert.match(markdown(report),/not benchmark/);assert.match(markdown(report),/Queue scope/);
 const differentBatch=series.map(r=>({...r,batchId:randomUUID()}));
 assert.equal(compare({earths:[earth('base',true,baseline),earth('alt',false,differentBatch)]}).earths[1].outcome,'INCONCLUSIVE');
});
test('setup never becomes passing check evidence and invalidates older checks',()=>{
 assert.throws(()=>validateCommand({program:'npm',args:['ci'],label:'install'}));
 assert.doesNotThrow(()=>validateCommand({program:'npm',args:['ci'],label:'install'},'setup'));
 const setup=run('PASSED',{kind:'setup',started:'2026-10-30T00:00:02Z',ended:'2026-10-30T00:00:03Z'});
 assert.equal(checkSeries([setup]).summary,'NOT_RUN');
 const report=compare({earths:[earth('base',true,[run('PASSED')]),earth('alt',false,[run('PASSED'),setup])]});
 assert.equal(report.earths[1].outcome,'INCONCLUSIVE');assert.equal(report.earths[1].setupStatus,'PASSED');
});
test('release commands are contributed with reachable context menus',async()=>{
 const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
 for(const suffix of ['copyEarthPath','revealEarthFolder','setupEarth','repeatChecks']){
  const id='parallelEarth.'+suffix;assert.ok(pkg.contributes.commands.some(c=>c.command===id));assert.ok(pkg.contributes.menus['view/item/context'].some(c=>c.command===id));
 }
});
test('approved setup executes and persists separately from checks in a real worktree',()=>temp(async root=>{
 const {Service,Store,Runner,git}=require('../dist/index.js');
 const repo=path.join(root,'repo');await fs.mkdir(repo);await git(repo,['init']);await git(repo,['config','user.name','Release test']);await git(repo,['config','user.email','test@localhost']);
 await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({scripts:{setup:'node setup.cjs'}}));
 await fs.writeFile(path.join(repo,'setup.cjs'),"require('node:fs').writeFileSync('ready.txt','ready');");
 await git(repo,['add','.']);await git(repo,['commit','-m','fixture']);
 const service=new Service(new Store(path.join(root,'storage'))),exp=await service.createExperiment(repo,'Setup');const earth=exp.earths[0];
 const command={program:'npm',args:['run','setup'],label:'setup'};
 const result=await new Runner().run(earth.id,earth.path,command,{approved:true,trusted:true,kind:'setup',timeoutMs:10000,maxBytes:4096});
 assert.equal(result.state,'PASSED',result.output);await service.record(earth,result);
 assert.equal(await fs.readFile(path.join(earth.path,'ready.txt'),'utf8'),'ready');
 const stored=(await service.store.load()).experiments[0];assert.equal(stored.earths[0].runs[0].kind,'setup');
 assert.equal(compare(stored).earths[0].outcome,'NOT_RUN');
}));

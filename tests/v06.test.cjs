const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {LifecycleService,Store,Runner,git,snapshot,PreviewHealth,probePreview,parseCoverage,changedLineCoverage,verifyRegression}=require('../dist/index.js');
const {recipeMarkup,parseRecipeMessage}=require('../dist/recipe-view.js');
const {NativeTests}=require('../dist/native-tests.js');
const {cli}=require('../dist/cli.js');
const {storageMarkup,parseStorageMessage}=require('../dist/storage-view.js');
const command={program:'npm',args:['run','test:json'],label:'test:json'},options={approved:true,trusted:true,timeoutMs:15000,maxBytes:8192};
async function fixture(fn){
 const parent=await fs.realpath(path.resolve('artifacts/test-fixtures'));
 const root=await fs.realpath(await fs.mkdtemp(path.join(parent,'earth-v06-')));
 try{
  const repo=path.join(root,'repo');await fs.mkdir(repo);await git(repo,['init']);await git(repo,['config','user.name','Test']);await git(repo,['config','user.email','test@localhost']);await git(repo,['config','core.autocrlf','false']);
  await fs.writeFile(path.join(repo,'.gitignore'),'ignored/\n');await fs.writeFile(path.join(repo,'value.txt'),'original\n');await fs.writeFile(path.join(repo,'other.txt'),'original other\n');await fs.writeFile(path.join(repo,'removed.txt'),'remove me');await fs.writeFile(path.join(repo,'src.js'),'one\ntwo\nthree\n');await fs.writeFile(path.join(repo,'sample.test.js'),'// identical regression test\n');
  await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({scripts:{'test:json':'node check.cjs'}}));
  await fs.writeFile(path.join(repo,'check.cjs'),`console.log(JSON.stringify({numTotalTests:1,testResults:[{name:'sample.test.js',assertionResults:[{fullName:'passes',status:'passed'}]}]}));`);
  await git(repo,['add','.']);await git(repo,['commit','-m','fixture']);const service=new LifecycleService(new Store(path.join(root,'storage'))),exp=await service.createExperiment(repo,'Lifecycle'),earth=await service.createEarth(exp.id,'Alternative');
  await fn({root,repo,service,exp,earth});
 }finally{assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('earth-v06-'));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
test('checkpoints restore staged/unstaged/deleted/binary files, keep HEAD, preserve backup and invalidate old evidence',()=>fixture(async({service,earth,exp})=>{
 await fs.writeFile(path.join(earth.path,'value.txt'),'staged\n');await git(earth.path,['add','.']);await fs.writeFile(path.join(earth.path,'value.txt'),'working\n');await fs.unlink(path.join(earth.path,'removed.txt'));await fs.writeFile(path.join(earth.path,'new.bin'),Buffer.from([0,255,3]));
 const index=await git(earth.path,['diff','--cached','--binary']),head=await git(earth.path,['rev-parse','HEAD']),cp=await service.createCheckpoint(earth,'Useful attempt');
 const run=await new Runner().run(earth.id,earth.path,command,options);await service.record(earth,run);
 await fs.writeFile(path.join(earth.path,'value.txt'),'next attempt');await fs.writeFile(path.join(earth.path,'later.txt'),'later');await fs.unlink(path.join(earth.path,'new.bin'));await git(earth.path,['add','.']);
 const preview=await service.previewRestore(earth,cp.id),backup=await service.restoreCheckpoint(earth,cp.id,preview);
 assert.equal(await fs.readFile(path.join(earth.path,'value.txt'),'utf8'),'working\n');assert.deepEqual(await fs.readFile(path.join(earth.path,'new.bin')),Buffer.from([0,255,3]));await assert.rejects(fs.access(path.join(earth.path,'removed.txt')));await assert.rejects(fs.access(path.join(earth.path,'later.txt')));
 assert.equal(await git(earth.path,['diff','--cached','--binary']),index);assert.equal(await git(earth.path,['rev-parse','HEAD']),head);
 const current=(await service.store.load()).experiments.find(e=>e.id===exp.id).earths.find(e=>e.id===earth.id);assert.equal((await service.freshness(current))[run.id],'STALE');assert.equal(current.checkpoints.length,2);
 const next=await new Runner().run(earth.id,earth.path,command,{...options,epoch:current.evidenceEpoch});await service.record(earth,next);const reloaded=(await service.store.load()).experiments.find(e=>e.id===exp.id).earths.find(e=>e.id===earth.id);assert.equal((await service.freshness(reloaded))[next.id],'CURRENT');
 assert.equal(await git(earth.path,['show','refs/parallel-earth/checkpoints/'+earth.id+'/'+backup.id+':value.txt']),'next attempt');
 await service.deleteCheckpoint(earth,cp.id);await assert.rejects(service.previewRestore(earth,cp.id));await assert.rejects(service.remove(earth,true),/checkpoints/);
}));
test('restore rejects edits after preview and refuses to overwrite an ignored file',()=>fixture(async({service,earth})=>{
 await fs.writeFile(path.join(earth.path,'private.txt'),'checkpoint copy');const cp=await service.createCheckpoint(earth,'Before ignore');await fs.unlink(path.join(earth.path,'private.txt'));
 await fs.writeFile(path.join(earth.path,'.gitignore'),'private.txt\n');await fs.writeFile(path.join(earth.path,'private.txt'),'ignored secret');const preview=await service.previewRestore(earth,cp.id);
 await assert.rejects(service.restoreCheckpoint(earth,cp.id,preview),/ignored file/);assert.equal(await fs.readFile(path.join(earth.path,'private.txt'),'utf8'),'ignored secret');
 await fs.writeFile(path.join(earth.path,'value.txt'),'changed after preview');await assert.rejects(service.restoreCheckpoint(earth,cp.id,preview),/changed after/);
}));
test('file selection excludes unrelated Earth commits and requires current passing checks before export',()=>fixture(async({service,earth,repo,exp})=>{
 await fs.writeFile(path.join(earth.path,'other.txt'),'excluded commit');await git(earth.path,['add','.']);await git(earth.path,['commit','-m','excluded']);
 await fs.writeFile(path.join(earth.path,'value.txt'),'selected');await fs.unlink(path.join(earth.path,'removed.txt'));await fs.writeFile(path.join(earth.path,'new.bin'),Buffer.from([0,7,255]));
 const selection=await service.selectionFiles(earth);await assert.rejects(service.prepareSelection(earth,['../escape'],selection.contents));
 const selected=await service.prepareSelection(earth,['value.txt','removed.txt','new.bin'],selection.contents);
 assert.equal((await git(selected.path,['rev-parse','HEAD'])).trim(),exp.baselineCommit);assert.equal(await fs.readFile(path.join(selected.path,'other.txt'),'utf8'),'original other\n');assert.equal(await fs.readFile(path.join(selected.path,'value.txt'),'utf8'),'selected');await assert.rejects(fs.access(path.join(selected.path,'removed.txt')));
 let preview=await service.previewBringBack(selected);await assert.rejects(service.bringBack(selected,'selected',preview),/passing current/);
 await service.record(selected,await new Runner().run(selected.id,selected.path,command,options));preview=await service.previewBringBack(selected);await service.bringBack(selected,'selected',preview);
 assert.equal(await git(repo,['show','selected:other.txt']),'original other\n');assert.equal((await git(repo,['rev-parse','selected^'])).trim(),exp.baselineCommit);
 await fs.writeFile(path.join(selected.path,'value.txt'),'later');await assert.rejects(service.bringBack(selected,'selected-later',await service.previewBringBack(selected)),/passing current/);
}));
test('baseline refresh carries clean changes into new worktrees and preserves the original experiment',()=>fixture(async({service,earth,repo,exp})=>{
 await fs.writeFile(path.join(earth.path,'value.txt'),'alternative');await fs.writeFile(path.join(repo,'other.txt'),'new baseline');await git(repo,['add','.']);await git(repo,['commit','-m','upstream']);const head=(await git(repo,['rev-parse','HEAD'])).trim();
 const next=await service.refreshBaseline(exp.id,head,[earth.id]);assert.notEqual(next.experiment.id,exp.id);assert.equal(next.experiment.baselineCommit,head);assert.deepEqual(next.results[0].conflicts,[]);
 assert.equal(await fs.readFile(path.join(next.results[0].earth.path,'value.txt'),'utf8'),'alternative');assert.equal(await fs.readFile(path.join(next.results[0].earth.path,'other.txt'),'utf8'),'new baseline');assert.deepEqual(next.results[0].earth.runs,[]);
 assert.equal(await fs.readFile(path.join(earth.path,'other.txt'),'utf8'),'original other\n');assert.equal((await service.store.load()).experiments.find(e=>e.id===exp.id).baselineCommit,exp.baselineCommit);
}));
test('baseline refresh retains conflict files for resolution and prevents unresolved check execution',()=>fixture(async({service,earth,repo,exp})=>{
 await fs.writeFile(path.join(earth.path,'value.txt'),'alternative\n');await fs.writeFile(path.join(repo,'value.txt'),'upstream\n');await git(repo,['add','.']);await git(repo,['commit','-m','upstream']);
 const next=await service.refreshBaseline(exp.id,'HEAD',[earth.id]);assert.ok(next.results[0].conflicts.includes('value.txt'));assert.match(await fs.readFile(path.join(next.results[0].earth.path,'value.txt'),'utf8'),/<<<<<<< /);
 await assert.rejects(new Runner().run(next.results[0].earth.id,next.results[0].earth.path,command,options),/Resolve merge conflicts/);assert.equal(await fs.readFile(path.join(earth.path,'value.txt'),'utf8'),'alternative\n');
}));
test('storage manager recovers valid run evidence, retains invalid records and refuses a live queue owner',()=>fixture(async({service,earth,root})=>{
 const run=await new Runner().run(earth.id,earth.path,command,options),recovery=path.join(service.store.root,'run-recovery');await fs.mkdir(recovery);await fs.writeFile(path.join(recovery,run.id+'.json'),JSON.stringify(run));const bad=randomUUID()+'.json';await fs.writeFile(path.join(recovery,bad),'invalid');
 const result=await service.recoverRuns();assert.ok(result.some(s=>s.includes('Recovered run')));await fs.access(path.join(recovery,bad));const overview=await service.storageOverview();assert.ok(overview.earths.find(e=>e.id===earth.id).bytes>0);assert.ok(overview.recoveryFiles.includes(bad));
 const active=path.join(service.store.root,'execution-queue','active');await fs.mkdir(active,{recursive:true});await fs.writeFile(path.join(active,'owner.json'),JSON.stringify({id:randomUUID(),earthId:earth.id,pid:process.pid,created:new Date().toISOString()}));await assert.rejects(service.recoverQueue(true),/dead owner/);
 await fs.writeFile(path.join(active,'owner.json'),JSON.stringify({id:randomUUID(),earthId:earth.id,pid:99999999,created:new Date().toISOString()}));await assert.rejects(service.recoverQueue(false));await service.recoverQueue(true);await assert.rejects(fs.access(active));
}));
test('changed-line coverage captures fresh Istanbul data and separates uncovered and unmeasured lines',()=>fixture(async({service,earth,exp})=>{
 await fs.writeFile(path.join(earth.path,'src.js'),'one\nchanged\nthree\nnew\n');const map={'src.js':{path:'src.js',statementMap:{a:{start:{line:2},end:{line:2}},b:{start:{line:4},end:{line:4}}},s:{a:1,b:0}}};
 const coverage=parseCoverage(JSON.stringify(map),earth.path);assert.equal(coverage.complete,true);let changed=await changedLineCoverage(earth.path,exp.baselineCommit,coverage,true);assert.equal(changed.covered,1);assert.equal(changed.uncovered,1);assert.equal(changed.percentage,50);
 assert.equal((await changedLineCoverage(earth.path,exp.baselineCommit,coverage,false)).state,'STALE');
 const payload=JSON.stringify(map);await fs.writeFile(path.join(earth.path,'check.cjs'),`require('node:fs').writeFileSync(process.env.PARALLEL_EARTH_COVERAGE,${JSON.stringify(payload)});console.log('done');`);
 const run=await new Runner().run(earth.id,earth.path,command,options);assert.equal(run.coverage.complete,true);await service.record(earth,run);const report=await service.report((await service.store.load()).experiments.find(e=>e.id===exp.id));assert.equal(report.earths.find(e=>e.id===earth.id).changedCoverage.uncovered,1);
 const external={a:{...map['src.js'],path:'../external.js'}};assert.equal(parseCoverage(JSON.stringify(external),earth.path).complete,false);assert.equal(parseCoverage(JSON.stringify(map),earth.path,true).complete,false);
 const multiline=parseCoverage(JSON.stringify({a:{path:'src.js',statementMap:{a:{start:{line:1},end:{line:4}}},s:{a:1}}}),earth.path);assert.deepEqual(multiline.files[0].lines,[{line:1,hits:1}]);
}));
test('regression verification needs identical tests, baseline failures and consistent passing candidate evidence',()=>{
 const test={id:'test',file:'sample.test.js',name:'bug',baseline:'FAILED',current:'PASSED',outcome:'IMPROVEMENT'},row={state:'PASSED',comparable:true,tests:[test]};
 assert.equal(verifyRegression(row,['test'],new Set(['sample.test.js'])).state,'VERIFIED');assert.equal(verifyRegression(row,['test'],new Set()).state,'INCONCLUSIVE');assert.equal(verifyRegression({...row,tests:[{...test,baseline:'PASSED'}]},['test'],new Set(['sample.test.js'])).state,'INCONCLUSIVE');assert.equal(verifyRegression({...row,tests:[{...test,current:'FAILED'}]},['test'],new Set(['sample.test.js'])).state,'FAILED');
 assert.equal(verifyRegression(row,['test'],new Set(['sample.test.js']),3).state,'INCONCLUSIVE');
});
test('CI regression recipes verify identical test sources and reject a changed test file',()=>fixture(async({root,repo})=>{
 await fs.writeFile(path.join(repo,'check.cjs'),`const pass=require('node:fs').readFileSync('value.txt','utf8')==='fixed';console.log(JSON.stringify({numTotalTests:1,testResults:[{name:'sample.test.js',assertionResults:[{fullName:'passes',status:pass?'passed':'failed'}]}]}));process.exitCode=pass?0:1;`);await git(repo,['add','.']);await git(repo,['commit','-m','regression suite']);const baseline=(await git(repo,['rev-parse','HEAD'])).trim();
 await fs.writeFile(path.join(repo,'value.txt'),'fixed');await git(repo,['add','.']);await git(repo,['commit','-m','fix']);let candidate=(await git(repo,['rev-parse','HEAD'])).trim();
 const recipe={version:1,name:'Verify fix',baseline,candidate,script:'test:json',repeat:2,regressionTests:[{file:'sample.test.js',name:'passes'}]},file=path.join(root,'recipe.json'),output=path.join(root,'regression-report.json');await fs.writeFile(file,JSON.stringify(recipe));
 const args=['ci','--repo',repo,'--storage',path.join(root,'ci-storage'),'--recipe',file,'--approve','--output',output],messages=[],io={out:s=>messages.push(s),err:s=>messages.push(s)};
 assert.equal(await cli(args,io),0,messages.join('\n'));let report=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(report.earths.find(e=>!e.baseline).regression.state,'VERIFIED');
 await fs.writeFile(path.join(repo,'sample.test.js'),'// changed assertions');await git(repo,['add','.']);await git(repo,['commit','-m','different tests']);recipe.candidate=(await git(repo,['rev-parse','HEAD'])).trim();recipe.repeat=1;await fs.writeFile(file,JSON.stringify(recipe));
 assert.equal(await cli(args,io),1);report=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(report.earths.find(e=>!e.baseline).regression.state,'INCONCLUSIVE');
}));
test('storage dashboard escapes paths and only accepts scoped recovery actions',()=>{
 const html=storageMarkup({root:'<script>x</script>',earths:[],orphanDirectories:['<img>'],recoveryFiles:[],queue:{queued:[]}},'nonce');assert.ok(!html.includes('<script>x</script>'));assert.ok(html.includes('&lt;img&gt;'));assert.equal(parseStorageMessage({action:'queue'}).action,'queue');assert.equal(parseStorageMessage({action:'cleanup',earthId:'../escape'}),undefined);assert.equal(parseStorageMessage({action:'runs',path:'outside'}),undefined);
});
test('preview health handles readiness, errors, recovery and terminal closure without late resurrection',async()=>{
 let ready=true;const history=[],health=new PreviewHealth('http://127.0.0.1:4300',s=>history.push(s.state),async()=>({ready,detail:ready?'HTTP 200':'connection refused'}));await health.check();assert.equal(health.status.state,'READY');ready=false;await health.check();assert.equal(health.status.state,'FAILED');ready=true;await health.check();assert.equal(health.status.state,'READY');health.stop();await health.check();assert.equal(health.status.state,'STOPPED');await assert.rejects(probePreview('http://example.com'),/loopback/);
 let release;const delayed=new PreviewHealth('http://127.0.0.1:4301',()=>{},()=>new Promise(r=>release=r));const pending=delayed.check();delayed.stop();release({ready:true,detail:'HTTP 200'});await pending;assert.equal(delayed.status.state,'STOPPED');
});
test('visual recipes validate messages, preserve mapped tests and escape hostile content',()=>{
 const recipe={version:1,name:'<script>alert(1)</script>',baseline:'HEAD~1',candidate:'HEAD',script:'test:json',repeat:3,criteria:[]};
 assert.equal(parseRecipeMessage({action:'save',recipe}).recipe.repeat,3);assert.equal(parseRecipeMessage({action:'run',recipe,extra:true}),undefined);assert.equal(parseRecipeMessage({action:'run',recipe:{...recipe,script:'test;echo evil'}}),undefined);
 const html=recipeMarkup({recipe,scripts:['test:json'],availableCriteria:[]},'nonce');assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('Content-Security-Policy'));assert.ok(html.includes('Save and run'));
});
test('visual recipe form posts validated settings and drops mappings for a different command',()=>{
 const vm=require('node:vm'),inputs=[],fields=new Map(),sent=[];
 const element=()=>({value:'',dataset:{},handlers:{},addEventListener(event,handler){this.handlers[event]=handler;},append(){},reportValidity(){return true;}});
 for(const id of ['name','baseline','candidate','script','setup','repeat','recipe','criteria','regression','status','run'])fields.set(id,element());
 const recipe={version:1,name:'Example',baseline:'HEAD~1',candidate:'HEAD',script:'test:json',repeat:3,regressionTests:[{file:'sample.test.js',name:'passes'}]};
 const html=recipeMarkup({recipe,scripts:['test:json','lint'],availableCriteria:[{label:'Fix bug',script:'test:json',tests:[{file:'sample.test.js',name:'passes'}]}],regressionScript:'test:json'},'nonce');
 const script=html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)[1];
 vm.runInNewContext(script,{acquireVsCodeApi:()=>({postMessage:message=>sent.push(message)}),document:{getElementById:id=>fields.get(id),createTextNode:value=>value,createElement:tag=>{const item=element();if(tag==='input')inputs.push(item);return item;},querySelectorAll:selector=>selector.includes(':checked')?inputs.filter(i=>i.checked):inputs}});
 fields.get('recipe').handlers.submit({preventDefault(){}});let message=parseRecipeMessage(JSON.parse(JSON.stringify(sent[0])));assert.equal(message.recipe.repeat,3);assert.equal(message.recipe.criteria.length,1);assert.equal(message.recipe.regressionTests.length,1);
 fields.get('script').value='lint';fields.get('script').handlers.input();fields.get('run').handlers.click();message=parseRecipeMessage(JSON.parse(JSON.stringify(sent[1])));assert.equal(message.recipe.script,'lint');assert.equal(message.recipe.criteria.length,0);assert.equal(message.recipe.regressionTests,undefined);
});
test('native Test Explorer publishes recorded results, skips stale evidence and reruns selected Earth suites',async()=>{
 const events=[],collection=()=>({map:new Map(),replace(){this.map.clear();},add(item){this.map.set(item.id,item);},forEach(fn){this.map.forEach(fn);}});let profile,rerun;
 const controller={items:collection(),createRunProfile(_name,_kind,fn){profile=fn;},createTestItem(id,label,uri){return {id,label,uri,children:collection()};},createTestRun(){return {started:item=>events.push(['start',item.id]),passed:item=>events.push(['passed',item.id]),failed:item=>events.push(['failed',item.id]),skipped:item=>events.push(['skipped',item.id]),end(){}};},invalidateTestResults(){events.push(['invalidate']);},dispose(){}};
 const api={tests:{createTestController:()=>controller},TestRunProfileKind:{Run:1},TestRunRequest:class{},TestMessage:class{constructor(message){this.message=message;}},Uri:{file:fsPath=>({fsPath})}};
 const native=new NativeTests(api,async ids=>{rerun=ids;});const row={id:'earth',name:'Alternative',path:path.resolve('artifacts'),freshness:'CURRENT',latestRun:{testReport:{complete:true,tests:[{id:'test',file:'sample.test.js',name:'test',state:'PASSED'}]}}};
 native.publish({earths:[row]});assert.ok(events.some(e=>e[0]==='passed'));events.length=0;native.publish({earths:[{...row,freshness:'STALE'}]});assert.ok(events.some(e=>e[0]==='skipped'));await profile({include:[{id:'earth:test'}],exclude:[]});assert.deepEqual(rerun,['earth']);native.invalidate();native.dispose();
});

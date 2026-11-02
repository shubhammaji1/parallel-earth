const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {parseTestReport,compareTests,evaluateCriteria,comparisonMarkup,parseComparisonMessage,compare,validateTestReport}=require('../dist/index.js');
const root=path.resolve('artifacts');
function report(states=['passed']) {return JSON.stringify({numTotalTests:states.length,testResults:[{name:path.join(root,'booking.test.js'),assertionResults:states.map((status,i)=>({fullName:'booking '+i,status}))}]});}
const command={program:'npm',args:['run','test:json'],label:'test:json'};
test('real approved npm checks capture stdout and per-run file reports without reusing old output',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os');
 const {Runner,git}=require('../dist/index.js');
 const parent=path.resolve('artifacts/test-fixtures');await fs.mkdir(parent,{recursive:true});
 const temp=await fs.mkdtemp(path.join(parent,'earth-v04-'));
 const payload=JSON.stringify({...JSON.parse(report()),testResults:[{name:'booking.test.js',assertionResults:[{fullName:'booking 0',status:'passed'}]}]});
 try {
  await git(temp,['init']);await git(temp,['config','user.name','Test']);await git(temp,['config','user.email','test@localhost']);
  await fs.writeFile(path.join(temp,'package.json'),JSON.stringify({scripts:{'test:json':'node report.cjs'}}));
  await fs.writeFile(path.join(temp,'report.cjs'),'process.stdout.write('+JSON.stringify(payload)+');');
  await git(temp,['add','.']);await git(temp,['commit','-m','fixture']);
  const runner=new Runner(),options={approved:true,trusted:true,timeoutMs:15000,maxBytes:8192};
  let result=await runner.run(randomUUID(),temp,command,options);
  assert.equal(result.state,'PASSED');assert.equal(result.testReport.complete,true);
  await fs.writeFile(path.join(temp,'report.cjs'),'require("node:fs").writeFileSync(process.env.PARALLEL_EARTH_REPORT,'+JSON.stringify(payload)+');console.log("ordinary log");');
  result=await runner.run(randomUUID(),temp,command,options);assert.equal(result.testReport.complete,true);
  await fs.writeFile(path.join(temp,'report.cjs'),'console.log("no report this time");');
  result=await runner.run(randomUUID(),temp,command,options);assert.equal(result.testReport,undefined);
 } finally {
  assert.equal(path.dirname(temp),parent);assert.ok(path.basename(temp).startsWith('earth-v04-'));
  await fs.rm(temp,{recursive:true,force:true,maxRetries:5});
 }
});
function run(states=['passed'],extra={}) {return {id:randomUUID(),command,state:states.includes('failed')?'FAILED':'PASSED',fingerprint:'same',revision:'a'.repeat(40),changesHash:'files-v1:hash',started:'2026-11-02T00:00:00Z',ended:'2026-11-02T00:00:01Z',testReport:parseTestReport(report(states),root),...extra};}
test('structured results normalize paths and reject incomplete, duplicate, external and truncated evidence',()=>{
 const parsed=parseTestReport(report(['passed','failed','pending','todo']),root);
 assert.equal(parsed.complete,true);assert.equal(parsed.tests[0].file,'booking.test.js');
 assert.deepEqual(parsed.tests.map(t=>t.state),['PASSED','FAILED','SKIPPED','TODO']);
 assert.equal(parseTestReport(report(),root,true).complete,false);
 assert.equal(parseTestReport(report().slice(0,-1),root).complete,false);
 const data=JSON.parse(report());data.numTotalTests=2;assert.equal(parseTestReport(JSON.stringify(data),root).complete,false);
 data.testResults[0].assertionResults.push(data.testResults[0].assertionResults[0]);assert.equal(parseTestReport(JSON.stringify(data),root).complete,false);
 data.testResults[0].name=path.resolve(root,'../outside.js');assert.equal(parseTestReport(JSON.stringify(data),root).complete,false);
 assert.equal(parseTestReport('ordinary logs',root),undefined);
 assert.throws(()=>validateTestReport(null));
});
test('individual comparisons distinguish regressions, recovery, skips, missing tests and unstable repeats',()=>{
 const baseline=run(['passed','failed','passed','passed']),alternative=run(['failed','passed','pending']);
 assert.deepEqual(compareTests([baseline],[alternative],true).map(t=>t.outcome),['REGRESSION','IMPROVEMENT','SKIPPED','MISSING']);
 assert.ok(compareTests([baseline],[alternative],false).every(t=>t.outcome==='INCONCLUSIVE'));
 assert.equal(compareTests([run()],[run(),run(['failed'])],true)[0].outcome,'UNSTABLE');
 assert.equal(compareTests([run()],[run(['passed'],{state:'ERROR'})],true)[0].outcome,'INCONCLUSIVE');
});
test('criteria require mapped, current, complete, passing evidence and survive missing or skipped tests',()=>{
 const r=run(),earth={runs:[r]},criterion={id:randomUUID(),label:'Prevent duplicate bookings',command,testIds:[r.testReport.tests[0].id]},exp={criteria:[criterion]};
 const state=(evidence={[r.id]:'CURRENT'})=>evaluateCriteria(exp,earth,evidence)[0].state;
 assert.equal(state(),'VERIFIED');assert.equal(state({[r.id]:'STALE'}),'STALE');assert.equal(state({}),'UNVERIFIED');
 r.testReport.tests[0].state='SKIPPED';assert.equal(state(),'UNVERIFIED');
 r.testReport.tests[0].state='FAILED';r.state='FAILED';assert.equal(state(),'FAILED');
 r.testReport.tests=[];assert.equal(state(),'UNVERIFIED');
 criterion.testIds=[];assert.equal(state(),'UNVERIFIED');
});
test('dashboard escapes repository content and accepts only scoped messages',()=>{
 const earth={id:randomUUID(),name:'<script>alert(1)</script>',baseline:true,path:root,runs:[]};
 const exp={id:randomUUID(),name:'<img src=x>',repository:root,baselineCommit:'a'.repeat(40),earths:[earth]};
 const html=comparisonMarkup(compare(exp,{}),earth.id,'unused','nonce');
 assert.ok(html.includes('&lt;img src=x&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));
 assert.ok(html.includes('Content-Security-Policy'));assert.ok(html.includes('Individual test results'));
 assert.deepEqual(parseComparisonMessage({action:'run',earthId:earth.id}),{action:'run',earthId:earth.id});
 assert.equal(parseComparisonMessage({action:'run',earthId:earth.id,command:'malicious'}),undefined);
 assert.equal(parseComparisonMessage({action:'run',earthId:'../escape'}),undefined);
});

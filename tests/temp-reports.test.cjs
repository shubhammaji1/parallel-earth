const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomUUID}=require('node:crypto');
const {Runner,git,noSymlinks}=require('../dist/index.js');
const {cli}=require('../dist/cli.js');

test('runner resolves the OS temp root before creating and checking its private report directory',async()=>{
 const vm=require('node:vm'),{createRequire}=require('node:module');
 const parent=await fs.realpath(path.resolve('artifacts'));
 const root=await fs.realpath(await fs.mkdtemp(path.join(parent,'temp-report-resolution-')));
 try {
  const physical=path.join(root,'physical-temp'),alias=path.join(root,'os-temp-alias'),repo=path.join(root,'repo');await fs.mkdir(physical);await fs.mkdir(repo);
  await git(repo,['init']);await git(repo,['config','user.name','Test']);await git(repo,['config','user.email','test@localhost']);
  await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({scripts:{'test:json':'node report.cjs'}}));
  const payload={numTotalTests:1,testResults:[{name:'sample.test.js',assertionResults:[{fullName:'passes',status:'passed'}]}]};
  await fs.writeFile(path.join(repo,'report.cjs'),'console.log('+JSON.stringify(JSON.stringify(payload))+');');await git(repo,['add','.']);await git(repo,['commit','-m','fixture']);
  const file=path.resolve('dist/runner.js'),realRequire=createRequire(file),module={exports:{}};let resolved=0,created=0,guarded=0;
  const originalGit=realRequire('./git');
  vm.runInNewContext(await fs.readFile(file,'utf8'),{module,exports:module.exports,process,Buffer,setTimeout,clearTimeout,require:id=>{
   if(id==='node:os')return {...os,tmpdir:()=>alias};
   if(id==='node:fs/promises')return {...fs,realpath:async target=>{if(target===alias){resolved++;return physical;}return fs.realpath(target);},mkdtemp:async prefix=>{assert.equal(path.dirname(prefix),physical);created++;return fs.mkdtemp(prefix);}};
   if(id==='./git')return {...originalGit,noSymlinks:async target=>{assert.equal(path.dirname(path.dirname(target)),physical);guarded++;return originalGit.noSymlinks(target);}};
   return realRequire(id);
  }});
  const runner=new module.exports.Runner(),options={approved:true,trusted:true,timeoutMs:15000,maxBytes:8192},command={program:'npm',args:['run','test:json'],label:'test:json'};
  let run=await runner.run(randomUUID(),repo,command,options);assert.equal(run.state,'PASSED',run.output);assert.equal(run.testReport?.complete,true,JSON.stringify(run.testReport));
  await fs.writeFile(path.join(repo,'report.cjs'),'require("node:fs").writeFileSync(process.env.PARALLEL_EARTH_REPORT,'+JSON.stringify(JSON.stringify(payload))+');console.log("noisy stdout");');
  run=await runner.run(randomUUID(),repo,command,options);assert.equal(run.testReport?.complete,true,JSON.stringify(run.testReport));
  assert.equal(resolved,2);assert.equal(created,2);assert.equal(guarded,2);assert.deepEqual(await fs.readdir(physical),[]);
 }finally{assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('temp-report-resolution-'));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

test('reports and CI work through a symlinked OS temporary root without accepting report-file links',async t=>{
 const parent=await fs.realpath(path.resolve('artifacts'));
 const root=await fs.realpath(await fs.mkdtemp(path.join(parent,'temp-report-regression-')));
 const originalTemp=os.tmpdir;
 try {
  const physical=path.join(root,'physical-temp'),alias=path.join(root,'temp-alias'),repo=path.join(root,'repo');
  await fs.mkdir(physical);await fs.mkdir(repo);
  try{await fs.symlink(physical,alias,process.platform==='win32'?'junction':'dir');}
  catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('Host does not permit directory links');return;}throw error;}
  await assert.rejects(noSymlinks(alias),/symlink/i);
  os.tmpdir=()=>alias;
  await git(repo,['init']);await git(repo,['config','user.name','Test']);await git(repo,['config','user.email','test@localhost']);
  await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({scripts:{'test:json':'node report.cjs'}}));
  const payload={numTotalTests:1,testResults:[{name:'sample.test.js',assertionResults:[{fullName:'passes',status:'passed'}]}]};
  const script=`const fs=require('node:fs'),path=require('node:path');const report=${JSON.stringify(payload)};report.captureDirectory=path.dirname(process.env.PARALLEL_EARTH_REPORT);`;
  await fs.writeFile(path.join(repo,'report.cjs'),script+'console.log(JSON.stringify(report));');
  await git(repo,['add','.']);await git(repo,['commit','-m','fixture']);
  const runner=new Runner(),command={program:'npm',args:['run','test:json'],label:'test:json'},options={approved:true,trusted:true,timeoutMs:15000,maxBytes:8192};
  let result=await runner.run(randomUUID(),repo,command,options);
  assert.equal(result.state,'PASSED',result.output);assert.equal(result.testReport?.complete,true,JSON.stringify(result.testReport));
  const captureDirectory=JSON.parse(result.output.trim()).captureDirectory;
  assert.equal(path.dirname(captureDirectory),physical);await assert.rejects(fs.access(captureDirectory));
  await fs.writeFile(path.join(repo,'report.cjs'),script+'fs.writeFileSync(process.env.PARALLEL_EARTH_REPORT,JSON.stringify(report));console.log("noisy stdout");');
  result=await runner.run(randomUUID(),repo,command,options);assert.equal(result.testReport?.complete,true,JSON.stringify(result.testReport));
  await fs.writeFile(path.join(repo,'report.cjs'),'console.log("no structured results");');
  result=await runner.run(randomUUID(),repo,command,options);assert.equal(result.testReport,undefined);
  // Both worktrees run the committed stdout-report fixture through the aliased temp root.
  const messages=[],io={out:s=>messages.push(s),err:s=>messages.push(s)};
  assert.equal(await cli(['ci','--repo',repo,'--storage',path.join(root,'storage'),'--baseline','HEAD','--candidate','HEAD','--script','test:json','--approve','--output',path.join(root,'report.json')],io),0,messages.join('\n'));
  // Replacing the private results file with a link must still invalidate report evidence.
  const external=path.join(root,'external.json');await fs.writeFile(external,JSON.stringify(payload));
  await fs.writeFile(path.join(repo,'report.cjs'),`const fs=require('node:fs');fs.unlinkSync(process.env.PARALLEL_EARTH_REPORT);fs.symlinkSync(${JSON.stringify(external)},process.env.PARALLEL_EARTH_REPORT);`);
  result=await runner.run(randomUUID(),repo,command,options);
  if(result.state==='PASSED'){assert.equal(result.testReport?.complete,false);assert.match(result.testReport.issue,/safely/);}
  else assert.match(result.output,/EPERM|EACCES|privilege/i,'Only link permissions may prevent the adversarial fixture');
  assert.deepEqual(await fs.readdir(physical),[]);assert.equal(await fs.readFile(external,'utf8'),JSON.stringify(payload));
 } finally {
  os.tmpdir=originalTemp;
  assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('temp-report-regression-'));
  await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});

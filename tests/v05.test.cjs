const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
const {reservePreviewPort,previewLaunch,captureEnvironment,environmentDifferences,environmentKey,validateEnvironment,git,Store,Service}=require('../dist/index.js');
const {cli,validateRecipe,ciPasses}=require('../dist/cli.js');
async function fixture(fn){
 const parent=path.resolve('artifacts/test-fixtures');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'earth-v05-'));
 try{await fn(root);}finally{assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('earth-v05-'));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
test('preview leases avoid occupied and allocated ports and constrain launch arguments',async()=>{
 const a=await reservePreviewPort(new Set(),24500,24600);let b;
 try {
  b=await reservePreviewPort(new Set([a.port+1]),a.port,a.port+5);assert.equal(b.port,a.port+2);
  await assert.rejects(reservePreviewPort(new Set(),a.port,a.port),/No local preview port/);
  const posix=previewLaunch('dev',a.port,'vite',false),win=previewLaunch('start',a.port,'port',true);
  assert.match(posix.shellArgs[1],/--strictPort/);assert.match(posix.shellArgs[1],/127.0.0.1/);assert.equal(win.env.PORT,String(a.port));assert.equal(win.shellArgs.at(-1),'npm.cmd run start');
  for(const script of ['dev;echo bad','dev&&echo bad','--bad','$(whoami)'])assert.throws(()=>previewLaunch(script,a.port,'port'));
  assert.throws(()=>previewLaunch('dev',80,'port'));assert.throws(()=>previewLaunch('dev',a.port,'invalid'));
 }finally{await a.release();await b?.release();}
});
test('environment captures tools, compares config hashes and omits config secrets',()=>fixture(async root=>{
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({packageManager:'npm@10.0.0'}));await fs.writeFile(path.join(root,'.npmrc'),'//registry.example/:_authToken=super-secret-test-token');
 const a=await captureEnvironment(root);validateEnvironment(a);assert.match(a.node,/^v?\d+\./);assert.match(a.npm,/^\d+\./);assert.equal(a.packageManager,'npm@10.0.0');assert.ok(!JSON.stringify(a).includes('super-secret-test-token'));
 await fs.writeFile(path.join(root,'tsconfig.json'),'{}');const b=await captureEnvironment(root);assert.notEqual(environmentKey(a),environmentKey(b));assert.ok(environmentDifferences(a,b).some(d=>d.field==='files.tsconfig.json'));
 assert.equal(environmentDifferences(undefined,b),undefined);assert.deepEqual(environmentDifferences(b,b),[]);assert.throws(()=>validateEnvironment({...b,variables:{TOKEN:'secret'}}));
}));
test('preview launch serves a real HTTP app on its assigned loopback port',t=>fixture(async root=>{
 const {spawn}=require('node:child_process'),http=require('node:http');
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{dev:'node app.cjs'}}));
 await fs.writeFile(path.join(root,'app.cjs'),`const http=require('node:http');const server=http.createServer((req,res)=>{res.end('Earth '+process.env.PORT);server.close();});server.listen(Number(process.env.PORT),process.env.HOST,()=>console.log('listening '+process.env.HOST+':'+process.env.PORT));setTimeout(()=>process.exit(3),12000).unref();`);
 const first=require('node:crypto').randomInt(20000,50000);
 const lease=await reservePreviewPort(new Set(),first,first+100),launch=previewLaunch('dev',lease.port,'port');await lease.release();
 const child=spawn(launch.shellPath,launch.shellArgs,{cwd:root,env:{...process.env,...launch.env},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
 const fetch=()=>new Promise((resolve,reject)=>{const request=http.get(lease.url,response=>{let body='';response.on('data',x=>body+=x);response.on('end',()=>resolve(body));});request.setTimeout(500,()=>request.destroy(Error('timeout')));request.on('error',reject);});
 let body,lastError;
 try {for(let i=0;i<60;i++){try{body=await fetch();break;}catch(error){lastError=error;if(['EACCES','EPERM'].includes(error.code))break;await new Promise(r=>setTimeout(r,100));}}}
 finally{await closed;}
 if(body===undefined&&['EACCES','EPERM'].includes(lastError?.code)&&logs.includes('listening 127.0.0.1:'+lease.port)){t.skip('Host sandbox denies loopback HTTP connections; real app listener startup was confirmed.');return;}
 assert.equal(body,'Earth '+lease.port,logs+' '+lastError);assert.equal(await closed,0,logs);
}));
test('CLI validates recipes and requires approval before execution',()=>fixture(async root=>{
 const output=[],io={out:s=>output.push(s),err:s=>output.push(s)};assert.equal(await cli(['--help'],io),0);assert.ok(output[0].includes('ci --storage'));
 assert.equal(await cli(['ci','--storage',root],io),2);assert.equal(await cli(['list','--storage',root,'--unknown'],io),2);assert.equal(await cli(['list','--storage',root],io),0);
 const base={version:1,name:'Test',baseline:'HEAD',candidate:'HEAD',script:'test'};validateRecipe(base);
 for(const bad of [{...base,script:'test;pwd'},{...base,repeat:11},{...base,setup:'evil'},{...base,criteria:[{label:'x',tests:[{file:'../x',name:'bad'}]}]}])assert.throws(()=>validateRecipe(bad));
}));
test('CI gate refuses inconclusive, skipped, stale, unknown-tool and malformed evidence',()=>{
 const row={id:'candidate',state:'PASSED',outcome:'PASSED',freshness:'CURRENT',comparable:true,environment:{node:'v22.0.0',npm:'10.0.0',files:{}},criteria:[],tests:[]};
 const passes=patch=>ciPasses({earths:[{...row,...patch}]},'candidate');assert.equal(passes({}),true);
 for(const patch of [{outcome:'INCONCLUSIVE'},{freshness:'STALE'},{comparable:false},{criteria:[{state:'UNVERIFIED'}]},{tests:[{current:'SKIPPED',outcome:'ADDED'}]},{environment:{node:'UNKNOWN',npm:'10',files:{}}},{latestRun:{testReport:{complete:false}}}])assert.equal(passes(patch),false);
 assert.equal(ciPasses({earths:[row,{id:'base',baseline:true,series:[{testReport:{complete:false}}]}]},'candidate'),false);
});
test('real CLI CI preserves dirty source, verifies a fix and fails an unfixed candidate',()=>fixture(async root=>{
 const repo=path.join(root,'repo');await fs.mkdir(repo);await git(repo,['init']);await git(repo,['config','user.name','Test']);await git(repo,['config','user.email','test@localhost']);await git(repo,['config','core.autocrlf','false']);
 await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({scripts:{'test:json':'node check.cjs'}}));await fs.writeFile(path.join(repo,'value.txt'),'bad');
 await fs.writeFile(path.join(repo,'check.cjs'),`const fs=require('node:fs');const pass=fs.readFileSync('value.txt','utf8')==='good';console.log(JSON.stringify({numTotalTests:1,numPassedTests:pass?1:0,numFailedTests:pass?0:1,testResults:[{name:'booking.test.js',assertionResults:[{fullName:'prevents duplicate booking',status:pass?'passed':'failed'}]}]}));process.exitCode=pass?0:1;`);
 await git(repo,['add','.']);await git(repo,['commit','-m','baseline']);const baseline=(await git(repo,['rev-parse','HEAD'])).trim();
 await fs.writeFile(path.join(repo,'value.txt'),'good');await git(repo,['add','.']);await git(repo,['commit','-m','fix']);const candidate=(await git(repo,['rev-parse','HEAD'])).trim();
 await fs.writeFile(path.join(repo,'value.txt'),'source staged');await git(repo,['add','.']);await fs.writeFile(path.join(repo,'value.txt'),'source dirty');const index=await git(repo,['diff','--cached','--binary']),head=await git(repo,['rev-parse','HEAD']);
 const recipe={version:1,name:'Booking fix',baseline,candidate,script:'test:json',repeat:2,criteria:[{label:'Prevent duplicate booking',tests:[{file:'booking.test.js',name:'prevents duplicate booking'}]}]};
 const recipePath=path.join(root,'recipe.json'),reportPath=path.join(root,'report.json');await fs.writeFile(recipePath,JSON.stringify(recipe));const storage=path.join(root,'storage'),messages=[],io={out:s=>messages.push(s),err:s=>messages.push(s)};
 const args=['ci','--storage',storage,'--repo',repo,'--recipe',recipePath,'--approve','--output',reportPath];assert.equal(await cli(args,io),0,messages.join('\n'));
 let report=JSON.parse(await fs.readFile(reportPath,'utf8')),earth=report.earths.find(e=>!e.baseline);assert.equal(earth.outcome,'IMPROVEMENT');assert.equal(earth.criteria[0].state,'VERIFIED');assert.equal(report.version,5);await new Service(new Store(storage)).store.load();
 recipe.candidate=baseline;recipe.repeat=1;await fs.writeFile(recipePath,JSON.stringify(recipe));assert.equal(await cli(args,io),1,messages.join('\n'));report=JSON.parse(await fs.readFile(reportPath,'utf8'));assert.equal(report.earths.find(e=>!e.baseline).criteria[0].state,'FAILED');
 assert.equal(await fs.readFile(path.join(repo,'value.txt'),'utf8'),'source dirty');assert.equal(await git(repo,['diff','--cached','--binary']),index);assert.equal(await git(repo,['rev-parse','HEAD']),head);
 const result=await exec(process.execPath,[path.resolve('dist/cli.js'),'list','--storage',storage],{maxBuffer:1048576});assert.equal(JSON.parse(result.stdout).length,2);
}));

require('./build.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {Store,Service,git}=require('../dist/index.js');
(async()=>{
 const base=path.resolve('artifacts/deletion-benchmarks');await fs.mkdir(base,{recursive:true});
 const root=await fs.mkdtemp(path.join(base,'bench-')),repo=path.join(root,'project');
 try{
  await fs.mkdir(repo);await git(repo,['init']);await git(repo,['config','core.autocrlf','false']);await git(repo,['config','user.name','Benchmark']);await git(repo,['config','user.email','test@localhost']);
  await fs.writeFile(path.join(repo,'file.txt'),'source\n');await git(repo,['add','.']);await git(repo,['commit','-m','fixture']);
  const service=new Service(new Store(path.join(root,'storage'))),exp=await service.createExperiment(repo,'Deletion benchmark');
  for(let i=0;i<3;i++)await service.createEarth(exp.id,'Alternative '+i);
  const start=performance.now();try{await service.deleteExperiment(exp.id,true,false);}catch(error){console.log('DELETE ERROR: '+error.message);console.log('REGISTERED: '+await git(repo,['worktree','list','--porcelain']));for(const folder of await fs.readdir(path.join(root,'storage','earths'))){console.log(folder+': '+JSON.stringify(await fs.readdir(path.join(root,'storage','earths',folder))));}throw error;}
  const result={earths:4,durationMs:Math.round(performance.now()-start),platform:process.platform,node:process.version};
  await fs.writeFile(path.resolve('artifacts/deletion-benchmark-'+(process.argv[2]||'latest')+'.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{if(path.dirname(root)!==base||!path.basename(root).startsWith('bench-'))throw Error('Cleanup scope mismatch');await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});


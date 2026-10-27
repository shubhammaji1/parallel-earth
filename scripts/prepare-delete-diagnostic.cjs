const fs=require('node:fs');
let s=fs.readFileSync('scripts/benchmark-delete.cjs','utf8');
s=s.replace("const start=performance.now();await service.deleteExperiment(exp.id,true,false);","const start=performance.now();try{await service.deleteExperiment(exp.id,true,false);}catch(error){console.log('DELETE ERROR: '+error.message);console.log('REGISTERED: '+await git(repo,['worktree','list','--porcelain']));for(const folder of await fs.readdir(path.join(root,'storage','earths'))){console.log(folder+': '+JSON.stringify(await fs.readdir(path.join(root,'storage','earths',folder))));}throw error;}");
fs.writeFileSync('scripts/diagnose-delete.cjs',s);


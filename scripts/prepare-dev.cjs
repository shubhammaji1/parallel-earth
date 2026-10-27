require('./build.cjs');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const artifacts=path.resolve('artifacts');
  await fs.mkdir(artifacts,{recursive:true});
  const workspace=path.join(artifacts,'ParallelEarth.code-workspace');
  // Explicit empty workspace prevents VS Code restoring the last project.
  await fs.writeFile(workspace,JSON.stringify({
    folders:[],
    settings:{'window.title':'ParallelEarth | Create an Experiment'}
  },null,2)+'\n');
  console.log('F5 opens a blank ParallelEarth workspace. No repository, demo or experiment is created.');
})().catch(e=>{console.error(e);process.exitCode=1;});


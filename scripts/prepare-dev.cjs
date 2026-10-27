require('./build.cjs');
const path=require('node:path');
const {writeEmptyWorkspace}=require('./dev-workspace.cjs');
// Explicit empty workspace prevents VS Code restoring the last project.
writeEmptyWorkspace(path.resolve('artifacts')).then(()=>{
  console.log('F5 opens a blank ParallelEarth workspace. No repository, demo or experiment is created.');
}).catch(e=>{console.error(e);process.exitCode=1;});

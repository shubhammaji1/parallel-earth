const fs=require('node:fs/promises'),path=require('node:path');
async function writeEmptyWorkspace(directory){
  await fs.mkdir(directory,{recursive:true});
  const file=path.join(directory,'ParallelEarth.code-workspace');
  await fs.writeFile(file,JSON.stringify({
    folders:[],
    settings:{'window.title':'ParallelEarth | Create an Experiment'}
  },null,2)+'\n');
  return file;
}
module.exports={writeEmptyWorkspace};

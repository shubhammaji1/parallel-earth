const fs=require('node:fs'),path=require('node:path');
function resolveHostExecutable(downloaded,platform=process.platform){
  if(platform!=='darwin'||fs.existsSync(downloaded))return downloaded;
  // Older test-electron versions return the removed Electron alias.
  const executableDirectory=path.dirname(downloaded);
  const info=path.resolve(executableDirectory,'..','Info.plist');
  let plist;
  try{plist=fs.readFileSync(info,'utf8');}
  catch(error){throw new Error('Cannot locate macOS VS Code executable: '+info,{cause:error});}
  const name=plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  if(!name||name==='.'||name==='..'||/[\\/\0]/.test(name))throw new Error('Invalid CFBundleExecutable in VS Code Info.plist');
  const executable=path.join(executableDirectory,name);
  if(!fs.existsSync(executable)||!fs.statSync(executable).isFile())throw new Error('VS Code executable missing: '+executable);
  return executable;
}
module.exports={resolveHostExecutable};


const fs=require('node:fs');
let s=fs.readFileSync('src/git.ts','utf8');
s=s.replace("registered:ReadonlySet<string> }","registered:ReadonlySet<string>; storageRoot?:string }");
s=s.replace("ownershipContext(repo:string):Promise<OwnershipContext>","ownershipContext(repo:string,storageRoot?:string):Promise<OwnershipContext>");
s=s.replace("  return {repository:normalizedPath(repo),common:await realpath(common.trim()),","  await noSymlinks(common.trim());\n  if(storageRoot)await noSymlinks(path.join(storageRoot,'earths'));\n  return {repository:normalizedPath(repo),common:await realpath(common.trim()),storageRoot:storageRoot?normalizedPath(storageRoot):undefined,");
s=s.replace("  await noSymlinks(target);\n  const context=snapshot??await ownershipContext(repo);","  const plain=async(file:string)=>{if((await lstat(file)).isSymbolicLink())throw new Error('Symlink/reparse path refused: '+file);};\n  if(snapshot?.storageRoot===normalizedPath(root)){\n    await plain(target);\n    if(normalizedPath(await realpath(target))!==normalizedPath(target))throw new Error('Worktree ancestor path changed');\n  }else await noSymlinks(target);\n  const context=snapshot??await ownershipContext(repo);");
s=s.replace("const marker=path.join(target,'.git');await noSymlinks(marker);","const marker=path.join(target,'.git');await plain(marker);");
s=s.replace("const admin=path.resolve(target,pointer.slice(8));await noSymlinks(admin);","const admin=path.resolve(target,pointer.slice(8));await plain(admin);");
s=s.replace("  if(normalizedPath(path.dirname(metadata))!==","  if(normalizedPath(metadata)!==normalizedPath(admin))throw new Error('Worktree metadata ancestor path changed');\n  if(normalizedPath(path.dirname(metadata))!==");
s=s.replace("await noSymlinks(commonFile);await noSymlinks(backlinkFile);","await plain(commonFile);await plain(backlinkFile);");
fs.writeFileSync('src/git.ts',s);
s=fs.readFileSync('src/service.ts','utf8').replace("await ownershipContext(exp.repository):undefined","await ownershipContext(exp.repository,this.store.root):undefined");
fs.writeFileSync('src/service.ts',s);


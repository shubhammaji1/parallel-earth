const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {resolveHostExecutable}=require('../scripts/host-executable.cjs');
async function bundle(t,name){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'parallel-earth-host-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const directory=path.join(root,'Visual Studio Code.app','Contents','MacOS');
 await fs.mkdir(directory,{recursive:true});
 await fs.writeFile(path.join(directory,'..','Info.plist'),'<plist><dict><key>CFBundleExecutable</key><string>'+name+'</string></dict></plist>');
 return {directory,downloaded:path.join(directory,'Electron')};
}
test('macOS launcher resolves the renamed Code executable from bundle metadata',async t=>{
 const b=await bundle(t,'Code'),actual=path.join(b.directory,'Code');
 await fs.writeFile(actual,'fixture');
 assert.equal(resolveHostExecutable(b.downloaded,'darwin'),actual);
});
test('legacy macOS executable and other platforms keep their existing paths',async t=>{
 const b=await bundle(t,'Electron');await fs.writeFile(b.downloaded,'fixture');
 assert.equal(resolveHostExecutable(b.downloaded,'darwin'),b.downloaded);
 assert.equal(resolveHostExecutable('/not-installed/code','linux'),'/not-installed/code');
 assert.equal(resolveHostExecutable('C:\\VSCode\\Code.exe','win32'),'C:\\VSCode\\Code.exe');
});
test('macOS bundle executable names cannot escape the bundle directory',async t=>{
 const b=await bundle(t,'../outside');
 assert.throws(()=>resolveHostExecutable(b.downloaded,'darwin'),/Invalid CFBundleExecutable/);
});
test('missing macOS executable reports a useful failure',async t=>{
 const b=await bundle(t,'Code');
 assert.throws(()=>resolveHostExecutable(b.downloaded,'darwin'),/VS Code executable missing/);
});


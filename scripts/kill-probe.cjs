const fs=require('node:fs'),{spawn,execFile}=require('node:child_process');
const start=Date.now();const log=o=>fs.appendFileSync('artifacts/kill-probe.jsonl',JSON.stringify({ms:Date.now()-start,...o})+'\n');
const child=spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{windowsHide:true});
log({pid:child.pid});
child.on('close',code=>log({closed:code}));
setTimeout(()=>execFile('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,timeout:1500},(e,o,r)=>{log({error:e?.message,stdout:o,stderr:r});log({directKill:child.kill('SIGKILL')});}),200);


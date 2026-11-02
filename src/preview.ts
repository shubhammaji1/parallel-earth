import { createServer } from 'node:net';
export interface PreviewPort { port:number; url:string; release():Promise<void> }
/** Hold a port until launch. Apps must respect PORT or the selected Vite flags. */
export async function reservePreviewPort(used:ReadonlySet<number>,first=4300,last=4399):Promise<PreviewPort> {
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<1024||last>65535||last<first||last-first>1000)throw Error('Invalid preview port range');
  for(let port=first;port<=last;port++){
    if(used.has(port))continue;const server=createServer();
    const free=await new Promise<boolean>((resolve,reject)=>{
      server.once('error',(error:NodeJS.ErrnoException)=>error.code==='EADDRINUSE'?resolve(false):reject(error));
      server.listen({host:'127.0.0.1',port,exclusive:true},()=>resolve(true));
    });
    if(free)return {port,url:'http://127.0.0.1:'+port,release:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
  }throw Error('No local preview port is available. Stop a preview and retry.');
}
export function previewLaunch(script:string,port:number,mode:'port'|'vite',windows=process.platform==='win32') {
  if(!/^[a-zA-Z0-9_][a-zA-Z0-9:_-]*$/.test(script)||!Number.isInteger(port)||port<1024||port>65535||!['port','vite'].includes(mode))throw Error('Invalid preview command');
  const command=(windows?'npm.cmd':'npm')+' run '+script+(mode==='vite'?' -- --host 127.0.0.1 --port '+port+' --strictPort':'');
  return {shellPath:windows?(process.env.COMSPEC??'cmd.exe'):'/bin/sh',shellArgs:windows?['/d','/s','/c',command]:['-c','exec '+command],env:{PORT:String(port),HOST:'127.0.0.1',BROWSER:'none'}};
}

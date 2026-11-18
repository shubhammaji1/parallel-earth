import { createServer } from 'node:net';
import { get } from 'node:http';
import { setInterval, clearInterval } from 'node:timers';
export interface PreviewStatus {state:'STARTING'|'READY'|'FAILED'|'STOPPED';url:string;detail:string;checkedAt?:string}
export async function probePreview(url:string,timeoutMs=1000):Promise<{ready:boolean;detail:string}>{
  const target=new URL(url);if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.username||target.password)throw Error('Only assigned loopback preview URLs may be probed');
  return new Promise(resolve=>{
    const request=get(target,response=>{resolve({ready:!!response.statusCode&&response.statusCode>=200&&response.statusCode<400,detail:'HTTP '+response.statusCode});response.destroy();});
    const timer=setTimeout(()=>request.destroy(Error('Health request timed out')),timeoutMs);
    request.once('close',()=>clearTimeout(timer));request.once('error',error=>resolve({ready:false,detail:error.message.slice(0,200)}));
  });
}
export class PreviewHealth {
  status:PreviewStatus;private timer?:ReturnType<typeof setInterval>;private stopped=false;private probing=false;private began=Date.now();
  constructor(url:string,private change:(status:PreviewStatus)=>void,private probe=probePreview){this.status={state:'STARTING',url,detail:'Waiting for the app to respond'};}
  start(){this.timer=setInterval(()=>void this.check(),2000);this.timer.unref();void this.check();}
  async check(){if(this.stopped||this.probing)return;this.probing=true;try{const result=await this.probe(this.status.url);if(this.stopped)return;this.status={...this.status,state:result.ready?'READY':this.status.state==='STARTING'&&Date.now()-this.began<15000?'STARTING':'FAILED',detail:result.detail,checkedAt:new Date().toISOString()};this.change(this.status);}catch(error){if(!this.stopped){this.status={...this.status,state:'FAILED',detail:String(error)};this.change(this.status);}}finally{this.probing=false;}}
  stop(detail='Preview terminal closed',failed=false){this.stopped=true;if(this.timer)clearInterval(this.timer);this.status={...this.status,state:failed?'FAILED':'STOPPED',detail,checkedAt:new Date().toISOString()};this.change(this.status);}
  dispose(){this.stop();}
}
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

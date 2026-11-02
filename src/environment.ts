import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export interface EnvironmentSnapshot {
  version:1; platform:string; arch:string; extensionNode:string; node:string; npm:string; packageManager:string;
  files:Record<string,string>; variables:Record<string,string>;
}
const files=['package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','.npmrc','.nvmrc','.node-version','tsconfig.json','vite.config.ts','vite.config.js','vitest.config.ts','vitest.config.js','jest.config.js','jest.config.cjs'];
function toolVersion(program:'node'|'npm',target:string):Promise<string> {
  const win=process.platform==='win32'&&program==='npm';
  return new Promise(resolve=>execFile(win?(process.env.COMSPEC??'cmd.exe'):program,win?['/d','/s','/c','npm.cmd --version']:['--version'],
    {cwd:target,windowsHide:true,timeout:5000,maxBuffer:4096},(error,stdout)=>{
      const value=stdout.trim();resolve(!error&&/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value)?value:'UNKNOWN');
    }));
}
export async function captureEnvironment(target:string):Promise<EnvironmentSnapshot> {
  const [node,npm]=await Promise.all([toolVersion('node',target),toolVersion('npm',target)]);
  const hashes:Record<string,string>={};let packageManager='UNSPECIFIED';
  for(const file of files)try {
    const content=await readFile(path.join(target,file));hashes[file]=createHash('sha256').update(content).digest('hex');
    if(file==='package.json')try {const declared=JSON.parse(content.toString()).packageManager;if(typeof declared==='string'&&/^[\w@.+-]{1,100}$/.test(declared))packageManager=declared;}catch{/* Retain hash. */}
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')hashes[file]='UNREADABLE';}
  return {version:1,platform:os.platform(),arch:os.arch(),extensionNode:process.version,node,npm,packageManager,files:hashes,variables:{CI:'true',FORCE_COLOR:'0'}};
}
export const environmentKey=(snapshot:EnvironmentSnapshot):string=>createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
export function environmentDifferences(baseline?:EnvironmentSnapshot,current?:EnvironmentSnapshot) {
  if(!baseline||!current)return undefined;
  const result:{field:string;baseline:string;current:string}[]=[];
  for(const field of ['platform','arch','extensionNode','node','npm','packageManager'] as const)
    if(baseline[field]!==current[field])result.push({field,baseline:baseline[field],current:current[field]});
  for(const group of ['files','variables'] as const)for(const key of new Set([...Object.keys(baseline[group]),...Object.keys(current[group])])){
    const a=baseline[group][key]??'ABSENT',b=current[group][key]??'ABSENT';if(a!==b)result.push({field:group+'.'+key,baseline:a,current:b});
  }return result;
}
export function validateEnvironment(value:unknown):asserts value is EnvironmentSnapshot {
  if(!value||typeof value!=='object')throw Error('Invalid environment snapshot');const v=value as Record<string,unknown>;
  if(v.version!==1)throw Error('Unsupported environment snapshot');
  for(const key of ['platform','arch','extensionNode','node','npm','packageManager'])if(typeof v[key]!=='string'||(v[key] as string).length>100)throw Error('Invalid environment field');
  for(const group of ['files','variables']){
    const map=v[group];if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>30)throw Error('Invalid environment map');
    for(const [key,item]of Object.entries(map))if(!(group==='files'?files.includes(key):['CI','FORCE_COLOR'].includes(key))||typeof item!=='string'||item.length>100)throw Error('Invalid environment entry');
  }
}

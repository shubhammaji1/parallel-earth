import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { git, contained, noSymlinks } from './git';
export interface CoverageReport {format:'istanbul-json';complete:boolean;files:{file:string;lines:{line:number;hits:number}[]}[];issue?:string}
export function parseCoverage(content:string,root:string,truncated=false):CoverageReport|undefined {
  if(!content.trim())return;
  const invalid=(issue:string):CoverageReport=>({format:'istanbul-json',complete:false,files:[],issue});
  if(truncated)return invalid('Coverage exceeded the output limit.');
  try {
    const data=JSON.parse(content);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Expected an Istanbul coverage map.');
    const files:CoverageReport['files']=[],seen=new Set<string>();let total=0;
    if(Object.keys(data).length>1000)throw Error('Too many coverage files.');
    for(const value of Object.values(data) as any[]){
      if(!value||typeof value.path!=='string'||!value.statementMap||!value.s||typeof value.statementMap!=='object'||typeof value.s!=='object')throw Error('Invalid statement coverage.');
      const absolute=path.resolve(root,value.path),file=path.relative(root,absolute).replace(/\\/g,'/');
      if(!contained(root,absolute)||seen.has(file)||file.length>1000)throw Error('Duplicate or external coverage file.');seen.add(file);
      const lines=new Map<number,number>();
      for(const [id,location]of Object.entries(value.statementMap) as [string,any][]){
        const start=location?.start?.line,end=location?.end?.line,hits=value.s[id];
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end>1000000||end-start>10000||!Number.isSafeInteger(hits)||hits<0)throw Error('Invalid coverage line/count.');
        // Istanbul records statement execution, not every physical line in a multiline span.
        lines.set(start,Math.min(lines.get(start)??hits,hits));if(++total>100000)throw Error('Coverage statement limit exceeded.');
      }
      files.push({file,lines:[...lines].map(([line,hits])=>({line,hits}))});
    }
    if(!files.length)throw Error('Empty coverage map.');return {format:'istanbul-json',complete:true,files};
  }catch(error){return invalid(error instanceof Error?error.message:'Invalid coverage');}
}
export function validateCoverage(value:unknown):asserts value is CoverageReport {
  if(!value||typeof value!=='object')throw Error('Invalid coverage');const v=value as CoverageReport;
  if(v.format!=='istanbul-json'||typeof v.complete!=='boolean'||!Array.isArray(v.files)||v.files.length>1000||v.issue!==undefined&&(typeof v.issue!=='string'||v.issue.length>1000))throw Error('Invalid coverage report');
  const seen=new Set<string>();let total=0;
  for(const f of v.files){if(!f||typeof f.file!=='string'||!f.file||f.file.length>1000||f.file.includes('\\')||path.isAbsolute(f.file)||f.file.split('/').includes('..')||seen.has(f.file)||!Array.isArray(f.lines))throw Error('Invalid coverage file');seen.add(f.file);
    const lines=new Set<number>();for(const l of f.lines){if(!Number.isSafeInteger(l.line)||l.line<1||l.line>1000000||!Number.isSafeInteger(l.hits)||l.hits<0||lines.has(l.line)||++total>100000)throw Error('Invalid coverage line');lines.add(l.line);}
  }if(v.complete&&(!v.files.length||v.issue))throw Error('Incomplete coverage');
}
export interface ChangedCoverage {state:'CURRENT'|'UNAVAILABLE'|'STALE';covered:number;uncovered:number;unmeasured:number;percentage:number|null;files:{file:string;lines:{line:number;state:'COVERED'|'UNCOVERED'|'UNMEASURED'}[]}[];reason:string}
export async function changedLineCoverage(target:string,baseline:string,coverage:CoverageReport|undefined,current:boolean):Promise<ChangedCoverage>{
  const empty=(state:ChangedCoverage['state'],reason:string):ChangedCoverage=>({state,covered:0,uncovered:0,unmeasured:0,percentage:null,files:[],reason});
  if(!current)return empty('STALE','Rerun checks after code changes.');if(!coverage?.complete)return empty('UNAVAILABLE',coverage?.issue??'No captured Istanbul JSON coverage.');
  const tracked=(await git(target,['diff','--no-renames','--name-only','-z',baseline,'--'])).split('\0').filter(Boolean);
  const untracked=(await git(target,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean),newFiles=new Set(untracked);
  const result=empty('CURRENT','Statement-line coverage of added/modified lines; unmeasured lines may be non-executable or absent from the report. Coverage does not prove correctness.');let total=0;
  for(const file of new Set([...tracked,...untracked])){
    if(result.files.length>=1000)throw Error('Changed-file limit exceeded');const absolute=path.resolve(target,file);if(!contained(target,absolute))throw Error('Coverage path escape');await noSymlinks(absolute);
    const numbers=new Set<number>();
    if(newFiles.has(file)){
      const bytes=await readFile(absolute);if(bytes.length>1048576||bytes.includes(0))continue;
      const text=bytes.toString('utf8'),count=text?text.split('\n').length-(text.endsWith('\n')?1:0):0;for(let i=1;i<=count;i++)numbers.add(i);
    }else{
      const diff=await git(target,['--literal-pathspecs','diff','--no-ext-diff','--no-textconv','--no-renames','--unified=0',baseline,'--',file]);
      for(const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)){const start=Number(match[1]),count=match[2]===undefined?1:Number(match[2]);if(count>50000)throw Error('Changed-line limit exceeded');for(let i=start;i<start+count;i++)numbers.add(i);}
    }
    const observed=new Map(coverage.files.find(f=>f.file===file.replace(/\\/g,'/'))?.lines.map(l=>[l.line,l.hits]));
    const lines=[...numbers].sort((a,b)=>a-b).map(line=>{if(++total>50000)throw Error('Changed-line limit exceeded');const hits=observed.get(line),state=hits===undefined?'UNMEASURED':hits>0?'COVERED':'UNCOVERED';if(state==='COVERED')result.covered++;else if(state==='UNCOVERED')result.uncovered++;else result.unmeasured++;return {line,state} as ChangedCoverage['files'][number]['lines'][number];});
    if(lines.length)result.files.push({file,lines});
  }const measured=result.covered+result.uncovered;result.percentage=measured?Math.round(result.covered/measured*10000)/100:null;return result;
}

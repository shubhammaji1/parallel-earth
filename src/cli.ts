#!/usr/bin/env node
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Store } from './store';
import { Service } from './service';
import { Runner } from './runner';
import { ExecutionQueue } from './queue';
import { Command, Earth, Experiment, name, validateCommand } from './domain';
import { git, resolveCommit, repositoryRoot } from './git';
import { markdown, Report } from './comparison';
import { testIdentity } from './test-results';

const help=`ParallelEarth 0.5 CLI (Node 22.17+)
  node dist/cli.js list --storage PATH
  node dist/cli.js create --storage PATH --repo PATH --name NAME [--baseline REF]
  node dist/cli.js earth --storage PATH --experiment ID --name NAME
  node dist/cli.js run --storage PATH --experiment ID --earth ID --script NAME --approve [--repeat 1..10]
  node dist/cli.js report --storage PATH --experiment ID [--output FILE] [--format json|markdown]
  node dist/cli.js ci --storage PATH --repo PATH --baseline REF --candidate REF --script NAME --approve [--repeat 1..10] [--output FILE]
  node dist/cli.js ci --storage PATH --repo PATH --recipe FILE --approve [--output FILE]
CI creates fresh worktrees, runs baseline and candidate, exports evidence, and exits 0 only for a passing current candidate with comparable baseline evidence and verified configured criteria. Exit 1: failed gate; exit 2: usage/execution error.
Dependencies are independent. Optional --setup ci|install executes package lifecycle scripts with --approve.
--approve acknowledges trusted repository commands with filesystem/network privileges. Reports may contain logs; review before sharing.`;
interface Recipe {version:1;name:string;baseline:string;candidate:string;script:string;repeat?:number;setup?:'ci'|'install';criteria?:{label:string;tests:{file:string;name:string}[]}[]}
function repeatCount(value:string):number {if(!/^(?:[1-9]|10)$/.test(value))throw Error('Repeat must be 1-10');return Number(value);}
export function validateRecipe(value:unknown):Recipe {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid recipe');const r=value as Recipe;
  if(Object.keys(r).some(k=>!['version','name','baseline','candidate','script','repeat','setup','criteria'].includes(k))||r.version!==1)throw Error('Unsupported recipe');
  name(r.name);for(const ref of [r.baseline,r.candidate])if(typeof ref!=='string'||!ref||ref.startsWith('-')||ref.length>200)throw Error('Invalid recipe ref');
  validateCommand({program:'npm',args:['run',r.script],label:r.script});repeatCount(String(r.repeat??1));
  if(r.setup!==undefined&&!['ci','install'].includes(r.setup))throw Error('Invalid setup');
  if(r.criteria!==undefined){
    if(!Array.isArray(r.criteria)||r.criteria.length>100)throw Error('Invalid recipe criteria');
    for(const c of r.criteria){name(c.label);if(!Array.isArray(c.tests)||!c.tests.length||c.tests.length>100)throw Error('Criteria require 1-100 mapped tests');
      for(const t of c.tests)if(typeof t.file!=='string'||!t.file||t.file.length>1000||t.file.includes('\\')||path.isAbsolute(t.file)||t.file.split('/').includes('..')||typeof t.name!=='string'||!t.name.trim()||t.name.length>2000)throw Error('Invalid criterion test');
    }
  }return r;
}
export function ciPasses(report:Report,candidateId:string):boolean {
  const c=report.earths.find(e=>e.id===candidateId);
  const baseline=report.earths.find(e=>e.baseline);
  if([...c?.series??[],...baseline?.series??[]].some(run=>run.testReport&&!run.testReport.complete))return false;
  return !!c&&c.state==='PASSED'&&c.freshness==='CURRENT'&&c.comparable&&['PASSED','IMPROVEMENT'].includes(c.outcome)&&
    !!c.environment&&c.environment.node!=='UNKNOWN'&&c.environment.npm!=='UNKNOWN'&&!Object.values(c.environment.files).includes('UNREADABLE')&&
    (!c.latestRun?.testReport||c.latestRun.testReport.complete)&&c.criteria.every(x=>x.state==='VERIFIED')&&c.tests.every(t=>t.current==='PASSED'&&!['REGRESSION','MISSING','SKIPPED','UNSTABLE','INCONCLUSIVE'].includes(t.outcome));
}
export async function cli(argv:string[],io:{out:(s:string)=>void;err:(s:string)=>void}={out:s=>process.stdout.write(s+'\n'),err:s=>process.stderr.write(s+'\n')}):Promise<number> {
  if(!argv.length||argv[0]==='--help'||argv[0]==='help'){io.out(help);return 0;}
  const [action,...args]=argv;
  const allowed:Record<string,string[]>={list:[],create:['repo','name','baseline'],earth:['experiment','name'],run:['experiment','earth','script','repeat','approve'],report:['experiment','output','format'],ci:['repo','baseline','candidate','script','repeat','approve','output','format','recipe','setup']};
  try {
    if(!Object.hasOwn(allowed,action))throw Error('Unknown command. Use --help.');const flags=new Map<string,string>();
    for(let i=0;i<args.length;i++){
      const key=args[i].replace(/^--/,'');if(args[i]!=='--'+key||!['storage',...allowed[action]].includes(key)||flags.has(key))throw Error('Unknown or duplicate option: '+args[i]);
      if(key==='approve'){flags.set(key,'true');continue;}
      const value=args[++i];if(!value||value.startsWith('--'))throw Error('Missing value for --'+key);flags.set(key,value);
    }
    if(flags.has('format')&&!['json','markdown'].includes(flags.get('format')!))throw Error('Format must be json or markdown');
    const required=(key:string)=>{const value=flags.get(key);if(!value)throw Error('Required: --'+key);return value;};
    const storage=path.resolve(required('storage')),service=new Service(new Store(storage));
    const load=async(id:string)=>{const exp=(await service.store.load()).experiments.find(e=>e.id===id);if(!exp)throw Error('Experiment missing');return exp;};
    const emit=async(report:Report)=>{
      const format=flags.get('format')??'json';if(!['json','markdown'].includes(format))throw Error('Format must be json or markdown');
      const content=format==='json'?JSON.stringify(report,null,2):markdown(report),file=flags.get('output');
      if(file){await mkdir(path.dirname(path.resolve(file)),{recursive:true});await writeFile(path.resolve(file),content+'\n');io.out('Report: '+path.resolve(file));}else io.out(content);
    };
    if(action==='list'){io.out(JSON.stringify((await service.store.load()).experiments.map(e=>({id:e.id,name:e.name,repository:e.repository,earths:e.earths.map(x=>({id:x.id,name:x.name}))})),null,2));return 0;}
    if(action==='create'){io.out(JSON.stringify(await service.createExperiment(required('repo'),required('name'),flags.get('baseline')??'HEAD')));return 0;}
    if(action==='earth'){io.out(JSON.stringify(await service.createEarth(required('experiment'),required('name'))));return 0;}
    if(action==='report'){await emit(await service.report(await load(required('experiment'))));return 0;}
    if(!flags.has('approve'))throw Error('Command execution requires --approve for a trusted repository.');
    const runner=new Runner(),queue=new ExecutionQueue(storage),controller=new AbortController();
    const cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
    const execute=async(exp:Experiment,earths:Earth[],command:Command,count:number,setup=false)=>{
      const batchId=randomUUID();
      for(let index=1;index<=count;index++)for(const earth of earths){
        await service.owned(earth);if(earth.archived)throw Error('Earth is archived');
        await queue.execute(earth.id,controller.signal,()=>{},async()=>{
          const run=await runner.run(earth.id,earth.path,command,{approved:true,trusted:true,timeoutMs:120000,maxBytes:262144,signal:controller.signal,kind:setup?'setup':'check',batchId,repeatIndex:index,repeatTotal:count,queueScope:queue.directory,concurrencyLimit:1});
          await service.record(earth,run);if(setup&&run.state!=='PASSED')throw Error('Setup failed for '+earth.name+'; evidence retained in '+exp.id);
        });
      }
    };
    try {
      if(action==='run'){
        const exp=await load(required('experiment')),earth=exp.earths.find(e=>e.id===required('earth'));if(!earth)throw Error('Earth missing');
        const script=required('script'),command:Command={program:'npm',args:['run',script],label:script};validateCommand(command);
        await execute(exp,[earth],command,repeatCount(flags.get('repeat')??'1'));
        const report=await service.report(await load(exp.id));await emit(report);return report.earths.find(e=>e.id===earth.id)?.state==='PASSED'?0:1;
      }
      if(flags.has('recipe')&&['baseline','candidate','script','repeat','setup'].some(k=>flags.has(k)))throw Error('Recipe cannot be combined with check/ref overrides');
      const recipe=flags.has('recipe')?validateRecipe(JSON.parse(await readFile(required('recipe'),'utf8'))):validateRecipe({version:1,name:'CI comparison',baseline:required('baseline'),candidate:required('candidate'),script:required('script'),repeat:repeatCount(flags.get('repeat')??'1'),setup:flags.get('setup')});
      const repo=await repositoryRoot(required('repo'));
      const baseline=await resolveCommit(repo,recipe.baseline),candidate=await resolveCommit(repo,recipe.candidate);
      const exp=await service.createExperiment(repo,recipe.name,baseline),alternative=await service.createEarth(exp.id,'Candidate');
      io.err('Experiment '+exp.id+'; worktrees and evidence retained under '+storage);
      await git(alternative.path,['checkout','--detach',candidate]);
      const command:Command={program:'npm',args:['run',recipe.script],label:recipe.script};
      for(const c of recipe.criteria??[])await service.saveCriterion(exp.id,{id:randomUUID(),label:c.label,command,testIds:[...new Set(c.tests.map(t=>testIdentity(t.file,t.name)))]});
      const earths=[exp.earths[0],alternative];
      if(recipe.setup)try {await execute(exp,earths,{program:'npm',args:[recipe.setup],label:'npm '+recipe.setup},1,true);}
      catch(error){await emit(await service.report(await load(exp.id)));throw error;}
      await execute(exp,earths,command,recipe.repeat??1);
      const report=await service.report(await load(exp.id));await emit(report);return ciPasses(report,alternative.id)?0:1;
    }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
  }catch(error){io.err('ParallelEarth: '+(error instanceof Error?error.message:String(error)));return 2;}
}
if(require.main===module)void cli(process.argv.slice(2)).then(code=>{process.exitCode=code;});

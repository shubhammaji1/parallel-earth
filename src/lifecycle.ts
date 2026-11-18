import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { Service } from './service';
import { Earth, Checkpoint, name, validateCatalog } from './domain';
import { git, snapshot, Snapshot, resolveCommit, assertOwned, noSymlinks, contained } from './git';
import { checkSeries } from './comparison';
import { ExecutionQueue, alive } from './queue';
const ref=(earth:Earth,id:string)=>'refs/parallel-earth/checkpoints/'+earth.id+'/'+id;
const commitTree=async(earth:Earth,tree:string,parent:string,label:string)=>(await git(earth.path,['-c','user.name=ParallelEarth','-c','user.email=parallel-earth@localhost','commit-tree',tree,'-p',parent,'-m',label])).trim();
function validPath(file:string):boolean{return !!file&&file.length<=1000&&!/[\\:\0\x00-\x1f]/.test(file)&&!path.isAbsolute(file)&&file.split('/').every(p=>p&&p!=='.'&&p!=='..'&&p.toLowerCase()!=='.git');}
export class LifecycleService extends Service {
  async createCheckpoint(earth:Earth,label:string):Promise<Checkpoint>{
    const exp=await this.owned(earth);if(earth.baseline)throw Error('Choose an alternative Earth');label=name(label);
    return this.store.transaction(async catalog=>{
      const current=catalog.experiments.find(e=>e.id===exp.id)?.earths.find(e=>e.id===earth.id);if(!current)throw Error('Earth missing');
      if((current.checkpoints?.length??0)>=20)throw Error('Checkpoint limit reached (20). Delete an older checkpoint first.');
      await assertOwned(exp.repository,this.store.root,earth.id,earth.path);
      const indexTree=(await git(earth.path,['write-tree'])).trim(),contents=await snapshot(earth.path);
      if((await git(earth.path,['write-tree'])).trim()!==indexTree)throw Error('Staging changed during checkpoint; retry');
      const indexCommit=await commitTree(earth,indexTree,contents.revision,'ParallelEarth checkpoint index');
      const commit=await commitTree(earth,contents.tree,indexCommit,'ParallelEarth checkpoint: '+label);
      const checkpoint:Checkpoint={id:randomUUID(),label,created:new Date().toISOString(),commit,tree:contents.tree,indexTree,head:contents.revision};
      await git(exp.repository,['update-ref',ref(earth,checkpoint.id),commit,'']);
      (current.checkpoints??=[]).push(checkpoint);
      await writeFile(path.join(this.store.root,'manifests',earth.id+'.json'),JSON.stringify(current));return checkpoint;
    });
  }
  async previewRestore(earth:Earth,checkpointId:string){
    const exp=await this.owned(earth),current=exp.earths.find(e=>e.id===earth.id)!,checkpoint=current.checkpoints?.find(c=>c.id===checkpointId);
    if(!checkpoint||earth.baseline)throw Error('Checkpoint missing');
    await this.checkpointIdentity(earth,checkpoint);
    const contents=await snapshot(earth.path),indexTree=(await git(earth.path,['write-tree'])).trim();
    return {...contents,indexTree,preview:await git(earth.path,['diff','--no-ext-diff','--no-textconv','--stat',contents.tree,checkpoint.tree,'--'])+await git(earth.path,['diff','--no-ext-diff','--no-textconv',contents.tree,checkpoint.tree,'--'])};
  }
  private async checkpointIdentity(earth:Earth,checkpoint:Checkpoint){
    if((await git(earth.path,['rev-parse',ref(earth,checkpoint.id)])).trim()!==checkpoint.commit||
      (await git(earth.path,['rev-parse',checkpoint.commit+'^{tree}'])).trim()!==checkpoint.tree||
      (await git(earth.path,['rev-parse',checkpoint.commit+'~1^{tree}'])).trim()!==checkpoint.indexTree)throw Error('Checkpoint reference or tree changed');
  }
  async restoreCheckpoint(earth:Earth,checkpointId:string,approved:Snapshot&{indexTree:string}):Promise<Checkpoint>{
    const backup=await this.createCheckpoint(earth,'Before restore '+new Date().toISOString());
    const exp=await this.owned(earth);
    await new ExecutionQueue(this.store.root).execute(earth.id,undefined,()=>{},()=>this.store.transaction(async catalog=>{
      const current=catalog.experiments.find(e=>e.id===exp.id)?.earths.find(e=>e.id===earth.id),checkpoint=current?.checkpoints?.find(c=>c.id===checkpointId);
      if(!current||!checkpoint)throw Error('Checkpoint missing');await this.checkpointIdentity(earth,checkpoint);
      await assertOwned(exp.repository,this.store.root,earth.id,earth.path);const contents=await snapshot(earth.path);
      if(contents.tree!==approved.tree||contents.hash!==approved.hash||contents.revision!==approved.revision||(await git(earth.path,['write-tree'])).trim()!==approved.indexTree)throw Error('Earth changed after restore preview; preview again. Backup retained.');
      const destinations=(await git(earth.path,['ls-tree','-r','--name-only','-z',checkpoint.tree])).split('\0').filter(Boolean);
      const ignored=(await git(earth.path,['ls-files','--others','--ignored','--exclude-standard','-z'])).split('\0').filter(Boolean);
      if(ignored.some(i=>destinations.some(d=>i===d||i.startsWith(d+'/')||d.startsWith(i+'/'))))throw Error('An ignored file would be overwritten; preserve it before restore.');
      // Stage the backed-up working tree first so current non-ignored new files can be removed by Git.
      await git(earth.path,['read-tree','--reset','-u',contents.tree]);
      try{await git(earth.path,['read-tree','--reset','-u',checkpoint.tree]);await git(earth.path,['read-tree',checkpoint.indexTree]);}
      catch(error){throw Error('Restore interrupted. Safety checkpoint '+backup.id+' retains the previous files and index. '+String(error));}
      current.evidenceEpoch=randomUUID();
    }));return backup;
  }
  async deleteCheckpoint(earth:Earth,id:string):Promise<void>{
    const exp=await this.owned(earth);await this.store.transaction(async catalog=>{
      const current=catalog.experiments.find(e=>e.id===exp.id)?.earths.find(e=>e.id===earth.id),cp=current?.checkpoints?.find(c=>c.id===id);if(!current||!cp)throw Error('Checkpoint missing');
      await git(exp.repository,['update-ref','-d',ref(earth,id),cp.commit]);current.checkpoints=current.checkpoints!.filter(c=>c.id!==id);
      await writeFile(path.join(this.store.root,'manifests',earth.id+'.json'),JSON.stringify(current));
    });
  }
  async selectionFiles(earth:Earth){await this.owned(earth);const contents=await snapshot(earth.path);return {contents,files:(await git(earth.path,['diff','--no-renames','--name-only','-z',earth.sourceCommit,contents.tree,'--'])).split('\0').filter(Boolean)};}
  async prepareSelection(earth:Earth,files:string[],approved:Snapshot):Promise<Earth>{
    await this.owned(earth);if(earth.baseline)throw Error('Choose an alternative Earth');
    const selection=await this.selectionFiles(earth);if(selection.contents.tree!==approved.tree||selection.contents.hash!==approved.hash||selection.contents.revision!==approved.revision)throw Error('Earth changed after selection preview');
    if(!files.length||files.length>1000||new Set(files).size!==files.length||files.some(f=>!validPath(f)||!selection.files.includes(f)))throw Error('Choose changed files from the preview');
    const index=path.join(this.store.root,'selection-'+randomUUID()+'.index');let tree:string;
    try{await git(earth.path,['read-tree',earth.sourceCommit],index);for(const file of files)await git(earth.path,['--literal-pathspecs','restore','--staged','--source='+approved.tree,'--',file],index);tree=(await git(earth.path,['write-tree'],index)).trim();}
    finally{await unlink(index).catch(()=>{});await unlink(index+'.lock').catch(()=>{});}
    const selected=await this.createEarth(earth.experimentId,name((earth.name+' selection').slice(0,100)),false,{...approved,tree});
    await this.store.transaction(async catalog=>{catalog.experiments.find(e=>e.id===earth.experimentId)!.earths.find(e=>e.id===selected.id)!.selection={sourceEarthId:earth.id,files};});
    return {...selected,selection:{sourceEarthId:earth.id,files}};
  }
  override async bringBack(earth:Earth,branch:string,approved:Snapshot):Promise<string>{
    const exp=await this.owned(earth),current=exp.earths.find(e=>e.id===earth.id)!;
    if(current.selection){const series=checkSeries(current.runs),fresh=await this.freshness(current);if(series.summary!=='PASSED'||!series.runs.every(r=>fresh[r.id]==='CURRENT'))throw Error('Run passing current checks on the selected files before exporting this Earth.');}
    return super.bringBack(current,branch,approved);
  }
  async refreshBaseline(experimentId:string,refName:string,earthIds:string[]){
    const exp=(await this.store.load()).experiments.find(e=>e.id===experimentId);if(!exp)throw Error('Experiment missing');
    const baseline=await resolveCommit(exp.repository,refName);await git(exp.repository,['merge-base',exp.baselineCommit,baseline]);
    const selected=earthIds.map(id=>{const earth=exp.earths.find(e=>e.id===id&&!e.baseline);if(!earth)throw Error('Alternative missing');return earth;});
    const snapshots=[];for(const earth of selected){await this.owned(earth);snapshots.push({earth,contents:await snapshot(earth.path)});}
    const next=await this.createExperiment(exp.repository,name((exp.name+' refreshed').slice(0,100)),baseline);
    for(const criterion of exp.criteria??[])await this.saveCriterion(next.id,{...criterion,id:randomUUID()});
    if(exp.regression)await this.store.transaction(async catalog=>{catalog.experiments.find(e=>e.id===next.id)!.regression=exp.regression;});
    const results:{earth:Earth;conflicts:string[]}[]=[];
    for(const {earth,contents}of snapshots){
      const candidate=await this.createEarth(next.id,earth.name),commit=await commitTree(earth,contents.tree,exp.baselineCommit,'Carry '+earth.name+' to refreshed baseline');
      try{await git(candidate.path,['-c','user.name=ParallelEarth','-c','user.email=parallel-earth@localhost','merge','--no-commit','--no-ff',commit]);}
      catch(error){const conflicts=(await git(candidate.path,['diff','--name-only','--diff-filter=U','-z'])).split('\0').filter(Boolean);if(!conflicts.length)throw Error('Refresh stopped; new experiment '+next.id+' retained. '+String(error));}
      results.push({earth:candidate,conflicts:(await git(candidate.path,['diff','--name-only','--diff-filter=U','-z'])).split('\0').filter(Boolean)});
    }return {experiment:(await this.store.load()).experiments.find(e=>e.id===next.id)!,results};
  }
  async storageOverview(){
    const catalog=await this.store.load(),earths=[];const known=new Set<string>();
    for(const exp of catalog.experiments)for(const earth of exp.earths){known.add(path.basename(earth.path));let bytes=0,entries=0,partial=false,issue='';
      try{await this.owned(earth);const walk=async(dir:string,depth:number):Promise<void>=>{if(depth>64||entries>100000){partial=true;return;}for(const entry of await readdir(dir,{withFileTypes:true})){if(++entries>100000){partial=true;return;}const file=path.join(dir,entry.name),stat=await lstat(file);if(stat.isSymbolicLink())continue;if(stat.isDirectory())await walk(file,depth+1);else if(stat.isFile())bytes+=stat.size;}};await walk(earth.path,0);}catch(error){issue=String(error);}
      earths.push({experimentId:exp.id,experiment:exp.name,id:earth.id,name:earth.name,path:earth.path,baseline:earth.baseline,archived:earth.archived,checkpoints:earth.checkpoints?.length??0,bytes,partial,issue});
    }
    await noSymlinks(path.join(this.store.root,'earths'));let directories:string[]=[];try{directories=await readdir(path.join(this.store.root,'earths'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    let recoveryFiles:string[]=[];try{await noSymlinks(path.join(this.store.root,'run-recovery'));recoveryFiles=(await readdir(path.join(this.store.root,'run-recovery'))).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    return {root:this.store.root,earths,orphanDirectories:directories.filter(d=>!known.has(d)),recoveryFiles,queue:await new ExecutionQueue(this.store.root).snapshot()};
  }
  async recoverRuns(){
    const root=path.join(this.store.root,'run-recovery');await noSymlinks(root);let files:string[];try{files=await readdir(root);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
    const results:string[]=[];for(const file of files.filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)))try{
      const target=path.join(root,file);await noSymlinks(target);const run=JSON.parse(await readFile(target,'utf8')),catalog=await this.store.load(),exp=catalog.experiments.find(e=>e.earths.some(x=>x.id===run.earthId)),earth=exp?.earths.find(e=>e.id===run.earthId);
      if(!exp||!earth)throw Error('Earth missing; evidence retained');await this.owned(earth);validateCatalog({version:1,experiments:[{...exp,earths:[{...earth,runs:[run]}]}]});
      if(!earth.runs.some(r=>r.id===run.id))await this.record(earth,run);await unlink(target);results.push('Recovered run '+run.id);
    }catch(error){results.push(file+': '+String(error));}return results;
  }
  async recoverQueue(confirmedNoSurvivingCommands:boolean){
    const queue=new ExecutionQueue(this.store.root),status=await queue.snapshot();if(!confirmedNoSurvivingCommands||!status.running||alive(status.running.pid))throw Error('Recovery requires a dead owner and confirmation that no command survives.');
    const active=path.join(queue.directory,'active');if(!contained(this.store.root,active))throw Error('Invalid queue path');await noSymlinks(active);
    const owner=JSON.parse(await readFile(path.join(active,'owner.json'),'utf8'));if(owner.id!==status.running.id||alive(owner.pid))throw Error('Queue owner changed');
    await unlink(path.join(active,'owner.json'));await rmdir(active);
  }
  override async remove(earth:Earth,confirmed:boolean){const exp=await this.owned(earth);if(exp.earths.find(e=>e.id===earth.id)?.checkpoints?.length)throw Error('Delete or preserve checkpoints before removing this Earth');return super.remove(earth,confirmed);}
  override async deleteExperiment(id:string,confirmed:boolean,keep=true,progress?:(message:string)=>void){if(!keep&&(await this.store.load()).experiments.find(e=>e.id===id)?.earths.some(e=>e.checkpoints?.length))throw Error('Preserve or delete checkpoints before permanent cleanup');return super.deleteExperiment(id,confirmed,keep,progress);}
}

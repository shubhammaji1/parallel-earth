import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { lstat, mkdir, writeFile, readdir, readFile, unlink } from 'node:fs/promises';
import { Experiment, Earth, name, validateCatalog, Run } from './domain';
import { Store } from './store';
import { git, repositoryRoot, resolveCommit, createWorktree, assertOwned, changes, noSymlinks, ownershipContext } from './git';
import { earthDirectory } from './workspace';
export class Service {
  readonly store: Store;
  constructor(store: Store) { this.store = store; }
  async createExperiment(repository: string, label: string, ref = 'HEAD'): Promise<Experiment> {
    repository = await repositoryRoot(repository); const baselineCommit = await resolveCommit(repository,ref);
    const experiment: Experiment = {id:randomUUID(),name:name(label),repository,baselineCommit,created:new Date().toISOString(),earths:[]};
    await this.store.transaction(async catalog => { catalog.experiments.push(experiment); });
    await this.createEarth(experiment.id,'Baseline',true);
    return (await this.store.load()).experiments.find(e => e.id === experiment.id)!;
  }
  async createEarth(experimentId: string, label: string, baseline = false): Promise<Earth> {
    return this.store.transaction(async catalog => {
      const exp = catalog.experiments.find(e => e.id === experimentId); if (!exp) throw new Error('Experiment missing');
      if (exp.earths.length >= 100) throw new Error('Earth limit reached');
      if (baseline && exp.earths.some(e => e.baseline)) throw new Error('Baseline already exists');
      const id = randomUUID();
      const directory=earthDirectory(exp.repository,name(label),id);
      const target = path.join(this.store.root,'earths',directory);
      const earth: Earth = {id,experimentId,name:name(label),sourceCommit:exp.baselineCommit,path:target,created:new Date().toISOString(),archived:false,baseline,runs:[]};
      await noSymlinks(this.store.root);
      await mkdir(path.join(this.store.root,'manifests'),{recursive:true});
      const manifest = path.join(this.store.root,'manifests',id + '.json');
      await writeFile(manifest,JSON.stringify(earth),{flag:'wx'});
      await createWorktree(exp.repository,this.store.root,id,exp.baselineCommit,directory);
      exp.earths.push(earth); return earth;
    });
  }
  async owned(earth: Earth): Promise<Experiment> {
    const exp = (await this.store.load()).experiments.find(e => e.id === earth.experimentId);
    if (!exp || !exp.earths.some(e => e.id === earth.id && e.path === earth.path)) throw new Error('Unknown Earth');
    await assertOwned(exp.repository,this.store.root,earth.id,earth.path); return exp;
  }
  async remove(earth: Earth, confirmed: boolean): Promise<void> {
    if (!confirmed) throw new Error('Explicit deletion confirmation required');
    const exp = await this.owned(earth);
    if (earth.baseline) throw new Error('Baseline deletion is disabled');
    if ((await git(earth.path,['status','--porcelain','--untracked-files=all','--ignored'])).trim()) throw new Error('Earth has changed, untracked or ignored files. Preserve or remove them manually before deletion.');
    if ((await git(earth.path,['rev-parse','HEAD'])).trim() !== earth.sourceCommit) throw new Error('Earth has commits. Preserve them manually before deletion.');
    await this.store.transaction(async catalog => {
      await assertOwned(exp.repository,this.store.root,earth.id,earth.path);
      await git(exp.repository,['worktree','remove',earth.path]);
      const current = catalog.experiments.find(e => e.id === exp.id)!;
      current.earths = current.earths.filter(e => e.id !== earth.id);
      await unlink(path.join(this.store.root,'manifests',earth.id + '.json')).catch(() => {});
    });
  }
  async deleteExperiment(experimentId:string,confirmed:boolean,keepWorktrees=true,onProgress?:(message:string)=>void):Promise<void> {
    if(!confirmed)throw new Error('Explicit experiment deletion confirmation required');
    const progress=(message:string)=>{try{onProgress?.(message);}catch{/* A view callback must not interrupt filesystem cleanup. */}};
    if(keepWorktrees){
      progress('Removing experiment from history...');
      await this.store.transaction(async catalog=>{
        if(!catalog.experiments.some(e=>e.id===experimentId))throw new Error('Experiment missing');
        catalog.experiments=catalog.experiments.filter(e=>e.id!==experimentId);
      });
      progress('Removed from history. Earth files retained.');return;
    }
    const exp=(await this.store.load()).experiments.find(e=>e.id===experimentId);
    if(!exp)throw new Error('Experiment missing');
    // Share the repository snapshot, but verify every live worktree marker/backlink on both passes.
    const context=exp.earths.length?await ownershipContext(exp.repository,this.store.root):undefined;
    const clean=async(earth:Earth):Promise<void>=>{
      await assertOwned(exp.repository,this.store.root,earth.id,earth.path,context);
      const status=await git(earth.path,['status','--porcelain=v2','--branch','--untracked-files=all','--ignored']);
      const lines=status.split(/\r?\n/).filter(Boolean);
      if(lines.some(line=>!line.startsWith('# ')))throw new Error(earth.name+' has changed, untracked or ignored files. Use Remove from History to keep its files.');
      const revision=lines.find(line=>line.startsWith('# branch.oid '))?.slice(13);
      if(revision!==earth.sourceCommit)throw new Error(earth.name+' has commits that need preservation. Use Remove from History to keep its files.');
    };
    // Read-only preflight is bounded to two worktrees at a time. Removals remain sequential.
    for(let index=0;index<exp.earths.length;index+=2){
      progress('Checking worktrees '+(index+1)+'–'+Math.min(index+2,exp.earths.length)+' of '+exp.earths.length);
      await Promise.all(exp.earths.slice(index,index+2).map(clean));
    }
    for(const [index,earth]of exp.earths.entries()){
      progress('Removing '+earth.name+' ('+(index+1)+'/'+exp.earths.length+')');
      await this.store.transaction(async catalog=>{
        const record=catalog.experiments.find(e=>e.id===experimentId),owned=record?.earths.find(e=>e.id===earth.id);
        if(!record||!owned)throw new Error('Experiment changed during deletion');
        await clean(owned);
        await git(exp.repository,['worktree','remove',owned.path]);
        record.earths=record.earths.filter(e=>e.id!==owned.id);
        await unlink(path.join(this.store.root,'manifests',owned.id+'.json')).catch(()=>{});
      });
    }
    await this.store.transaction(async catalog=>{
      const record=catalog.experiments.find(e=>e.id===experimentId);
      if(record?.earths.length)throw new Error('Experiment acquired another Earth; deletion stopped');
      catalog.experiments=catalog.experiments.filter(e=>e.id!==experimentId);
    });
    progress('Experiment and clean worktrees removed.');
  }


  async update(earth: Earth, patch: {name?: string; archived?: boolean}): Promise<void> {
    await this.owned(earth);
    if (earth.baseline) throw new Error('Baseline metadata is read-only');
    await this.store.transaction(async catalog => {
      const current = catalog.experiments.find(e => e.id === earth.experimentId)!.earths.find(e => e.id === earth.id)!;
      if (patch.name !== undefined) current.name = name(patch.name);
      if (patch.archived !== undefined) current.archived = patch.archived;
    });
  }
  async record(earth: Earth, run: Run): Promise<void> {
    await this.store.transaction(async catalog => {
      const current = catalog.experiments.find(e => e.id === earth.experimentId)?.earths.find(e => e.id === earth.id);
      if (!current) throw new Error('Earth removed while running; evidence not saved');
      current.runs = [...current.runs,run].slice(-50);
    });
  }
  async inspect(earth: Earth): Promise<string> { await this.owned(earth); return changes(earth.path,earth.sourceCommit); }
  async recover(): Promise<string[]> {
    return this.store.transaction(async catalog => {
      const result: string[] = [];
      const manifests = path.join(this.store.root,'manifests');
      let files: string[] = [];
      try { files = await readdir(manifests); } catch { /* none yet */ }
      for (const file of files) {
        if (!/^[0-9a-f-]{36}\.json$/.test(file)) continue;
        try {
          await noSymlinks(path.join(manifests,file));
          const candidate = JSON.parse(await readFile(path.join(manifests,file),'utf8')) as Earth;
          const exp = catalog.experiments.find(e => e.id === candidate.experimentId);
          if (!exp || exp.earths.some(e => e.id === candidate.id)) continue;
          validateCatalog({version:1,experiments:[{...exp,earths:[...exp.earths,candidate]}]});
          await assertOwned(exp.repository,this.store.root,candidate.id,candidate.path);
          exp.earths.push(candidate); result.push('Recovered: ' + candidate.name);
        } catch (e) { result.push(file + ': recovery refused — ' + String(e)); }
      }
      for (const exp of catalog.experiments) for (const earth of exp.earths) {
        try { await lstat(earth.path); await assertOwned(exp.repository,this.store.root,earth.id,earth.path); result.push(earth.name + ': registered'); }
        catch (e) { result.push(earth.name + ': unavailable — ' + String(e)); }
      }
      return result;
    });
  }
}


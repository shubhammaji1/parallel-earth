import type * as vscode from 'vscode';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Earth, Experiment, Command, RunKind, validateCriterion } from './domain';
import { LifecycleService } from './lifecycle';
import { contained, git, readPackage, resolveCommit } from './git';
import { cli, Recipe } from './cli';
import { parseRecipeMessage, recipeMarkup } from './recipe-view';
import { NativeTests } from './native-tests';
import { storageMarkup, parseStorageMessage } from './storage-view';
interface Item {experimentId?:string;earthId?:string}
interface Options {api:typeof vscode;context:vscode.ExtensionContext;service:LifecycleService;trusted:()=>void;earth:(item?:Item,baseline?:boolean)=>Promise<Earth|undefined>;experiment:(item?:Item)=>Promise<Experiment|undefined>;busy:(earth:Earth)=>boolean;text:(value:string,language?:string)=>Promise<unknown>;refresh:()=>void;execute:(earths:Earth[],command:Command,kind:RunKind,count?:number)=>Promise<void>;activateExperiment:(id:string)=>void;onChecksRecorded?:(listener:(ids:string[])=>Promise<void>)=>void}
export function advancedHandlers(o:Options):Record<string,(item?:Item)=>Promise<unknown>>{
  const {api,context,service}=o;let native:NativeTests|undefined,nativeExperimentId:string|undefined;
  const safe=(earth:Earth)=>{o.trusted();if(o.busy(earth))throw Error('Stop previews and checks before changing this Earth.');if(api.workspace.textDocuments.some(d=>d.isDirty&&d.uri.scheme==='file'&&contained(earth.path,d.uri.fsPath)))throw Error('Save or close unsaved Earth files before continuing.');};
  const publish=async(exp:Experiment)=>{native?.publish(await service.report(exp));};
  o.onChecksRecorded?.(async ids=>{if(native&&nativeExperimentId&&ids.includes(nativeExperimentId)){const exp=(await service.store.load()).experiments.find(e=>e.id===nativeExperimentId);if(exp)await publish(exp);}});
  if(api.workspace.onDidChangeTextDocument)context.subscriptions.push(api.workspace.onDidChangeTextDocument(()=>native?.invalidate()));
  return {
    async createCheckpoint(item){const earth=await o.earth(item,false);if(!earth)return;safe(earth);const label=await api.window.showInputBox({prompt:'Checkpoint name (files and staging are preserved)',value:'Before next attempt'});if(!label)return;safe(earth);const cp=await service.createCheckpoint(earth,label);await api.window.showInformationMessage('Checkpoint saved: '+cp.label);},
    async restoreCheckpoint(item){const earth=await o.earth(item,false);if(!earth)return;safe(earth);const exp=await service.owned(earth),current=exp.earths.find(e=>e.id===earth.id)!;
      const choice=await api.window.showQuickPick((current.checkpoints??[]).map(c=>({label:c.label,description:c.created,id:c.id})),{placeHolder:'Choose a checkpoint to restore'});if(!choice)return;
      const preview=await service.previewRestore(earth,choice.id);await o.text(preview.preview||'Files match this checkpoint. Staging will be restored.','diff');
      if(await api.window.showWarningMessage('Restore files and staging for '+earth.name+'? A safety checkpoint will preserve the current state first. HEAD commits stay in place. Ignored files are not part of checkpoints.',{modal:true},'Restore Checkpoint')!=='Restore Checkpoint')return;
      safe(earth);const backup=await service.restoreCheckpoint(earth,choice.id,preview);native?.invalidate();await api.window.showInformationMessage('Checkpoint restored. Safety checkpoint: '+backup.label+'. Rerun checks.');},
    async deleteCheckpoint(item){const earth=await o.earth(item,false);if(!earth)return;safe(earth);const exp=await service.owned(earth),current=exp.earths.find(e=>e.id===earth.id)!;
      const choice=await api.window.showQuickPick((current.checkpoints??[]).map(c=>({label:c.label,id:c.id})),{placeHolder:'Choose checkpoint to delete'});if(choice&&await api.window.showWarningMessage('Delete checkpoint '+choice.label+'?',{modal:true},'Delete Checkpoint')==='Delete Checkpoint')await service.deleteCheckpoint(earth,choice.id);},
    async selectiveExport(item){const earth=await o.earth(item,false);if(!earth)return;safe(earth);const selection=await service.selectionFiles(earth);
      const choices=await api.window.showQuickPick(selection.files.map(file=>({label:file,picked:true})),{canPickMany:true,placeHolder:'Choose complete files to include; a new Earth will be created for verification'});if(!choices?.length)return;
      const files=choices.map(c=>c.label);await o.text(files.join('\n'),'plaintext');
      if(await api.window.showWarningMessage('Create a verification Earth with these '+files.length+' files? Run checks there, then use Bring Changes Back. The export will start from the experiment baseline.',{modal:true},'Create Selection')!=='Create Selection')return;
      safe(earth);const selected=await service.prepareSelection(earth,files,selection.contents);o.activateExperiment(selected.experimentId);await api.window.showInformationMessage('Created '+selected.name+'. Set up dependencies and run checks before Bring Changes Back.');await api.commands.executeCommand('parallelEarth.openEarth',{experimentId:selected.experimentId,earthId:selected.id});},
    async refreshBaseline(item){o.trusted();const exp=await o.experiment(item);if(!exp)return;for(const earth of exp.earths)safe(earth);
      const ref=await api.window.showInputBox({prompt:'New baseline Git reference',value:'HEAD'});if(!ref)return;const commit=await resolveCommit(exp.repository,ref);
      const selected=await api.window.showQuickPick(exp.earths.filter(e=>!e.baseline&&!e.archived).map(e=>({label:e.name,id:e.id,picked:true})),{canPickMany:true,placeHolder:'Choose alternatives to carry into a new experiment'});if(!selected)return;
      if(await api.window.showWarningMessage('Create a refreshed experiment at '+commit.slice(0,12)+' and carry '+selected.length+' alternative(s)? Conflicts stay in the new Earths for resolution; existing experiments are preserved.',{modal:true},'Refresh Baseline')!=='Refresh Baseline')return;
      for(const earth of exp.earths)safe(earth);const result=await service.refreshBaseline(exp.id,commit,selected.map(e=>e.id));o.activateExperiment(result.experiment.id);
      await o.text('Refreshed experiment: '+result.experiment.name+'\n\n'+result.results.map(r=>r.earth.name+': '+(r.conflicts.length?'Resolve conflicts in '+r.conflicts.join(', '):'Changes carried; rerun setup/checks')+'\n'+r.earth.path).join('\n\n'));},
    async storageManager(){o.trusted();
      const panel=api.window.createWebviewPanel('parallelEarth.storage','Earth storage and recovery',api.ViewColumn.One,{enableScripts:true,localResourceRoots:[]});context.subscriptions.push(panel);let busy=false,closed=false;
      context.subscriptions.push(panel.onDidDispose(()=>{closed=true;}));
      const render=async()=>{const data=await service.storageOverview();if(!closed)panel.webview.html=storageMarkup(data,randomUUID());};await render();
      context.subscriptions.push(panel.webview.onDidReceiveMessage(async value=>{if(busy)return;const message=parseStorageMessage(value);if(!message)return;busy=true;try{
        o.trusted();
        if(message.action==='records')await o.text((await service.recover()).join('\n'));
        if(message.action==='runs')await o.text((await service.recoverRuns()).join('\n')||'No retained runs.');
        if(message.action==='queue'&&await api.window.showWarningMessage('Verify all commands from the interrupted host have stopped before recovering its queue.',{modal:true},'No Commands Survive')==='No Commands Survive')await service.recoverQueue(true);
        if(message.action==='cleanup'){
          const earth=(await service.store.load()).experiments.flatMap(e=>e.earths).find(e=>e.id===message.earthId);if(!earth)return;safe(earth);
          if(await api.window.showWarningMessage('Remove clean Earth '+earth.name+'? Edits, ignored files, commits and checkpoints will prevent removal.',{modal:true},'Remove Earth')==='Remove Earth')await service.remove(earth,true);
        }
      }catch(error){await api.window.showErrorMessage('ParallelEarth: '+String(error));}finally{busy=false;await render();o.refresh();}}));
    },
    async guidedRegression(item){o.trusted();const exp=await o.experiment(item);if(!exp)return;const baseline=exp.earths.find(e=>e.baseline);if(!baseline)throw Error('Baseline missing');
      const choice=await api.window.showQuickPick(exp.earths.filter(e=>!e.baseline&&!e.archived).map(earth=>({label:earth.name,earth})),{placeHolder:'Choose the implementation that should fix the bug'});if(!choice)return;
      const run=choice.earth.runs.findLast(r=>r.kind!=='setup'&&r.testReport?.complete);if(!run)throw Error('Run a structured Jest/Vitest check in the candidate first.');
      const tests=await api.window.showQuickPick(run.testReport!.tests.map(t=>({label:t.name,description:t.file,id:t.id})),{canPickMany:true,placeHolder:'Select regression tests expected to fail on baseline and pass on candidate'});if(!tests?.length)return;
      validateCriterion({id:exp.id,label:'Regression goal',command:run.command,testIds:tests.map(t=>t.id)});
      await service.store.transaction(async catalog=>{catalog.experiments.find(e=>e.id===exp.id)!.regression={command:run.command,testIds:tests.map(t=>t.id),minimumRuns:3};});
      await o.execute([baseline,choice.earth],run.command,'check',3);const report=await service.report((await service.store.load()).experiments.find(e=>e.id===exp.id)!);await o.text(JSON.stringify(report.earths.find(e=>e.id===choice.earth.id)?.regression,null,2),'json');await publish((await service.store.load()).experiments.find(e=>e.id===exp.id)!);},
    async publishTests(item){o.trusted();const exp=await o.experiment(item);if(!exp)return;
      nativeExperimentId=exp.id;
      if(!native){native=new NativeTests(api,async ids=>{const current=(await service.store.load()).experiments.find(e=>e.id===nativeExperimentId);if(!current)return;for(const earth of current.earths.filter(e=>ids.includes(e.id))){const run=earth.runs.findLast(r=>r.kind!=='setup');if(run)await o.execute([earth],run.command,'check');}const updated=(await service.store.load()).experiments.find(e=>e.id===nativeExperimentId);if(updated)await publish(updated);});context.subscriptions.push(native);}
      await publish(exp);await api.commands.executeCommand('workbench.view.testing.focus');},
    async recipeBuilder(item){o.trusted();const exp=await o.experiment(item);if(!exp)return;
      const scripts=[...new Set((await Promise.all(exp.earths.map(e=>readPackage(e.path)))).flatMap(p=>Object.keys(p).filter(s=>/^(test|check|lint|build|typecheck)(:|$)/.test(s))))];
      const tests=new Map(exp.earths.flatMap(e=>e.runs.flatMap(r=>r.testReport?.tests??[])).map(t=>[t.id,t]));
      const criteria=(exp.criteria??[]).filter(c=>c.testIds.length&&c.testIds.every(id=>tests.has(id))&&c.command?.program==='npm').map(c=>({label:c.label,script:c.command!.args[1],tests:c.testIds.map(id=>({file:tests.get(id)!.file,name:tests.get(id)!.name}))}));
      const recipe:Recipe={version:1,name:exp.name,baseline:exp.baselineCommit,candidate:'HEAD',script:exp.earths.flatMap(e=>e.runs).findLast(r=>r.kind!=='setup'&&r.command.program==='npm')?.command.args[1]??scripts[0]??'test',repeat:3};
      if(exp.regression?.testIds.every(id=>tests.has(id)))recipe.regressionTests=exp.regression.testIds.map(id=>({file:tests.get(id)!.file,name:tests.get(id)!.name}));
      const panel=api.window.createWebviewPanel('parallelEarth.recipe','Experiment recipe',api.ViewColumn.One,{enableScripts:true,localResourceRoots:[]});context.subscriptions.push(panel);panel.webview.html=recipeMarkup({recipe,scripts,availableCriteria:criteria,regressionScript:exp.regression?.command.args[1]},randomUUID());let busy=false;
      context.subscriptions.push(panel.webview.onDidReceiveMessage(async value=>{if(busy)return;const message=parseRecipeMessage(value);if(!message)return;busy=true;try{
        o.trusted();await resolveCommit(exp.repository,message.recipe.baseline);await resolveCommit(exp.repository,message.recipe.candidate);
        const file=await api.window.showSaveDialog({defaultUri:api.Uri.file(path.join(exp.repository,'parallel-earth.recipe.json')),filters:{Recipe:['json']}});if(!file)return;await writeFile(file.fsPath,JSON.stringify(message.recipe,null,2)+'\n');
        if(message.action==='save'){await api.window.showInformationMessage('Recipe saved: '+file.fsPath);return;}
        if(await api.window.showWarningMessage('Run recipe '+message.recipe.name+'?\n'+JSON.stringify(message.recipe,null,2)+'\nRepository scripts and setup execute with your privileges.',{modal:true},'Approve Recipe Run')!=='Approve Recipe Run')return;
        const directory=path.join(service.store.root,'reports');await mkdir(directory,{recursive:true});const reportPath=path.join(directory,randomUUID()+'.json'),messages:string[]=[];
        const code=await api.window.withProgress({location:api.ProgressLocation.Notification,title:'Running experiment recipe',cancellable:true},async(_progress,token)=>{const controller=new AbortController(),subscription=token.onCancellationRequested(()=>controller.abort());if(token.isCancellationRequested)controller.abort();try{return await cli(['ci','--storage',service.store.root,'--repo',exp.repository,'--recipe',file.fsPath,'--approve','--output',reportPath],{out:s=>messages.push(s),err:s=>messages.push(s)},controller.signal);}finally{subscription.dispose();}});
        try{const report=JSON.parse(await readFile(reportPath,'utf8'));o.activateExperiment(report.experimentId);await o.text(JSON.stringify(report,null,2),'json');}catch{await o.text(messages.join('\n'));}await api.window.showInformationMessage('Recipe finished with exit code '+code+'. Review the recorded evidence.');
      }catch(error){await api.window.showErrorMessage('ParallelEarth: '+String(error));}finally{busy=false;o.refresh();}}));
    }
  };
}

import { sidebarMarkup, parseSidebarMessage } from './sidebar';
import * as vscode from 'vscode';
import path from 'node:path';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { Store, Service, Runner, ExecutionQueue, QueueState, RunKind, fingerprint, validateCommand, Earth, Experiment, Command, git, repositoryRoot, readPackage, discoverCommands, applyPatch, compare, checkSeries, markdown } from './index';

import { earthWorkspace } from './workspace';
import { projectHistory, projectSummaries } from './history';
import { homeMarkup, parseHomeMessage } from './home';
import { setInterval as interval, clearInterval } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';

interface Item extends vscode.TreeItem { experimentId?: string; earthId?: string; projectRepository?: string }
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('ParallelEarth');
  const change = new vscode.EventEmitter<Item | undefined>();
  const cfg = () => vscode.workspace.getConfiguration('parallelEarth');
  const root = cfg().get<string>('storageRoot') || context.globalStorageUri.fsPath;
  const service = new Service(new Store(root));
  const runner = new Runner(1);
  const queue = new ExecutionQueue(root);
  const queueStates = new Map<string, QueueState>();
  const controllers = new Set<AbortController>();
  const running = new Set<string>();
  const deleting = new Set<string>();
  let activeExperimentId:string|undefined;
  let homePanel:vscode.WebviewPanel|undefined;
  let sidebarView:vscode.WebviewView|undefined;
  let sidebarSnapshot="";
  let homeVersion=0;
  let homeReady=false;
  let homeSnapshot='';
  async function renderHome():Promise<void>{
    const panel=homePanel,version=++homeVersion;if(!panel)return;
    const projects=vscode.workspace.isTrusted?projectHistory(await service.store.load()):[];
    if(panel!==homePanel||version!==homeVersion)return;
    const summaries=projectSummaries(projects),snapshot=JSON.stringify(summaries);
    if(homeReady){
      if(snapshot===homeSnapshot)return;
      homeSnapshot=snapshot;
      if(!await panel.webview.postMessage({type:'history',projects:summaries}))homeSnapshot='';
      return;
    }
    homeReady=true;homeSnapshot=snapshot;
    const logo=panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','parallel-earth-logo.png')).toString();
    panel.webview.html=homeMarkup(projects,logo,panel.webview.cspSource,randomUUID());
  }
  async function showHome():Promise<void>{
    if(homePanel){homePanel.reveal(vscode.ViewColumn.One);await renderHome();return;}
    const panel=vscode.window.createWebviewPanel('parallelEarth.home','ParallelEarth',vscode.ViewColumn.One,{
      enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]
    });
    homePanel=panel;homeReady=false;homeSnapshot='';
    panel.iconPath=vscode.Uri.joinPath(context.extensionUri,'media','icon.png');
    context.subscriptions.push(panel,panel.onDidDispose(()=>{if(homePanel===panel){homePanel=undefined;homeReady=false;homeSnapshot='';}}),
      panel.webview.onDidReceiveMessage(async value=>{
        const message=parseHomeMessage(value);if(!message)return;
        const command=message.action==='create'?'createExperiment':message.action==='history'?'showHistory':message.action==='open'?'openExperiment':'deleteExperiment';
        await vscode.commands.executeCommand('parallelEarth.'+command,'experimentId' in message?{experimentId:message.experimentId}:undefined);
      }));
    await renderHome();
  }
  async function renderSidebar():Promise<void>{
    const view=sidebarView;if(!view)return;
    const projects=vscode.workspace.isTrusted?projectHistory(await service.store.load()):[];
    if(sidebarView!==view)return;
    const summaries=projectSummaries(projects);
    const state={trusted:vscode.workspace.isTrusted,projectCount:projects.length,
      experimentCount:summaries.reduce((n,p)=>n+p.experimentCount,0),earthCount:summaries.reduce((n,p)=>n+p.earthCount,0),
      activeName:projects.flatMap(p=>p.experiments).find(e=>e.id===activeExperimentId)?.name};
    const snapshot=JSON.stringify(state);if(snapshot===sidebarSnapshot)return;sidebarSnapshot=snapshot;
    const logo=view.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','icon.png')).toString();
    view.webview.html=sidebarMarkup(state,logo,view.webview.cspSource,randomUUID());
  }
  const refresh = () => {
    change.fire(undefined);
    void renderHome().catch(error=>output.appendLine(String(error)));
    void renderSidebar().catch(error=>output.appendLine(String(error)));
  };
  async function showExplorer(): Promise<void> {
    refresh();
    await vscode.commands.executeCommand('workbench.view.extension.parallelEarth');
    await vscode.commands.executeCommand('parallelEarth.explorer.focus');
  }
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  status.text = '$(globe) ParallelEarth';
  status.tooltip = 'Open Earth Explorer — experiments are stored outside the original repository';
  status.command = 'parallelEarth.showHome';
  status.show();
  context.subscriptions.push(status);
  function trusted(): void { if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before using Git, worktrees, patches or checks.'); }
  async function experiment(item?: Item): Promise<Experiment | undefined> {
    const all = (await service.store.load()).experiments;
    if (item?.experimentId) return all.find(e => e.id === item.experimentId);
    if(activeExperimentId)return all.find(e=>e.id===activeExperimentId);
    const selection = await vscode.window.showQuickPick(all.map(e => ({label:e.name,description:path.basename(e.repository)+' | '+e.baselineCommit.slice(0,8),detail:e.repository,id:e.id})),{placeHolder:'Choose an experiment'});
    return all.find(e => e.id === selection?.id);
  }
  async function earth(item?: Item, includeBaseline = true): Promise<Earth | undefined> {
    const exp = await experiment(item); if (!exp) return;
    if (item?.earthId) return exp.earths.find(e => e.id === item.earthId && (includeBaseline || !e.baseline));
    const selection = await vscode.window.showQuickPick(exp.earths.filter(e => includeBaseline || !e.baseline).map(e => ({label:e.name,description:(e.baseline?'Baseline · ':'')+(e.archived?'Archived · ':'')+(e.runs.at(-1)?.state??'NOT_RUN'),id:e.id})),{placeHolder:'Choose an Earth'});
    return exp.earths.find(e => e.id === selection?.id);
  }
  async function text(content: string, language = 'markdown'): Promise<void> {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({content,language}));
  }
  async function repository(): Promise<string | undefined> {
    const found = new Set<string>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme !== 'file') continue;
      try { found.add(await repositoryRoot(folder.uri.fsPath)); } catch { /* report if none */ }
    }
    if(!found.size){
      const folders=await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'Choose project'});
      if(!folders?.[0])return;
      return repositoryRoot(folders[0].fsPath);
    }
    const pick=await vscode.window.showQuickPick([
      ...[...found].map(repo=>({label:path.basename(repo),description:repo,repository:repo})),
      {label:'Choose another repository...',description:'Browse for a local Git project',repository:undefined}
    ],{placeHolder:'Which project should this experiment use?'});
    if(!pick)return;
    if(pick.repository)return pick.repository;
    const folders=await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'Use Git repository'});
    if(!folders?.[0])return;
    return repositoryRoot(folders[0].fsPath);
  }
  function action(label: string, command: string, parent: Item): Item {
    const item: Item = new vscode.TreeItem(label);
    item.command = {command:'parallelEarth.'+command,title:label,arguments:[parent]};
    const icons:Record<string,string>={createEarth:'add',compareEarths:'git-compare',exportReport:'export',openDocumentation:'book',showDiagnostics:'info'};
    item.iconPath = new vscode.ThemeIcon(icons[command]??'arrow-right');
    return item;
  }
  const experimentItem=(exp: Experiment):Item=>{
    const item:Item=new vscode.TreeItem(exp.name,vscode.TreeItemCollapsibleState.Expanded);
    item.id='experiment:'+exp.id;item.experimentId=exp.id;item.contextValue='parallelEarth.experiment';
    item.description=path.basename(exp.repository)+' | '+exp.earths.filter(e=>!e.baseline).length+' Earths';
    item.tooltip=exp.repository+'\nBaseline commit: '+exp.baselineCommit;item.iconPath=new vscode.ThemeIcon('beaker',new vscode.ThemeColor('charts.purple'));
    return item;
  };
  const provider: vscode.TreeDataProvider<Item> = {
    onDidChangeTreeData:change.event,getTreeItem:item=>item,
    getChildren:async parent=>{
      try{
        if(!vscode.workspace.isTrusted)return[action('Read getting started','openDocumentation',{})];
        const catalog=await service.store.load();
        if(!parent){
          const selected=catalog.experiments.find(exp=>exp.id===activeExperimentId);
          return selected?[experimentItem(selected)]:[];
        }
        const exp=catalog.experiments.find(e=>e.id===parent.experimentId);if(!exp)return[];
        if(!parent.earthId)return[
          ...exp.earths.map(earth=>{
            const state=checkSeries(earth.runs).summary;
            const item:Item=new vscode.TreeItem(earth.name,vscode.TreeItemCollapsibleState.None);
            item.id='earth:'+earth.id;item.experimentId=exp.id;item.earthId=earth.id;
            const states:Record<string,string>={PASSED:'Checks passed',FAILED:'Checks failed',ERROR:'Check error',CANCELLED:'Cancelled',NOT_RUN:'Not checked',UNSTABLE:'Unstable checks',INCONCLUSIVE:'Incomplete evidence'};
            item.description=(earth.archived?'Archived | ':earth.baseline?'Baseline | ':'')+(queueStates.get(earth.id)==='QUEUED'?'Queued':queueStates.get(earth.id)==='RUNNING'?'Running':queueStates.get(earth.id)==='CANCELLED'?'Cancelled':states[state]??state);
            item.contextValue=earth.baseline?'parallelEarth.baseline':'parallelEarth.earth';
            item.command={command:'parallelEarth.openEarth',title:'Open Earth',arguments:[item]};
            item.tooltip='Setup: '+(earth.runs.findLast(r=>r.kind==='setup')?.state??'Not recorded')+'\nEarth working directory: '+earth.path+'\n'+(earth.baseline?'Committed baseline':'Alternative Earth')+'\nFresh Earths do not install dependencies. Right-click for Copy Path, Reveal Folder and Set Up Earth.';
            const icon=earth.baseline?'git-commit':state==='PASSED'?'pass':state==='FAILED'?'error':state==='ERROR'?'warning':'globe';
            const color=state==='PASSED'?'charts.green':state==='FAILED'?'charts.red':state==='ERROR'?'charts.yellow':'charts.blue';
            item.iconPath=new vscode.ThemeIcon(icon,new vscode.ThemeColor(color));return item;
          }),
          action('Create Earth','createEarth',parent),action('Compare evidence','compareEarths',parent),
          action('Export report','exportReport',parent),action('Repeat checks (baseline + alternatives)','repeatChecks',parent)
        ];
        return [];
      }catch(e){output.appendLine(String(e));return[action('Catalog unavailable - Show Diagnostics','showDiagnostics',{})];}
    }
  };
  const historyProvider:vscode.TreeDataProvider<Item>={
    onDidChangeTreeData:change.event,getTreeItem:item=>item,
    getChildren:async parent=>{
      try{
        if(!vscode.workspace.isTrusted)return[];
        const groups=projectHistory(await service.store.load());
        if(!parent)return groups.map((project,index)=>{
          const item:Item=new vscode.TreeItem(project.name,vscode.TreeItemCollapsibleState.Collapsed);
          item.id='history-project:'+project.repository;item.projectRepository=project.repository;
          item.description=project.experiments.length+' experiment'+(project.experiments.length===1?'':'s');
          item.tooltip=project.repository;
          item.iconPath=new vscode.ThemeIcon('repo',new vscode.ThemeColor(['charts.blue','charts.purple','charts.green','charts.orange'][index%4]));return item;
        });
        const project=groups.find(p=>p.repository===parent.projectRepository);if(!project)return[];
        return project.experiments.map(exp=>{
          const item:Item=new vscode.TreeItem(exp.name);
          item.id='history-experiment:'+exp.id;item.experimentId=exp.id;item.contextValue='parallelEarth.historyExperiment';
          item.description=exp.earths.filter(e=>!e.baseline).length+' Earths';
          item.tooltip=exp.repository+'\nCreated: '+new Date(exp.created).toLocaleString()+'\nBaseline: '+exp.baselineCommit;
          item.iconPath=new vscode.ThemeIcon('beaker',new vscode.ThemeColor('charts.purple'));
          item.command={command:'parallelEarth.openExperiment',title:'Resume experiment',arguments:[item]};return item;
        });
      }catch(e){output.appendLine(String(e));return[action('History unavailable - Show Diagnostics','showDiagnostics',{})];}
    }
  };


  const launchpad=vscode.window.registerWebviewViewProvider('parallelEarth.launchpad',{
    resolveWebviewView(view){
      sidebarView=view;sidebarSnapshot='';
      view.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]};
      context.subscriptions.push(view.onDidDispose(()=>{if(sidebarView===view){sidebarView=undefined;sidebarSnapshot='';}}),
        view.webview.onDidReceiveMessage(value=>{
          const action=parseSidebarMessage(value);if(!action)return;
          const command={create:'createExperiment',resume:'openExperiment',home:'showHome',help:'openDocumentation'}[action];
          void vscode.commands.executeCommand('parallelEarth.'+command);
        }));
      void renderSidebar().catch(error=>output.appendLine(String(error)));
    }
  });
  const explorerView=vscode.window.createTreeView('parallelEarth.explorer',{treeDataProvider:provider});
  const historyView=vscode.window.createTreeView('parallelEarth.history',{treeDataProvider:historyProvider});
  // Opening the activity-bar container should reveal Home in installed builds too.
  const openHomeFromSidebar=()=>{
    if(homePanel)return;
    void showHome().catch(error=>{
      output.appendLine(String(error));
      void vscode.window.showErrorMessage('ParallelEarth: Unable to open Home. '+String(error));
    });
  };
  context.subscriptions.push(output,change,launchpad,explorerView,historyView,
    explorerView.onDidChangeVisibility(event=>{if(event.visible)openHomeFromSidebar();}),
    historyView.onDidChangeVisibility(event=>{if(event.visible)openHomeFromSidebar();}),
    vscode.workspace.onDidGrantWorkspaceTrust(refresh),
    {dispose:()=>{for(const controller of controllers)controller.abort();}},
    vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('parallelEarth.storageRoot')||e.affectsConfiguration('parallelEarth.maxConcurrentRuns'))void vscode.window.showInformationMessage('Reload the VS Code window to apply ParallelEarth storage or concurrency changes.');})
  );
  const queuePoll = interval(()=>{
    if(!vscode.workspace.isTrusted)return;
    void queue.snapshot().then(snapshot=>{
      for(const [id,value] of queueStates)if(value!=='CANCELLED')queueStates.delete(id);
      for(const job of snapshot.queued)queueStates.set(job.earthId,'QUEUED');
      if(snapshot.running)queueStates.set(snapshot.running.earthId,'RUNNING');
      change.fire(undefined);
    }).catch(error=>output.appendLine(String(error)));
  },2000);queuePoll.unref();context.subscriptions.push({dispose:()=>clearInterval(queuePoll)});

  async function chooseCheck(selected:Earth):Promise<Command|undefined>{
    const commands=await discoverCommands(selected.path);
    const choice=await vscode.window.showQuickPick([...commands.map(c=>({label:c.label,description:c.program+' '+c.args.join(' '),command:c})),{label:'Node test file…',description:'node --test <relative-file.js>',command:undefined}],{placeHolder:'Choose a check; use Set Up Earth first if dependencies are missing'});
    if(!choice)return;
    let command=choice.command;
    if(!command){const file=await vscode.window.showInputBox({prompt:'Relative test file (e.g. test/reconcile.test.cjs)'});if(!file)return;command={program:'node',args:['--test',file],label:'node-test:'+file};}
    validateCommand(command);return command;
  }
  async function executePlan(earths:Earth[],command:Command,kind:RunKind,count=1):Promise<void>{
    trusted();validateCommand(command,kind);
    const timeoutMs=cfg().get<number>('timeoutSeconds',120)*1000,maxBytes=cfg().get<number>('maxLogBytes',262144);
    const approvals=new Map<string,string>();const descriptions:string[]=[];
    for(const selected of earths){
      await service.owned(selected);
      if(selected.archived||running.has(selected.id))throw new Error('Earth is archived or already queued/running: '+selected.name);
      approvals.set(selected.id,await fingerprint(selected.path,timeoutMs));
      const scripts=await readPackage(selected.path);
      if(command.program==='npm'&&command.args[0]==='run'&&!scripts[command.args[1]])throw new Error('Script missing in '+selected.name);
      descriptions.push(selected.name+' — '+selected.path+(command.program==='npm'&&command.args[0]==='run'?'\nScript: '+scripts[command.args[1]]:''));
    }
    const description=(kind==='setup'?'SETUP':'CHECK')+': '+command.program+' '+command.args.join(' ')+'\n'+count+' run(s) per Earth; '+earths.length*count+' total.\n'+descriptions.join('\n')+
      '\nOne command at a time across ParallelEarth windows sharing this storage. External processes and test workers are not controlled. Elapsed times are not benchmarks.\nCommands run with your privileges and may access files, credentials and network. Setup may download packages and execute lifecycle scripts. No dependencies are shared automatically.';
    if(await vscode.window.showWarningMessage(description,{modal:true},'Approve and Run')!=='Approve and Run')return;
    const controller=new AbortController();controllers.add(controller);for(const e of earths)running.add(e.id);
    const batchId=count>1?randomUUID():undefined;
    output.show(true);output.appendLine(description);
    let stopped=false;
    try{await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:kind==='setup'?'Set Up Earth':'Run approved checks',cancellable:true},async(progress,token)=>{
      const cancel=token.onCancellationRequested(()=>controller.abort());if(token.isCancellationRequested)controller.abort();
      try{for(const selected of earths){for(let index=1;index<=count;index++){
        if(controller.signal.aborted){stopped=true;break;}
        const queuedAt=Date.now();
        const run=await queue.execute(selected.id,controller.signal,state=>{
          queueStates.set(selected.id,state);progress.report({message:state+': '+selected.name+' '+index+'/'+count});change.fire(undefined);
        },async()=>{
          trusted();await service.owned(selected);
          const current=(await service.store.load()).experiments.flatMap(e=>e.earths).find(e=>e.id===selected.id);
          if(!current||current.archived)throw new Error('Earth removed or archived while queued.');
          if(await fingerprint(selected.path,timeoutMs)!==approvals.get(selected.id))throw new Error('Manifest, lockfile or environment changed after approval. Review and approve again.');
          if(kind==='check'&&selected.baseline&&((await git(selected.path,['status','--porcelain'])).trim()||(await git(selected.path,['rev-parse','HEAD'])).trim()!==selected.sourceCommit))throw new Error('Baseline has changes; preserve them manually or create a new experiment.');
          const result=await runner.run(selected.id,selected.path,command,{approved:true,trusted:true,timeoutMs,maxBytes,signal:controller.signal,onOutput:value=>output.append(value),kind,batchId,repeatIndex:index,repeatTotal:count,queueScope:root,concurrencyLimit:1,queuedMs:Date.now()-queuedAt});
          // Preserve completed evidence even if another catalog writer holds its lock.
          const recovery=path.join(root,'run-recovery');await mkdir(recovery,{recursive:true});
          const evidenceFile=path.join(recovery,result.id+'.json');await writeFile(evidenceFile,JSON.stringify(result));
          for(let attempt=0;;attempt++){try{await service.record(selected,result);break;}catch(error){if(attempt>=60||!String(error).includes('Catalog busy'))throw new Error('Evidence retained at '+evidenceFile+'. '+String(error));await delay(250);}}
          await unlink(evidenceFile);return result;
        });
        queueStates.delete(selected.id);output.appendLine('\n'+selected.name+' '+index+'/'+count+': '+run.state+'; elapsed '+run.durationMs+' ms (not a benchmark).');change.fire(undefined);
        if(run.state==='CANCELLED'||run.state==='ERROR'){stopped=true;break;}
      }if(stopped)break;}}
      catch(error){if(controller.signal.aborted){stopped=true;output.appendLine('Cancelled. A queued command was not started; completed runs remain recorded.');}else throw error;}
      finally{cancel.dispose();}
    });
      await vscode.window.showInformationMessage(stopped?'Stopped. Partial repeat series are inconclusive; completed runs are retained.':kind==='setup'?'Setup finished. Review its recorded status before running checks.':'Checks recorded. Compare evidence; elapsed times are not benchmarks.');
    }finally{controllers.delete(controller);for(const e of earths){running.delete(e.id);if(controller.signal.aborted)queueStates.set(e.id,'CANCELLED');else queueStates.delete(e.id);}refresh();}
  }
  const handlers: Record<string,(item?: Item)=>Promise<unknown>> = {
    async showHome() {await showHome();},
    async openExperiment(item) {
      trusted();const selected=await experiment(item);if(!selected)return;
      activeExperimentId=selected.id;await showExplorer();
    },
    async closeExperiment() {activeExperimentId=undefined;await showExplorer();},
    async showHistory() {await vscode.commands.executeCommand('workbench.view.extension.parallelEarth');await vscode.commands.executeCommand('parallelEarth.history.focus');},
    async deleteExperiment(item) {
      trusted();
      const all=(await service.store.load()).experiments;
      let selected=item?.experimentId?all.find(e=>e.id===item.experimentId):undefined;
      if(!selected){
        const pick=await vscode.window.showQuickPick(all.map(e=>({label:e.name,description:path.basename(e.repository)+(e.earths.some(earth=>earth.baseline)?'':' | incomplete'),detail:e.repository,id:e.id})),{placeHolder:'Select an experiment to delete'});
        selected=all.find(e=>e.id===pick?.id);
      }
      if(!selected)return;
      const target=selected;
      if(deleting.has(target.id))return;
      if(target.earths.some(e=>running.has(e.id)))throw new Error('Wait until this experiment finishes running.');
      deleting.add(target.id);
      const feedback=(message:string,busy=true)=>{void homePanel?.webview.postMessage({type:'deletion',experimentId:target.id,busy,message});};
      let result='Deletion cancelled.';
      feedback('Waiting for confirmation...');
      try {
        const choice=await vscode.window.showWarningMessage('Delete "'+target.name+'" for '+path.basename(target.repository)+'?\nRemove from History keeps every Earth file. Delete Clean Worktrees also removes its worktrees, refusing edits, ignored/untracked files or new commits. Your original project is kept.',{modal:true},'Remove from History','Delete Clean Worktrees');
        if(choice!=='Remove from History'&&choice!=='Delete Clean Worktrees')return;
        feedback('Deleting experiment...');
        await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Deleting '+target.name,cancellable:false},
          async progress=>service.deleteExperiment(target.id,true,choice==='Remove from History',message=>{
            progress.report({message});feedback(message);
          }));
        if(activeExperimentId===target.id)activeExperimentId=undefined;
        // Refresh the list before displaying the completion toast.
        refresh();
        await renderHome();
        result=choice==='Remove from History'?'Experiment removed from history; Earth files retained.':'Experiment and clean worktrees deleted.';
        void vscode.window.showInformationMessage(result);
      } catch(error) {
        result='Deletion stopped: '+(error instanceof Error?error.message:String(error)).slice(0,240);
        throw error;
      } finally {
        deleting.delete(target.id);feedback(result,false);
      }
    },


    async showExplorer() { await showExplorer(); },
    async createExperiment() {
      trusted(); const repo=await repository();if(!repo)return;
      const previous=(await service.store.load()).experiments.filter(e=>e.repository===repo&&e.earths.some(earth=>earth.baseline));
      const label=await vscode.window.showInputBox({prompt:'Name your experiment for '+path.basename(repo),value:'Experiment '+(previous.length+1)});if(!label)return;
      const ref=await vscode.window.showInputBox({prompt:'Committed baseline (uncommitted and untracked files are excluded)',value:'HEAD'});if(!ref)return;
      const accepted=await vscode.window.showWarningMessage('Create detached worktrees from this committed baseline? Existing working files remain in the original tree. Worktrees are not security sandboxes.',{modal:true},'Create Experiment');
      if(accepted!=='Create Experiment')return;
      const created = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Creating baseline Earth'},()=>service.createExperiment(repo,label,ref));
      activeExperimentId=created.id;
      await showExplorer();
      const next = await vscode.window.showInformationMessage('Experiment "'+created.name+'" created. Its baseline is stored outside your project at '+created.earths[0].path, 'Create Earth');
      if(next === 'Create Earth') await handlers.createEarth({experimentId:created.id});
    },
    async createEarth(item) {
      trusted();const exp=await experiment(item);if(!exp)return;
      activeExperimentId=exp.id;
      const label=await vscode.window.showInputBox({prompt:'Name this alternative for '+path.basename(exp.repository)+' ('+exp.repository+')',value:'Earth '+exp.earths.length});if(!label)return;
      const created = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Creating detached Earth'},()=>service.createEarth(exp.id,label));
      await showExplorer();
      const next = await vscode.window.showInformationMessage('Earth "'+created.name+'" created at '+created.path, 'Open Earth','Set Up Earth','Copy Path');
      if(next==='Set Up Earth')await handlers.setupEarth({experimentId:exp.id,earthId:created.id});
      if(next==='Copy Path')await handlers.copyEarthPath({experimentId:exp.id,earthId:created.id});
      if(next === 'Open Earth') await handlers.openEarth({experimentId:exp.id,earthId:created.id});
    },
    async openEarth(item) {
      trusted();const selected=await earth(item);if(!selected)return;
      const exp=await service.owned(selected);
      const workspace=await earthWorkspace(root,exp.repository,selected);
      await vscode.commands.executeCommand('vscode.openFolder',vscode.Uri.file(workspace),{forceNewWindow:true});
    },
    async renameEarth(item) {
      trusted();const selected=await earth(item,false);if(!selected)return;
      const label=await vscode.window.showInputBox({prompt:'New Earth name',value:selected.name});if(label)await service.update(selected,{name:label});
    },
    async duplicateEarth(item) {
      trusted();const selected=await earth(item,false);if(!selected)return;
      const label=await vscode.window.showInputBox({prompt:'New Earth from the same committed baseline; manual edits are not copied',value:selected.name+' copy'});
      if(label)await service.createEarth(selected.experimentId,label);
    },
    async inspectChanges(item) {
      trusted();const selected=await earth(item);if(!selected)return;
      await text((await service.inspect(selected))||'No tracked or untracked changes.','diff');
    },
    async applyPatch(item) {
      trusted();const selected=await earth(item,false);if(!selected)return;await service.owned(selected);
      if(running.has(selected.id))throw new Error('Wait until this Earth finishes running.');
      const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{'Git patch':['patch','diff']}});
      if(!files?.[0])return;
      const patch=await readFile(files[0].fsPath,'utf8');
      const {patchPaths}=await import('./git.js');patchPaths(patch);
      await text(patch,'diff');
      if(await vscode.window.showWarningMessage('Apply this previewed patch to '+selected.name+'? Scripts are never run by patch import.',{modal:true},'Apply Patch')!=='Apply Patch')return;
      trusted();await service.owned(selected);await applyPatch(selected.path,patch);
    },
    async copyEarthPath(item) {
      trusted();const selected=await earth(item);if(!selected)return;await service.owned(selected);await vscode.env.clipboard.writeText(selected.path);
      await vscode.window.showInformationMessage('Earth path copied: '+selected.path);
    },
    async revealEarthFolder(item) {
      trusted();const selected=await earth(item);if(!selected)return;await service.owned(selected);
      await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.file(selected.path));
    },
    async setupEarth(item) {
      trusted();const selected=await earth(item);if(!selected)return;await service.owned(selected);
      const scripts=await readPackage(selected.path);
      const options=[{label:'npm ci',description:'Install from package-lock.json; may run lifecycle scripts',command:{program:'npm' as const,args:['ci'],label:'npm-ci'}},
        {label:'npm install',description:'May change package-lock.json and run lifecycle scripts',command:{program:'npm' as const,args:['install'],label:'npm-install'}},
        ...Object.keys(scripts).filter(key=>/^[a-zA-Z0-9_][a-zA-Z0-9:_-]*$/.test(key)).map(key=>({label:'npm run '+key,description:scripts[key],command:{program:'npm' as const,args:['run',key],label:key}}))];
      const choice=await vscode.window.showQuickPick(options,{placeHolder:'Set up this Earth independently. Nothing runs until approved. Use an npm script for custom setup.'});
      if(choice)await executePlan([selected],choice.command,'setup');
    },
    async runChecks(item) {
      trusted();const selected=await earth(item);if(!selected)return;
      const command=await chooseCheck(selected);if(command)await executePlan([selected],command,'check');
    },
    async repeatChecks(item) {
      trusted();const exp=await experiment(item);if(!exp)return;
      const baseline=exp.earths.find(e=>e.baseline);if(!baseline)throw new Error('Baseline missing.');
      const choices=exp.earths.filter(e=>!e.baseline&&!e.archived).map(e=>({label:e.name,description:e.path,earth:e,picked:true}));
      const picked=await vscode.window.showQuickPick(choices,{canPickMany:true,placeHolder:'Select alternatives; the baseline is always included'});if(!picked?.length)return;
      const count=await vscode.window.showQuickPick(['3','5','10','2'],{placeHolder:'Runs per Earth (sequential). Every result is retained; this is not a benchmark.'});if(!count)return;
      const command=await chooseCheck(baseline);if(command)await executePlan([baseline,...picked.map(p=>p.earth)],command,'check',Number(count));
    },
    async compareEarths(item) {
      trusted();const exp=await experiment(item);if(!exp)return;
      await text(markdown(compare(exp)));
    },
    async exportReport(item) {
      trusted();const exp=await experiment(item);if(!exp)return;
      const format=await vscode.window.showQuickPick(['Markdown','JSON (includes retained execution logs)'],{placeHolder:'Choose report format; review for secrets before sharing'});if(!format)return;
      const json=format.startsWith('JSON'), ext=json?'json':'md';
      const file=await vscode.window.showSaveDialog({defaultUri:vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath??root,'parallel-earth-report.'+ext)),filters:{Report:[ext]}});if(!file)return;
      const report=compare(exp);
      await writeFile(file.fsPath,json?JSON.stringify(report,null,2):markdown(report),'utf8');
      await vscode.window.showInformationMessage('Report exported: '+file.fsPath);
    },
    async archiveEarth(item) {
      trusted();const selected=await earth(item,false);if(!selected)return;
      if(running.has(selected.id))throw new Error('Wait until this Earth finishes running.');
      await service.update(selected,{archived:!selected.archived});
    },
    async deleteEarth(item) {
      trusted();const selected=await earth(item,false);if(!selected)return;
      if(running.has(selected.id))throw new Error('Wait until this Earth finishes running.');
      if(await vscode.window.showWarningMessage('Remove '+selected.name+' at '+selected.path+'? Deletion is refused when files or commits need preservation.',{modal:true},'Delete Earth')==='Delete Earth')await service.remove(selected,true);
    },
    async recover() {trusted();await text('# Recovery\n\n'+(await service.recover()).join('\n\n'));},
    async showDiagnostics() {
      const diagnostics=['ParallelEarth '+context.extension.packageJSON.version,'Workspace trusted: '+vscode.workspace.isTrusted,'Storage: '+root,'Platform: '+process.platform+' '+process.arch,'Extension Node: '+process.version];
      if(vscode.workspace.isTrusted){try{diagnostics.push((await git(rootExistsFallback(),['--version'])).trim());diagnostics.push('Experiments: '+(await service.store.load()).experiments.length);}catch(e){diagnostics.push(String(e));}}
      await text(diagnostics.join('\n'),'plaintext');
    },
    async openDocumentation() {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(context.extensionUri,'docs','getting-started.md')));
    },
    async refresh() {refresh();}
  };
  function rootExistsFallback():string{return vscode.workspace.workspaceFolders?.find(f=>f.uri.scheme==='file')?.uri.fsPath??context.extensionUri.fsPath;}
  for(const [id,handler]of Object.entries(handlers))context.subscriptions.push(vscode.commands.registerCommand('parallelEarth.'+id,async(arg:unknown)=>{
    try {
      // Only identifiers are accepted from command arguments; authoritative state is reloaded.
      const item=arg&&typeof arg==='object'?arg as Item:undefined;
      await handler(item);
    }catch(e){output.appendLine(String(e));await vscode.window.showErrorMessage('ParallelEarth: '+(e instanceof Error?e.message:String(e)));}
    finally{refresh();}
  }));
  if(vscode.workspace.isTrusted)await mkdir(root,{recursive:true});
  if(context.extensionMode===vscode.ExtensionMode.Development){await showExplorer();await showHome();}
  else if(explorerView.visible||historyView.visible)await showHome();
}
export function deactivate():void {}



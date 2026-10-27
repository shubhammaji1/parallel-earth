import { sidebarMarkup, parseSidebarMessage } from './sidebar';
import * as vscode from 'vscode';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Store, Service, Runner, Earth, Experiment, Command, git, repositoryRoot, readPackage, discoverCommands, applyPatch, compare, markdown } from './index';

import { earthWorkspace } from './workspace';
import { projectHistory, projectSummaries } from './history';
import { homeMarkup, parseHomeMessage } from './home';
import { randomUUID } from 'node:crypto';

interface Item extends vscode.TreeItem { experimentId?: string; earthId?: string; projectRepository?: string }
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('ParallelEarth');
  const change = new vscode.EventEmitter<Item | undefined>();
  const cfg = () => vscode.workspace.getConfiguration('parallelEarth');
  const root = cfg().get<string>('storageRoot') || context.globalStorageUri.fsPath;
  const service = new Service(new Store(root));
  const runner = new Runner(cfg().get<number>('maxConcurrentRuns',1));
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
            const state=earth.runs.at(-1)?.state??'NOT_RUN';
            const item:Item=new vscode.TreeItem(earth.name,vscode.TreeItemCollapsibleState.None);
            item.id='earth:'+earth.id;item.experimentId=exp.id;item.earthId=earth.id;
            const states:Record<string,string>={PASSED:'Checks passed',FAILED:'Checks failed',ERROR:'Check error',CANCELLED:'Cancelled',NOT_RUN:'Not checked'};
            item.description=(earth.archived?'Archived | ':earth.baseline?'Baseline | ':'')+(running.has(earth.id)?'Running...':states[state]??state);
            item.contextValue=earth.baseline?'parallelEarth.baseline':'parallelEarth.earth';
            item.command={command:'parallelEarth.openEarth',title:'Open Earth',arguments:[item]};
            item.tooltip=earth.path+'\n'+(earth.baseline?'Committed baseline':'Alternative Earth');
            const icon=earth.baseline?'git-commit':state==='PASSED'?'pass':state==='FAILED'?'error':state==='ERROR'?'warning':'globe';
            const color=state==='PASSED'?'charts.green':state==='FAILED'?'charts.red':state==='ERROR'?'charts.yellow':'charts.blue';
            item.iconPath=new vscode.ThemeIcon(icon,new vscode.ThemeColor(color));return item;
          }),
          action('Create Earth','createEarth',parent),action('Compare evidence','compareEarths',parent),
          action('Export report','exportReport',parent)
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
      const next = await vscode.window.showInformationMessage('Earth "'+created.name+'" created at '+created.path, 'Open Earth');
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
    async runChecks(item) {
      trusted();const selected=await earth(item);if(!selected)return;await service.owned(selected);
      if(selected.archived)throw new Error('Unarchive this Earth before running checks.');
      if(running.has(selected.id))throw new Error('This Earth is already running.');
      if(selected.baseline && ((await git(selected.path,['status','--porcelain'])).trim() || (await git(selected.path,['rev-parse','HEAD'])).trim()!==selected.sourceCommit))throw new Error('Baseline has changes; restore them manually or create a new experiment.');
      const commands=await discoverCommands(selected.path);
      const choice=await vscode.window.showQuickPick([...commands.map(c=>({label:c.label,description:c.program+' '+c.args.join(' '),command:c})),{label:'Node test file…',description:'node --test <relative-file.js>',command:undefined}],{placeHolder:'Choose a check (no dependency installation is performed)'});
      if(!choice)return;
      let command:Command|undefined=choice.command;
      if(!command){const file=await vscode.window.showInputBox({prompt:'Relative test file (e.g. test/reconcile.test.cjs)'});if(!file)return;command={program:'node',args:['--test',file],label:'node-test:'+file};}
      const {validateCommand}=await import('./domain.js');validateCommand(command);
      const scripts=await readPackage(selected.path);
      const description=command.program+' '+command.args.join(' ')+'\nDirectory: '+selected.path+
        (command.program==='npm'?'\nScript: '+scripts[command.args[1]]:'')+
        '\nRuns with your current user privileges. Repository code may access machine files and network. Logs may contain secrets. Worktrees are not sandboxes. No dependencies are installed automatically.';
      if(await vscode.window.showWarningMessage(description,{modal:true},'Approve and Run')!=='Approve and Run')return;
      trusted();await service.owned(selected);
      const controller=new AbortController();controllers.add(controller);running.add(selected.id);
      output.clear();output.show(true);output.appendLine(description);
      const approved=command;
      try {
        await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Running '+selected.name+': '+command.label,cancellable:true},async(_,token)=>{
          const cancellation=token.onCancellationRequested(()=>controller.abort());
          try {
            const run=await runner.run(selected.id,selected.path,approved,{approved:true,trusted:vscode.workspace.isTrusted,timeoutMs:cfg().get<number>('timeoutSeconds',120)*1000,maxBytes:cfg().get<number>('maxLogBytes',262144),signal:controller.signal,onOutput:s=>output.append(s)});
            await service.record(selected,run);
            output.appendLine('\n'+run.state+' · '+run.durationMs+' ms · '+run.id);
            await vscode.window.showInformationMessage(selected.name+': '+run.state+'. This describes the approved command only.');
          } finally {cancellation.dispose();}
        });
      } finally {controllers.delete(controller);running.delete(selected.id);}
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



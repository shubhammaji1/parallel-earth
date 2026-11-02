const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const file=path.resolve('dist/extension.js'),realRequire=createRequire(file);
const disposable=()=>({dispose(){}});
function host(visible=false,trusted=false,previewFixture=false){
 const views=[],panels=[],commands=new Map(),output=[],providers=new Map(),executed=[];
 const terminals=[],terminalClosed=[],quickPicks=[],opened=[];
 const catalog={version:1,experiments:[]},freshnessOverrides=new Map();
 const base=realRequire('./index');
 const core={...base,Store:class{constructor(root){this.root=root;}async load(){return catalog;}},
  Service:class extends base.Service{async owned(earth){if(previewFixture)return catalog.experiments.find(e=>e.id===earth.experimentId);return super.owned(earth);}async freshness(earth){return freshnessOverrides.has(earth.id)?Object.fromEntries(earth.runs.map(r=>[r.id,freshnessOverrides.get(earth.id)])):super.freshness(earth);}}};
 const uri=fsPath=>({fsPath});
 const vscode={
  TreeItem:class{constructor(label,collapsibleState){this.label=label;this.collapsibleState=collapsibleState;}},TreeItemCollapsibleState:{None:0,Collapsed:1,Expanded:2},ThemeIcon:class{constructor(id,color){this.id=id;this.color=color;}},ThemeColor:class{constructor(id){this.id=id;}},
  ExtensionMode:{Production:1,Development:2,Test:3},ViewColumn:{One:1},StatusBarAlignment:{Left:1},
  EventEmitter:class{constructor(){this.event=()=>disposable();}fire(){}dispose(){}},
  Uri:{file:uri,parse:value=>({toString:()=>value}),joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},
  env:{openExternal:async value=>{opened.push(value.toString());return true;}},
  workspace:{isTrusted:trusted,getConfiguration:()=>({get:(_key,fallback)=>fallback}),onDidGrantWorkspaceTrust:disposable,onDidChangeConfiguration:disposable},
  commands:{registerCommand:(name,handler)=>{commands.set(name,handler);return disposable();},executeCommand:async name=>{executed.push(name);return commands.get(name)?.();}},
  window:{
   onDidCloseTerminal:fn=>{terminalClosed.push(fn);return disposable();},
   createTerminal:options=>{const terminal={options,show(){},dispose(){terminal.disposed=true;for(const fn of terminalClosed)fn(terminal);}};terminals.push(terminal);return terminal;},
   showQuickPick:async choices=>{const index=quickPicks.shift()??0;return choices[index];},
   showWarningMessage:async(_message,_options,button)=>button,
   showInformationMessage:async()=>undefined,
   createOutputChannel:()=>({appendLine:line=>output.push(line),dispose(){}}),
   createStatusBarItem:()=>({show(){},dispose(){}}),
   registerWebviewViewProvider:(id,provider)=>{providers.set(id,provider);return disposable();},
   createTreeView:(id,options)=>{
    const listeners=[];
    const view={id,provider:options.treeDataProvider,visible,onDidChangeVisibility:fn=>{listeners.push(fn);return disposable();},dispose(){},
     visibility(value){view.visible=value;for(const listener of listeners)listener({visible:value});}};
    views.push(view);return view;
   },
   createWebviewPanel:()=>{
    let close;
    const panel={webview:{cspSource:'vscode-webview:',html:'',asWebviewUri:u=>({toString:()=>u.fsPath}),onDidReceiveMessage:disposable,postMessage:async()=>true},
     reveal(){},onDidDispose:fn=>{close=fn;return disposable();},dispose(){close?.();}};
    panels.push(panel);return panel;
   },
   showErrorMessage:async message=>{throw Error(message);}
  }
 };
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:id=>id==='vscode'?vscode:id==='./index'?core:realRequire(id),exports:module.exports,module,console});
 const context={subscriptions:[],extensionMode:vscode.ExtensionMode.Production,globalStorageUri:uri(path.resolve('artifacts/dashboard-test-storage')),extensionUri:uri(process.cwd()),extension:{packageJSON:{version:'0.1.1'}}};
 return {...module.exports,context,views,panels,commands,output,providers,catalog,executed,freshnessOverrides,terminals,quickPicks,opened};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('preview commands launch separate terminal ports, open only their URLs and dispose on stop/close',async()=>{
 const fsp=require('node:fs/promises'),{randomUUID}=require('node:crypto');
 const parent=path.resolve('artifacts/test-fixtures');await fsp.mkdir(parent,{recursive:true});const root=await fsp.mkdtemp(path.join(parent,'preview-host-'));
 const h=host(false,true,true);
 try{
  await fsp.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{dev:'node server.cjs'}}));
  await h.activate(h.context);const id=randomUUID(),earths=[0,1].map(i=>({id:randomUUID(),experimentId:id,name:'App '+i,path:root,archived:false,baseline:i===0,runs:[]}));
  h.catalog.experiments.push({id,name:'Preview',repository:root,earths});
  for(const earth of earths)await h.commands.get('parallelEarth.startPreview')({experimentId:id,earthId:earth.id});
  assert.equal(h.terminals.length,2);assert.notEqual(h.terminals[0].options.env.PORT,h.terminals[1].options.env.PORT);
  assert.equal(h.terminals[0].options.env.HOST,'127.0.0.1');assert.equal(h.terminals[0].options.isTransient,true);
  await h.commands.get('parallelEarth.openPreview')({experimentId:id,earthId:earths[0].id});assert.equal(h.opened[0],'http://127.0.0.1:'+h.terminals[0].options.env.PORT);
  await h.commands.get('parallelEarth.stopPreview')({experimentId:id,earthId:earths[0].id});assert.equal(h.terminals[0].disposed,true);
  h.terminals[1].dispose();await assert.rejects(h.commands.get('parallelEarth.openPreview')({experimentId:id,earthId:earths[1].id}),/Start a preview/);
 }finally{
  for(const subscription of h.context.subscriptions)subscription.dispose();assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('preview-host-'));await fsp.rm(root,{recursive:true,force:true});
 }
});
test('installed extension opens Home when the sidebar becomes visible, without duplicate dashboards',async()=>{
 const h=host();await h.activate(h.context);
 assert.equal(h.panels.length,0,'Do not interrupt unrelated editor startup');
 h.views[0].visibility(true);h.views[1].visibility(true);await settle();
 assert.equal(h.panels.length,1);
 assert.match(h.panels[0].webview.html,/Your projects/);
 h.panels[0].dispose();h.views[0].visibility(false);await settle();
 assert.equal(h.panels.length,1,'Hiding the sidebar must not reopen Home');
 h.views[1].visibility(false);h.views[1].visibility(true);await settle();
 assert.equal(h.panels.length,2,'History-only sidebar navigation must also open Home');
});
test('installed extension opens Home when its sidebar was restored on startup',async()=>{
 const h=host(true);await h.activate(h.context);
 assert.equal(h.panels.length,1);
});
test('Open Home remains available from commands and both sidebar title menus',async()=>{
 const h=host();await h.activate(h.context);
 await h.commands.get('parallelEarth.showHome')();
 assert.equal(h.panels.length,1);
 await h.commands.get('parallelEarth.showHome')();
 assert.equal(h.panels.length,1);
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
 const menu=pkg.contributes.menus['view/title'].find(item=>item.command==='parallelEarth.showHome');
 assert.match(menu.when,/view == parallelEarth.explorer/);
 assert.match(menu.when,/view == parallelEarth.history/);
});


test('sidebar launchpad exposes branded navigation and accepts only its explicit actions',async()=>{
 const h=host();await h.activate(h.context);
 let receive;
 const view={webview:{cspSource:'vscode-webview:',html:'',asWebviewUri:u=>({toString:()=>u.fsPath}),onDidReceiveMessage:fn=>{receive=fn;return disposable();}},onDidDispose:disposable};
 h.providers.get('parallelEarth.launchpad').resolveWebviewView(view);await settle();
 assert.match(view.webview.html,/New experiment/);
 assert.match(view.webview.html,/Find experiment/);
 assert.match(view.webview.html,/Workspace Trust required/);
 assert.match(view.webview.html,/data-action="create" disabled/);
 const before=h.executed.length;
 receive({action:'create',command:'malicious'});receive({action:'arbitrary'});
 assert.equal(h.executed.length,before);
 receive({action:'home'});await settle();
 assert.ok(h.executed.includes('parallelEarth.showHome'));
 assert.equal(h.panels.length,1);
});
test('active experiment displays flat Earth rows with friendly status and contextual actions',async()=>{
 const h=host(false,true);await h.activate(h.context);
 const baseline={id:'base',baseline:true,name:'Baseline',path:'/baseline',runs:[],archived:false};
 const alternative={id:'alt',baseline:false,name:'Faster checkout',path:'/alternative',runs:[{id:'run-alt',state:'PASSED'}],archived:false};
 const exp={id:'experiment',name:'Checkout experiment',repository:'/project',baselineCommit:'a'.repeat(40),created:'2026-10-27T00:00:00Z',earths:[baseline,alternative]};
 h.catalog.experiments.push(exp);
 await h.commands.get('parallelEarth.openExperiment')({experimentId:exp.id});
 const provider=h.views.find(v=>v.id==='parallelEarth.explorer').provider;
 const roots=await provider.getChildren();
 assert.equal(roots.length,1);
 const children=await provider.getChildren(roots[0]);
 const earths=children.filter(item=>item.earthId);
 assert.equal(earths.length,2);
 assert.equal(earths[0].description,'Baseline | Not checked');
 assert.equal(earths[1].description,'Freshness unknown - rerun checks');
 h.freshnessOverrides.set('alt','CURRENT');
 assert.equal((await provider.getChildren(roots[0])).find(e=>e.earthId==='alt').description,'Checks passed');
 h.freshnessOverrides.set('alt','STALE');
 const stale=(await provider.getChildren(roots[0])).find(e=>e.earthId==='alt');
 assert.equal(stale.description,'Code changed - rerun checks');
 assert.equal(stale.iconPath.id,'warning');
 assert.equal(earths[1].collapsibleState,0);
 assert.equal(earths[1].command.command,'parallelEarth.openEarth');
 assert.equal(children.some(item=>item.command?.command==='parallelEarth.deleteExperiment'),false);
 assert.deepEqual(Array.from(await provider.getChildren(earths[1])),[]);
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
 const remove=pkg.contributes.menus['view/item/context'].find(m=>m.command==='parallelEarth.deleteEarth');
 assert.equal(remove.when,'viewItem == parallelEarth.earth');
 assert.ok(!remove.group.startsWith('inline'));
});
test('sidebar escapes experiment labels and refuses unexpected or inherited messages',()=>{
 const {sidebarMarkup,parseSidebarMessage}=realRequire('./sidebar');
 const html=sidebarMarkup({trusted:true,projectCount:2,experimentCount:3,earthCount:4,activeName:'<img src=x onerror=alert(1)>'},'local-logo','vscode-webview:','nonce');
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img src=x/);
 assert.match(html,/nonce="nonce"/);
 for(const message of [null,[],{action:'run'},{action:'home',extra:1},Object.assign(Object.create({action:'home'}),{extra:1})])assert.equal(parseSidebarMessage(message),undefined);
 assert.equal(parseSidebarMessage({action:'resume'}),'resume');
});


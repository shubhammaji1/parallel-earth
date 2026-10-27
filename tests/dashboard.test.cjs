const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const file=path.resolve('dist/extension.js'),realRequire=createRequire(file);
const disposable=()=>({dispose(){}});
function host(visible=false,trusted=false){
 const views=[],panels=[],commands=new Map(),output=[],providers=new Map(),executed=[];
 const catalog={version:1,experiments:[]};
 const core={...realRequire('./index'),Store:class{constructor(root){this.root=root;}async load(){return catalog;}}};
 const uri=fsPath=>({fsPath});
 const vscode={
  TreeItem:class{constructor(label,collapsibleState){this.label=label;this.collapsibleState=collapsibleState;}},TreeItemCollapsibleState:{None:0,Collapsed:1,Expanded:2},ThemeIcon:class{constructor(id,color){this.id=id;this.color=color;}},ThemeColor:class{constructor(id){this.id=id;}},
  ExtensionMode:{Production:1,Development:2,Test:3},ViewColumn:{One:1},StatusBarAlignment:{Left:1},
  EventEmitter:class{constructor(){this.event=()=>disposable();}fire(){}dispose(){}},
  Uri:{file:uri,joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},
  workspace:{isTrusted:trusted,getConfiguration:()=>({get:(_key,fallback)=>fallback}),onDidGrantWorkspaceTrust:disposable,onDidChangeConfiguration:disposable},
  commands:{registerCommand:(name,handler)=>{commands.set(name,handler);return disposable();},executeCommand:async name=>{executed.push(name);return commands.get(name)?.();}},
  window:{
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
 return {...module.exports,context,views,panels,commands,output,providers,catalog,executed};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
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
 const alternative={id:'alt',baseline:false,name:'Faster checkout',path:'/alternative',runs:[{state:'PASSED'}],archived:false};
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
 assert.equal(earths[1].description,'Checks passed');
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


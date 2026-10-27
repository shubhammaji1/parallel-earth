const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const file=path.resolve('dist/extension.js'),realRequire=createRequire(file);
const disposable=()=>({dispose(){}});
function host(visible=false){
 const views=[],panels=[],commands=new Map(),output=[];
 const uri=fsPath=>({fsPath});
 const vscode={
  ExtensionMode:{Production:1,Development:2,Test:3},ViewColumn:{One:1},StatusBarAlignment:{Left:1},
  EventEmitter:class{constructor(){this.event=()=>disposable();}fire(){}dispose(){}},
  Uri:{file:uri,joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},
  workspace:{isTrusted:false,getConfiguration:()=>({get:(_key,fallback)=>fallback}),onDidGrantWorkspaceTrust:disposable,onDidChangeConfiguration:disposable},
  commands:{registerCommand:(name,handler)=>{commands.set(name,handler);return disposable();},executeCommand:async name=>commands.get(name)?.()},
  window:{
   createOutputChannel:()=>({appendLine:line=>output.push(line),dispose(){}}),
   createStatusBarItem:()=>({show(){},dispose(){}}),
   createTreeView:(id)=>{
    const listeners=[];
    const view={id,visible,onDidChangeVisibility:fn=>{listeners.push(fn);return disposable();},dispose(){},
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
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:id=>id==='vscode'?vscode:realRequire(id),exports:module.exports,module,console});
 const context={subscriptions:[],extensionMode:vscode.ExtensionMode.Production,globalStorageUri:uri(path.resolve('artifacts/dashboard-test-storage')),extensionUri:uri(process.cwd()),extension:{packageJSON:{version:'0.1.1'}}};
 return {...module.exports,context,views,panels,commands,output};
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


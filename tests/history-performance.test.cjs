const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {projectSummaries,historyPage,homeMarkup}=require('../dist/index.js');
function groups(count){return Array.from({length:count},(_,i)=>({
 name:'Project '+i,repository:'/projects/'+i,experiments:[{
 id:randomUUID(),name:'Experiment '+i,created:'2026-10-27T00:00:00Z',
 earths:[{baseline:true,runs:[{output:'private execution log'}]},{baseline:false,runs:[]}]
 }]
}));}
test('large histories are paginated, searchable, sorted and contain no execution logs in summaries',()=>{
 const projects=projectSummaries(groups(1000));
 assert.equal(historyPage(projects,'',0).rows.length,6);
 assert.equal(historyPage(projects,'',999).page,166);
 assert.equal(historyPage(projects,'',999).rows.length,4);
 assert.equal(historyPage(projects,'Project 999',0).total,1);
 assert.equal(historyPage(projects,'/projects/999',0).rows[0].name,'Project 999');
 assert.equal(historyPage(projects,'no matches',90).page,0);
 assert.equal(historyPage(projects,'',-5).page,0);
 assert.equal(historyPage(projects,'',0,500).rows.length,12);
 assert.equal(historyPage(projects,'',0,6,'name').rows[0].name,'Project 0');
 assert.doesNotMatch(JSON.stringify(projects),/private execution log|runs|output/);
 assert.equal(projects[0].earthCount,1);
});
class Element {
 constructor(tag='div'){this.tag=tag;this.dataset={};this.children=[];this.listeners={};this.value='';this.disabled=false;this.hidden=false;this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(key,value){this[key]=value;}
 addEventListener(type,fn){this.listeners[type]=fn;}
 closest(){return this;}
 set innerHTML(_){throw Error('Client must not insert HTML from project names');}
}
test('actual home script keeps six rendered rows, suppresses duplicate deletes and preserves search on updates',()=>{
 const projects=groups(200),ids=['history-list','history-query','history-sort','history-count','history-page','history-prev','history-next','history-empty','history-no-results','history-status','history-footer','total-projects','total-experiments','total-earths'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 elements['history-prev'].dataset.action='previous';elements['history-next'].dataset.action='next';
 const events={},windowEvents={},messages=[];
 const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag),addEventListener:(type,fn)=>{events[type]=fn;}};
 const window={addEventListener:(type,fn)=>{windowEvents[type]=fn;}};
 const html=homeMarkup(projects,'local-logo','vscode-webview:','test-nonce');
 const source=html.match(/<script nonce="test-nonce">([\s\S]*?)<\/script>/)[1];
 let saved;
 vm.runInNewContext(source,{document,window,acquireVsCodeApi:()=>({getState:()=>({}),setState:value=>{saved={...value};},postMessage:value=>messages.push(value)}),setTimeout:fn=>{fn();return 1;},clearTimeout:()=>{}},{timeout:1000});
 assert.equal(elements['history-list'].children.length,6);
 for(const key of ['total-projects','total-experiments','total-earths'])assert.equal(elements[key].textContent,'200');
 assert.equal(elements['history-footer'].hidden,false);
 events.click({target:elements['history-next']});assert.equal(saved.page,1);
 const search=elements['history-query'];search.value='Project 199';search.listeners.input();
 assert.equal(elements['history-list'].children.length,1);
 const deleteButton=elements['history-list'].children[0].children[2].children[1];
 events.click({target:deleteButton});events.click({target:deleteButton});
 assert.equal(messages.filter(m=>m.action==='delete').length,1);
 assert.equal(elements['history-list'].children[0].children[2].children[1].disabled,true);
 windowEvents.message({data:{type:'deletion',experimentId:projects[199].experiments[0].id,busy:false,message:'Deletion cancelled.'}});
 assert.equal(elements['history-list'].children[0].children[2].children[1].disabled,false);
 assert.equal(elements['history-status'].textContent,'Deletion cancelled.');
 windowEvents.message({data:{type:'history',projects:projectSummaries(projects.slice(0,199))}});
 assert.equal(document.getElementById('history-query'),search);
 assert.equal(search.value,'Project 199');
 assert.equal(elements['history-list'].children.length,0);
 assert.equal(elements['history-no-results'].hidden,false);
 assert.equal(elements['total-projects'].textContent,'199');
 windowEvents.message({data:{type:'history',projects:[]}});
 assert.equal(elements['history-empty'].hidden,false);
 assert.equal(elements['history-footer'].hidden,true);
 for(const key of ['total-projects','total-experiments','total-earths'])assert.equal(elements[key].textContent,'0');
});
test('initial history payload cannot terminate its nonce script',()=>{
 const data=groups(1);data[0].name='</script><img src=x onerror=alert(1)>';
 const html=homeMarkup(data,'local-logo','vscode-webview:','test-nonce');
 assert.equal((html.match(/<\/script>/g)||[]).length,1);
 assert.doesNotMatch(html,/<img src=x/);
 assert.ok(html.includes('\\u003c/script\\u003e'));
});


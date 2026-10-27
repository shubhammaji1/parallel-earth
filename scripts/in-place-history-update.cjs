const fs=require('node:fs');
let text=fs.readFileSync('src/extension.ts','utf8');
text=text.replace("import { projectHistory } from './history';","import { projectHistory, projectSummaries } from './history';");
text=text.replace("  const running = new Set<string>();","  const running = new Set<string>();\n  const deleting = new Set<string>();");
text=text.replace("  let homeVersion=0;","  let homeVersion=0;\n  let homeReady=false;\n  let homeSnapshot='';");
text=text.replace("    const logo=panel.webview.asWebviewUri", "    const summaries=projectSummaries(projects),snapshot=JSON.stringify(summaries);\n    if(homeReady){\n      if(snapshot===homeSnapshot)return;\n      homeSnapshot=snapshot;\n      if(!await panel.webview.postMessage({type:'history',projects:summaries}))homeSnapshot='';\n      return;\n    }\n    homeReady=true;homeSnapshot=snapshot;\n    const logo=panel.webview.asWebviewUri");
text=text.replace("      enableScripts:true,localResourceRoots:", "      enableScripts:true,retainContextWhenHidden:true,localResourceRoots:");
text=text.replace("    homePanel=panel;","    homePanel=panel;homeReady=false;homeSnapshot='';");
text=text.replace("if(homePanel===panel)homePanel=undefined;","if(homePanel===panel){homePanel=undefined;homeReady=false;homeSnapshot='';}");
const from=text.indexOf('    async deleteExperiment(item) {'),to=text.indexOf('    async showExplorer()',from);
if(from<0||to<0)throw Error('Delete handler boundary not found');
text=text.slice(0,from)+fs.readFileSync('scripts/delete-feedback-handler.txt','utf8')+'\n'+text.slice(to);
fs.writeFileSync('src/extension.ts',text);
text=fs.readFileSync('tests/project-flow.test.cjs','utf8').replace("assert.match(page,/&lt;script&gt;/);","assert.ok(page.includes('\\\\u003cscript\\\\u003e'));");
fs.writeFileSync('tests/project-flow.test.cjs',text);


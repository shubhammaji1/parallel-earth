const fs=require('node:fs');
let s=fs.readFileSync('src/extension.ts','utf8');
s=s.replace("import { earthWorkspace } from './workspace';","import { earthWorkspace } from './workspace';\nimport { projectHistory } from './history';");
s=s.replace('interface Item extends vscode.TreeItem { experimentId?: string; earthId?: string }','interface Item extends vscode.TreeItem { experimentId?: string; earthId?: string; projectRepository?: string }');
s=s.replace('  const refresh = () => change.fire(undefined);','  let activeExperimentId:string|undefined;\n  const refresh = () => change.fire(undefined);');
s=s.replace("    if (item?.experimentId) return all.find(e => e.id === item.experimentId);","    if (item?.experimentId) return all.find(e => e.id === item.experimentId);\n    if(activeExperimentId)return all.find(e=>e.id===activeExperimentId);");
const from=s.indexOf('  const provider: vscode.TreeDataProvider<Item> = {');
const to=s.indexOf('  context.subscriptions.push(output,change,',from);
if(from<0||to<0)throw new Error('Tree provider boundaries missing');
s=s.slice(0,from)+fs.readFileSync('scripts/project-trees-snippet.txt','utf8')+'\n'+s.slice(to);
s=s.replace("vscode.window.registerTreeDataProvider('parallelEarth.explorer',provider),","vscode.window.registerTreeDataProvider('parallelEarth.explorer',provider),\n    vscode.window.registerTreeDataProvider('parallelEarth.history',historyProvider),");
s=s.replace('  const handlers: Record<string,(item?: Item)=>Promise<unknown>> = {','  const handlers: Record<string,(item?: Item)=>Promise<unknown>> = {\n'+fs.readFileSync('scripts/project-handlers-snippet.txt','utf8'));
s=s.replace("      await showExplorer();\n      const next = await vscode.window.showInformationMessage('Experiment", "      activeExperimentId=created.id;\n      await showExplorer();\n      const next = await vscode.window.showInformationMessage('Experiment");
s=s.replace("      const label=await vscode.window.showInputBox({prompt:'Name this alternative for '","      activeExperimentId=exp.id;\n      const label=await vscode.window.showInputBox({prompt:'Name this alternative for '");
fs.writeFileSync('src/extension.ts',s);


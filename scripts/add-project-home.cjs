const fs=require('node:fs');
let s=fs.readFileSync('src/extension.ts','utf8');
s=s.replace("import { projectHistory } from './history';","import { projectHistory } from './history';\nimport { homeMarkup, parseHomeMessage } from './home';\nimport { randomUUID } from 'node:crypto';");
s=s.replace('  const refresh = () => change.fire(undefined);',fs.readFileSync('scripts/home-panel-snippet.txt','utf8').trimEnd());
s=s.replace("  status.command = 'parallelEarth.showExplorer';","  status.command = 'parallelEarth.showHome';");
s=s.replace("  status.tooltip = 'Open Earth Explorer - experiments are stored outside the original repository';","  status.tooltip = 'Open ParallelEarth home and project history';");
s=s.replace('  const handlers: Record<string,(item?: Item)=>Promise<unknown>> = {','  const handlers: Record<string,(item?: Item)=>Promise<unknown>> = {\n    async showHome() {await showHome();},');
s=s.replace('  if(context.extensionMode===vscode.ExtensionMode.Development)await showExplorer();','  if(context.extensionMode===vscode.ExtensionMode.Development){await showExplorer();await showHome();}');
fs.writeFileSync('src/extension.ts',s);
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(!pkg.contributes.commands.some(c=>c.command==='parallelEarth.showHome'))pkg.contributes.commands.unshift({command:'parallelEarth.showHome',title:'ParallelEarth: Open Home',icon:'$(home)'});
pkg.contributes.viewsWelcome[0].contents='Explore alternate futures.\n\nChoose your own Git project and create an experiment. Nothing is created automatically.\n\n[Create Experiment](command:parallelEarth.createExperiment)\n[Open Home](command:parallelEarth.showHome)\n\nResume previous work from Project History below.';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('src/index.ts',"\nexport * from './home';\n");


const fs=require('node:fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.scripts['dev:prepare']='node scripts/prepare-dev.cjs';
if(!pkg.activationEvents.includes('onStartupFinished'))pkg.activationEvents.push('onStartupFinished');
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
const launch={version:'0.2.0',configurations:[{
  name:'Run ParallelEarth (isolated demo)',type:'extensionHost',request:'launch',
  args:['--extensionDevelopmentPath='+'$'+'{workspaceFolder}','--user-data-dir='+'$'+'{workspaceFolder}/artifacts/dev-profile','--extensions-dir='+'$'+'{workspaceFolder}/artifacts/dev-extensions','--disable-extensions','$'+'{workspaceFolder}/artifacts/development-demo'],
  outFiles:['$'+'{workspaceFolder}/dist/**/*.js'],preLaunchTask:'npm: dev:prepare'
}]};
fs.writeFileSync('.vscode/launch.json',JSON.stringify(launch,null,2)+'\n');
fs.writeFileSync('.vscode/tasks.json',JSON.stringify({version:'2.0.0',tasks:[{type:'npm',script:'build',problemMatcher:[]},{type:'npm',script:'dev:prepare',problemMatcher:[]}]},null,2)+'\n');
let s=fs.readFileSync('src/extension.ts','utf8');
s=s.replace("description:e.baselineCommit.slice(0,8),id:e.id","description:path.basename(e.repository)+' | '+e.baselineCommit.slice(0,8),detail:e.repository,id:e.id");
s=s.replace("item.description=exp.baselineCommit.slice(0,8);","item.description=path.basename(exp.repository)+' | '+(exp.earths.some(e=>e.baseline)?exp.baselineCommit.slice(0,8):'INCOMPLETE');");
const from="    if (!found.size) throw new Error('Open a local Git repository with at least one commit.');\n    if (found.size === 1) return [...found][0];\n    return vscode.window.showQuickPick([...found],{placeHolder:'Choose repository'});";
const to="    const pick=await vscode.window.showQuickPick([\n      ...[...found].map(repo=>({label:path.basename(repo),description:repo,repository:repo})),\n      {label:'Choose another repository...',description:'Browse for a local Git project',repository:undefined}\n    ],{placeHolder:'Which project should this experiment use?'});\n    if(!pick)return;\n    if(pick.repository)return pick.repository;\n    const folders=await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'Use Git repository'});\n    if(!folders?.[0])return;\n    return repositoryRoot(folders[0].fsPath);";
if(!s.includes(from))throw new Error('Repository picker source changed; inspect before editing.');
s=s.replace(from,to);
s=s.replace("prompt:'Name this alternative',value:'Earth '+exp.earths.length","prompt:'Name this alternative for '+path.basename(exp.repository)+' ('+exp.repository+')',value:'Earth '+exp.earths.length");
s=s.replace("  if(vscode.workspace.isTrusted)await mkdir(root,{recursive:true});","  if(vscode.workspace.isTrusted)await mkdir(root,{recursive:true});\n  if(context.extensionMode===vscode.ExtensionMode.Development)await showExplorer();");
fs.writeFileSync('src/extension.ts',s);
fs.appendFileSync('docs/getting-started.md','\n## F5 development workspace\n\nF5 now prepares and opens artifacts/development-demo in an isolated VS Code profile. It does not restore the last folder from your normal VS Code profile. The demo contains a small booking-reconciliation Git repository; existing demo edits are preserved on subsequent launches. Experiments in your normal profile remain untouched. Create Experiment explicitly selects a repository, with a Browse option for other projects. Create Earth always uses that experiment\\\'s recorded repository. To use a real project in the demo host, select Choose another repository and browse to it.\n');
fs.appendFileSync('CHANGELOG.md','\nF5 now opens an explicit booking demo folder with separate development profile and no third-party extensions. Repository names are shown in the Explorer/picker; new experiments explicitly select a project. Existing normal-profile experiments are preserved.\n');


const fs=require('node:fs');
let s=fs.readFileSync('src/extension.ts','utf8');
s=s.replace("    const pick=await vscode.window.showQuickPick([\n      ...[...found].map(repo=>", "    if(!found.size){\n      const folders=await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'Choose project'});\n      if(!folders?.[0])return;\n      return repositoryRoot(folders[0].fsPath);\n    }\n    const pick=await vscode.window.showQuickPick([\n      ...[...found].map(repo=>");
s=s.replace("      const label=await vscode.window.showInputBox({prompt:'Experiment name',value:'My experiment'});if(!label)return;", "      const previous=(await service.store.load()).experiments.filter(e=>e.repository===repo&&e.earths.some(earth=>earth.baseline));\n      const label=await vscode.window.showInputBox({prompt:'Name your experiment for '+path.basename(repo),value:'Experiment '+(previous.length+1)});if(!label)return;");
fs.writeFileSync('src/extension.ts',s);


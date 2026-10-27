const fs=require('node:fs');
let s=fs.readFileSync('src/service.ts','utf8');
const deletion=fs.readFileSync('scripts/experiment-delete-snippet.txt','utf8');
s=s.replace('  async update(earth: Earth,',deletion+'\n  async update(earth: Earth,');
fs.writeFileSync('src/service.ts',s);
fs.appendFileSync('src/index.ts',"\nexport * from './history';\n");
const dollar='$';
fs.writeFileSync('.vscode/launch.json',JSON.stringify({version:'0.2.0',configurations:[{
  name:'ParallelEarth - Start Empty',type:'extensionHost',request:'launch',
  args:['--new-window','--extensionDevelopmentPath='+dollar+'{workspaceFolder}','--disable-extensions',dollar+'{workspaceFolder}/artifacts/ParallelEarth.code-workspace'],
  outFiles:[dollar+'{workspaceFolder}/dist/**/*.js'],preLaunchTask:'npm: dev:prepare'
}]},null,2)+'\n');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
for(const [id,title,icon]of [
  ['openExperiment','Open Experiment','folder-open'],['deleteExperiment','Delete Experiment','trash'],
  ['closeExperiment','Close Active Experiment','close'],['showHistory','Show Project History','history']]){
  if(!pkg.contributes.commands.some(c=>c.command==='parallelEarth.'+id))pkg.contributes.commands.push({command:'parallelEarth.'+id,title:'ParallelEarth: '+title,icon:'$('+icon+')'});
}
pkg.contributes.views.parallelEarth=[{id:'parallelEarth.explorer',name:'Active Experiment'},{id:'parallelEarth.history',name:'Project History'}];
pkg.contributes.viewsWelcome=[
  {view:'parallelEarth.explorer',contents:'Explore alternate futures.\n\nChoose a project and create an experiment to start. Nothing is created automatically.\n\n[Create Experiment](command:parallelEarth.createExperiment)\n\nResume previous work from Project History below.\n[Getting Started](command:parallelEarth.openDocumentation)'},
  {view:'parallelEarth.history',contents:'Your projects will appear here after you create an experiment.\n\nEach project keeps its own experiments and Earths.'}
];
pkg.contributes.menus['view/title']=[
  {command:'parallelEarth.createExperiment',when:'view == parallelEarth.explorer',group:'navigation'},
  {command:'parallelEarth.closeExperiment',when:'view == parallelEarth.explorer',group:'navigation'},
  {command:'parallelEarth.refresh',when:'view == parallelEarth.history',group:'navigation'}
];
pkg.contributes.menus['view/item/context']=[
  {command:'parallelEarth.deleteExperiment',when:"viewItem == parallelEarth.experiment",group:'inline'},
  {command:'parallelEarth.openExperiment',when:"viewItem == parallelEarth.historyExperiment",group:'inline'},
  {command:'parallelEarth.deleteExperiment',when:"viewItem == parallelEarth.historyExperiment",group:'inline'}
];
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');


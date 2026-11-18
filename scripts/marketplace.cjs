const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
require('./icon.cjs');
fs.mkdirSync('artifacts',{recursive:true});
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const result=spawnSync(process.execPath,[require.resolve('@vscode/vsce/vsce'),'package','--no-dependencies','--out',path.resolve('artifacts','parallel-earth-'+pkg.version+'-marketplace.vsix')],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;process.exitCode=result.status??1;

const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
let vsce;
try {
  vsce = require.resolve('@vscode/vsce/vsce');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  console.error('Marketplace packaging requires @vscode/vsce. See docs/publishing.md for the separate release-tool installation.');
  process.exit(1);
}
require('./icon.cjs');
fs.mkdirSync('artifacts',{recursive:true});
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const result=spawnSync(process.execPath,[vsce,'package','--no-dependencies','--out',path.resolve('artifacts','parallel-earth-'+pkg.version+'-marketplace.vsix')],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;process.exitCode=result.status??1;

import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('shubhammaji1.parallel-earth');
  assert.ok(extension,'Extension must be installed/discovered');
  await extension.activate();
  assert.equal(extension.isActive,true);
  await writeFile(path.resolve(__dirname,'../artifacts/host-result.json'),JSON.stringify({activation:true,vscode:vscode.version,checkedAt:new Date().toISOString()}));
  const commands = await vscode.commands.getCommands(true);
  for (const command of ['createExperiment','createEarth','openEarth','applyPatch','runChecks','compareEarths','exportReport','deleteEarth','showDiagnostics','duplicateEarth','bringChangesBack','manageCriteria','startPreview','openPreview','stopPreview','compareEnvironment','createCheckpoint','restoreCheckpoint','deleteCheckpoint','selectiveExport','refreshBaseline','storageManager','recipeBuilder','guidedRegression','publishTests','previewHealth']) assert.ok(commands.includes('parallelEarth.'+command),command);
  const {NativeTests}=require('./native-tests.js');
  const native=new NativeTests(vscode,async()=>{});
  try{
    native.publish({earths:[{id:'host-earth',name:'Host smoke',path:path.resolve(__dirname),freshness:'CURRENT',latestRun:{testReport:{complete:true,tests:[{id:'sample',file:'host.js',name:'Recorded evidence',state:'PASSED'}]}}}]});
    assert.ok(native.controller.items.get('host-earth')?.children.get('host-earth:sample'));
    native.invalidate();
  }finally{native.dispose();}
}



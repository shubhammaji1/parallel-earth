const path=require('node:path');
require('./build.cjs');
(async()=>{
  const {runTests}=require('@vscode/test-electron');
  const ts=require('./tooling.cjs').typescript(),fs=require('node:fs');
  fs.writeFileSync('dist/host.js',ts.transpileModule(fs.readFileSync('tests/host.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText);
  await runTests({extensionDevelopmentPath:path.resolve('.'),extensionTestsPath:path.resolve('dist/host.js'),launchArgs:['--disable-extensions','--skip-welcome','--skip-release-notes']});
})().catch(error=>{console.error(error);process.exitCode=1;});


const path=require('node:path');
require('./build.cjs');
(async()=>{
  const {runTests,downloadAndUnzipVSCode}=require('@vscode/test-electron');
  const {resolveHostExecutable}=require('./host-executable.cjs');
  const ts=require('./tooling.cjs').typescript(),fs=require('node:fs');
  fs.writeFileSync('dist/host.js',ts.transpileModule(fs.readFileSync('tests/host.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText);
  const vscodeExecutablePath=resolveHostExecutable(await downloadAndUnzipVSCode());
  await runTests({vscodeExecutablePath,extensionDevelopmentPath:path.resolve('.'),extensionTestsPath:path.resolve('dist/host.js'),launchArgs:['--disable-extensions','--skip-welcome','--skip-release-notes']});
})().catch(error=>{console.error(error);process.exitCode=1;});


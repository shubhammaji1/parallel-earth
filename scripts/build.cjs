const fs = require('node:fs');
const path = require('node:path');
const ts = require('./tooling.cjs').typescript();
fs.mkdirSync('dist',{recursive:true}); fs.mkdirSync('artifacts',{recursive:true});
for (const file of fs.readdirSync('src').filter(f=>f.endsWith('.ts'))) {
  const result = ts.transpileModule(fs.readFileSync(path.join('src',file),'utf8'),{
    fileName:file,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,strict:true,esModuleInterop:true}
  });
  const errors = result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)??[];
  if(errors.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>'\n'}));
  fs.writeFileSync(path.join('dist',file.replace(/\.ts$/,'.js')),result.outputText);
}
console.log('Built extension and core modules using TypeScript '+ts.version+' (syntax transpilation; run typecheck separately).');


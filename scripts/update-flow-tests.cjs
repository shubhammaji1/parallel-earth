const fs=require('node:fs');
let s=fs.readFileSync('src/home.ts','utf8').replace("&&keys.length===1)return","&&keys.length===1&&keys[0]==='action')return");
fs.writeFileSync('src/home.ts',s);
s=fs.readFileSync('tests/naming.test.cjs','utf8');
s=s.replace("F5 explicitly targets the local demo with a separate profile","F5 explicitly targets a blank workspace without a demo");
s=s.replace("assert.ok(config.args.some(a=>a.endsWith('/artifacts/development-demo')));","assert.ok(config.args.some(a=>a.endsWith('/artifacts/ParallelEarth.code-workspace')));");
s=s.replace("assert.ok(config.args.some(a=>a.startsWith('--user-data-dir=')&&a.endsWith('/artifacts/dev-profile')));","assert.ok(config.args.includes('--new-window'));\n  assert.ok(config.args.every(a=>!a.includes('development-demo')));");
fs.writeFileSync('tests/naming.test.cjs',s);
s=fs.readFileSync('scripts/test.cjs','utf8').replace("'tests/naming.test.cjs'","'tests/naming.test.cjs','tests/project-flow.test.cjs'");
fs.writeFileSync('scripts/test.cjs',s);


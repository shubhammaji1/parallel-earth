require('./build.cjs');
const {spawnSync} = require('node:child_process');
const result=spawnSync(process.execPath,['--test','tests/v05.test.cjs','tests/v04.test.cjs','tests/v03.test.cjs','tests/release.test.cjs','tests/core.test.cjs','tests/naming.test.cjs','tests/project-flow.test.cjs','tests/history-performance.test.cjs','tests/host-executable.test.cjs','tests/dashboard.test.cjs'],{stdio:'inherit'});
process.exitCode=result.status??1;




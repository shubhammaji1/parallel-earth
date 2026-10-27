const path = require('node:path');
const os = require('node:os');
exports.typescript = () => {
  const candidates = ['typescript',path.join(os.homedir(),'AppData/Roaming/npm/node_modules/typescript'),'/usr/local/lib/node_modules/typescript'];
  for (const candidate of candidates) { try { return require(candidate); } catch {} }
  throw new Error('TypeScript compiler unavailable. Run npm install first.');
};


const fs=require('node:fs');
let text=fs.readFileSync('src/git.ts','utf8');
const start=text.indexOf('export async function assertOwned('),end=text.indexOf('export async function changes(',start);
if(start<0||end<0)throw Error('Ownership boundary not found');
text=text.slice(0,start)+fs.readFileSync('scripts/ownership-optimization.txt','utf8')+'\n'+text.slice(end);
fs.writeFileSync('src/git.ts',text);
text=fs.readFileSync('src/service.ts','utf8').replace('changes, noSymlinks }','changes, noSymlinks, ownershipContext }');
const from=text.indexOf('  async deleteExperiment('),to=text.indexOf('  async update(',from);
if(from<0||to<0)throw Error('Deletion boundary not found');
text=text.slice(0,from)+fs.readFileSync('scripts/deletion-optimization.txt','utf8')+'\n'+text.slice(to);
fs.writeFileSync('src/service.ts',text);


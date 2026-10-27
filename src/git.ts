import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { lstat, realpath, readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isEarthPath } from './workspace';
const exec = promisify(execFile);
export async function git(cwd: string, args: string[]): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
  const result = await exec('git', ['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','submodule.recurse=false', ...args], {
    cwd, env: { ...env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 4 * 1024 * 1024, timeout: 30000, windowsHide: true
  });
  return result.stdout;
}
export function contained(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
export async function noSymlinks(target: string): Promise<void> {
  let current = path.resolve(target);
  for (;;) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlink/reparse path refused: ' + current); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
export async function repositoryRoot(cwd: string): Promise<string> { return realpath((await git(cwd, ['rev-parse','--show-toplevel'])).trim()); }
export async function resolveCommit(repo: string, ref: string): Promise<string> {
  if (!ref || ref.startsWith('-') || /[\r\n\0]/.test(ref)) throw new Error('Invalid revision');
  return (await git(repo, ['rev-parse','--verify','--end-of-options',ref + '^{commit}'])).trim();
}
export async function createWorktree(repo: string, root: string, id: string, commit: string, directory = id): Promise<string> {
  const target = path.join(root, 'earths', directory);
  if (!isEarthPath(root,id,target)) throw new Error('Ownership path mismatch');
  await noSymlinks(root);
  if (contained(repo, root) || path.resolve(repo) === path.resolve(root)) throw new Error('Storage must be outside the original repository');
  await mkdir(path.dirname(target), { recursive: true });
  await git(repo, ['worktree','add','--detach',target,commit]);
  return target;
}
export interface OwnershipContext { repository:string; common:string; registered:ReadonlySet<string>; storageRoot?:string }
function normalizedPath(value:string):string {
  const resolved=path.resolve(value);return process.platform==='win32'?resolved.toLowerCase():resolved;
}
export async function ownershipContext(repo:string,storageRoot?:string):Promise<OwnershipContext> {
  const [listed,common]=await Promise.all([
    git(repo,['worktree','list','--porcelain','-z']),
    git(repo,['rev-parse','--path-format=absolute','--git-common-dir'])
  ]);
  await noSymlinks(common.trim());
  if(storageRoot)await noSymlinks(path.join(storageRoot,'earths'));
  return {repository:normalizedPath(repo),common:await realpath(common.trim()),storageRoot:storageRoot?normalizedPath(storageRoot):undefined,
    registered:new Set(listed.split('\0').filter(line=>line.startsWith('worktree ')).map(line=>normalizedPath(line.slice(9))))};
}
export async function assertOwned(repo:string,root:string,id:string,target:string,snapshot?:OwnershipContext):Promise<void> {
  if(!isEarthPath(root,id,target))throw new Error('Ownership path mismatch');
  const plain=async(file:string)=>{if((await lstat(file)).isSymbolicLink())throw new Error('Symlink/reparse path refused: '+file);};
  if(snapshot?.storageRoot===normalizedPath(root)){
    await plain(target);
    if(normalizedPath(await realpath(target))!==normalizedPath(target))throw new Error('Worktree ancestor path changed');
  }else await noSymlinks(target);
  const context=snapshot??await ownershipContext(repo);
  if(context.repository!==normalizedPath(repo)||!context.registered.has(normalizedPath(target)))throw new Error('Worktree is not registered with its repository');
  const marker=path.join(target,'.git');await plain(marker);
  const pointer=(await readFile(marker,'utf8')).trim();
  if(!pointer.startsWith('gitdir: ')||pointer.includes('\0')||/[\r\n]/.test(pointer))throw new Error('Invalid linked worktree marker');
  const admin=path.resolve(target,pointer.slice(8));await plain(admin);
  const metadata=await realpath(admin);
  if(normalizedPath(metadata)!==normalizedPath(admin))throw new Error('Worktree metadata ancestor path changed');
  if(normalizedPath(path.dirname(metadata))!==normalizedPath(path.join(context.common,'worktrees')))throw new Error('Repository identity mismatch');
  const commonFile=path.join(metadata,'commondir'),backlinkFile=path.join(metadata,'gitdir');
  await plain(commonFile);await plain(backlinkFile);
  const [common,backlink]=await Promise.all([readFile(commonFile,'utf8'),readFile(backlinkFile,'utf8')]);
  if(normalizedPath(await realpath(path.resolve(metadata,common.trim())))!==normalizedPath(context.common))throw new Error('Repository identity mismatch');
  if(normalizedPath(await realpath(path.resolve(metadata,backlink.trim())))!==normalizedPath(await realpath(marker)))throw new Error('Worktree backlink mismatch');
}


export async function changes(target: string, commit: string): Promise<string> {
  const diff = await git(target, ['diff','--no-ext-diff','--no-textconv',commit,'--']);
  const untracked = await git(target, ['ls-files','--others','--exclude-standard']);
  return diff + (untracked ? '\nUntracked files (not included in diff):\n' + untracked : '');
}
export function patchPaths(patch: string): string[] {
  if (Buffer.byteLength(patch) > 1024 * 1024) throw new Error('Patch exceeds 1 MiB');
  if (!patch.startsWith('diff --git ') || /^(GIT binary patch|rename |copy )/m.test(patch)) throw new Error('Only plain text Git patches without renames/copies are supported');
  const paths: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    if (/^diff --git /.test(line) && !/^diff --git a\/[^\t\r\n]+ b\/[^\t\r\n]+$/.test(line)) throw new Error('Unsupported patch syntax');
    if (/^(---|\+\+\+) /.test(line)) {
      const value = line.slice(4); if (value === '/dev/null') continue;
      if (!/^[ab]\//.test(value)) throw new Error('Patch needs a/ and b/ paths');
      const p = value.slice(2);
      if (!p || /[\\:\0\t"\x00-\x1f]/.test(p) || p.split('/').some(part => part === '..' || part === '.' || part.toLowerCase() === '.git' || !part || /[. ]$/.test(part))) throw new Error('Unsafe patch path');
      paths.push(p);
    }
  }
  if (!paths.length || /^(new file mode|old mode|new mode|deleted file mode) 120000/m.test(patch)) throw new Error('Empty or symlink patch refused');
  return [...new Set(paths)];
}
export async function applyPatch(target: string, patch: string): Promise<void> {
  for (const p of patchPaths(patch)) { const file = path.resolve(target,p); if (!contained(target,file)) throw new Error('Patch escape'); await noSymlinks(file); }
  const scratch = path.join(path.dirname(target),'patch-' + randomUUID() + '.diff');
  await writeFile(scratch,patch,{flag:'wx'});
  try { await git(target,['apply','--check','--',scratch]); await git(target,['apply','--',scratch]); }
  finally { await unlink(scratch); }
}
export async function readPackage(target: string): Promise<Record<string,string>> {
  try {
    const data = JSON.parse(await readFile(path.join(target,'package.json'),'utf8')) as {scripts?: Record<string,unknown>};
    return Object.fromEntries(Object.entries(data.scripts ?? {}).filter((entry): entry is [string,string] => typeof entry[1] === 'string'));
  } catch { return {}; }
}


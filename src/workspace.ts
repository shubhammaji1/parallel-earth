import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { Earth } from './domain';
import { noSymlinks } from './git';
export function slug(value: string, fallback = 'earth'): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,28).replace(/-+$/g,'') || fallback;
}
export function earthDirectory(repository: string, label: string, id: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid Earth ID');
  return slug(path.basename(repository),'project')+'--'+slug(label)+'--'+id.slice(0,8);
}
export function isEarthPath(root: string, id: string, target: string): boolean {
  const parent=path.resolve(root,'earths'), resolved=path.resolve(target);
  if (path.dirname(resolved)!==parent || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  const base=path.basename(resolved);
  return base===id || (/^[a-z0-9][a-z0-9-]{0,70}$/.test(base) && base.endsWith('--'+id.slice(0,8)));
}
export async function earthWorkspace(root: string, repository: string, earth: Earth): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(earth.id)) throw new Error('Invalid Earth ID');
  const project=path.basename(repository);
  const directory=path.join(root,'workspaces',earth.id);
  await noSymlinks(directory); await mkdir(directory,{recursive:true});
  const file=path.join(directory,slug(project,'project')+'--'+slug(earth.name)+'.code-workspace');
  await noSymlinks(file);
  await writeFile(file,JSON.stringify({
    folders:[{name:project+' \u2014 Earth: '+earth.name,path:earth.path}],
    settings:{'window.title':'ParallelEarth | '+earth.name+' | '+project+'${separator}${activeEditorShort}'}
  },null,2)+'\n','utf8');
  return file;
}


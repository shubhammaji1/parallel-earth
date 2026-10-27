import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Catalog, validateCatalog } from './domain';
import { noSymlinks } from './git';
export class Store {
  readonly root: string;
  constructor(root: string) { if (!path.isAbsolute(root)) throw new Error('Storage must be absolute'); this.root = path.resolve(root); }
  async load(): Promise<Catalog> {
    await noSymlinks(this.root);
    try { return validateCatalog(JSON.parse(await readFile(path.join(this.root,'catalog.json'),'utf8'))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {version:1,experiments:[]}; throw new Error('Catalog corrupt or incompatible; original preserved. ' + String(e)); }
  }
  async transaction<T>(action: (catalog: Catalog) => Promise<T>): Promise<T> {
    await noSymlinks(this.root); await mkdir(this.root,{recursive:true});
    const lockPath = path.join(this.root,'catalog.lock');
    let lock;
    try { lock = await open(lockPath,'wx'); } catch { throw new Error('Catalog busy. If all ParallelEarth windows are closed, remove catalog.lock to recover.'); }
    const temp = path.join(this.root,'catalog-' + crypto.randomUUID() + '.tmp');
    try {
      await lock.writeFile(JSON.stringify({pid:process.pid,created:new Date().toISOString()}));
      const catalog = await this.load(); const result = await action(catalog);
      await writeFile(temp,JSON.stringify(validateCatalog(catalog),null,2)); await rename(temp,path.join(this.root,'catalog.json'));
      return result;
    } finally { await lock.close(); await unlink(lockPath); await unlink(temp).catch(() => {}); }
  }
}


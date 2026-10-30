import { mkdir, readdir, readFile, writeFile, unlink, rmdir, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { noSymlinks } from './git';

export interface QueueJob { id: string; earthId: string; pid: number; created: string }
export type QueueState = 'QUEUED' | 'RUNNING' | 'CANCELLED';
export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}
/** Serialises commands across hosts sharing local storage. Never steals an active
 * lock from a dead host: a child command may have survived that host. */
export class ExecutionQueue {
  readonly directory: string;
  constructor(root: string) { this.directory = path.join(root, 'execution-queue'); }
  async snapshot(): Promise<{ running?: QueueJob; queued: QueueJob[] }> {
    await noSymlinks(this.directory);
    let names: string[];
    try { names = await readdir(this.directory); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { queued: [] }; throw e; }
    const read = async (name: string): Promise<QueueJob | undefined> => {
      try { const data = JSON.parse(await readFile(path.join(this.directory, name), 'utf8'));
        if (typeof data.id !== 'string' || typeof data.earthId !== 'string' || !Number.isSafeInteger(data.pid) || data.pid < 1 || typeof data.created !== 'string') throw new Error('Invalid execution queue record');
        return data;
      } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
    };
    const running = await read(path.join('active', 'owner.json'));
    const queued: QueueJob[] = [];
    for (const name of names.filter(n => /^\d+-[0-9a-f-]+\.json$/.test(n)).sort()) {
      const job = await read(name); if (job && alive(job.pid)) queued.push(job);
      else if (job) await unlink(path.join(this.directory, name)).catch(() => {});
    }
    return { running, queued };
  }
  async execute<T>(earthId: string, signal: AbortSignal | undefined, state: (state: QueueState) => void, action: () => Promise<T>): Promise<T> {
    await noSymlinks(this.directory); await mkdir(this.directory, { recursive: true });
    const job: QueueJob = { id: randomUUID(), earthId, pid: process.pid, created: new Date().toISOString() };
    const ticket = path.join(this.directory, String(Date.now()).padStart(16, '0') + '-' + job.id + '.json');
    const active = path.join(this.directory, 'active'); let held = false;
    const temp = ticket + '.tmp';
    await writeFile(temp, JSON.stringify(job)); await rename(temp, ticket);
    try {
      state('QUEUED');
      while (!held) {
        if (signal?.aborted) throw new Error('Cancelled while queued; command was not started.');
        const snapshot = await this.snapshot();
        if (snapshot.running && !alive(snapshot.running.pid)) throw new Error('Execution queue blocked by an interrupted host. Verify no command is still running before manually recovering ' + active);
        if (snapshot.queued[0]?.id === job.id) {
          try { await mkdir(active); held = true; }
          catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
        }
        if (!held) await delay(150, undefined, { signal }).catch(() => { throw new Error('Cancelled while queued; command was not started.'); });
      }
      await writeFile(path.join(active, 'owner.tmp'), JSON.stringify(job));
      await rename(path.join(active, 'owner.tmp'), path.join(active, 'owner.json'));
      if (signal?.aborted) throw new Error('Cancelled while queued; command was not started.');
      state('RUNNING'); return await action();
    } catch (e) { if (signal?.aborted) state('CANCELLED'); throw e; }
    finally {
      if (held) { await unlink(path.join(active, 'owner.json')).catch(() => {}); await unlink(path.join(active, 'owner.tmp')).catch(() => {}); await rmdir(active); }
      await unlink(ticket).catch(() => {});
    }
  }
}

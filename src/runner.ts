import { spawn, execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Command, Run, RunKind, validateCommand } from './domain';
import { git, changes, readPackage } from './git';
export interface RunOptions { approved: boolean; trusted: boolean; timeoutMs: number; maxBytes: number; signal?: AbortSignal; onOutput?: (text: string) => void; kind?: RunKind; batchId?: string; repeatIndex?: number; repeatTotal?: number; queueScope?: string; concurrencyLimit?: number; queuedMs?: number }
export async function discoverCommands(target: string): Promise<Command[]> {
  return Object.keys(await readPackage(target)).filter(s => /^(test|build|lint|typecheck|check)(:|$)/.test(s) && /^[a-zA-Z0-9:_-]+$/.test(s)).map(label => ({program:'npm',args:['run',label],label}));
}
export async function fingerprint(target: string, timeoutMs: number): Promise<string> {
  const hash = createHash('sha256'); hash.update(JSON.stringify({platform:os.platform(),arch:os.arch(),extensionNode:process.version,timeoutMs}));
  for (const file of ['package.json','package-lock.json','pnpm-lock.yaml','yarn.lock']) {
    try { hash.update(file).update(await readFile(path.join(target,file))); } catch { /* absent */ }
  }
  return hash.digest('hex');
}
export class Runner {
  private active = 0;
  readonly maxConcurrent: number;
  constructor(maxConcurrent = 1) { if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) throw new Error('Invalid concurrency limit'); this.maxConcurrent = maxConcurrent; }
  async run(earthId: string, target: string, command: Command, options: RunOptions): Promise<Run> {
    if (!options.approved || !options.trusted) throw new Error('Explicit approval and Workspace Trust required');
    validateCommand(command, options.kind);
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 3600000 || !Number.isInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 1048576) throw new Error('Invalid execution limits');
    if (this.active >= this.maxConcurrent) throw new Error('Concurrency limit reached');
    this.active++;
    try {
      const revision = (await git(target,['rev-parse','HEAD'])).trim();
      const changesHash = createHash('sha256').update(await changes(target,revision)).digest('hex');
      const envFingerprint = await fingerprint(target,options.timeoutMs); const start = Date.now();
      if (options.signal?.aborted) throw new Error('Cancelled before launch');
      return await new Promise<Run>((resolve) => {
        let output = Buffer.alloc(0), truncated = false, timedOut = false, cancelled = false, spawnError = '';
        const env: NodeJS.ProcessEnv = {};
        for (const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','PATHEXT','COMSPEC','HOME','USERPROFILE','TEMP','TMP','APPDATA','LOCALAPPDATA']) if (process.env[key]) env[key] = process.env[key];
        env.CI = 'true'; env.FORCE_COLOR = '0';
        // npm.cmd requires cmd.exe on Windows. Only a constrained script identifier reaches it.
        const isWin = process.platform === 'win32' && command.program === 'npm';
        const program = isWin ? (process.env.COMSPEC ?? 'cmd.exe') : command.program;
        const args = isWin ? ['/d','/s','/c','npm.cmd ' + command.args.join(' ')] : command.args;
        const child = spawn(program,args,{cwd:target,env,shell:false,windowsHide:true,detached:process.platform !== 'win32',stdio:['ignore','pipe','pipe']});
        const append = (chunk: Buffer) => {
          const remaining = options.maxBytes - output.length;
          if (chunk.length > remaining) truncated = true;
          const kept = chunk.subarray(0,Math.max(0,remaining)); output = Buffer.concat([output,kept]);
          if (kept.length) { try { options.onOutput?.(kept.toString('utf8')); } catch { /* consumer must not crash runner */ } }
        };
        child.stdout.on('data',append); child.stderr.on('data',append);
        const kill = () => {
          if (!child.pid) return;
          if (process.platform === 'win32') execFile('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true},() => {});
          else { try { process.kill(-child.pid,'SIGKILL'); } catch { /* exited */ } }
        };
        const abort = () => { cancelled = true; kill(); };
        options.signal?.addEventListener('abort',abort,{once:true});
        const timer = setTimeout(() => { timedOut = true; kill(); },options.timeoutMs);
        child.on('error',e => { spawnError = e.message; });
        child.on('close',code => {
          clearTimeout(timer); options.signal?.removeEventListener('abort',abort);
          if (process.platform !== 'win32') kill();
          const state = cancelled ? 'CANCELLED' : timedOut || spawnError ? 'ERROR' : code === 0 ? 'PASSED' : code === null ? 'ERROR' : 'FAILED';
          resolve({id:randomUUID(),earthId,command,started:new Date(start).toISOString(),ended:new Date().toISOString(),state,exitCode:code,output:output.toString('utf8'),truncated,durationMs:Date.now()-start,kind:options.kind??'check',batchId:options.batchId,repeatIndex:options.repeatIndex,repeatTotal:options.repeatTotal,queueScope:options.queueScope,concurrencyLimit:options.concurrencyLimit,queuedMs:options.queuedMs,fingerprint:envFingerprint,revision,changesHash,limitation:timedOut ? 'Timeout exceeded' : spawnError || 'Command exit status only; individual assertions and coverage are not inferred. Installed dependencies, tools and external services may differ. Changes hash excludes untracked contents. Elapsed time is not a benchmark; external processes and test workers can contend for resources.'});
        });
      });
    } finally { this.active--; }
  }
}


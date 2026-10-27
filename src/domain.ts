import { randomUUID } from 'node:crypto';

export type State = 'PASSED' | 'FAILED' | 'INCONCLUSIVE' | 'NOT_RUN' | 'ERROR' | 'CANCELLED';
export interface Command { program: 'node' | 'npm'; args: string[]; label: string }
export interface Run {
  id: string; earthId: string; command: Command; started: string; ended: string;
  state: State; exitCode: number | null; output: string; truncated: boolean;
  durationMs: number; fingerprint: string; revision: string; changesHash: string; limitation: string;
}
export interface Earth {
  id: string; experimentId: string; name: string; sourceCommit: string; path: string;
  created: string; archived: boolean; baseline: boolean; runs: Run[];
}
export interface Experiment { id: string; name: string; repository: string; baselineCommit: string; created: string; earths: Earth[] }
export interface Catalog { version: 1; experiments: Experiment[] }
export const uuid = randomUUID;
export function name(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100 || /[\x00-\x1f]/.test(value)) throw new Error('Name must contain 1–100 printable characters');
  return value.trim();
}
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
}
function text(value: unknown, max = 4096): asserts value is string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error('Invalid string');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid UUID');
}
function commit(value: unknown): void { if (typeof value !== 'string' || !/^[0-9a-f]{40,64}$/.test(value)) throw new Error('Invalid commit'); }
function date(value: unknown): void { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid timestamp'); }
export function validateCommand(value: Command): Command {
  object(value); text(value.label, 100);
  if (!Array.isArray(value.args) || !value.args.every(a => typeof a === 'string')) throw new Error('Invalid command arguments');
  if (value.program === 'npm') {
    if (value.args.length !== 2 || value.args[0] !== 'run' || !/^[a-zA-Z0-9_][a-zA-Z0-9:_-]*$/.test(value.args[1])) throw new Error('Select a simple npm script name');
  } else if (value.program === 'node') {
    if (value.args.length !== 2 || value.args[0] !== '--test' || !/^[a-zA-Z0-9_./-]+\.(?:cjs|mjs|js)$/.test(value.args[1]) || (value.args[1].startsWith('/') || value.args[1].startsWith('-')) || value.args[1].split('/').includes('..')) throw new Error('Node checks require node --test relative-file.js');
  } else throw new Error('Only npm scripts and Node test files are supported');
  return value;
}
export function validateCatalog(value: unknown): Catalog {
  object(value);
  if (value.version !== 1 || !Array.isArray(value.experiments) || value.experiments.length > 100) throw new Error('Unsupported catalog version or size');
  const seen = new Set<string>();
  for (const exp of value.experiments) {
    object(exp); id(exp.id); text(exp.name, 100); name(exp.name); text(exp.repository); commit(exp.baselineCommit); date(exp.created);
    if (seen.has(exp.id)) throw new Error('Duplicate ID'); seen.add(exp.id);
    if (!Array.isArray(exp.earths) || exp.earths.length > 100) throw new Error('Invalid Earth collection');
    for (const earth of exp.earths) {
      object(earth); id(earth.id); id(earth.experimentId); text(earth.name, 100); name(earth.name); text(earth.path); commit(earth.sourceCommit); date(earth.created);
      if (seen.has(earth.id) || earth.experimentId !== exp.id || earth.sourceCommit !== exp.baselineCommit || typeof earth.archived !== 'boolean' || typeof earth.baseline !== 'boolean') throw new Error('Invalid Earth relationship');
      seen.add(earth.id);
      if (!Array.isArray(earth.runs) || earth.runs.length > 50) throw new Error('Invalid run collection');
      for (const run of earth.runs) {
        object(run); id(run.id); id(run.earthId); date(run.started); date(run.ended); text(run.output, 1100000); text(run.fingerprint); text(run.changesHash); commit(run.revision); text(run.limitation);
        if (run.earthId !== earth.id || !['PASSED','FAILED','INCONCLUSIVE','NOT_RUN','ERROR','CANCELLED'].includes(String(run.state)) || typeof run.truncated !== 'boolean' || typeof run.durationMs !== 'number' || !Number.isFinite(run.durationMs) || run.durationMs < 0 || !(run.exitCode === null || Number.isInteger(run.exitCode))) throw new Error('Invalid execution evidence');
        validateCommand(run.command as Command);
      }
    }
    if (exp.earths.filter(e => (e as Record<string, unknown>).baseline).length > 1) throw new Error('Duplicate baseline');
  }
  return value as unknown as Catalog;
}



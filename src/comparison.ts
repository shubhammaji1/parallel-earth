import { Experiment, State } from './domain';
export function compare(experiment: Experiment) {
  const baseline = experiment.earths.find(e => e.baseline);
  return {version:1,experimentId:experiment.id,name:experiment.name,baselineCommit:experiment.baselineCommit,generated:new Date().toISOString(),
    limitations:['Command exit status is evidence for that command, not general correctness or individual test outcomes.',
      'Worktrees isolate code state; commands can access this machine and network.',
      'Fingerprints cover OS, extension Node, timeout, package manifest and lockfiles; installed dependencies and external services are not verified.',
      'No performance conclusion follows from single-run durations.',
      'Evidence is historical; edit after a run requires rerunning checks. Untracked contents are excluded from the changes hash.',
      'Only the latest check for each Earth is summarized; JSON includes the complete retained run history.'],
    earths:experiment.earths.map(earth => {
      const latest = earth.runs.at(-1);
      const base = baseline?.runs.findLast(r => latest && JSON.stringify(r.command) === JSON.stringify(latest.command));
      const comparable = !!latest && !!base && latest.fingerprint === base.fingerprint;
      const state: State = latest?.state ?? 'NOT_RUN';
      const outcome = !latest ? 'NOT_RUN' : !base || !comparable ? 'INCONCLUSIVE' :
        base.state === 'PASSED' && state === 'FAILED' ? 'REGRESSION' :
        base.state === 'FAILED' && state === 'PASSED' ? 'IMPROVEMENT' :
        base.state === 'FAILED' && state === 'FAILED' ? 'BASELINE_FAILURE' : state;
      return {id:earth.id,name:earth.name,baseline:earth.baseline,archived:earth.archived,state,outcome,comparable,latestRun:latest ?? null,runs:earth.runs};
    })};
}
export type Report = ReturnType<typeof compare>;
function cell(value: string): string { return value.replace(/[|\r\n]/g,' ').replace(/[<>\x00-\x1f]/g,''); }
export function markdown(report: Report): string {
  return '# ParallelEarth — ' + cell(report.name) + '\n\nBaseline: ' + report.baselineCommit + '\nGenerated: ' + report.generated +
    '\n\n| Earth | Check status | Comparison | Duration | Run ID |\n| --- | --- | --- | --- | --- |\n' +
    report.earths.map(e => '| ' + cell(e.name) + ' | ' + e.state + ' | ' + e.outcome + ' | ' + (e.latestRun?.durationMs ?? '—') + ' ms | ' + (e.latestRun?.id ?? '—') + ' |').join('\n') +
    '\n\n## Evidence limits\n\n' + report.limitations.map(l => '- ' + l).join('\n') +
    '\n\n## Execution evidence\n\n' + report.earths.map(e => '### ' + cell(e.name) + '\n\n' + (e.latestRun ?
      'Command: ' + cell([e.latestRun.command.program,...e.latestRun.command.args].join(' ')) +
      '\n\nRevision: ' + e.latestRun.revision + '\nFingerprint: ' + e.latestRun.fingerprint +
      '\nChanges hash: ' + e.latestRun.changesHash + '\nStarted: ' + e.latestRun.started + '\nEnded: ' + e.latestRun.ended +
      '\nExit: ' + e.latestRun.exitCode + '\nOutput truncated: ' + e.latestRun.truncated + '\n\n' + e.latestRun.limitation : 'No execution evidence.')).join('\n\n') + '\n';
}


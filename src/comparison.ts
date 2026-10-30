import { Experiment, Run } from './domain';
const sameCommand = (a: Run, b: Run) => a.command.program === b.command.program && JSON.stringify(a.command.args) === JSON.stringify(b.command.args);
export function checkSeries(runs: Run[]) {
  const checks = runs.filter(r => r.kind !== 'setup'), latest = checks.at(-1);
  const series = latest ? latest.batchId ? checks.filter(r => r.batchId === latest.batchId && sameCommand(r, latest)) : [latest] : [];
  const expected = latest?.repeatTotal ?? 1;
  const consistent = !latest || series.every(r => r.fingerprint === latest.fingerprint && r.revision === latest.revision && r.changesHash === latest.changesHash);
  const complete = series.length === expected && (expected === 1 || new Set(series.map(r => r.repeatIndex)).size === expected && series.every(r => r.repeatTotal === expected && r.repeatIndex! >= 1 && r.repeatIndex! <= expected));
  const states = new Set(series.map(r => r.state));
  const unstable = consistent && states.has('PASSED') && states.has('FAILED');
  const summary = !latest ? 'NOT_RUN' : !consistent || !complete ? 'INCONCLUSIVE' : unstable ? 'UNSTABLE' : states.size === 1 ? latest.state : 'INCONCLUSIVE';
  return { latest, runs: series, expected, recorded: series.length, consistent, complete, unstable, summary };
}
export function compare(experiment: Experiment) {
  const baseline = experiment.earths.find(e => e.baseline);
  return {version:2,experimentId:experiment.id,name:experiment.name,repository:experiment.repository,baselineCommit:experiment.baselineCommit,generated:new Date().toISOString(),
    limitations:['Command exit status is evidence for that command, not general correctness or individual test outcomes.',
      'Worktrees separate code state; commands can access this machine and network. Dependencies are not shared automatically.',
      'Fingerprints cover OS, extension Node, timeout, package manifest and lockfiles; installed dependencies and external services are not verified.',
      'Elapsed time is execution detail, not a performance benchmark. The shared queue does not control external processes, other storage roots or test-runner workers.',
      'Evidence is historical; edit after a run requires rerunning checks. Untracked contents are excluded from the changes hash.',
      'Repeated comparisons require complete, internally consistent series from the same batch. UNSTABLE indicates observed pass/fail variation, not a diagnosis of flakiness.',
      'Reports summarise the latest check series per Earth. JSON retains up to 50 runs per Earth, including setup. Missing history cannot establish stability.'],
    earths:experiment.earths.map(earth => {
      const result = checkSeries(earth.runs), latest = result.latest;
      const baseRuns = baseline?.runs.filter(r => r.kind !== 'setup' && latest && sameCommand(r, latest)) ?? [];
      const base = checkSeries(baseRuns);
      const setup = earth.runs.findLast(r => r.kind === 'setup');
      const baseSetup = baseline?.runs.findLast(r => r.kind === 'setup');
      const setupUnchanged = (!setup || !!latest && setup.ended <= latest.started) && (!baseSetup || !!base.latest && baseSetup.ended <= base.latest.started);
      const sameBatch = (result.expected === 1 && base.expected === 1) || !!latest?.batchId && latest.batchId === base.latest?.batchId && result.expected === base.expected;
      const comparable = !!latest && !!base.latest && latest.fingerprint === base.latest.fingerprint && result.consistent && base.consistent && result.complete && base.complete && sameBatch && setupUnchanged;
      const unstable = result.unstable || base.unstable;
      const outcome = !latest ? 'NOT_RUN' : !comparable ? 'INCONCLUSIVE' : unstable ? 'UNSTABLE' :
        base.summary === 'PASSED' && result.summary === 'FAILED' ? 'REGRESSION' :
        base.summary === 'FAILED' && result.summary === 'PASSED' ? 'IMPROVEMENT' :
        base.summary === 'FAILED' && result.summary === 'FAILED' ? 'BASELINE_FAILURE' :
        ['PASSED','FAILED','ERROR','CANCELLED'].includes(result.summary) && base.summary === result.summary ? result.summary : 'INCONCLUSIVE';
      return {id:earth.id,name:earth.name,path:earth.path,baseline:earth.baseline,archived:earth.archived,state:result.summary,outcome,comparable,
        setupStatus:setup?.state??'NOT_RUN',latestSetup:setup??null,repeat:{expected:result.expected,recorded:result.recorded,complete:result.complete,consistent:result.consistent,unstable:result.unstable},
        latestRun:latest??null,series:result.runs,runs:earth.runs};
    })};
}
export type Report = ReturnType<typeof compare>;
function cell(value: string): string { return value.replace(/[|\r\n]/g,' ').replace(/[<>\x00-\x1f]/g,''); }
export function markdown(report: Report): string {
  const command = (r: Run) => cell([r.command.program,...r.command.args].join(' '));
  const evidence = (r: Run) => '- '+cell(r.kind??'check')+' '+(r.repeatIndex??1)+'/'+(r.repeatTotal??1)+' — '+command(r)+' — '+r.state+
    '\n  - Run: '+r.id+'; revision: '+r.revision+'; fingerprint: '+cell(r.fingerprint)+'; changes: '+cell(r.changesHash)+
    '\n  - Started: '+r.started+'; ended: '+r.ended+'; elapsed (not benchmark): '+r.durationMs+' ms'+
    '\n  - Queue scope: '+cell(r.queueScope??'Not recorded (legacy or direct SDK run)')+'; concurrency limit: '+(r.concurrencyLimit??'Not recorded')+'; waited: '+(r.queuedMs??'Not recorded')+' ms'+
    '\n  - Exit: '+r.exitCode+'; output truncated: '+r.truncated+'; batch: '+(r.batchId??'none')+'\n  - '+cell(r.limitation);
  return '# ParallelEarth — ' + cell(report.name) + '\n\nRepository: '+cell(report.repository)+'\nBaseline: '+report.baselineCommit+'\nGenerated: '+report.generated+
    '\n\n| Earth | Setup | Check status | Comparison | Runs / requested | Elapsed (not benchmark) |\n| --- | --- | --- | --- | --- | --- |\n'+
    report.earths.map(e=>'| '+cell(e.name)+' | '+e.setupStatus+' | '+e.state+' | '+e.outcome+' | '+e.repeat.recorded+' / '+e.repeat.expected+' | '+(e.latestRun?e.latestRun.durationMs+' ms':'—')+' |').join('\n')+
    '\n\n## Evidence limits\n\n'+report.limitations.map(l=>'- '+l).join('\n')+
    '\n\n## Execution evidence\n\n'+report.earths.map(e=>'### '+cell(e.name)+'\n\nDirectory: '+cell(e.path)+'\n\n'+
      (e.latestSetup?'Latest approved setup:\n\n'+evidence(e.latestSetup)+'\n\n':'Setup: no recorded setup run. Dependencies may have been installed manually.\n\n')+
      (e.series.length?e.series.map(evidence).join('\n\n'):'No check execution evidence.')).join('\n\n')+'\n';
}

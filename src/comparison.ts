import { Experiment, Run, Earth } from './domain';
import { compareTests } from './test-results';
import { environmentDifferences } from './environment';
const sameCommand = (a: Pick<Run,'command'>, b: Pick<Run,'command'>) => a.command.program === b.command.program && JSON.stringify(a.command.args) === JSON.stringify(b.command.args);
export function checkSeries(runs: Run[]) {
  const checks = runs.filter(r => r.kind !== 'setup'), latest = checks.at(-1);
  const series = latest ? latest.batchId ? checks.filter(r => r.batchId === latest.batchId && sameCommand(r, latest)) : [latest] : [];
  const expected = latest?.repeatTotal ?? 1;
  const consistent = !latest || series.every(r => !r.changedDuringRun && r.fingerprint === latest.fingerprint && r.revision === latest.revision && r.changesHash === latest.changesHash);
  const complete = series.length === expected && (expected === 1 || new Set(series.map(r => r.repeatIndex)).size === expected && series.every(r => r.repeatTotal === expected && r.repeatIndex! >= 1 && r.repeatIndex! <= expected));
  const states = new Set(series.map(r => r.state));
  const unstable = consistent && states.has('PASSED') && states.has('FAILED');
  const summary = !latest ? 'NOT_RUN' : !consistent || !complete ? 'INCONCLUSIVE' : unstable ? 'UNSTABLE' : states.size === 1 ? latest.state : 'INCONCLUSIVE';
  return { latest, runs: series, expected, recorded: series.length, consistent, complete, unstable, summary };
}
export type Freshness = 'CURRENT' | 'STALE' | 'UNKNOWN' | 'NOT_CHECKED';
export function evaluateCriteria(experiment: Experiment, earth: Earth, evidence?: Record<string,Freshness>) {
  return (experiment.criteria??[]).map(criterion=>{
    const result=checkSeries(earth.runs.filter(r=>r.kind!=='setup'&&criterion.command&&sameCommand(r,{command:criterion.command})));
    const finish=(state:string,reason:string)=>({id:criterion.id,label:criterion.label,testIds:criterion.testIds,state,reason,runIds:result.runs.map(r=>r.id)});
    if(!criterion.command||!criterion.testIds.length)return finish('UNVERIFIED','No tests mapped to this criterion.');
    if(!result.latest)return finish('UNVERIFIED','This check has not run in this Earth.');
    if(result.runs.some(r=>evidence?.[r.id]==='STALE'||r.changedDuringRun))return finish('STALE','Code changed; rerun the mapped check.');
    if(!evidence||result.runs.some(r=>evidence[r.id]!=='CURRENT'))return finish('UNVERIFIED','Evidence freshness is unknown.');
    if(!result.complete||!result.consistent)return finish('UNVERIFIED','Check series is incomplete or inconsistent.');
    if(earth.runs.some(r=>r.kind==='setup'&&r.ended>result.latest!.started))return finish('UNVERIFIED','Setup ran after this evidence; rerun checks.');
    if(result.runs.some(r=>!r.testReport?.complete||!['PASSED','FAILED'].includes(r.state)))return finish('UNVERIFIED','Complete structured test results are required.');
    const statuses=result.runs.map(r=>criterion.testIds.map(id=>r.testReport!.tests.find(t=>t.id===id)?.state));
    if(statuses.some(row=>row.some(s=>!s||s==='SKIPPED'||s==='TODO')))return finish('UNVERIFIED','A mapped test is missing, skipped or todo.');
    if(criterion.testIds.some((_,i)=>new Set(statuses.map(row=>row[i])).size>1))return finish('UNSTABLE','Mapped test outcomes vary across repeated runs.');
    if(statuses.some(row=>row.includes('FAILED')))return finish('FAILED','A mapped test failed.');
    if(result.runs.some(r=>r.state!=='PASSED'))return finish('UNVERIFIED','The mapped tests passed, but the check command failed.');
    return finish('VERIFIED','Mapped tests passed in the complete, current check series.');
  });
}
export function compare(experiment: Experiment, evidence?: Record<string,Freshness>) {
  const baseline = experiment.earths.find(e => e.baseline);
  return {version:5,experimentId:experiment.id,name:experiment.name,repository:experiment.repository,baselineCommit:experiment.baselineCommit,generated:new Date().toISOString(),criteria:experiment.criteria??[],
    limitations:['Individual tests are framework-reported Jest-compatible JSON, not independently verified assertions. Acceptance criteria reflect the mapped tests, not proof of requirement semantics.',
      'Worktrees separate code state; commands can access this machine and network. Dependencies are not shared automatically.',
      'Fingerprints cover OS/architecture, extension Node, observed PATH Node/npm versions, timeout, manifest, lockfiles and selected configuration hashes. Raw configuration and arbitrary environment variables are not exported; installed dependency trees, global tool config and external services are not verified.',
      'Elapsed time is execution detail, not a performance benchmark. The shared queue does not control external processes, other storage roots or test-runner workers.',
      'Freshness checks cover tracked and non-ignored untracked contents and HEAD. Ignored files and external services are excluded. Legacy hashes have unknown freshness; rerun checks.',
      'Repeated comparisons require complete, internally consistent series from the same batch. UNSTABLE indicates observed pass/fail variation, not a diagnosis of flakiness.',
      'Reports summarise the latest check series per Earth. JSON retains up to 50 runs per Earth, including setup. Missing history cannot establish stability.'],
    earths:experiment.earths.map(earth => {
      const result = checkSeries(earth.runs), latest = result.latest;
      const baseRuns = baseline?.runs.filter(r => r.kind !== 'setup' && latest && sameCommand(r, latest)) ?? [];
      const base = checkSeries(baseRuns);
      const fresh = (runs: Run[]): Freshness => !evidence ? 'NOT_CHECKED' : runs.some(r=>evidence[r.id]==='STALE') ? 'STALE' :
        runs.length && runs.every(r=>evidence[r.id]==='CURRENT') ? 'CURRENT' : 'UNKNOWN';
      const freshness = fresh(result.runs), baselineFreshness = fresh(base.runs);
      const setup = earth.runs.findLast(r => r.kind === 'setup');
      const baseSetup = baseline?.runs.findLast(r => r.kind === 'setup');
      const setupUnchanged = (!setup || !!latest && setup.ended <= latest.started) && (!baseSetup || !!base.latest && baseSetup.ended <= base.latest.started);
      const sameBatch = (result.expected === 1 && base.expected === 1) || !!latest?.batchId && latest.batchId === base.latest?.batchId && result.expected === base.expected;
      const comparable = (!evidence || freshness==='CURRENT' && baselineFreshness==='CURRENT') && !!latest && !!base.latest && latest.fingerprint === base.latest.fingerprint && result.consistent && base.consistent && result.complete && base.complete && sameBatch && setupUnchanged;
      const unstable = result.unstable || base.unstable;
      const outcome = !latest ? 'NOT_RUN' : freshness==='STALE' || baselineFreshness==='STALE' ? 'STALE' : !comparable ? 'INCONCLUSIVE' : unstable ? 'UNSTABLE' :
        base.summary === 'PASSED' && result.summary === 'FAILED' ? 'REGRESSION' :
        base.summary === 'FAILED' && result.summary === 'PASSED' ? 'IMPROVEMENT' :
        base.summary === 'FAILED' && result.summary === 'FAILED' ? 'BASELINE_FAILURE' :
        ['PASSED','FAILED','ERROR','CANCELLED'].includes(result.summary) && base.summary === result.summary ? result.summary : 'INCONCLUSIVE';
      return {id:earth.id,name:earth.name,path:earth.path,baseline:earth.baseline,archived:earth.archived,state:freshness==='STALE'?'STALE':result.summary,outcome,comparable,freshness,baselineFreshness,
        changedFiles:null as number|null,tests:compareTests(base.runs,result.runs,comparable&&!!evidence),criteria:evaluateCriteria(experiment,earth,evidence),
        environment:latest?.environment??null,environmentDifferences:environmentDifferences(base.latest?.environment,latest?.environment)??null,
        setupStatus:setup?.state??'NOT_RUN',latestSetup:setup??null,repeat:{expected:result.expected,recorded:result.recorded,complete:result.complete,consistent:result.consistent,unstable:result.unstable},
        latestRun:latest??null,series:result.runs,runs:earth.runs};
    })};
}
export type Report = ReturnType<typeof compare>;
function cell(value: string): string { return value.replace(/[|\r\n]/g,' ').replace(/[<>\x00-\x1f]/g,''); }
function environmentMarkdown(earth:Report['earths'][number]):string {
  const env=earth.environment;
  return '\n\n#### Recorded environment\n\n'+(env?'Node (PATH): '+cell(env.node)+'; npm: '+cell(env.npm)+'; extension Node: '+cell(env.extensionNode)+'; platform: '+cell(env.platform)+' / '+cell(env.arch)+'; declared manager: '+cell(env.packageManager)+'\n\n'+Object.entries(env.files).map(([key,value])=>'- '+cell(key)+': '+cell(value)).join('\n'):'No recorded environment; rerun checks.')+'\n\n'+(earth.environmentDifferences===null?'Baseline environment unavailable.':earth.environmentDifferences.length?earth.environmentDifferences.map(d=>'- '+cell(d.field)+': '+cell(d.baseline)+' → '+cell(d.current)).join('\n'):'No recorded environment differences. Installed dependencies and external services remain unverified.');
}
export function markdown(report: Report): string {
  const command = (r: Run) => cell([r.command.program,...r.command.args].join(' '));
  const evidence = (r: Run) => '- '+cell(r.kind??'check')+' '+(r.repeatIndex??1)+'/'+(r.repeatTotal??1)+' — '+command(r)+' — '+r.state+
    '\n  - Run: '+r.id+'; revision: '+r.revision+'; fingerprint: '+cell(r.fingerprint)+'; changes: '+cell(r.changesHash)+
    '\n  - Started: '+r.started+'; ended: '+r.ended+'; elapsed (not benchmark): '+r.durationMs+' ms'+
    '\n  - Queue scope: '+cell(r.queueScope??'Not recorded (legacy or direct SDK run)')+'; concurrency limit: '+(r.concurrencyLimit??'Not recorded')+'; waited: '+(r.queuedMs??'Not recorded')+' ms'+
    '\n  - Exit: '+r.exitCode+'; output truncated: '+r.truncated+'; batch: '+(r.batchId??'none')+'\n  - '+cell(r.limitation);
  return '# ParallelEarth — ' + cell(report.name) + '\n\nRepository: '+cell(report.repository)+'\nBaseline: '+report.baselineCommit+'\nGenerated: '+report.generated+
    '\n\n| Earth | Setup | Check status | Freshness | Comparison | Runs / requested | Elapsed (not benchmark) |\n| --- | --- | --- | --- | --- | --- | --- |\n'+
    report.earths.map(e=>'| '+cell(e.name)+' | '+e.setupStatus+' | '+e.state+' | '+e.freshness+' | '+e.outcome+' | '+e.repeat.recorded+' / '+e.repeat.expected+' | '+(e.latestRun?e.latestRun.durationMs+' ms':'—')+' |').join('\n')+
    '\n\n## Evidence limits\n\n'+report.limitations.map(l=>'- '+l).join('\n')+
    '\n\n## Execution evidence\n\n'+report.earths.map(e=>'### '+cell(e.name)+'\n\nDirectory: '+cell(e.path)+'\n\n'+
      (e.latestSetup?'Latest approved setup:\n\n'+evidence(e.latestSetup)+'\n\n':'Setup: no recorded setup run. Dependencies may have been installed manually.\n\n')+
      (e.series.length?e.series.map(evidence).join('\n\n'):'No check execution evidence.')+
      environmentMarkdown(e)+'\n\n#### Individual tests\n\n'+(e.tests.length?'| File / test | Baseline | Current | Comparison |\n| --- | --- | --- | --- |\n'+e.tests.map(t=>'| '+cell(t.file+' / '+t.name)+' | '+t.baseline+' | '+t.current+' | '+t.outcome+' |').join('\n'):'No structured test evidence. Use a Jest-compatible JSON reporter.')+
      '\n\n#### Acceptance criteria\n\n'+(e.criteria.length?e.criteria.map(c=>'- '+cell(c.label)+': **'+c.state+'** - '+cell(c.reason)).join('\n'):'No acceptance criteria defined.')).join('\n\n')+'\n';
}

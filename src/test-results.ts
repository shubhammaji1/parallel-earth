import path from 'node:path';
import { createHash } from 'node:crypto';
import { TestReport, TestResult, TestState, Run } from './domain';

const states: Record<string,TestState>={passed:'PASSED',failed:'FAILED',pending:'SKIPPED',skipped:'SKIPPED',disabled:'SKIPPED',todo:'TODO'};
export function testIdentity(file: string, name: string): string {
  return createHash('sha256').update(JSON.stringify([file,name])).digest('hex');
}
/** Only a complete stdout JSON document is accepted. Arbitrary log snippets and report files are never imported. */
export function parseTestReport(stdout: string, root: string, truncated=false): TestReport | undefined {
  if (!stdout.trimStart().startsWith('{')) return;
  const invalid=(issue:string):TestReport=>({format:'jest-compatible-json',complete:false,tests:[],issue});
  if (truncated) return invalid('Structured stdout exceeded the output limit. Increase maxLogBytes and rerun.');
  let data: any;
  try { data=JSON.parse(stdout); } catch { return invalid('Stdout is not one complete JSON document. Use only the JSON reporter.'); }
  if (!data || !Array.isArray(data.testResults)) return;
  try {
    if (data.wasInterrupted===true || !Number.isSafeInteger(data.numTotalTests) || data.numTotalTests<1 || data.numTotalTests>1000 || data.testResults.length>1000) throw Error('Interrupted, empty or oversized test report. Limit: 1000 tests per run.');
    const tests:TestResult[]=[], seen=new Set<string>();
    for (const suite of data.testResults) {
      if (!suite || typeof suite.name!=='string' || !Array.isArray(suite.assertionResults) || suite.testExecError || suite.status==='failed'&&!suite.assertionResults.length) throw Error('A test suite could not be collected.');
      const file=path.relative(path.resolve(root),path.resolve(root,suite.name)).replace(/\\/g,'/');
      if (!file || file==='..' || file.startsWith('../') || path.isAbsolute(file) || file.length>1000 || file.includes('\0')) throw Error('Test file is outside this Earth or unsupported.');
      for (const assertion of suite.assertionResults) {
        if (!assertion || typeof assertion.fullName!=='string' || !assertion.fullName.trim() || assertion.fullName.length>2000 || assertion.fullName.includes('\0') || !Object.hasOwn(states,assertion.status) || assertion.wouldRun!==undefined) throw Error('Unsupported assertion or dry-run result.');
        const id=testIdentity(file,assertion.fullName);
        if (seen.has(id)) throw Error('Duplicate test identity. Use unique full test names within each file.');
        seen.add(id);
        const result:TestResult={id,file,name:assertion.fullName,state:states[assertion.status]};
        if (assertion.duration!=null) { if(typeof assertion.duration!=='number'||!Number.isFinite(assertion.duration)||assertion.duration<0)throw Error('Invalid test duration.');result.durationMs=assertion.duration; }
        if (assertion.failureMessages!==undefined) {
          if(!Array.isArray(assertion.failureMessages)||assertion.failureMessages.some((s:unknown)=>typeof s!=='string'))throw Error('Invalid failure messages.');
          result.message=assertion.failureMessages.join('\n').replace(/\0/g,'').slice(0,4000);
        }
        tests.push(result);
        if(tests.length>1000)throw Error('Too many tests.');
      }
    }
    if(tests.length!==data.numTotalTests)throw Error('Reported total does not match individual tests.');
    for(const [field,state]of [['numPassedTests','PASSED'],['numFailedTests','FAILED'],['numPendingTests','SKIPPED'],['numTodoTests','TODO']]){
      if(data[field]!==undefined && (!Number.isSafeInteger(data[field]) || data[field]!==tests.filter(t=>t.state===state).length))throw Error('Reported counts do not match test outcomes.');
    }
    return {format:'jest-compatible-json',complete:true,tests};
  } catch(error) { return invalid(error instanceof Error?error.message:'Invalid structured test report.'); }
}
export type ObservedTestState=TestState|'MISSING'|'UNSTABLE'|'UNKNOWN';
function observed(runs:Run[],id:string):ObservedTestState {
  if(!runs.length||runs.some(r=>!r.testReport?.complete||!['PASSED','FAILED'].includes(r.state)))return 'UNKNOWN';
  const values=runs.map(r=>r.testReport!.tests.find(t=>t.id===id)?.state??'MISSING');
  return new Set(values).size===1?values[0]:'UNSTABLE';
}
export function compareTests(baseline:Run[], alternative:Run[],comparable:boolean) {
  const tests=new Map<string,TestResult>();
  for(const run of [...baseline,...alternative])for(const test of run.testReport?.tests??[])tests.set(test.id,test);
  return [...tests.values()].map(test=>{
    const base=observed(baseline,test.id),current=observed(alternative,test.id);
    const outcome=!comparable||base==='UNKNOWN'||current==='UNKNOWN'?'INCONCLUSIVE':
      base==='UNSTABLE'||current==='UNSTABLE'?'UNSTABLE':current==='MISSING'?'MISSING':base==='MISSING'?'ADDED':
      current==='SKIPPED'||current==='TODO'?'SKIPPED':base==='PASSED'&&current==='FAILED'?'REGRESSION':
      base==='FAILED'&&current==='PASSED'?'IMPROVEMENT':base===current?'UNCHANGED':'CHANGED';
    const latest=alternative.at(-1)?.testReport?.tests.find(t=>t.id===test.id);
    return {...test,message:latest?.message??'',baseline:base,current,outcome};
  }).sort((a,b)=>a.file.localeCompare(b.file)||a.name.localeCompare(b.name));
}

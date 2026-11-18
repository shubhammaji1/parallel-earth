export interface RegressionVerification {state:'VERIFIED'|'FAILED'|'INCONCLUSIVE';reason:string;tests:{id:string;name:string;file:string;baseline:string;current:string;identicalSource:boolean}[]}
interface Input {comparable:boolean;state:string;repeat?:{recorded:number};tests:{id:string;name:string;file:string;baseline:string;current:string;outcome:string}[]}
export function verifyRegression(row:Input,ids:string[],sameSource:ReadonlySet<string>,minimumRuns=1):RegressionVerification {
  const tests=ids.map(id=>row.tests.find(t=>t.id===id)).filter((t):t is Input['tests'][number]=>!!t).map(t=>({...t,identicalSource:sameSource.has(t.file)}));
  const result=(state:RegressionVerification['state'],reason:string):RegressionVerification=>({state,reason,tests});
  if(!ids.length||!row.comparable||tests.length!==ids.length)return result('INCONCLUSIVE','Select tests present in complete, current, comparable baseline and candidate runs.');
  if((row.repeat?.recorded??1)<minimumRuns)return result('INCONCLUSIVE','Rerun the selected check series with at least '+minimumRuns+' runs per Earth.');
  if(tests.some(t=>!t.identicalSource))return result('INCONCLUSIVE','A selected test file differs or could not be verified. Run identical regression test files in both Earths.');
  if(tests.some(t=>['UNKNOWN','UNSTABLE','MISSING','SKIPPED','TODO'].includes(t.current)||['UNKNOWN','UNSTABLE','MISSING','SKIPPED','TODO'].includes(t.baseline)))return result('INCONCLUSIVE','Missing, skipped or varying test outcomes cannot verify a regression fix.');
  if(tests.some(t=>t.current!=='PASSED')||row.state!=='PASSED')return result('FAILED','The candidate or a selected regression test failed.');
  if(tests.some(t=>t.baseline!=='FAILED'))return result('INCONCLUSIVE','Every selected regression test must fail on the baseline.');
  return result('VERIFIED','Identical selected test files failed on the baseline and passed on the candidate across the recorded series. Test semantics, helpers and external data are not independently proved.');
}

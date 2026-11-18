import type * as vscode from 'vscode';
import type { Report } from './comparison';
import path from 'node:path';
export class NativeTests {
  readonly controller:vscode.TestController;
  constructor(private api:typeof vscode,run:(earthIds:string[])=>Promise<void>){
    this.controller=api.tests.createTestController('parallelEarth.recorded','ParallelEarth checks');
    this.controller.createRunProfile('Run Earth checks',api.TestRunProfileKind.Run,async request=>{
      const ids=new Set<string>();const visit=(item:vscode.TestItem)=>{ids.add(item.id.split(':')[0]);};
      if(request.include)request.include.forEach(visit);else this.controller.items.forEach(visit);
      const excluded=new Set((request.exclude??[]).filter(i=>!i.id.includes(':')).map(i=>i.id));await run([...ids].filter(id=>!excluded.has(id)));
    },true);
  }
  publish(report:Report){
    this.controller.items.replace([]);
    const run=this.controller.createTestRun(new this.api.TestRunRequest(), 'Recorded check evidence',true);
    for(const earth of report.earths){
      if(!earth.latestRun?.testReport?.complete)continue;
      const suite=this.controller.createTestItem(earth.id,earth.name);this.controller.items.add(suite);
      for(const test of earth.latestRun.testReport.tests){
        const absolute=path.resolve(earth.path,test.file),relative=path.relative(earth.path,absolute);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))continue;
        const item=this.controller.createTestItem(earth.id+':'+test.id,test.name,this.api.Uri.file(absolute));suite.children.add(item);
        if(earth.freshness!=='CURRENT'||test.state==='SKIPPED'||test.state==='TODO'){run.skipped(item);continue;}
        run.started(item);if(test.state==='PASSED')run.passed(item,test.durationMs);else run.failed(item,new this.api.TestMessage(test.message||'Recorded test failure'),test.durationMs);
      }
    }run.end();
  }
  invalidate(){this.controller.invalidateTestResults();}
  dispose(){this.controller.dispose();}
}

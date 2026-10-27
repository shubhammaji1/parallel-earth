import path from 'node:path';
import { Catalog, Experiment } from './domain';
export interface ProjectHistory { repository: string; name: string; experiments: Experiment[] }
export function projectHistory(catalog: Catalog): ProjectHistory[] {
  const projects = new Map<string,ProjectHistory>();
  for (const experiment of catalog.experiments) {
    // Interrupted creation attempts are not presented as successful user experiments.
    if (!experiment.earths.some(earth => earth.baseline)) continue;
    let project=projects.get(experiment.repository);
    if(!project){project={repository:experiment.repository,name:path.basename(experiment.repository),experiments:[]};projects.set(experiment.repository,project);}
    project.experiments.push(experiment);
  }
  return [...projects.values()].map(project=>({...project,experiments:project.experiments.sort((a,b)=>b.created.localeCompare(a.created))}))
    .sort((a,b)=>b.experiments[0].created.localeCompare(a.experiments[0].created));
}


export interface ProjectSummary {
  repository:string;name:string;experimentCount:number;earthCount:number;
  latestId:string;latestName:string;created:string;
}
export function projectSummaries(projects:ProjectHistory[]):ProjectSummary[] {
  return projects.filter(p=>p.experiments.length>0).map(project=>({
    repository:project.repository,name:project.name,experimentCount:project.experiments.length,
    earthCount:project.experiments.reduce((sum,exp)=>sum+exp.earths.filter(earth=>!earth.baseline).length,0),
    latestId:project.experiments[0].id,latestName:project.experiments[0].name,created:project.experiments[0].created
  }));
}
export function historyPage(projects:ProjectSummary[],query:string,page:number,pageSize=6,sort='recent') {
  const size=Number.isInteger(pageSize)?Math.max(1,Math.min(12,pageSize)):6;
  const search=query.trim().toLocaleLowerCase().slice(0,200);
  const matches=projects.filter(p=>(p.name+' '+p.repository+' '+p.latestName).toLocaleLowerCase().includes(search));
  matches.sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name):(a,b)=>b.created.localeCompare(a.created));
  const pages=Math.max(1,Math.ceil(matches.length/size));
  const current=Math.max(0,Math.min(pages-1,Number.isInteger(page)?page:0));
  return {rows:matches.slice(current*size,(current+1)*size),page:current,pages,total:matches.length,
    from:matches.length?current*size+1:0,to:Math.min((current+1)*size,matches.length)};
}



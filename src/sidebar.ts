import { escapeHtml } from './home';
export interface SidebarState {
  trusted:boolean;projectCount:number;experimentCount:number;earthCount:number;activeName?:string;
}
export type SidebarAction='create'|'resume'|'home'|'help';
export function parseSidebarMessage(value:unknown):SidebarAction|undefined {
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const record=value as Record<string,unknown>;
  if(Object.keys(record).length!==1||!Object.prototype.hasOwnProperty.call(record,'action')||typeof record.action!=='string'||!['create','resume','home','help'].includes(record.action))return;
  return record.action as SidebarAction;
}
export function sidebarMarkup(state:SidebarState,logo:string,csp:string,nonce:string):string {
 const h=escapeHtml;
 const styles = `
*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font:12px/1.5 var(--vscode-font-family);padding:17px 14px 13px}
button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}button:disabled{opacity:.45;cursor:default}p,h1{margin:0}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:15px}.brand img{width:38px;height:46px;object-fit:contain}.brand h1{font-size:15px;font-weight:700;letter-spacing:-.5px}.brand p{font-size:10px;color:var(--vscode-descriptionForeground);margin-top:3px}
.tag{display:inline-flex;align-items:center;gap:5px;color:var(--vscode-descriptionForeground);font-size:9px;margin:1px 0 12px}.tag:before{content:"";width:5px;height:5px;border-radius:50%;background:#74d6ac}
.primary{width:100%;display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid #a6f3ce;border-radius:6px;background:#a6f3ce;color:#133529;font-weight:650;font-size:11px}.primary:hover:not(:disabled){background:#c5ffe5}.primary span{font-size:16px;line-height:1}
.shortcuts{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.shortcut{display:flex;align-items:center;justify-content:center;gap:6px;min-height:33px;padding:7px;border:1px solid var(--vscode-panel-border,transparent);border-radius:6px;background:var(--vscode-editor-background);color:var(--vscode-foreground);font-size:10px}.shortcut:hover:not(:disabled){background:var(--vscode-list-hoverBackground)}.shortcut span{color:var(--vscode-textLink-foreground)}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;border-top:1px solid var(--vscode-panel-border);margin-top:15px;padding-top:12px}
.metric{text-align:center;border-right:1px solid var(--vscode-panel-border)}.metric:last-child{border:0}.metric b{display:block;font-size:16px;font-weight:600;line-height:1.2;letter-spacing:-.6px}.metric span{display:block;color:var(--vscode-descriptionForeground);font-size:9px;margin-top:3px}
.hint{font-size:10px;line-height:1.7;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);padding:10px;border-radius:6px;margin-top:12px}.hint strong{display:block;color:var(--vscode-foreground);font-weight:550;font-size:10px;margin-bottom:3px}
.active{border-left:2px solid #ac84ff;padding:7px 9px;background:var(--vscode-editor-background);margin-top:12px;border-radius:0 5px 5px 0}.active span{display:block;font-size:8px;letter-spacing:1px;color:var(--vscode-descriptionForeground);text-transform:uppercase}.active strong{display:block;font-size:11px;font-weight:550;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bottom{display:flex;justify-content:space-between;align-items:center;margin-top:10px}.bottom span{font-size:9px;color:var(--vscode-descriptionForeground)}.help{border:0;background:transparent;padding:3px 0;color:var(--vscode-textLink-foreground);font-size:10px}
body.vscode-light .primary{background:#215a45;border-color:#215a45;color:#fff}body.vscode-light .primary:hover:not(:disabled){background:#2c7057}
body.vscode-high-contrast .primary,body.vscode-high-contrast-light .primary{background:var(--vscode-button-background);border-color:var(--vscode-contrastBorder);color:var(--vscode-button-foreground)}
@media(max-width:220px){body{padding:12px 9px}.brand h1{font-size:13px}.brand img{width:30px}.shortcuts{grid-template-columns:1fr}.metric span{font-size:8px}}
`;
 const active=state.activeName?'<div class="active"><span>Currently exploring</span><strong>'+h(state.activeName)+'</strong></div>':'';
 const hint=!state.trusted?'<div class="hint"><strong>Workspace Trust required</strong>Trust this workspace to create experiments and run checks. You can still open Home or read the guide.</div>':
 state.projectCount===0?'<div class="hint"><strong>Your first experiment</strong>Choose a Git project, select a commit, then create an Earth to try your idea.</div>':'';
 const disabled=!state.trusted?' disabled':'';
 const resumeDisabled=!state.trusted||state.experimentCount===0?' disabled':'';
 return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src '+h("'none'")+'; img-src '+h(csp)+'; style-src '+h("'nonce-"+nonce+"'")+'; script-src '+h("'nonce-"+nonce+"'")+';"><title>ParallelEarth sidebar</title><style nonce="'+h(nonce)+'">'+styles+'</style></head><body>'+
 '<div class="brand"><img src="'+h(logo)+'" alt=""><div><h1>ParallelEarth</h1><p>A space for your next approach.</p></div></div>'+
 '<div class="tag">Local worktrees. Your projects.</div>'+
 '<button class="primary" data-action="create"'+disabled+'>New experiment<span aria-hidden="true">+</span></button>'+
 '<div class="shortcuts"><button class="shortcut" data-action="resume"'+resumeDisabled+'><span aria-hidden="true">&#8635;</span>Find experiment</button><button class="shortcut" data-action="home"><span aria-hidden="true">&#9638;</span>Dashboard</button></div>'+
 active+'<div class="metrics" aria-label="Library totals"><div class="metric"><b>'+state.projectCount+'</b><span>Projects</span></div><div class="metric"><b>'+state.experimentCount+'</b><span>Experiments</span></div><div class="metric"><b>'+state.earthCount+'</b><span>Earths</span></div></div>'+
 hint+'<div class="bottom"><span>No project files uploaded</span><button class="help" data-action="help">Quick guide &nearr;</button></div>'+
 '<script nonce="'+h(nonce)+'">const vscode=acquireVsCodeApi();document.addEventListener("click",event=>{const button=event.target.closest("button[data-action]");if(button&&!button.disabled)vscode.postMessage({action:button.dataset.action});});</script></body></html>';
}


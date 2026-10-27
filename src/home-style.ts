export const homeStyles = `
:root{
 color-scheme:light dark;
 --bg:var(--vscode-editor-background,#11151b);--fg:var(--vscode-editor-foreground,#e8edf3);
 --muted:var(--vscode-descriptionForeground,#a3acba);--line:var(--vscode-panel-border,#303844);
 --surface:var(--vscode-sideBar-background,#171c24);--input:var(--vscode-input-background,#202732);
 --mint:#a6f3ce;--ink:#10251e;--violet:#ac84ff;--focus:var(--vscode-focusBorder,#a6f3ce);
}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.6 var(--vscode-font-family,system-ui,sans-serif)}
button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--focus);outline-offset:4px}
[hidden]{display:none!important}h1,h2,h3,p{margin:0}button{transition:background .16s,transform .16s}
button:not(:disabled):active{transform:translateY(1px)}main{max-width:1232px;margin:auto;padding:0 40px 32px}
.topbar{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);gap:20px}
.identity{display:flex;align-items:center;gap:11px}.identity img{width:40px;height:46px;object-fit:contain}
.brand{font-size:18px;font-weight:750;letter-spacing:-.65px}.brand span{font-weight:450;color:var(--muted)}
.version{font-size:10px;border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:var(--muted);letter-spacing:.4px}
.top-actions{display:flex;align-items:center;gap:24px}.local-badge{font-size:11px;color:var(--muted);display:flex;gap:8px;align-items:center}
.local-badge:before{content:"";height:6px;width:6px;border-radius:50%;background:#6bd5a6}
.text-button{border:0;background:none;color:var(--muted);padding:6px 0;font-size:12px}
.text-button:hover{color:var(--fg)}.intro{padding-top:35px;display:flex;justify-content:space-between;align-items:center;gap:16px}
.breadcrumb{font-size:11px;color:var(--muted);display:flex;gap:9px;align-items:center}.breadcrumb strong{font-weight:500;color:var(--fg)}
.workspace-note{font-size:10px;text-transform:uppercase;letter-spacing:1.6px;color:var(--muted)}
.hero{display:grid;grid-template-columns:1.25fr 1fr;align-items:center;min-height:370px;gap:28px;padding:32px 0 30px}
.eyebrow{font:500 10px/1.5 var(--vscode-editor-font-family,monospace);letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:18px}
.eyebrow:before{content:"";display:inline-block;width:18px;height:2px;background:var(--violet);vertical-align:middle;margin-right:9px}
h1{font-size:clamp(36px,4.8vw,62px);font-weight:750;line-height:1.07;letter-spacing:-2.7px;max-width:600px}
h1 span{color:var(--violet)}.hero-copy>p{font-size:13px;line-height:1.85;color:var(--muted);max-width:400px;margin:21px 0 25px}
.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.primary{border:1px solid var(--mint);background:var(--mint);color:var(--ink);padding:11px 17px;border-radius:8px;font-weight:700;font-size:12px;display:inline-flex;align-items:center;gap:15px}
.primary:hover{background:#c5ffe5}.primary .plus{font-size:19px;font-weight:400;line-height:1}
.subtle{border:1px solid var(--line);background:transparent;color:var(--fg);border-radius:7px;padding:9px 13px;font-size:12px}
.subtle:hover{background:var(--surface)}.hero-points{display:flex;flex-wrap:wrap;gap:18px;margin-top:21px;color:var(--muted);font-size:10px}
.hero-points span:before{content:"+";color:var(--violet);margin-right:5px}
.portal-scene{position:relative;min-height:310px;display:grid;place-items:center;isolation:isolate}
.portal-grid{position:absolute;inset:7% -2% 0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:33px 33px;opacity:.22;mask-image:radial-gradient(ellipse,#000 10%,transparent 67%);transform:rotate(-12deg)}
.portal-scene:before{content:"";position:absolute;width:270px;height:270px;border-radius:50%;background:radial-gradient(ellipse,rgba(122,74,231,.2),transparent 70%);z-index:-1;animation:portal-pulse 6s ease-in-out infinite}
.portal-mark{position:relative;display:grid;place-items:center;width:240px;height:290px}
.portal-mark img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 15px 28px rgba(46,22,87,.2));animation:portal-hover 6s ease-in-out infinite}
.portal-label{position:absolute;padding:9px 12px;border:1px solid var(--line);background:var(--bg);border-radius:8px;box-shadow:0 8px 25px #0000000d;font-size:10px;color:var(--muted);line-height:1.4;z-index:2}
.portal-label strong{display:block;font-size:11px;color:var(--fg);font-weight:600;margin-bottom:2px}
.portal-label:before{content:"";position:absolute;left:-4px;top:15px;width:6px;height:6px;background:var(--violet);border:2px solid var(--bg);border-radius:2px}
.label-baseline{top:35px;left:0}.label-alternative{right:0;bottom:38px}.label-alternative:before{background:#49c8dd}
.scene-caption{position:absolute;bottom:-1px;left:0;right:0;text-align:center;font:9px var(--vscode-editor-font-family,monospace);letter-spacing:2px;color:var(--muted);text-transform:uppercase}
.overview{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:12px;padding:18px 0;margin:12px 0 30px;background:var(--surface)}
.overview>div{padding:0 26px;display:flex;align-items:center;gap:15px;border-right:1px solid var(--line)}.overview>div:last-child{border:0}
.metric-icon{display:grid;place-items:center;flex:none;width:33px;height:33px;border:1px solid var(--line);border-radius:8px;font:17px var(--vscode-editor-font-family,monospace);color:var(--violet)}
.metric-icon.teal{color:#49c8dd}.metric-icon.gold{color:#eebc6a}.metric-value{font-size:21px;font-weight:650;letter-spacing:-1px;line-height:1.2}.metric-label{font-size:10px;color:var(--muted);margin-top:3px}
.library-layout{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:28px;align-items:start}
.section-title{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 17px}
.section-kicker{font:9px var(--vscode-editor-font-family,monospace);color:var(--muted);letter-spacing:1.6px;text-transform:uppercase;margin-bottom:4px}
h2{font-size:20px;font-weight:650;letter-spacing:-.6px}.section-title p{font-size:11px;color:var(--muted);margin-top:3px}
.history-tools{display:flex;gap:10px;margin-bottom:12px}
.search-wrap{flex:1;position:relative;min-width:0}.search-wrap:before{content:"";position:absolute;width:10px;height:10px;border:1.5px solid var(--muted);border-radius:50%;left:13px;top:12px;pointer-events:none}
.search-wrap:after{content:"";position:absolute;width:5px;height:1.5px;background:var(--muted);left:22px;top:23px;transform:rotate(45deg);pointer-events:none}
.history-tools input,.history-tools select{height:38px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--fg);font-size:11px}
.history-tools input{width:100%;padding:8px 12px 8px 35px;min-width:0}.history-tools input::placeholder{color:var(--muted)}
.history-tools select{max-width:140px;padding:0 9px;color:var(--muted)}
.project-list{max-height:510px;overflow:auto;border:1px solid var(--line);border-radius:10px}
.project-list:empty{display:none}.project-row{display:flex;align-items:center;gap:13px;padding:16px;border-bottom:1px solid var(--line)}
.project-row:last-child{border:0}.project-row:hover{background:var(--surface)}
.project-icon{display:grid;place-items:center;flex:none;width:36px;height:38px;background:#9775fa18;border:1px solid #9775fa30;border-radius:8px;font:600 12px var(--vscode-editor-font-family,monospace);color:var(--violet)}
.project-row:nth-child(3n+2) .project-icon{background:#49c8dd16;border-color:#49c8dd30;color:#49c8dd}
.project-row:nth-child(3n) .project-icon{background:#eebc6a16;border-color:#eebc6a30;color:#d2a052}
.project-details{flex:1;min-width:0}.project-details h3{font-size:12px;font-weight:650;letter-spacing:-.1px}
.project-details .path{font:10px/1.6 var(--vscode-editor-font-family,monospace);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.project-details .recent{font-size:10px;color:var(--muted);margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.project-row .actions{flex:none;gap:7px}.project-row .actions button{font-size:10px;padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg)}
.project-row .actions button.subtle{background:transparent;color:var(--muted);border-color:transparent}
.project-row .actions button.subtle:hover{color:var(--vscode-errorForeground,#f48771);border-color:var(--line)}
.history-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10px;color:var(--muted);margin-top:13px}
.history-footer button{font-size:10px;padding:5px 8px}.history-footer .actions{gap:7px}
#history-status{font-size:11px;color:var(--muted);margin:8px 0}#history-status:empty{display:none}
.empty{padding:36px 22px;text-align:center;border:1px dashed var(--line);border-radius:10px;background:var(--surface)}
.empty-symbol{display:grid;place-items:center;width:45px;height:48px;margin:0 auto 15px;background:#9775fa18;color:var(--violet);border:1px solid #9775fa30;border-radius:10px;font:24px var(--vscode-editor-font-family,monospace)}
.empty h3{font-size:15px;font-weight:600;letter-spacing:-.3px}.empty p{max-width:315px;margin:9px auto 18px;font-size:11px;line-height:1.8;color:var(--muted)}
.empty .primary{padding:8px 13px;font-size:11px}#history-no-results{padding:28px 18px;background:var(--surface);border:1px solid var(--line);border-radius:10px;font-size:12px;color:var(--muted)}
.guide{border-left:1px solid var(--line);padding-left:25px}.guide h2{font-size:14px;letter-spacing:-.2px;margin:0 0 19px}
.steps{list-style:none;padding:0;margin:0}.step{display:grid;grid-template-columns:24px 1fr;gap:9px;padding-bottom:21px;position:relative}
.step:not(:last-child):before{content:"";position:absolute;top:27px;left:10px;height:calc(100% - 32px);width:1px;background:var(--line)}
.step-number{display:grid;place-items:center;width:22px;height:22px;border:1px solid var(--line);border-radius:6px;color:var(--muted);font:10px var(--vscode-editor-font-family,monospace)}
.step strong{display:block;font-size:11px;font-weight:600;margin:1px 0 4px}.step p{font-size:10px;line-height:1.75;color:var(--muted)}
.tip{padding:15px;background:var(--surface);border:1px solid var(--line);border-radius:8px;margin-top:5px}
.tip strong{font-size:10px;font-weight:600;color:var(--violet)}.tip p{font-size:10px;line-height:1.75;color:var(--muted);margin-top:6px}
footer{border-top:1px solid var(--line);margin-top:38px;padding-top:16px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;color:var(--muted);font-size:9px}
footer p{max-width:660px}footer>span{white-space:nowrap;font:9px var(--vscode-editor-font-family,monospace);letter-spacing:.5px}
@keyframes portal-hover{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes portal-pulse{0%,100%{opacity:.6;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}
body.vscode-light{--mint:#164e3b;--ink:#fff;--violet:#7442c9}body.vscode-light .primary:hover{background:#22674f}
body.vscode-high-contrast,body.vscode-high-contrast-light{--line:var(--vscode-contrastBorder);--violet:var(--vscode-textLink-foreground);--mint:var(--vscode-button-background);--ink:var(--vscode-button-foreground)}
body.vscode-high-contrast .portal-grid,body.vscode-high-contrast-light .portal-grid{display:none}
@media(min-width:1500px){main{padding-top:10px}.hero{min-height:410px}}
@media(max-width:900px){main{padding:0 26px 25px}.hero{grid-template-columns:1.2fr 1fr;gap:10px}h1{font-size:43px;letter-spacing:-1.8px}.portal-mark{width:190px;height:255px}.portal-label{font-size:8px;padding:7px 8px}.portal-label strong{font-size:9px}.label-baseline{left:-6px}.label-alternative{right:-6px}.library-layout{grid-template-columns:minmax(0,1fr) 210px;gap:22px}.guide{padding-left:20px}.overview>div{padding:0 18px}}
@media(max-width:720px){.hero{grid-template-columns:1fr 190px}.portal-label,.scene-caption{display:none}.portal-scene{min-height:240px}.portal-mark{width:180px;height:230px}h1{font-size:38px}.hero-copy>p{font-size:12px}.library-layout{grid-template-columns:1fr}.guide{border:0;padding:20px 0 0;border-top:1px solid var(--line)}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.step:not(:last-child):before{display:none}.tip{display:none}.overview>div{gap:10px;padding:0 15px}.metric-icon{display:none}}
@media(max-width:480px){main{padding:0 18px 24px}.topbar{height:72px}.brand{font-size:16px}.version,.local-badge,.workspace-note{display:none}.top-actions{gap:0}.intro{padding-top:24px}.hero{grid-template-columns:1fr;padding-top:26px;gap:0}.hero-copy>p{max-width:340px}h1{font-size:42px}.portal-scene{min-height:190px;grid-row:2;margin-top:12px}.portal-mark{width:150px;height:185px}.hero-points{gap:13px}.overview{margin-top:0;padding:15px 0}.overview>div{padding:0 12px}.metric-value{font-size:19px}.metric-label{font-size:9px}.section-title .text-button{max-width:90px;text-align:right}.project-row{flex-wrap:wrap;padding:13px;gap:10px}.project-details{flex-basis:calc(100% - 48px)}.project-row .actions{margin-left:46px}.history-tools select{max-width:112px;font-size:10px}.history-footer{flex-wrap:wrap}.steps{grid-template-columns:1fr;gap:0}.step{padding-bottom:18px}footer{display:block}footer>span{display:block;margin-top:10px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
`;

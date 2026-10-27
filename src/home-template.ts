export const homeTemplate = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src %%CSP%%; style-src 'nonce-%%NONCE%%'; script-src 'nonce-%%NONCE%%';">
<title>ParallelEarth</title>
<style nonce="%%NONCE%%">%%STYLES%%</style>
</head>
<body>
<main>
<header class="topbar">
 <div class="identity"><img src="%%LOGO%%" alt=""><div class="brand">Parallel<span>Earth</span></div><span class="version">EXPERIMENT LAB</span></div>
 <div class="top-actions"><span class="local-badge">Runs on your machine</span><button class="text-button" data-action="history">Open explorer &nearr;</button></div>
</header>
<div class="intro"><div class="breadcrumb">Workspace <span aria-hidden="true">/</span> <strong>Overview</strong></div><span class="workspace-note">A little space to think differently</span></div>
<section class="hero" aria-labelledby="hero-title">
 <div class="hero-copy">
  <div class="eyebrow">Your project. More possibilities.</div>
  <h1 id="hero-title">One project.<br><span>Many possibilities.</span></h1>
  <p>Give your next idea its own space. Try a different approach, run your checks, and bring back what works.</p>
  <div class="actions"><button class="primary" data-action="create"><span class="plus" aria-hidden="true">+</span>New experiment<span aria-hidden="true">&rarr;</span></button><button class="text-button" data-action="history">Explore your projects &nearr;</button></div>
  <div class="hero-points"><span>Git-backed worktrees</span><span>Local by default</span><span>Your tools</span></div>
 </div>
 <div class="portal-scene" role="img" aria-label="Pixel Portal illustration: a committed baseline connects to an alternative implementation">
  <div class="portal-grid" aria-hidden="true"></div>
  <div class="portal-label label-baseline" aria-hidden="true"><strong>Baseline</strong>Your committed starting point</div>
  <div class="portal-mark"><img src="%%LOGO%%" alt=""></div>
  <div class="portal-label label-alternative" aria-hidden="true"><strong>Alternative</strong>A space for your next approach</div>
  <div class="scene-caption" aria-hidden="true">Same starting point. New direction.</div>
 </div>
</section>
<section class="overview" aria-label="Your experiment library totals">
 <div><span class="metric-icon" aria-hidden="true">&#9633;</span><div><p class="metric-value" id="total-projects">0</p><p class="metric-label">Projects in your library</p></div></div>
 <div><span class="metric-icon teal" aria-hidden="true">&#9095;</span><div><p class="metric-value" id="total-experiments">0</p><p class="metric-label">Experiments created</p></div></div>
 <div><span class="metric-icon gold" aria-hidden="true">&#9671;</span><div><p class="metric-value" id="total-earths">0</p><p class="metric-label">Alternative Earths</p></div></div>
</section>
<div class="library-layout">
 <section aria-labelledby="projects-title">
  <div class="section-title"><div><div class="section-kicker">Pick up where you left off</div><h2 id="projects-title">Your projects</h2><p>Your ideas, organised by project.</p></div><button class="text-button" data-action="history">All experiments &nearr;</button></div>
  <div class="history-tools"><div class="search-wrap"><input id="history-query" type="search" maxlength="200" placeholder="Find a project or experiment..." aria-label="Search project history"></div><select id="history-sort" aria-label="Sort projects"><option value="recent">Most recent</option><option value="name">Project name</option></select></div>
  <p id="history-status" role="status" aria-live="polite"></p>
  <div id="history-list" class="project-list" aria-label="Project history"></div>
  <div id="history-empty" class="empty"><span class="empty-symbol" aria-hidden="true">+</span><h3>Your first &ldquo;what if&rdquo; starts here.</h3><p>No projects yet. Choose a Git repository and give your next idea a world of its own.</p><button class="primary" data-action="create">Create your first experiment <span aria-hidden="true">&rarr;</span></button></div>
  <p id="history-no-results" hidden>No matching projects. Try a different name, path or experiment.</p>
  <div class="history-footer" id="history-footer"><span id="history-count" aria-live="polite"></span><div class="actions"><button class="subtle" data-action="previous" id="history-prev" aria-label="Previous page">&larr;</button><span id="history-page"></span><button class="subtle" data-action="next" id="history-next" aria-label="Next page">&rarr;</button></div></div>
 </section>
 <aside class="guide" aria-labelledby="guide-title">
  <div class="section-kicker">Small steps. Different outcomes.</div><h2 id="guide-title">From idea to evidence</h2>
  <ol class="steps">
   <li class="step"><span class="step-number" aria-hidden="true">01</span><div><strong>Choose a starting point</strong><p>Pick your Git project and a committed revision.</p></div></li>
   <li class="step"><span class="step-number" aria-hidden="true">02</span><div><strong>Make space for an idea</strong><p>Create an Earth and edit in its own working directory.</p></div></li>
   <li class="step"><span class="step-number" aria-hidden="true">03</span><div><strong>Let the checks speak</strong><p>Run matching checks and compare with your baseline.</p></div></li>
  </ol>
  <div class="tip"><strong>A good first experiment</strong><p>Try that refactor you have been putting off. Start from a commit, change one thing, then run the same tests.</p></div>
 </aside>
</div>
<footer><p>No projects are created automatically. Earths separate working files; approved commands can still access your machine and network.</p><span>BUILT FOR THE &ldquo;WHAT IF&rdquo;</span></footer>
</main>
<script nonce="%%NONCE%%">%%CLIENT%%</script>
</body></html>`;

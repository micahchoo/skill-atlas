/**
 * main.js — side-panel prototype (ticket 006).
 *
 * Reuses the tree-renderer's pure modules read-only via relative import:
 *   graph.js  → buildGraph (merge + topology, ancestors/descendants)
 *   render.js → setupViewer (svg/viewer/tooltip), bindTooltip
 *   variants.js → VARIANTS[0] variant-A lane layout, makeDraw
 *
 * Data: merges ALL bodies batches (batch-001 11 + batch-002 3 = 14) against the
 * skeleton — the earlier renderer only merged batch-001; this prototype must
 * show 14, not 2.
 */

import { buildGraph } from '../tree-renderer/graph.js';
import { setupViewer, bindTooltip } from '../tree-renderer/render.js';
import { VARIANTS, makeDraw } from '../tree-renderer/variants.js';

const SECTIONS = ['know_what', 'know_how', 'habits', 'know_why', 'school_weights', 'checkpoint', 'common_failure', 'sources'];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let graph = null, viewer = null, bodyCount = 0, batchCounts = [];
let bodyById = new Map(); // bodies are NOT part of buildGraph's merged nodes — keep them here
let hardEdgeEls = [];
let selectedId = null;
const opts = { showSoft: true, showSpine: true };

/* ---------------------------------------------------------------- data load */
async function load() {
  const [sk, b1, b2] = await Promise.all([
    fetch('../../domains/grant-writing/skeleton.json').then((r) => r.json()),
    fetch('../../domains/grant-writing/bodies/batch-001.json').then((r) => r.json()),
    fetch('../../domains/grant-writing/bodies/batch-002.json').then((r) => r.json()),
  ]);
  const bodies = { nodes: [...b1.nodes, ...b2.nodes] }; // ALL batches — 14, not 2
  bodyCount = bodies.nodes.length;
  batchCounts = [b1.nodes.length, b2.nodes.length];
  bodyById = new Map(bodies.nodes.map((n) => [n.id, n]));
  graph = buildGraph(sk, bodies);
}

/* ---------------------------------------------------------------- rendering */
function renderTree() {
  viewer.clear();
  const A = VARIANTS.find((v) => v.key === 'A');
  const box = A.render(graph, viewer.world, makeDraw(), opts);
  // skeleton-only nodes get the dashed "content pending" outline (question 4)
  for (const g of viewer.world.querySelectorAll('[data-id]')) {
    if (!graph.byId.get(g.dataset.id).hasBody) g.classList.add('pending');
  }
  // hard edges are appended by A.render in graph.hardEdges order — zip them
  hardEdgeEls = [...viewer.world.querySelectorAll('path.edge.hard')];
  if (selectedId) applyChain(selectedId); // re-apply highlight after re-render
  requestAnimationFrame(() => viewer.fit(box));
}

/* ------------------------------------------------------- chain highlight Q5 */
function applyChain(id) {
  for (const g of viewer.world.querySelectorAll('.chain-anc,.chain-desc,.chain-selected')) {
    g.classList.remove('chain-anc', 'chain-desc', 'chain-selected');
  }
  for (const e of viewer.world.querySelectorAll('.chain-edge')) e.classList.remove('chain-edge');

  const anc = graph.ancestors(id);                 // hard-prereq chain, backward
  const desc = graph.descendants(id);              // hard-prereq chain, forward
  const chainSet = new Set([...anc, id, ...desc]);

  for (const g of viewer.world.querySelectorAll('[data-id]')) {
    const nid = g.dataset.id;
    if (nid === id) g.classList.add('chain-selected');
    else if (anc.includes(nid)) g.classList.add('chain-anc');
    else if (desc.includes(nid)) g.classList.add('chain-desc');
  }
  hardEdgeEls.forEach((el, i) => {
    const e = graph.hardEdges[i];
    if (e && chainSet.has(e.from) && chainSet.has(e.to)) el.classList.add('chain-edge');
  });
  return { anc, desc };
}

/* ---------------------------------------------------------------- selection */
function selectNode(id) {
  selectedId = id;
  const n = graph.byId.get(id);
  const { anc, desc } = applyChain(id);
  renderPanel(n, anc, desc);
  updateStatus(n, anc, desc);
}

function deselect() {
  selectedId = null;
  for (const g of viewer.world.querySelectorAll('.chain-anc,.chain-desc,.chain-selected')) {
    g.classList.remove('chain-anc', 'chain-desc', 'chain-selected');
  }
  for (const e of viewer.world.querySelectorAll('.chain-edge')) e.classList.remove('chain-edge');
  document.getElementById('panel').innerHTML =
    '<div class="placeholder" id="panelPlaceholder">Click a node in the tree to open its panel.<br>' +
    'Solid outline = body present · dashed outline = body pending.</div>';
  updateStatus(null, [], []);
}

/* ------------------------------------------------------------- panel (Q1-4) */
function schoolName(id) { return graph.schools.find((s) => s.id === id)?.name ?? id; }

function chips(list, kind) {
  if (!list.length) return '<span class="none">— none</span>';
  return list.map((pid) => {
    const lbl = graph.byId.get(pid)?.label ?? pid;
    return `<span class="chip ${kind}" data-nav="${pid}" title="${esc(pid)}">${esc(lbl)}</span>`;
  }).join('');
}

function renderPanel(n, anc, desc) {
  const clusterName = graph.clusterMeta.get(n.cluster)?.name ?? n.cluster;
  const badges =
    (n.spine ? '<span class="badge spine">★ spine</span>' : '') +
    (n.hasBody ? '<span class="badge body">body</span>' : '<span class="badge pending">content pending</span>');

  let html = `
    <div class="p-label">${esc(n.label)}${badges}</div>
    <div class="p-meta">Tier ${n.tier} · ${esc(clusterName)} · ${esc(n.hours)} h</div>
    ${n.one_line ? `<div class="p-line">${esc(n.one_line)}</div>` : ''}

    <div class="prereqs">
      <div class="row"><span class="lbl">Builds on</span>
        <span class="chips">${chips(n.prereqs, 'hard')}</span></div>
      <div class="row"><span class="lbl">Also useful</span>
        <span class="chips">${chips(n.soft_prereqs, 'soft')}</span></div>
    </div>`;

  const b = n.hasBody ? bodyById.get(n.id) : null;

  if (n.hasBody && b) {
    // Q2 — checkpoint gets top billing: the pass/fail gate is THE thing.
    html += `
      <div class="checkpoint">
        <div class="cp-kicker">Checkpoint · pass / fail</div>
        <div class="cp-text">${esc(b.checkpoint)}</div>
      </div>`;

    // Q1 — learning-path order: what → how → habits → warning → why → lens → refs
    const bullets = (list) => `<ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (b.know_what?.length) html += `
      <div class="sec"><h3>What you must know <span class="count">${b.know_what.length}</span></h3>${bullets(b.know_what)}</div>`;
    if (b.know_how?.length) html += `
      <div class="sec"><h3>What you must do <span class="count">${b.know_how.length}</span></h3>${bullets(b.know_how)}</div>`;
    if (b.habits?.length) html += `
      <div class="sec"><h3>Habits to build <span class="count">${b.habits.length}</span></h3>${bullets(b.habits)}</div>`;
    // common_failure is a single ';'-separated string in the data — render as bullets
    if (b.common_failure) html += `
      <div class="sec warn"><h3>Common failure — avoid this</h3><ul>
        ${b.common_failure.split(/;\s*/).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}
      </ul></div>`;

    // Q3 — know_why as a disagreement, not a paragraph.
    if (b.know_why && typeof b.know_why === 'object') {
      const k = b.know_why;
      html += `
        <div class="sec"><h3>Why this is contested</h3>
          <div class="kw-grid">
            <div class="kw-claim">
              <div class="kw-side">The claim</div>
              <div class="kw-body">
                <p>${esc(k.claim)}</p>
                ${k.because ? `<div class="kw-because"><b>Because:</b> ${esc(k.because)}</div>` : ''}
              </div>
            </div>
            <div class="kw-vs">VS</div>
            <div class="kw-dispute">
              <div class="kw-side">The dispute</div>
              <div class="kw-body"><p>${esc(k.disputed_by)}</p></div>
            </div>
          </div>
          ${k.source ? `<div class="kw-source">Debate sourced from: ${esc(k.source)}</div>` : ''}
        </div>`;
    }

    // school_weights: {} = school-neutral; else colored chips (Q1 collapse candidate)
    html += '<details class="sec"><summary>School lens</summary>';
    if (b.school_weights && Object.keys(b.school_weights).length) {
      html += `<div class="sw-chips">${Object.entries(b.school_weights).map(([sid, v]) =>
        `<span class="sw-chip v-${esc(v)}">${esc(schoolName(sid))} · ${esc(v)}</span>`).join('')}</div>`;
    } else {
      html += '<div class="sw-neutral">School-neutral — no unusual weightings recorded for this node.</div>';
    }
    html += '</details>';

    if (b.sources?.length) html += `
      <details class="sec"><summary>Sources</summary><ol>
        ${b.sources.map((s) => `<li>${esc(s)}</li>`).join('')}
      </ol></details>`;
  } else {
    // Q4 — skeleton-only: real tree content, honest "content pending" state.
    html += `
      <div class="pending-card">
        <div class="pend-title">Content pending — tree done, body not yet generated</div>
        <p>This node is fully mapped: tier, cluster, ${esc(n.hours)} h, and the one_line above are real
           skeleton data. Its 8-section body has not been generated yet.</p>
        <p class="pend-sub">These sections appear here when the body batch lands:</p>
        <div class="pend-sections">${SECTIONS.map((s) => `<span class="pend-sec">${s}</span>`).join('')}</div>
      </div>`;
  }

  // Q5 tie-in — the chain is highlighted in the tree; mirror it as clickable chips here.
  html += `
    <div class="sec"><h3>Prereq chain <span class="count">${anc.length + 1 + desc.length} nodes</span></h3>
      <div class="prereqs">
        <div class="row"><span class="lbl">Ancestors</span><span class="chips">${chips(anc, 'hard')}</span></div>
        <div class="row"><span class="lbl">This node</span><span class="chips">${chips([n.id], 'hard')}</span></div>
        <div class="row"><span class="lbl">Unlocks</span><span class="chips">${chips(desc, 'hard')}</span></div>
      </div>
    </div>`;

  const panel = document.getElementById('panel');
  panel.innerHTML = html;
  // chips navigate the selection — panel and tree talk to each other
  panel.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => selectNode(el.dataset.nav));
  });
  panel.scrollTop = 0;
}

/* ---------------------------------------------------------------- statusbar */
function updateStatus(n, anc, desc) {
  const s = (id) => document.getElementById(id);
  s('stSelected').textContent = n ? n.id : '—';
  s('stBody').textContent = n ? (n.hasBody ? 'yes' : 'no — pending') : '—';
  s('stChain').textContent = n ? `${anc.length + 1 + desc.length} nodes (${anc.length} anc · ${desc.length} desc)` : '—';
  s('stSoft').textContent = n ? n.soft_prereqs.length : '—';
  s('stMerged').textContent = bodyCount;
}

/* ------------------------------------------------------------------ wiring */
async function main() {
  try {
    await load();
    document.getElementById('facts').textContent =
      `${graph.nodes.length} nodes · ${graph.tiers.length} tiers · ${graph.clusters.length} clusters · ` +
      `${graph.hardEdges.length} hard edges · ${graph.softEdges.length} soft edges`;
    document.getElementById('bodyCount').textContent =
      `Bodies merged: ${bodyCount} (batch-001 ${batchCounts[0]} + batch-002 ${batchCounts[1]}) — ALL batches`;
    document.getElementById('stMerged').textContent = bodyCount;

    viewer = setupViewer(document.getElementById('stage'));
    bindTooltip(viewer, graph);
    renderTree();

    // click node → open panel + highlight chain; click empty → deselect
    viewer.svg.addEventListener('click', (e) => {
      const g = e.target.closest('[data-id]');
      if (g) selectNode(g.dataset.id);
      else deselect();
    });

    // options
    document.getElementById('softToggle').addEventListener('change', (e) => { opts.showSoft = e.target.checked; renderTree(); });
    document.getElementById('spineToggle').addEventListener('change', (e) => { opts.showSpine = e.target.checked; renderTree(); });
    const center = () => {
      const r = viewer.svg.getBoundingClientRect();
      return { cx: r.width / 2, cy: r.height / 2 };
    };
    document.getElementById('zoomIn').addEventListener('click', () => { const c = center(); viewer.zoomBy(1.25, c.cx, c.cy); });
    document.getElementById('zoomOut').addEventListener('click', () => { const c = center(); viewer.zoomBy(0.8, c.cx, c.cy); });
    document.getElementById('fitBtn').addEventListener('click', () => renderTree());
  } catch (err) {
    const box = document.getElementById('errorBox');
    box.hidden = false;
    box.textContent = `Failed to load: ${err.message}`;
    console.error(err);
  }
}

main();

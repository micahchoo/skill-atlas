/**
 * tree-client.ts — the interactive tree page (zero framework).
 *
 * Reads the merged DomainData embedded by the Astro page, builds the graph,
 * and wires: tiered-lane SVG tree, side panel (ticket 006), school lens
 * (ticket 007), chain highlight, and the /<domain>?node=<id>&school=<id> URL
 * contract (ticket 004) — one shared URLSearchParams object so the two
 * compose by construction; replaceState for reload stability.
 */
import { buildGraph, type SkillGraph } from '../lib/graph';
import { layoutLanes, type LaneLayout, type Box } from '../lib/layout';
import { setupViewer, drawTree, bindTooltip, type Viewer, type TreeDraw } from '../lib/render';
import type { BodyNode, DomainData, MergedNode, SchoolWeight } from '../lib/types';

const SECTIONS = ['know_what', 'know_how', 'habits', 'know_why', 'school_weights', 'checkpoint', 'common_failure', 'sources'];

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

interface State {
  graph: SkillGraph;
  layout: LaneLayout;
  viewer: Viewer;
  selectedId: string | null;
  deepId: string | null; // node id that arrived via ?node= — keeps its blue ring
  activeSchool: string | null;
  showSoft: boolean;
  showSpine: boolean;
  draw: TreeDraw | null;
}

const params = new URLSearchParams(window.location.search);

export function initTree(): void {
  const dataEl = document.getElementById('domain-data');
  if (!dataEl) throw new Error('missing embedded domain data');
  const data = JSON.parse(dataEl.textContent ?? '{}') as DomainData;

  const graph = buildGraph(data);
  const state: State = {
    graph,
    layout: layoutLanes(graph),
    viewer: setupViewer($<HTMLElement>('stage')),
    selectedId: null,
    deepId: null,
    activeSchool: null,
    showSoft: true,
    showSpine: true,
    draw: null,
  };

  for (const [id, b] of Object.entries(data.bodies ?? {})) bodiesById.set(id, b);

  bindTooltip(state.viewer, state.graph, () => state.activeSchool);

  // URL state first (lenient parse: unknown school → no lens, param dropped;
  // unknown node → simply not highlighted), so the first render already
  // carries the deep ring and the lens.
  const wantNode = params.get('node');
  if (wantNode && state.graph.byId.has(wantNode)) state.deepId = wantNode;
  const wantSchool = params.get('school');
  if (wantSchool) {
    if (state.graph.schools.some((s) => s.id === wantSchool)) state.activeSchool = wantSchool;
    else {
      params.delete('school');
      syncUrlState();
    }
  }

  render(state);
  wireControls(state);
  if (state.deepId) selectNode(state, state.deepId, false);
  updateSelector(state);
  updateStrip(state);
  updateStatus(state);
}

/* ------------------------------------------------------------- rendering */

function render(state: State): void {
  state.viewer.clear();
  state.draw = drawTree(state.viewer, state.graph, state.layout, {
    showSoft: state.showSoft,
    showSpine: state.showSpine,
  });
  applyLens(state);
  if (state.deepId) {
    for (const g of state.draw.nodeEls) {
      if (g.dataset.id === state.deepId) g.classList.add('deep');
    }
  }
  if (state.selectedId) applyChain(state, state.selectedId);
  requestAnimationFrame(() => state.viewer.fit(state.draw!.box));
}

/** Lens grammar is strictly additive: no school_weights entry ⇒ untouched. */
function applyLens(state: State): void {
  const { graph, draw, activeSchool } = state;
  if (!draw) return;
  for (const g of draw.nodeEls) {
    g.classList.remove('lens-high', 'lens-low', 'lens-rejected');
    g.querySelector('.badge')?.remove();
    const n = graph.byId.get(g.dataset.id!);
    if (!n) continue;
    const w: SchoolWeight | undefined = activeSchool ? n.school_weights[activeSchool] : undefined;
    if (!w || w === 'normal') continue;
    g.classList.add(`lens-${w}`);
    const b = state.layout.pos.get(n.id)!;
    const label = w === 'high' ? 'H' : w === 'low' ? 'L' : 'R';
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    badge.setAttribute('x', String(b.x + b.w - 5));
    badge.setAttribute('y', String(b.y + b.h - 4));
    badge.setAttribute('text-anchor', 'middle');
    badge.setAttribute('dominant-baseline', 'middle');
    badge.setAttribute('class', `badge ${w === 'high' ? 'hi' : w === 'low' ? 'lo' : 'rj'}`);
    badge.textContent = label;
    g.appendChild(badge);
  }
}

/* --------------------------------------------------------- chain highlight */

function applyChain(state: State, id: string): { anc: string[]; desc: string[] } {
  const { graph, draw } = state;
  if (!draw) return { anc: [], desc: [] };
  const anc = graph.ancestors(id);
  const desc = graph.descendants(id);
  const chainSet = new Set([...anc, id, ...desc]);

  for (const g of draw.nodeEls) {
    g.classList.remove('chain-anc', 'chain-desc', 'chain-selected');
    const nid = g.dataset.id!;
    if (nid === id) g.classList.add('chain-selected');
    else if (anc.includes(nid)) g.classList.add('chain-anc');
    else if (desc.includes(nid)) g.classList.add('chain-desc');
  }
  for (const e of draw.hardEdgeEls) {
    e.classList.remove('chain-edge');
    if (chainSet.has(e.dataset.from!) && chainSet.has(e.dataset.to!)) e.classList.add('chain-edge');
  }
  return { anc, desc };
}

/* ---------------------------------------------------------------- selection */

function selectNode(state: State, id: string, syncUrl: boolean): void {
  state.selectedId = id;
  const { anc, desc } = applyChain(state, id);
  renderPanel(state, id, anc, desc);
  if (syncUrl) {
    params.set('node', id);
    syncUrlState();
  }
  updateStatus(state);
}

function deselect(state: State): void {
  state.selectedId = null;
  const { draw } = state;
  if (draw) {
    for (const g of draw.nodeEls) g.classList.remove('chain-anc', 'chain-desc', 'chain-selected');
    for (const e of draw.hardEdgeEls) e.classList.remove('chain-edge');
  }
  $<HTMLElement>('panel').innerHTML =
    '<div class="placeholder">Click a node in the tree to open its panel.<br>' +
    'Solid outline = body present · dashed outline = body pending.</div>';
  if (params.has('node')) {
    params.delete('node');
    syncUrlState();
  }
  updateStrip(state);
  updateStatus(state);
}

function syncUrlState(): void {
  history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
}

/* ------------------------------------------------------------------- panel */

function schoolName(state: State, id: string): string {
  return state.graph.schools.find((s) => s.id === id)?.name ?? id;
}

function chips(state: State, list: string[], kind: 'hard' | 'soft'): string {
  if (!list.length) return '<span class="none">— none</span>';
  return list
    .map((pid) => `<span class="chip ${kind}" data-nav="${esc(pid)}" title="${esc(pid)}">${esc(state.graph.byId.get(pid)?.label ?? pid)}</span>`)
    .join('');
}

function bullets(list: string[]): string {
  return `<ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

function bodySections(state: State, b: BodyNode): string {
  const parts: string[] = [];
  // checkpoint — top billing, the only colored card, first body element
  if (b.checkpoint) {
    parts.push(`
      <div class="checkpoint">
        <div class="cp-kicker">Checkpoint · pass / fail</div>
        <div class="cp-text">${esc(b.checkpoint)}</div>
      </div>`);
  }
  if (b.know_what?.length) parts.push(`<div class="sec"><h3>What you must know <span class="count">${b.know_what.length}</span></h3>${bullets(b.know_what)}</div>`);
  if (b.know_how?.length) parts.push(`<div class="sec"><h3>What you must do <span class="count">${b.know_how.length}</span></h3>${bullets(b.know_how)}</div>`);
  if (b.habits?.length) parts.push(`<div class="sec"><h3>Habits to build <span class="count">${b.habits.length}</span></h3>${bullets(b.habits)}</div>`);
  // common_failure is a single ';'-separated string — split into bullets
  if (b.common_failure) {
    parts.push(`<div class="sec warn"><h3>Common failure — avoid this</h3><ul>
      ${b.common_failure.split(/;\s*/).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}
    </ul></div>`);
  }
  // know_why — a disagreement, rendered as two camps, never a paragraph
  if (b.know_why && typeof b.know_why === 'object') {
    const k = b.know_why;
    parts.push(`<div class="sec"><h3>Why this is contested</h3>
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
    </div>`);
  }
  // school_weights + sources are the collapsible annotation layers
  const sw = b.school_weights ?? {};
  const swChips = Object.keys(sw).length
    ? `<div class="sw-chips">${Object.entries(sw)
        .map(([sid, v]) => `<span class="sw-chip v-${esc(v)}">${esc(schoolName(state, sid))} · ${esc(v)}</span>`)
        .join('')}</div>`
    : '<div class="sw-neutral">School-neutral — no unusual weightings recorded for this node.</div>';
  parts.push(`<details class="sec"><summary>School lens</summary>${swChips}</details>`);
  if (b.sources?.length) {
    parts.push(`<details class="sec"><summary>Sources</summary><ol>
      ${b.sources.map((s) => `<li>${esc(s)}</li>`).join('')}
    </ol></details>`);
  }
  return parts.join('');
}

function renderPanel(state: State, id: string, anc: string[], desc: string[]): void {
  const { graph } = state;
  const n = graph.byId.get(id);
  if (!n) return;
  const b = bodiesById.get(id);
  const badges =
    (n.spine ? '<span class="badge spine">★ spine</span>' : '') +
    (n.hasBody ? '<span class="badge body">body</span>' : '<span class="badge pending">content pending</span>');

  const html = `
    <div class="p-label">${esc(n.label)}${badges}</div>
    <div class="p-meta">Tier ${n.tier} · ${esc(graph.clusterMeta.get(n.cluster)?.name ?? n.cluster)} · ${esc(n.hours)} h</div>
    ${n.one_line ? `<div class="p-line">${esc(n.one_line)}</div>` : ''}

    <div class="prereqs">
      <div class="row"><span class="lbl">Builds on</span>
        <span class="chips">${chips(state, n.prereqs, 'hard')}</span></div>
      <div class="row"><span class="lbl">Also useful</span>
        <span class="chips">${chips(state, n.soft_prereqs, 'soft')}</span></div>
    </div>

    ${n.hasBody && b ? bodySections(state, b) : pendingCard(n)}

    <div class="sec"><h3>Prereq chain <span class="count">${anc.length + 1 + desc.length} nodes</span></h3>
      <div class="prereqs">
        <div class="row"><span class="lbl">Ancestors</span><span class="chips">${chips(state, anc, 'hard')}</span></div>
        <div class="row"><span class="lbl">This node</span><span class="chips">${chips(state, [n.id], 'hard')}</span></div>
        <div class="row"><span class="lbl">Unlocks</span><span class="chips">${chips(state, desc, 'hard')}</span></div>
      </div>
    </div>`;

  const panel = $<HTMLElement>('panel');
  panel.innerHTML = html;
  panel.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => selectNode(state, (el as HTMLElement).dataset.nav!, true));
  });
  panel.scrollTop = 0;
}

function pendingCard(n: MergedNode): string {
  return `
    <div class="pending-card">
      <div class="pend-title">Content pending — tree done, body not yet generated</div>
      <p>This node is fully mapped: tier, cluster, ${esc(n.hours)} h, and the one_line above are real
         skeleton data. Its 8-section body has not been generated yet.</p>
      <p class="pend-sub">These sections appear here when the body batch lands:</p>
      <div class="pend-sections">${SECTIONS.map((s) => `<span class="pend-sec">${s}</span>`).join('')}</div>
    </div>`;
}

/* ---------------------------------------------------------------- school lens */

function weightedCount(state: State, schoolId: string): number {
  return state.graph.nodes.filter((n) => n.school_weights[schoolId]).length;
}

function setSchool(state: State, schoolId: string | null): void {
  state.activeSchool = schoolId;
  if (schoolId) params.set('school', schoolId);
  else params.delete('school');
  syncUrlState();
  applyLens(state);
  updateSelector(state);
  updateStrip(state);
  updateStatus(state);
}

function updateSelector(state: State): void {
  for (const chip of document.querySelectorAll<HTMLElement>('.lens-chip')) {
    chip.classList.remove('active', 'enemy');
    const sid = chip.dataset.school ?? '';
    if (sid === (state.activeSchool ?? '')) {
      chip.classList.add('active');
      continue;
    }
    if (state.activeSchool) {
      const s = state.graph.schools.find((x) => x.id === state.activeSchool);
      if (s && (s.quarrels_with ?? []).includes(sid)) chip.classList.add('enemy');
    }
  }
  document.body.dataset.lens = state.activeSchool ?? '';
}

function updateStrip(state: State): void {
  const strip = $<HTMLElement>('lensStrip');
  const lens = state.activeSchool;
  const deepChip = state.deepId
    ? `<span class="deepchip">deep link: ${esc(state.graph.byId.get(state.deepId)?.label ?? state.deepId)}</span>`
    : '';
  if (!lens) {
    strip.className = 'strip off';
    strip.innerHTML =
      `<b>No school lens — overview.</b> The tree as authored. Pick a school above to re-tint it by that school's weights.` +
      deepChip;
    return;
  }
  const s = state.graph.schools.find((x) => x.id === lens);
  if (!s) return;
  const qw = (s.quarrels_with ?? []).map((id) => schoolName(state, id)).join(', ') || '—';
  const count = weightedCount(state, lens);
  const warn = count === 0
    ? `<span class="warn">— no weight annotations for this school yet (0 nodes), so the tree stays neutral under this lens.</span>`
    : `<span class="warn">— ${count} node${count === 1 ? '' : 's'} weighted by this school.</span>`;
  strip.className = 'strip';
  strip.innerHTML =
    `<span class="sname">${esc(s.name)}</span>` +
    `<span class="frag"><span class="k">optimises for</span>${esc(s.optimises_for)}</span>` +
    `<span class="frag"><span class="k">gives up</span>${esc(s.gives_up)}</span>` +
    `<span class="frag"><span class="k">quarrels with</span><span class="qw">${esc(qw)}</span></span>` +
    warn + deepChip;
}

function updateStatus(state: State): void {
  const n = state.selectedId ? state.graph.byId.get(state.selectedId) : null;
  $<HTMLElement>('stSelected').textContent = n ? n.id : '—';
  $<HTMLElement>('stBody').textContent = n ? (n.hasBody ? 'yes' : 'no — pending') : '—';
  $<HTMLElement>('stLens').textContent = state.activeSchool ? state.activeSchool : 'no lens';
  $<HTMLElement>('stUrl').textContent = params.toString() || '(bare)';
}

/* ------------------------------------------------------------------ wiring */

function wireControls(state: State): void {
  const viewer = state.viewer;

  $<HTMLInputElement>('softToggle').addEventListener('change', (e) => {
    state.showSoft = (e.target as HTMLInputElement).checked;
    render(state);
  });
  $<HTMLInputElement>('spineToggle').addEventListener('change', (e) => {
    state.showSpine = (e.target as HTMLInputElement).checked;
    render(state);
  });

  const center = (): { cx: number; cy: number } => {
    const r = viewer.svg.getBoundingClientRect();
    return { cx: r.width / 2, cy: r.height / 2 };
  };
  $<HTMLButtonElement>('zoomIn').addEventListener('click', () => {
    const c = center();
    viewer.zoomBy(1.25, c.cx, c.cy);
  });
  $<HTMLButtonElement>('zoomOut').addEventListener('click', () => {
    const c = center();
    viewer.zoomBy(0.8, c.cx, c.cy);
  });
  $<HTMLButtonElement>('fitBtn').addEventListener('click', () => render(state));

  viewer.svg.addEventListener('click', (e) => {
    const g = (e.target as Element).closest('[data-id]') as SVGGElement | null;
    if (g) selectNode(state, g.dataset.id!, true);
    else deselect(state);
  });

  for (const chip of document.querySelectorAll<HTMLElement>('.lens-chip')) {
    chip.addEventListener('click', () => {
      const sid = chip.dataset.school ?? '';
      setSchool(state, sid === (state.activeSchool ?? '') ? null : (sid || null));
    });
  }
}

/** Bodies are not part of the graph — keep them alongside, keyed by id. */
const bodiesById = new Map<string, BodyNode>();

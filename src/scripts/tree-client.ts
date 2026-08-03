/**
 * tree-client.ts — the domain page at three altitudes (zero framework).
 *
 * Semantic zoom in the Arcanum skin (issues/011): the overview shows
 * disciplines (clusters), a cluster opens as a bottom-up talent board with a
 * preview sidebar, a node opens as a full reading page. Text renders at
 * readable size or not at all — you descend to see more, you never squint.
 *
 * URL contract (ticket 004, extended): one shared URLSearchParams so
 * ?cluster= / ?node= / ?sel= / ?school= compose by construction; unknown ids
 * are dropped leniently. Navigation is URL-native: every navigational control
 * is a real <a href> (middle-click, share, keyboard for free), descents push
 * history entries (Back ascends), and popstate re-renders from the URL.
 * The school lens (ticket 007) is strictly additive: no school_weights entry
 * for the active school ⇒ the socket is untouched.
 */
import { buildGraph, type SkillGraph, type Edge } from '../lib/graph';
import type { BodyNode, DomainData, MergedNode, SchoolWeight } from '../lib/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_FALLBACK = '✦';
/** Site root under the deploy base path (GitHub Pages serves at /skill-atlas/). */
const ROOT = import.meta.env.BASE_URL.replace(/\/+$/, '') + '/';

interface State {
  cluster: string | null;
  node: string | null;
  sel: string | null;
  school: string | null;
  flash: string | null;
}

let G: SkillGraph;
let BODY: Map<string, BodyNode>;
let app: HTMLElement;
let params = new URLSearchParams(window.location.search);
const state: State = { cluster: null, node: null, sel: null, school: null, flash: null };

/** Lenient URL parse: unknown ids drop, node implies its cluster, sel lives in its cluster. */
function readState(): void {
  state.cluster = params.get('cluster');
  state.node = params.get('node');
  state.sel = params.get('sel');
  state.school = params.get('school');
  if (state.node && !G.byId.has(state.node)) state.node = null;
  if (state.node) state.cluster = G.byId.get(state.node)!.cluster;
  if (state.cluster && !G.clusterMeta.has(state.cluster)) state.cluster = null;
  if (state.sel && G.byId.get(state.sel)?.cluster !== state.cluster) state.sel = null;
  if (state.school && !G.schools.some((s) => s.id === state.school)) state.school = null;
}

function writeParams(q: URLSearchParams, s: State): string {
  const set = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k));
  set('cluster', s.cluster);
  set('node', s.node);
  set('sel', s.sel);
  set('school', s.school);
  return `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
}

export function initAtlas(): void {
  const dataEl = document.getElementById('domain-data');
  if (!dataEl) throw new Error('missing embedded domain data');
  const data = JSON.parse(dataEl.textContent ?? '{}') as DomainData;
  G = buildGraph(data);
  BODY = new Map(Object.entries(data.bodies));
  app = document.getElementById('app') as HTMLElement;

  readState();
  history.replaceState(null, '', writeParams(params, state)); // normalize dropped ids, no entry
  window.addEventListener('popstate', () => {
    params = new URLSearchParams(window.location.search);
    state.flash = null;
    readState();
    render();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.node) go({ node: null });
    else if (state.sel) go({ sel: null });
    else if (state.cluster) go({ cluster: null });
  });
  window.addEventListener('resize', () => render());
  render();
}

function go(patch: Partial<State>): void {
  Object.assign(state, patch);
  if (state.node) state.cluster = G.byId.get(state.node)!.cluster;
  // a board selection only lives inside its own cluster
  if (state.sel && G.byId.get(state.sel)?.cluster !== state.cluster) state.sel = null;
  const url = writeParams(params, state);
  if (url !== `${window.location.pathname}${window.location.search}`) {
    history.pushState(null, '', url); // Back ascends the way you came
  }
  render();
}

/* ---------------------------------------------------------------- helpers */

function el(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cname = (cid: string): string => G.clusterMeta.get(cid)?.name ?? cid;
const icon = (cid: string): string => G.clusterMeta.get(cid)?.icon ?? ICON_FALLBACK;
const clusterNodes = (cid: string): MergedNode[] => G.nodes.filter((n) => n.cluster === cid);
const coverage = (cid: string): { total: number; bodies: number } => {
  const ns = clusterNodes(cid);
  return { total: ns.length, bodies: ns.filter((n) => n.hasBody).length };
};

/** The URL go(patch) would land on — same invariants, no mutation. */
function hrefFor(patch: Partial<State>): string {
  const s = { ...state, ...patch };
  if (s.node) s.cluster = G.byId.get(s.node)!.cluster;
  if (s.sel && G.byId.get(s.sel)?.cluster !== s.cluster) s.sel = null;
  return writeParams(new URLSearchParams(params), s);
}

/** Navigational anchor: real href for middle-click/share/keyboard, SPA go() on plain click. */
function navA(cls: string | undefined, html: string, patch: Partial<State>, before?: () => void): HTMLAnchorElement {
  const a = document.createElement('a');
  if (cls) a.className = cls;
  a.innerHTML = html;
  a.href = hrefFor(patch);
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
    e.preventDefault();
    before?.();
    go(patch);
  });
  return a;
}

function crumbs(...parts: { text: string; to?: Partial<State> }[]): HTMLElement {
  const c = el('div', 'crumbs');
  parts.forEach((p, i) => {
    if (i) c.append(el('span', 'sep', '·'));
    if (p.to !== undefined) c.append(navA(undefined, esc(p.text), p.to));
    else c.append(el('b', undefined, esc(p.text)));
  });
  return c;
}

/* ------------------------------------------------------ altitude 1: overview */

function renderOverview(): void {
  const crumb = el('div', 'crumbs');
  crumb.innerHTML = `<a href="${ROOT}">Skill Atlas</a><span class="sep">·</span><b>${esc(G.domain)}</b>`;
  app.append(
    crumb,
    el('h1', undefined, esc(G.domain)),
    el('p', 'sub', `${esc(G.level)} — choose a discipline. ${G.nodes.length} skills await.`),
    el('hr', 'rule'),
  );

  // the main quest is a path across disciplines — badge only its start,
  // count its stops everywhere else
  const questStart = G.byId.get(G.spine[0])?.cluster;
  const row = el('div', 'disciplines');
  G.clusters.forEach((c, i) => {
    const cov = coverage(c.id);
    const spineCount = clusterNodes(c.id).filter((n) => n.spine).length;
    const d = navA(`discipline${c.id === questStart ? ' lead' : ''}`, '', { cluster: c.id });
    d.style.setProperty('--i', String(i));
    if (c.id === questStart) d.append(el('span', 'questline', 'QUEST BEGINS'));
    d.append(
      el('div', 'emblem', icon(c.id)),
      el('div', 'dname', esc(c.name)),
      el('div', 'dgist', esc(c.gist)),
      el('div', 'dstat',
        `<b>${cov.bodies}</b> of <b>${cov.total}</b> tomes written` +
        (spineCount ? ` · ★ ${spineCount} on the quest` : '')),
    );
    row.append(d);
  });
  app.append(row);

  const first = G.byId.get(G.spine[0]);
  if (first) {
    app.append(navA('startwalk', `Take up the main quest → ${esc(first.label)}`, { node: first.id }));
  }
}

/* -------------------------------------------------- altitude 2: talent board */

function externalEdges(cid: string): { incoming: Edge[]; outgoing: Edge[]; softIn: Edge[]; softOut: Edge[] } {
  const inC = (id: string) => G.byId.get(id)?.cluster === cid;
  return {
    incoming: G.hardEdges.filter((e) => !inC(e.from) && inC(e.to)),
    outgoing: G.hardEdges.filter((e) => inC(e.from) && !inC(e.to)),
    softIn: G.softEdges.filter((e) => !inC(e.from) && inC(e.to)),
    softOut: G.softEdges.filter((e) => inC(e.from) && !inC(e.to)),
  };
}

function renderBoard(cid: string): void {
  const meta = G.clusterMeta.get(cid)!;
  const cov = coverage(cid);
  app.append(
    crumbs({ text: G.domain, to: { cluster: null, node: null } }, { text: meta.name }),
    el('h2', undefined, `${icon(cid)} ${esc(meta.name)}`),
    el('p', 'sub', `${esc(meta.gist)} — ${cov.bodies} of ${cov.total} tomes written.`),
  );
  renderLensRow(cid);

  const wrap = el('div', 'arcwrap');
  const board = el('div', 'talentboard');
  const cards = new Map<string, HTMLElement>();
  const ns = clusterNodes(cid);
  const tiers = [...new Set(ns.map((n) => n.tier))].sort((a, b) => b - a); // top row = highest tier
  tiers.forEach((t, ti) => {
    const row = el('div', 'trow');
    row.style.setProperty('--i', String(ti));
    row.append(el('span', 'trowlabel', `TIER ${t}`));
    for (const n of ns.filter((x) => x.tier === t)) {
      const cell = el('div', socketClasses(n));
      cell.dataset.id = n.id;
      // the hit target is the socket+label anchor; travel doors sit OUTSIDE it,
      // so aiming at a skill can never teleport you to another cluster
      const hit = navA('sockethit', '', { sel: n.id });
      hit.append(
        el('div', 'socket', n.hasBody ? icon(cid) : ''),
        el('div', 'nlabel', esc(n.label)),
        el('div', 'nmeta', n.hasBody ? `${n.hours} h` : `${n.hours} h · forthcoming`),
      );
      cell.append(hit);
      if (state.flash === n.id) {
        cell.classList.add('flash');
        state.flash = null;
      }
      cards.set(n.id, cell);
      row.append(cell);
    }
    board.append(row);
  });
  board.append(legendRow());
  wrap.append(board, renderPreview(cid));
  app.append(wrap);
  attachDoors(cid, cards);
  drawEdges(board, inClusterPairs(cid, cards));
}

function socketClasses(n: MergedNode): string {
  let cls = 'socketnode';
  if (n.spine) cls += ' spine';
  if (!n.hasBody) cls += ' pending';
  if (state.sel === n.id) cls += ' selected';
  if (state.school) {
    const w: SchoolWeight | undefined = n.school_weights[state.school];
    if (w && w !== 'normal') cls += ` lens-${w}`;
  }
  return cls;
}

function renderLensRow(cid: string): void {
  if (!G.schools.length) return;
  const row = el('div', 'lensrow');
  row.append(el('span', 'cap', 'School lens'));
  const active = state.school ? G.schools.find((s) => s.id === state.school) : null;
  for (const s of G.schools) {
    // promise only what this board can show: non-normal weights in this cluster
    const count = clusterNodes(cid).filter((n) => {
      const w = n.school_weights[s.id];
      return w && w !== 'normal';
    }).length;
    const enemy = s.id !== state.school && !!active?.quarrels_with?.includes(s.id);
    const chip = el('button', 'schoolchip', `${enemy ? '⚔ ' : ''}${esc(s.name)} (${count})`);
    if (s.id === state.school) chip.classList.add('active');
    else if (enemy) chip.classList.add('enemy');
    chip.title = `optimises for: ${s.optimises_for} · gives up: ${s.gives_up}`;
    chip.addEventListener('click', () => go({ school: s.id === state.school ? null : s.id }));
    row.append(chip);
  }
  app.append(row);
  const line = el('div', 'lensline');
  if (active) {
    const qw = (active.quarrels_with ?? []).map((id) => G.schools.find((s) => s.id === id)?.name ?? id).join(', ') || '—';
    line.innerHTML =
      `<b>${esc(active.name)}</b> — optimises for ${esc(active.optimises_for)} · ` +
      `gives up ${esc(active.gives_up)} · quarrels with <span class="qw">${esc(qw)}</span>`;
  } else {
    line.textContent = 'No lens — the board as authored. Pick a school to see what it prizes and rejects.';
  }
  app.append(line);
}

/** How to read the board — the visual grammar, taught once. */
function legendRow(): HTMLElement {
  const l = el('div', 'legend');
  const item = (swatch: string, glyph: string, label: string) => {
    const it = el('span', 'lg');
    it.append(el('span', `lg-sw ${swatch}`, glyph), el('span', undefined, label));
    l.append(it);
  };
  item('lg-spine', '', 'main quest');
  item('lg-hard', '', 'requires');
  item('lg-soft', '', 'helps');
  item('lg-forth', '✎', 'tome forthcoming');
  item('lg-door', '⇠⇢', 'door to another discipline');
  return l;
}

/** Cross-cluster prereqs as clickable travel chips under the touched socket. */
function attachDoors(cid: string, cards: Map<string, HTMLElement>): void {
  const { incoming, outgoing, softIn, softOut } = externalEdges(cid);
  const byNode = new Map<string, { rid: string; dir: 'in' | 'out' }[]>();
  const collect = (edges: Edge[], dir: 'in' | 'out') => {
    for (const e of edges) {
      const local = dir === 'in' ? e.to : e.from;
      const remote = dir === 'in' ? e.from : e.to;
      const list = byNode.get(local) ?? [];
      list.push({ rid: remote, dir });
      byNode.set(local, list);
    }
  };
  collect(incoming, 'in');
  collect(softIn, 'in');
  collect(outgoing, 'out');
  collect(softOut, 'out');
  for (const [local, doors] of byNode) {
    const row = el('div', 'doorrow');
    for (const { rid, dir } of doors) {
      const r = G.byId.get(rid)!;
      // arrive selected: the preview describes what you traveled for
      const chip = navA('door',
        `${dir === 'in' ? '⇠' : '⇢'} ${esc(r.label)} · ${esc(cname(r.cluster))}`,
        { cluster: r.cluster, node: null, sel: rid },
        () => { state.flash = rid; });
      chip.title = `Travel to ${cname(r.cluster)}`;
      row.append(chip);
    }
    cards.get(local)?.append(row);
  }
}

function inClusterPairs(cid: string, cards: Map<string, HTMLElement>): { from: HTMLElement; to: HTMLElement; cls: string }[] {
  const inC = (id: string) => G.byId.get(id)?.cluster === cid;
  const spineLegs = new Set(G.spinePath.map((e) => `${e.from}>${e.to}`));
  const pairs: { from: HTMLElement; to: HTMLElement; cls: string }[] = [];
  const push = (e: Edge, cls: string) => {
    const from = cards.get(e.from);
    const to = cards.get(e.to);
    if (from && to) pairs.push({ from, to, cls });
  };
  for (const e of G.hardEdges) {
    if (inC(e.from) && inC(e.to)) push(e, spineLegs.has(`${e.from}>${e.to}`) ? 'e-spine' : 'e-hard');
  }
  for (const e of G.softEdges) {
    if (inC(e.from) && inC(e.to)) push(e, 'e-soft');
  }
  return pairs;
}

/** Bezier edges between measured elements; bottom-up flow (prereq below dependent). */
function drawEdges(container: HTMLElement, pairs: { from: HTMLElement; to: HTMLElement; cls: string }[]): void {
  container.querySelector(':scope > .edgelayer')?.remove();
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'edgelayer');
  const cr = container.getBoundingClientRect();
  svg.setAttribute('width', String(container.scrollWidth));
  svg.setAttribute('height', String(container.scrollHeight));
  for (const p of pairs) {
    const a = p.from.getBoundingClientRect(); // prereq (lower row)
    const b = p.to.getBoundingClientRect();   // dependent (upper row)
    const x1 = a.left + a.width / 2 - cr.left;
    const y1 = a.top - cr.top;
    const x2 = b.left + b.width / 2 - cr.left;
    const y2 = b.bottom - cr.top;
    const my = (y1 + y2) / 2;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`);
    path.setAttribute('class', p.cls);
    svg.append(path);
  }
  container.prepend(svg);
}

/* -------------------------------------------------------- preview sidebar */

function renderPreview(cid: string): HTMLElement {
  const box = el('aside', 'preview');
  const n = state.sel ? G.byId.get(state.sel) : null;
  if (!n) {
    const cov = coverage(cid);
    box.append(
      el('div', 'pv-kicker', 'Inspect'),
      el('div', 'pv-title', esc(cname(cid))),
      el('p', 'pv-line', esc(G.clusterMeta.get(cid)?.gist ?? '')),
      el('p', 'pv-hint', `${cov.bodies} of ${cov.total} tomes written. Click a skill on the board to inspect it here.`),
    );
    return box;
  }
  const b = BODY.get(n.id);
  box.append(
    el('div', 'pv-kicker', n.spine ? '★ Main quest skill' : 'Skill'),
    el('div', 'pv-title', esc(n.label)),
    el('div', 'pv-meta', `Tier ${n.tier} · ${n.hours} h · ${n.hasBody ? 'tome written' : 'tome forthcoming'}`),
  );
  if (n.one_line) box.append(el('p', 'pv-line', esc(n.one_line)));
  if (b?.checkpoint) {
    const cp = el('div', 'pv-trial');
    cp.append(el('div', 'k', 'Trial'), el('p', undefined, esc(b.checkpoint)));
    box.append(cp);
  }
  if (b?.know_what?.length) {
    const head = b.know_what.slice(0, 3);
    const more = b.know_what.length - head.length;
    const s = el('div', 'pv-sec');
    s.append(el('h3', undefined, 'You must know'),
      el('ul', undefined,
        head.map((x) => `<li>${esc(x)}</li>`).join('') +
        (more > 0 ? `<li class="pv-more">… ${more} more in the tome</li>` : '')));
    box.append(s);
  }
  const doors = el('div', 'pv-sec');
  doors.append(el('h3', undefined, 'Builds on'));
  const bo = el('div', 'chipline');
  n.prereqs.forEach((p) => bo.append(previewChip(p)));
  n.soft_prereqs.forEach((p) => bo.append(previewChip(p, true)));
  if (!n.prereqs.length && !n.soft_prereqs.length) bo.append(el('span', 'pv-hint', '— a starting point'));
  doors.append(bo, el('h3', undefined, 'Unlocks'));
  const un = el('div', 'chipline');
  const outs = G.outgoing(n.id).map((e) => e.to);
  outs.forEach((t) => un.append(previewChip(t)));
  if (!outs.length) un.append(el('span', 'pv-hint', '— nothing yet'));
  doors.append(un);
  box.append(doors);
  if (n.hasBody) {
    box.append(navA('pv-open', 'Open the tome →', { node: n.id }));
  } else {
    box.append(el('p', 'pv-hint', 'Forthcoming — the tome for this skill has not been written yet. Its place on the map (tier, hours, prereqs) is real.'));
  }
  return box;
}

/** Same-cluster chip selects on the board; cross-cluster chip travels there. */
function previewChip(id: string, soft = false): HTMLElement {
  const r = G.byId.get(id)!;
  const cross = r.cluster !== state.cluster;
  const cls = `nchip${soft ? ' softc' : ''}${r.hasBody ? '' : ' pendc'}`;
  const html = `${esc(r.label)}${cross ? ` <span class="xc">· ${esc(cname(r.cluster))}</span>` : ''}`;
  const chip = cross
    ? navA(cls, html, { cluster: r.cluster, sel: id }, () => { state.flash = id; })
    : navA(cls, html, { sel: id });
  if (!r.hasBody) chip.title = 'tome forthcoming';
  return chip;
}

/* ---------------------------------------------------- altitude 3: reading */

function renderNode(id: string): void {
  const n = G.byId.get(id)!;
  const b = BODY.get(id);
  app.append(crumbs(
    { text: G.domain, to: { cluster: null, node: null } },
    { text: cname(n.cluster), to: { cluster: n.cluster, node: null, sel: n.id } },
    { text: n.label },
  ));

  const read = el('div', 'read');
  const page = el('div', 'page');
  page.append(
    el('h2', undefined, `${esc(n.label)}${n.spine ? ' ★' : ''}`),
    el('p', 'sub', `Tier ${n.tier} · ${esc(cname(n.cluster))} · ${n.hours} h${n.spine ? ' · main quest' : ''}`),
  );
  if (n.one_line) page.append(el('p', 'one-line', esc(n.one_line)));

  if (b) {
    if (b.checkpoint) {
      const cp = el('div', 'checkpoint');
      cp.append(el('div', 'k', 'Trial · pass or fail'), el('p', undefined, esc(b.checkpoint)));
      page.append(cp);
    }
    const list = (title: string, items?: string[]) => {
      if (!items?.length) return;
      const s = el('div', 'sec');
      s.append(el('h3', undefined, title), el('ul', undefined, items.map((x) => `<li>${esc(x)}</li>`).join('')));
      page.append(s);
    };
    list('What you must know', b.know_what);
    list('What you must do', b.know_how);
    list('Habits to build', b.habits);
    if (b.common_failure) {
      const s = el('div', 'sec');
      s.append(el('h3', undefined, '⚠ Where travelers fall'),
        el('ul', undefined, b.common_failure.split(/;\s*/).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')));
      page.append(s);
    }
    if (b.know_why && typeof b.know_why === 'object') {
      const s = el('div', 'sec');
      s.append(el('h3', undefined, 'The dispute'));
      const kw = el('div', 'kw');
      kw.append(
        el('div', 'claim',
          `<div class="side">The claim</div>${esc(b.know_why.claim)}` +
          (b.know_why.because ? `<br><small><b>Because:</b> ${esc(b.know_why.because)}</small>` : '')),
        el('div', 'dispute', `<div class="side">The counter</div>${esc(b.know_why.disputed_by)}`),
      );
      s.append(kw);
      if (b.know_why.source) s.append(el('div', 'kw-source', `Debate sourced from: ${esc(b.know_why.source)}`));
      page.append(s);
    }
    const sw = b.school_weights ?? {};
    if (Object.keys(sw).length) {
      const s = el('div', 'sec');
      s.append(el('h3', undefined, 'Schools of thought'));
      const chips = el('div', 'swchips');
      for (const [sid, w] of Object.entries(sw)) {
        const name = G.schools.find((x) => x.id === sid)?.name ?? sid;
        chips.append(el('span', `swchip v-${esc(w)}`, `${esc(name)} · ${esc(w)}`));
      }
      s.append(chips);
      page.append(s);
    }
    if (b.sources?.length) {
      const d = el('details', 'sec');
      d.append(el('summary', undefined, 'Sources'),
        el('ol', undefined, b.sources.map((x) => `<li>${esc(x)}</li>`).join('')));
      page.append(d);
    }
  } else {
    page.append(el('div', 'pendnote',
      'Forthcoming — this skill is on the map (tier, hours, position are real) but its tome has not been written yet.'));
  }

  // location rail — where you are, and the doors out
  const rail = el('div', 'rail');
  const here = el('div', 'box');
  here.append(el('h3', undefined, `In ${esc(cname(n.cluster))}`));
  const ns = clusterNodes(n.cluster);
  for (const t of [...new Set(ns.map((x) => x.tier))].sort((a, b) => a - b)) {
    here.append(el('div', 'trlabel', `Tier ${t}`));
    for (const s of ns.filter((x) => x.tier === t)) {
      const row = navA(`sib${s.id === id ? ' current' : ''}`, '', { node: s.id });
      row.append(
        el('span', `mini${s.spine ? ' gold' : s.hasBody ? ' lit' : ''}`),
        el('span', undefined, esc(s.label)),
      );
      here.append(row);
    }
  }
  rail.append(here);

  const doors = el('div', 'box');
  doors.append(el('h3', undefined, 'Builds on'));
  const bo = el('div', 'chipline');
  n.prereqs.forEach((p) => bo.append(nodeChip(p)));
  n.soft_prereqs.forEach((p) => bo.append(nodeChip(p, true)));
  if (!n.prereqs.length && !n.soft_prereqs.length) bo.append(el('span', 'pv-hint', '— a starting point'));
  doors.append(bo, el('h3', undefined, 'Unlocks'));
  const un = el('div', 'chipline');
  const outs = G.outgoing(id).map((e) => e.to);
  outs.forEach((t) => un.append(nodeChip(t)));
  if (!outs.length) un.append(el('span', 'pv-hint', '— nothing yet'));
  doors.append(un);
  rail.append(doors);

  read.append(page, rail);
  app.append(read);
}

function nodeChip(id: string, soft = false): HTMLElement {
  const r = G.byId.get(id)!;
  const cross = r.cluster !== state.cluster;
  const cls = `nchip${soft ? ' softc' : ''}${r.hasBody ? '' : ' pendc'}`;
  const chip = navA(cls,
    `${esc(r.label)}${cross ? ` <span class="xc">· ${esc(cname(r.cluster))}</span>` : ''}`,
    { node: id });
  if (!r.hasBody) chip.title = 'tome forthcoming';
  return chip;
}

/* ---------------------------------------------------------------- render */

function render(): void {
  app.innerHTML = '';
  if (state.node) renderNode(state.node);
  else if (state.cluster) renderBoard(state.cluster);
  else renderOverview();
}

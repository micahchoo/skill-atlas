/**
 * tree-client.ts — the domain page at three altitudes (zero framework).
 *
 * Semantic zoom in the Arcanum skin (issues/011): the overview shows the main
 * quest as a route plus the disciplines; a discipline opens as a bottom-up
 * talent board with an inspector; a skill opens as a full reading page.
 * Text renders at readable size or not at all: you descend to see more.
 *
 * Rendering contract: an ALTITUDE change rebuilds the page (inside a view
 * transition when the browser and the reader allow it); a change WITHIN an
 * altitude (selection, lens) patches the DOM in place, so focus, scroll and
 * the drawn edges all survive the click.
 *
 * URL contract (ticket 004, extended): one URLSearchParams so ?cluster= /
 * ?node= / ?sel= / ?school= compose by construction; unknown ids drop
 * leniently. Every navigational control is a real <a href>; descents push
 * history (Back ascends); popstate re-renders from the URL.
 */
import { buildGraph, type SkillGraph, type Edge } from '../lib/graph';
import type { BodyNode, DomainData, MergedNode, SchoolWeight } from '../lib/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_FALLBACK = '✦';
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

/** What is mounted right now: 'overview' | 'board:<cid>' | 'node:<id>'. */
let mounted = '';
/** The patch each navigational anchor applies, so hrefs can be refreshed after an in-place patch. */
const PATCHES = new WeakMap<HTMLAnchorElement, Partial<State>>();

/* ------------------------------------------------------------ traveler log */

const LS_PREFIX = 'atlas.read.';
let READ: Set<string> = new Set();
function readLog(): string[] {
  try {
    const raw = localStorage.getItem(LS_PREFIX + G.domain);
    if (!raw) return [];
    const a = JSON.parse(raw) as unknown;
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function recordRead(id: string): void {
  if (!BODY.get(id)) return;
  try {
    const a = readLog().filter((x) => x !== id);
    a.push(id);
    localStorage.setItem(LS_PREFIX + G.domain, JSON.stringify(a));
  } catch {
    /* private browsing: the record simply does not persist */
  }
}

/* ------------------------------------------------------------------ URL */

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

function hrefFor(patch: Partial<State>): string {
  const s = { ...state, ...patch };
  if (s.node) s.cluster = G.byId.get(s.node)!.cluster;
  if (s.sel && G.byId.get(s.sel)?.cluster !== s.cluster) s.sel = null;
  return writeParams(new URLSearchParams(params), s);
}

export function initAtlas(): void {
  const dataEl = document.getElementById('domain-data');
  if (!dataEl) throw new Error('missing embedded domain data');
  const data = JSON.parse(dataEl.textContent ?? '{}') as DomainData;
  G = buildGraph(data);
  BODY = new Map(Object.entries(data.bodies));
  app = document.getElementById('app') as HTMLElement;

  readState();
  history.replaceState(null, '', writeParams(params, state));
  window.addEventListener('popstate', () => {
    params = new URLSearchParams(window.location.search);
    state.flash = null;
    readState();
    render(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.node) go({ node: null, sel: state.node });
    else if (state.sel) go({ sel: null });
    else if (state.cluster) go({ cluster: null });
  });
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => redrawEdges());
  });
  document.fonts?.ready.then(() => redrawEdges());
  render(false);
}

function go(patch: Partial<State>): void {
  Object.assign(state, patch);
  if (state.node) state.cluster = G.byId.get(state.node)!.cluster;
  if (state.sel && G.byId.get(state.sel)?.cluster !== state.cluster) state.sel = null;
  const url = writeParams(params, state);
  if (url !== `${window.location.pathname}${window.location.search}`) history.pushState(null, '', url);
  render(true);
}

/* -------------------------------------------------------------- helpers */

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
const humanize = (slug: string): string => slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const vt = (prefix: string, id: string): string => `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
const clusterNodes = (cid: string): MergedNode[] => G.nodes.filter((n) => n.cluster === cid);
const hours = (h: number): string => `${h} h`;

function leadHtml(x: string): string {
  const i = x.indexOf('—');
  if (i <= 0) return `<li>${esc(x)}</li>`;
  return `<li><b>${esc(x.slice(0, i).trim())}</b> ${esc(x.slice(i).trim())}</li>`;
}

/** Navigational anchor: real href for middle-click, share and keyboard; SPA go() on plain click. */
function navA(cls: string | undefined, html: string, patch: Partial<State>, before?: () => void): HTMLAnchorElement {
  const a = document.createElement('a');
  if (cls) a.className = cls;
  a.innerHTML = html;
  a.href = hrefFor(patch);
  PATCHES.set(a, patch);
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
    e.preventDefault();
    before?.();
    go(patch);
  });
  return a;
}
function refreshHrefs(root: ParentNode): void {
  for (const a of root.querySelectorAll('a')) {
    const p = PATCHES.get(a);
    if (p) a.href = hrefFor(p);
  }
}

function crumbs(...parts: { text: string; to?: Partial<State>; href?: string }[]): HTMLElement {
  const c = el('nav', 'crumbs');
  c.setAttribute('aria-label', 'Where you are');
  parts.forEach((p, i) => {
    if (i) c.append(el('span', 'sep'));
    if (p.href) {
      const a = el('a', undefined, esc(p.text)) as HTMLAnchorElement;
      a.href = p.href;
      c.append(a);
    } else if (p.to !== undefined) c.append(navA(undefined, esc(p.text), p.to));
    else c.append(el('span', 'here', esc(p.text)));
  });
  return c;
}

/** The first unopened stop on the main quest, or null when every stop is opened. */
function nextQuestStop(): MergedNode | null {
  for (const id of G.spine) if (!READ.has(id)) return G.byId.get(id) ?? null;
  return null;
}
/** Where to go after a tome: the next quest stop, else the first skill it unlocks. */
function onwardFrom(n: MergedNode): MergedNode | null {
  const i = G.spine.indexOf(n.id);
  if (i >= 0 && i + 1 < G.spine.length) return G.byId.get(G.spine[i + 1]) ?? null;
  const out = G.outgoing(n.id).map((e) => G.byId.get(e.to)).filter((x): x is MergedNode => !!x);
  return out.find((x) => x.cluster === n.cluster) ?? out[0] ?? null;
}

/* ----------------------------------------------------------- altitude 1 */

function renderOverview(): void {
  const c = el('nav', 'crumbs');
  c.setAttribute('aria-label', 'Where you are');
  c.innerHTML = `<a href="${ROOT}">Skill Atlas</a><span class="sep"></span><span class="here">${esc(humanize(G.domain))}</span>`;
  const h1 = el('h1', undefined, esc(humanize(G.domain)));
  h1.tabIndex = -1;
  app.append(
    c,
    h1,
    el('p', 'lede', `For a ${esc(G.level)}. ${G.clusters.length} disciplines, ${G.nodes.length} skills.`),
  );

  // the main quest: the authored route across disciplines, lit as far as you have read
  if (G.spine.length) {
    const q = el('section', 'questpanel panel enter');
    q.setAttribute('aria-labelledby', 'quest-h');
    const head = el('div', 'quest-head');
    const h2 = el('h2', undefined, 'The main quest');
    h2.id = 'quest-h';
    const opened = G.spine.filter((id) => READ.has(id)).length;
    const total = G.spine.reduce((a, id) => a + (G.byId.get(id)?.hours ?? 0), 0);
    head.append(h2, el('span', 'meta num', `${G.spine.length} stops, ${hours(total)}${opened ? `, <b>${opened}</b> opened` : ''}`));
    q.append(head);
    const route = el('div', 'route');
    const next = nextQuestStop();
    G.spine.forEach((id, i) => {
      const n = G.byId.get(id);
      if (!n) return;
      const cls = `stop${READ.has(id) ? ' lit' : ''}${next?.id === id ? ' next' : ''}`;
      const a = navA(cls, '', { node: id });
      a.append(
        el('span', 'stop-k', `${next?.id === id ? 'Next: ' : ''}${esc(cname(n.cluster))}`),
        el('span', 'stop-name', esc(n.label)),
      );
      a.style.setProperty('--i', String(i));
      route.append(a);
    });
    q.append(route);
    const foot = el('div', 'quest-foot');
    if (next) {
      foot.append(navA('btn', opened ? `Resume at ${esc(next.label)}` : 'Take up the main quest', { node: next.id }));
    } else {
      foot.append(el('span', 'meta', 'Every stop on the quest is opened. The side paths remain.'));
    }
    if (READ.size) foot.append(el('span', 'meta num', `You have opened <b>${READ.size}</b> of ${G.nodes.length} tomes.`));
    q.append(foot);
    app.append(q);
  }

  const questStart = G.byId.get(G.spine[0])?.cluster;
  const grid = el('div', 'disciplines');
  const ordered = [...G.clusters].sort((a, b) => Number(b.id === questStart) - Number(a.id === questStart));
  ordered.forEach((cl, i) => {
    const ns = clusterNodes(cl.id);
    const written = ns.filter((n) => n.hasBody).length;
    const opened = ns.filter((n) => READ.has(n.id)).length;
    const onQuest = ns.filter((n) => n.spine).length;
    const lead = cl.id === questStart;
    const d = navA(`discipline panel enter${lead ? ' lead' : ''}`, '', { cluster: cl.id });
    d.style.setProperty('--i', String(i + 1));
    const em = el('div', 'emblem', esc(icon(cl.id)));
    em.setAttribute('aria-hidden', 'true');
    em.style.viewTransitionName = vt('emblem', cl.id);
    const facts = written < ns.length
      ? `<b>${written}</b> of ${ns.length} tomes written${onQuest ? `, ${onQuest} on the quest` : ''}`
      : `<b>${ns.length}</b> tomes${onQuest ? `, ${onQuest} on the quest` : ''}`;
    const foot = el('div', 'dfoot');
    foot.append(el('span', 'meta num', facts));
    if (opened) {
      const bar = el('div', 'bar', '<i></i>');
      bar.style.setProperty('--w', `${Math.round((opened / ns.length) * 100)}%`);
      bar.title = `${opened} of ${ns.length} opened`;
      foot.append(bar, el('span', 'meta num', `${opened} opened`));
    }
    d.append(em, el('div', 'dname display', esc(cl.name)), el('p', 'dgist', esc(cl.gist)), foot);
    if (lead) d.append(el('span', 'questmark plaque', 'Quest begins'));
    grid.append(d);
  });
  app.append(grid);
}

/* ----------------------------------------------------------- altitude 2 */

function externalEdges(cid: string): { incoming: Edge[]; outgoing: Edge[]; softIn: Edge[]; softOut: Edge[] } {
  const inC = (id: string) => G.byId.get(id)?.cluster === cid;
  return {
    incoming: G.hardEdges.filter((e) => !inC(e.from) && inC(e.to)),
    outgoing: G.hardEdges.filter((e) => inC(e.from) && !inC(e.to)),
    softIn: G.softEdges.filter((e) => !inC(e.from) && inC(e.to)),
    softOut: G.softEdges.filter((e) => inC(e.from) && !inC(e.to)),
  };
}

function skillClasses(n: MergedNode): string {
  let cls = 'skill';
  if (n.spine) cls += ' spine';
  if (!n.hasBody) cls += ' pending';
  if (READ.has(n.id)) cls += ' read';
  if (state.sel === n.id) cls += ' selected';
  if (state.school) {
    const w: SchoolWeight | undefined = n.school_weights[state.school];
    if (w && w !== 'normal') cls += ` lens-${w}`;
  }
  return cls;
}

function renderBoard(cid: string): void {
  const meta = G.clusterMeta.get(cid)!;
  const ns = clusterNodes(cid);

  app.append(crumbs({ text: humanize(G.domain), to: { cluster: null, node: null, sel: null } }, { text: meta.name }));
  const head = el('div', 'board-head');
  const em = el('div', 'emblem lg', esc(icon(cid)));
  em.setAttribute('aria-hidden', 'true');
  em.style.viewTransitionName = vt('emblem', cid);
  const titles = el('div');
  const h1 = el('h1', undefined, esc(meta.name));
  h1.tabIndex = -1;
  titles.append(h1, el('p', 'lede', esc(meta.gist)));
  head.append(em, titles);
  app.append(head);

  renderLens(cid);

  const arc = el('div', 'arc');
  const board = el('section', 'board well');
  board.setAttribute('aria-label', `${meta.name} talent board`);
  const scroll = el('div', 'board-scroll');
  const inner = el('div', 'board-inner');
  const tiers = [...new Set(ns.map((n) => n.tier))].sort((a, b) => b - a); // top row = highest tier
  tiers.forEach((t, ti) => {
    const row = el('div', 'tier');
    row.append(el('span', 'tier-k plaque', `Tier ${t}`));
    const body = el('div', 'tier-body');
    for (const n of ns.filter((x) => x.tier === t)) {
      const cell = el('div', skillClasses(n));
      cell.dataset.id = n.id;
      const link = navA('skill-link', '', { sel: n.id });
      const gem = el('div', 'gem');
      gem.setAttribute('aria-hidden', 'true');
      const name = el('div', 'skill-name', esc(n.label));
      link.append(gem, name, el('div', 'skill-meta', n.hasBody ? hours(n.hours) : `${hours(n.hours)}, forthcoming`));
      if (state.sel === n.id) name.style.viewTransitionName = 'vt-node';
      cell.append(link);
      if (state.flash === n.id) {
        cell.classList.add('flash');
        state.flash = null;
      }
      body.append(cell);
    }
    row.append(body);
    row.style.setProperty('--i', String(ti));
    inner.append(row);
  });
  scroll.append(inner);
  board.append(scroll, legendRow(cid));
  arc.append(board, renderInspector(cid));
  app.append(arc);
  attachDoors(cid, inner);
  redrawEdges();
}

function renderLens(cid: string): void {
  if (!G.schools.length) return;
  const row = el('div', 'lens');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'School lens');
  row.append(el('span', 'plaque', 'School lens'));
  for (const s of G.schools) {
    const chip = el('button', 'chip schoolchip') as HTMLButtonElement;
    chip.type = 'button';
    chip.dataset.school = s.id;
    chip.title = `Prizes ${s.optimises_for}. Gives up ${s.gives_up}.`;
    chip.addEventListener('click', () => go({ school: s.id === state.school ? null : s.id }));
    row.append(chip);
  }
  app.append(row, el('p', 'lensline'));
  patchLens(cid);
}

/** Chip state and the lens line, from state; safe to call on a mounted board. */
function patchLens(cid: string): void {
  const active = state.school ? G.schools.find((s) => s.id === state.school) : null;
  for (const chip of app.querySelectorAll<HTMLButtonElement>('.schoolchip')) {
    const s = G.schools.find((x) => x.id === chip.dataset.school)!;
    const count = clusterNodes(cid).filter((n) => {
      const w = n.school_weights[s.id];
      return w && w !== 'normal';
    }).length;
    const enemy = s.id !== state.school && !!active?.quarrels_with?.includes(s.id);
    chip.setAttribute('aria-pressed', String(s.id === state.school));
    chip.classList.toggle('enemy', enemy);
    chip.innerHTML = `${esc(s.name)} <span class="dim num">${count}</span>`;
  }
  const line = app.querySelector('.lensline')!;
  if (active) {
    const qw = (active.quarrels_with ?? []).map((id) => G.schools.find((s) => s.id === id)?.name ?? id).join(', ');
    line.innerHTML =
      `<b>${esc(active.name)}</b> prizes ${esc(active.optimises_for)}. It gives up ${esc(active.gives_up)}.` +
      (qw ? ` It quarrels with <span class="qw">${esc(qw)}</span>.` : '');
  } else {
    line.textContent = 'No lens. The board as authored. Pick a school to see what it prizes and rejects.';
  }
}

function legendRow(cid: string): HTMLElement {
  const l = el('div', 'legend');
  l.setAttribute('aria-label', 'How to read the board');
  const item = (sw: string, label: string) => {
    const it = el('span', 'lg');
    it.append(el('span', `sw ${sw}`), el('span', undefined, label));
    l.append(it);
  };
  const ns = clusterNodes(cid);
  const spineLegs = G.spinePath.some((e) => G.byId.get(e.from)?.cluster === cid && G.byId.get(e.to)?.cluster === cid);
  if (spineLegs) item('sw-spine', 'main quest');
  item('sw-hard', 'requires');
  if (G.softEdges.some((e) => G.byId.get(e.to)?.cluster === cid)) item('sw-soft', 'helps');
  item('sw-read', 'tome opened');
  if (ns.some((n) => n.spine)) item('sw-quest', 'quest stop opened');
  if (ns.some((n) => !n.hasBody)) {
    const it = el('span', 'lg');
    it.append(el('span', undefined, '✎'), el('span', undefined, 'tome forthcoming'));
    l.append(it);
  }
  return l;
}

/** Cross-discipline prereqs as travel chips under the touched skill. */
function attachDoors(cid: string, inner: HTMLElement): void {
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
    const row = el('div', 'doors');
    for (const { rid, dir } of doors) {
      const r = G.byId.get(rid)!;
      const chip = navA('chip door', `${dir === 'in' ? '←' : '→'} ${esc(r.label)}`,
        { cluster: r.cluster, node: null, sel: rid },
        () => { state.flash = rid; });
      chip.title = `Travel to ${cname(r.cluster)}`;
      chip.setAttribute('aria-label', `${r.label}, in ${cname(r.cluster)}`);
      row.append(chip);
    }
    inner.querySelector<HTMLElement>(`.skill[data-id="${CSS.escape(local)}"]`)?.append(row);
  }
}

/** Edges between gem centres; bottom-up flow (prereq below dependent). Cheap enough to rerun on resize. */
function redrawEdges(): void {
  const inner = app.querySelector<HTMLElement>('.board-inner');
  if (!inner || !state.cluster) return;
  inner.querySelector(':scope > .tiermap')?.remove();
  const cid = state.cluster;
  const inC = (id: string) => G.byId.get(id)?.cluster === cid;
  const gemOf = (id: string) => inner.querySelector<HTMLElement>(`.skill[data-id="${CSS.escape(id)}"] .gem`);
  const spineLegs = new Set(G.spinePath.map((e) => `${e.from}>${e.to}`));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tiermap');
  svg.setAttribute('aria-hidden', 'true');
  const cr = inner.getBoundingClientRect();
  svg.setAttribute('width', String(inner.scrollWidth));
  svg.setAttribute('height', String(inner.scrollHeight));
  const path = (e: Edge, cls: string) => {
    const a = gemOf(e.from);
    const b = gemOf(e.to);
    if (!a || !b) return;
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const x1 = ar.left + ar.width / 2 - cr.left;
    const y1 = ar.top - cr.top;
    const x2 = br.left + br.width / 2 - cr.left;
    const y2 = br.bottom - cr.top;
    const my = (y1 + y2) / 2;
    const d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
    for (const c of cls.split(' ')) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', c);
      svg.append(p);
    }
  };
  for (const e of G.softEdges) if (inC(e.from) && inC(e.to)) path(e, 'e-soft');
  for (const e of G.hardEdges) if (inC(e.from) && inC(e.to) && !spineLegs.has(`${e.from}>${e.to}`)) path(e, 'e-hard');
  for (const e of G.hardEdges) if (inC(e.from) && inC(e.to) && spineLegs.has(`${e.from}>${e.to}`)) path(e, 'e-spine-glow e-spine');
  inner.prepend(svg);
}

function renderInspector(cid: string): HTMLElement {
  const box = el('aside', 'inspect panel');
  box.setAttribute('aria-label', 'Inspector');
  fillInspector(box, cid);
  return box;
}

function fillInspector(box: HTMLElement, cid: string): void {
  box.innerHTML = '';
  const scroll = el('div', 'inspect-scroll');
  const n = state.sel ? G.byId.get(state.sel) : null;
  if (!n) {
    const ns = clusterNodes(cid);
    const opened = ns.filter((x) => READ.has(x.id)).length;
    const start = ns.find((x) => x.spine && x.tier === Math.min(...ns.map((y) => y.tier)))
      ?? ns.filter((x) => x.hasBody).sort((a, b) => a.tier - b.tier)[0];
    scroll.append(
      el('div', 'kicker plaque', 'Inspect'),
      el('h2', undefined, esc(cname(cid))),
      el('p', 'meta num', `${ns.length} skills${opened ? `, <b>${opened}</b> opened` : ''}`),
      el('p', 'hint', 'Select a skill on the board to see its trial and what it asks of you.'),
    );
    if (start) {
      const s = el('div', 'start');
      s.append(navA('btn quiet', `Start at ${esc(start.label)}`, { sel: start.id }));
      scroll.append(s);
    }
    box.append(scroll);
    return;
  }
  const b = BODY.get(n.id);
  scroll.append(
    el('div', `kicker plaque${n.spine ? ' is-quest' : ''}`, n.spine ? 'Main quest' : 'Skill'),
    el('h2', undefined, esc(n.label)),
    el('p', 'meta num', `Tier ${n.tier}, ${hours(n.hours)}${n.hasBody ? '' : ', tome forthcoming'}`),
  );
  if (n.one_line) scroll.append(el('p', 'epigraph', esc(n.one_line)));
  if (b?.checkpoint) {
    const cp = el('div', 'trial');
    cp.append(el('div', 'plaque', 'Trial'), el('p', undefined, esc(b.checkpoint)));
    scroll.append(cp);
  }
  if (b?.know_what?.length) {
    const head = b.know_what.slice(0, 3);
    const more = b.know_what.length - head.length;
    const s = el('div', 'sec');
    s.append(el('h3', undefined, 'You must know'),
      el('ul', undefined, head.map(leadHtml).join('') + (more > 0 ? `<li class="more">and ${more} more in the tome</li>` : '')));
    scroll.append(s);
  }
  scroll.append(linksSection(n, 'board'));
  box.append(scroll);
  const foot = el('div', 'inspect-foot');
  if (n.hasBody) foot.append(navA('btn block', 'Open the tome', { node: n.id }));
  else foot.append(el('p', 'note', 'The tome for this skill is not written yet. Its place on the map is real.'));
  box.append(foot);
}

/** Builds on / Unlocks chips. On the board a same-discipline chip selects; a far chip travels. */
function linksSection(n: MergedNode, where: 'board' | 'page'): HTMLElement {
  const wrap = el('div', 'sec');
  const chipFor = (id: string, soft = false): HTMLElement => {
    const r = G.byId.get(id)!;
    const cross = r.cluster !== n.cluster;
    const cls = `chip${soft ? ' soft' : ''}${r.hasBody ? '' : ' pending'}`;
    const html = `${esc(r.label)}${cross ? ` <span class="dim">${esc(cname(r.cluster))}</span>` : ''}`;
    const patch: Partial<State> = where === 'page'
      ? { node: id }
      : cross ? { cluster: r.cluster, sel: id } : { sel: id };
    const chip = navA(cls, html, patch, cross && where === 'board' ? () => { state.flash = id; } : undefined);
    if (!r.hasBody) chip.title = 'tome forthcoming';
    return chip;
  };
  wrap.append(el('h3', undefined, 'Builds on'));
  const bo = el('div', 'chipline');
  n.prereqs.forEach((p) => bo.append(chipFor(p)));
  n.soft_prereqs.forEach((p) => bo.append(chipFor(p, true)));
  if (!n.prereqs.length && !n.soft_prereqs.length) bo.append(el('span', 'meta', 'A starting point.'));
  wrap.append(bo);
  if (n.soft_prereqs.length) wrap.append(el('p', 'note', 'Dashed: helpful context, not a hard gate.'));
  const h = el('h3', undefined, 'Unlocks');
  h.style.marginTop = '14px';
  wrap.append(h);
  const un = el('div', 'chipline');
  const outs = G.outgoing(n.id).map((e) => e.to);
  outs.forEach((t) => un.append(chipFor(t)));
  if (!outs.length) un.append(el('span', 'meta', 'Nothing yet.'));
  wrap.append(un);
  return wrap;
}

/** Selection and lens changed on a mounted board: touch only what changed. */
function patchBoard(cid: string): void {
  for (const cell of app.querySelectorAll<HTMLElement>('.skill')) {
    const n = G.byId.get(cell.dataset.id!)!;
    const flash = cell.classList.contains('flash');
    cell.className = skillClasses(n) + (flash ? ' flash' : '');
    const name = cell.querySelector<HTMLElement>('.skill-name')!;
    name.style.viewTransitionName = state.sel === n.id ? 'vt-node' : '';
  }
  patchLens(cid);
  const box = app.querySelector<HTMLElement>('.inspect')!;
  fillInspector(box, cid);
  refreshHrefs(app);
}

/* ----------------------------------------------------------- altitude 3 */

function renderNode(id: string): void {
  const n = G.byId.get(id)!;
  const b = BODY.get(id);
  if (n.hasBody) recordRead(id);
  READ = new Set(readLog());

  app.append(crumbs(
    { text: humanize(G.domain), to: { cluster: null, node: null, sel: null } },
    { text: cname(n.cluster), to: { cluster: n.cluster, node: null, sel: n.id } },
    { text: n.label },
  ));

  const read = el('div', 'read');
  const page = el('article', 'page');
  page.append(el('div', `kicker plaque${n.spine ? ' is-quest' : ''}`, n.spine ? 'Main quest' : 'Skill'));
  const h1 = el('h1', undefined, esc(n.label));
  h1.tabIndex = -1;
  h1.style.viewTransitionName = 'vt-node';
  page.append(h1, el('p', 'meta num', `Tier ${n.tier} in ${esc(cname(n.cluster))}, ${hours(n.hours)}`));
  if (n.one_line) page.append(el('p', 'epigraph', esc(n.one_line)));
  if (b?.checkpoint) {
    const jump = document.createElement('a');
    jump.className = 'totrial';
    jump.textContent = 'Skip to the trial';
    jump.href = '#trial';
    jump.addEventListener('click', (e) => {
      e.preventDefault();
      const t = document.getElementById('trial');
      t?.scrollIntoView({ block: 'start' });
      t?.focus();
    });
    page.append(jump);
  }

  if (b) {
    if (b.checkpoint) {
      const cp = el('div', 'trial');
      cp.id = 'trial';
      cp.tabIndex = -1;
      cp.append(el('div', 'plaque', 'Trial, pass or fail'), el('p', undefined, esc(b.checkpoint)));
      page.append(cp);
    }
    const list = (title: string, items?: string[], lead = false) => {
      if (!items?.length) return;
      const s = el('section', 'sec');
      s.append(el('h3', undefined, title),
        el('ul', undefined, items.map((x) => (lead ? leadHtml(x) : `<li>${esc(x)}</li>`)).join('')));
      page.append(s);
    };
    list('What you must know', b.know_what, true);
    list('What you must do', b.know_how);
    list('Habits to build', b.habits);
    if (b.common_failure) {
      const s = el('section', 'sec');
      s.append(el('h3', undefined, 'Where travelers fall'),
        el('ul', undefined, b.common_failure.split(/;\s*/).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')));
      page.append(s);
    }
    if (b.know_why && typeof b.know_why === 'object') {
      const s = el('section', 'sec');
      s.append(el('h3', undefined, 'The dispute'));
      const kw = el('div', 'dispute');
      kw.append(
        el('div', 'claim',
          `<div class="side plaque">The claim</div>${esc(b.know_why.claim)}` +
          (b.know_why.because ? `<small><b>Because</b> ${esc(b.know_why.because)}</small>` : '')),
        el('div', 'counter', `<div class="side plaque">The counter</div>${esc(b.know_why.disputed_by)}`),
      );
      s.append(kw);
      if (b.know_why.source) s.append(el('p', 'source', `Debate sourced from ${esc(b.know_why.source)}`));
      page.append(s);
    }
    const sw = b.school_weights ?? {};
    if (Object.keys(sw).length) {
      const s = el('section', 'sec');
      s.append(el('h3', undefined, 'Schools of thought'));
      const chips = el('div', 'chipline');
      for (const [sid, w] of Object.entries(sw)) {
        const name = G.schools.find((x) => x.id === sid)?.name ?? sid;
        chips.append(el('span', `chip swchip v-${esc(w)}`, `${esc(name)} <span class="dim">${esc(w)}</span>`));
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
      'This skill is on the map, with a real tier, hours and prerequisites, but its tome is not written yet.'));
  }

  // onward: the quest continues, or the board waits
  const onward = el('nav', 'onward');
  onward.setAttribute('aria-label', 'Onward');
  const next = onwardFrom(n);
  if (next) {
    onward.append(el('span', 'plaque', next.spine && n.spine ? 'Next on the quest' : 'Next'));
    onward.append(navA('btn', esc(next.label), { node: next.id }));
  }
  onward.append(navA('btn quiet', `Back to ${esc(cname(n.cluster))}`, { node: null, sel: n.id }));
  page.append(onward);

  // rail: where you are, and the doors out
  const rail = el('aside', 'rail');
  rail.setAttribute('aria-label', 'Your position');
  const here = el('div', 'box panel');
  here.append(el('h3', undefined, `In ${esc(cname(n.cluster))}`));
  const ns = clusterNodes(n.cluster);
  for (const t of [...new Set(ns.map((x) => x.tier))].sort((a, b) => a - b)) {
    here.append(el('div', 'plaque', `Tier ${t}`));
    for (const s of ns.filter((x) => x.tier === t)) {
      const row = navA('sib', '', { node: s.id });
      if (s.id === id) row.setAttribute('aria-current', 'page');
      row.append(
        el('span', `dot${s.spine ? ' is-quest' : ''}${READ.has(s.id) ? ' read' : ''}`),
        el('span', undefined, esc(s.label)),
      );
      here.append(row);
    }
  }
  rail.append(here);
  const doors = el('div', 'box panel');
  doors.append(linksSection(n, 'page'));
  rail.append(doors);

  read.append(page, rail);
  app.append(read);
}

/* --------------------------------------------------------------- render */

function mount(): void {
  READ = new Set(readLog());
  app.innerHTML = '';
  if (state.node) renderNode(state.node);
  else if (state.cluster) renderBoard(state.cluster);
  else renderOverview();
}

/**
 * @param userNav true when a click or key caused this render: the new page
 * title takes focus so keyboard and screen-reader travelers land somewhere.
 */
function render(userNav: boolean): void {
  const key = state.node ? `node:${state.node}` : state.cluster ? `board:${state.cluster}` : 'overview';
  if (key === mounted && state.cluster && !state.node) {
    patchBoard(state.cluster);
    return;
  }
  const wasMounted = mounted !== '';
  mounted = key;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settle = () => {
    if (userNav) app.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    if (wasMounted) window.scrollTo({ top: 0 });
  };
  const vtDoc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (wasMounted && !reduce && vtDoc.startViewTransition) {
    vtDoc.startViewTransition(() => { mount(); settle(); });
  } else {
    mount();
    settle();
  }
}

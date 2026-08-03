/**
 * render.ts — SVG primitives + viewer chrome for the tree (client-side only).
 *
 * Re-implements the renderer prototype's decisions: tiered lanes, left-to-right
 * beziers, soft edges dashed default-on, spine as its own gold path layer,
 * label-on-node + hover tooltip, wheel zoom + drag pan + fit.
 */
import type { SkillGraph } from './graph';
import type { LaneLayout, Box } from './layout';
import { edgePath, spinePoints } from './layout';
import { clusterColor } from './palette';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
  parent: Element | null = null,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

export interface Viewer {
  svg: SVGSVGElement;
  world: SVGGElement;
  tooltip: HTMLDivElement;
  setView(k: number, tx: number, ty: number): void;
  zoomBy(f: number, cx: number, cy: number): void;
  fit(box: Box, pad?: number): void;
  clear(): void;
  getView(): { k: number; tx: number; ty: number };
  onZoom(cb: (k: number) => void): void;
}

/**
 * Create the svg + world group + tooltip overlay inside `container`.
 * Wheel zoom about cursor, drag pan (node elements drag nothing).
 */
export function setupViewer(container: HTMLElement): Viewer {
  const svg = el('svg', { class: 'viewer', tabindex: 0 });
  const defs = el('defs', {}, svg);
  el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs)
    .appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#8a93a6' }));
  el('marker', { id: 'arrow-soft', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs)
    .appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#a6adbb' }));
  const world = el('g', { id: 'world' }, svg);
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.hidden = true;
  container.appendChild(svg);
  container.appendChild(tooltip);

  const view = { k: 1, tx: 0, ty: 0 };
  const zoomCbs: ((k: number) => void)[] = [];

  function apply(): void {
    world.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.k})`);
    for (const cb of zoomCbs) cb(view.k);
  }
  function setView(k: number, tx: number, ty: number): void {
    view.k = Math.min(3, Math.max(0.08, k));
    view.tx = tx;
    view.ty = ty;
    apply();
  }
  function zoomBy(f: number, cx: number, cy: number): void {
    const k2 = Math.min(3, Math.max(0.08, view.k * f));
    const r = k2 / view.k;
    setView(k2, cx - (cx - view.tx) * r, cy - (cy - view.ty) * r);
  }
  function fit(box: Box, pad = 40): void {
    const vb = svg.getBoundingClientRect();
    const k = Math.min(3, Math.max(0.08, Math.min((vb.width - pad * 2) / box.w, (vb.height - pad * 2) / box.h)));
    setView(k, (vb.width - box.w * k) / 2 - box.x * k, (vb.height - box.h * k) / 2 - box.y * k);
  }
  function clear(): void {
    while (world.firstChild) world.removeChild(world.firstChild);
    tooltip.hidden = true;
  }

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  let dragging = false;
  let lx = 0;
  let ly = 0;
  svg.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('[data-id]')) return; // nodes drag nothing
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    setView(view.k, view.tx + (e.clientX - lx), view.ty + (e.clientY - ly));
    lx = e.clientX;
    ly = e.clientY;
  });
  svg.addEventListener('pointerup', () => {
    dragging = false;
    svg.classList.remove('panning');
  });
  svg.addEventListener('pointercancel', () => {
    dragging = false;
    svg.classList.remove('panning');
  });

  return {
    svg,
    world,
    tooltip,
    setView,
    zoomBy,
    fit,
    clear,
    getView: () => ({ ...view }),
    onZoom(cb) {
      zoomCbs.push(cb);
    },
  };
}

export interface TreeDraw {
  nodeEls: SVGGElement[];
  hardEdgeEls: SVGPathElement[];
  box: Box;
}

export interface DrawOptions {
  showSoft: boolean;
  showSpine: boolean;
}

/**
 * Draw the whole tree: lane strips + labels, tier headers, hard edges,
 * optional soft edges, optional gold spine path, then nodes on top.
 * Node groups carry data-id; skeleton-only nodes get the `pending` class.
 */
export function drawTree(viewer: Viewer, graph: SkillGraph, layout: LaneLayout, opts: DrawOptions): TreeDraw {
  const { world } = viewer;
  const { width: W, height: H, pos, laneY, laneDepth } = layout;

  // lane strips + cluster labels
  for (const c of graph.clusters) {
    const ly = laneY.get(c.id)!;
    const col = clusterColor(graph.clusterOrder.get(c.id) ?? 0);
    el('rect', {
      x: 0,
      y: ly,
      width: W,
      height: laneDepth.get(c.id)! * (24 + 6) + 20,
      fill: col,
      'fill-opacity': 0.05,
      stroke: col,
      'stroke-opacity': 0.18,
      rx: 8,
      class: 'lane',
    }, world);
    el('text', { x: 8, y: ly + 15, fill: col, 'font-weight': 600, 'font-size': 10.5, 'text-anchor': 'start' }, world)
      .appendChild(document.createTextNode(c.name));
  }

  // tier headers
  for (const t of graph.tiers) {
    const cx = (t - 1) * 200 + 100;
    el('text', { x: cx, y: 14, fill: '#475569', 'font-size': 11, 'font-weight': 600, 'text-anchor': 'middle' }, world)
      .appendChild(document.createTextNode(`Tier ${t} · ${graph.tierNodes(t).length}`));
  }

  // hard edges
  const hardEdgeEls: SVGPathElement[] = [];
  for (const e of graph.hardEdges) {
    const d = edgePath(layout, e);
    if (!d) continue;
    hardEdgeEls.push(el('path', {
      d,
      class: 'edge hard',
      fill: 'none',
      'marker-end': 'url(#arrow)',
      'data-from': e.from,
      'data-to': e.to,
    }, world));
  }
  // soft edges: faint dashed layer, default on
  if (opts.showSoft) {
    for (const e of graph.softEdges) {
      const d = edgePath(layout, e);
      if (!d) continue;
      el('path', { d, class: 'edge soft', fill: 'none', 'marker-end': 'url(#arrow-soft)' }, world);
    }
  }
  // spine: its own gold path layer, never thicker edges
  if (opts.showSpine) {
    const pts = spinePoints(layout, graph.spine);
    if (pts.length >= 2) {
      const gold = el('g', { class: 'spine-layer' }, world);
      const poly = el('polyline', { class: 'spine-path', fill: 'none' }, gold);
      poly.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
    }
  }

  // nodes on top
  const nodeEls: SVGGElement[] = [];
  for (const n of graph.nodes) {
    const b = pos.get(n.id)!;
    const cls = [n.spine && opts.showSpine ? 'spine' : '', !n.hasBody ? 'pending' : ''].filter(Boolean).join(' ');
    const g = el('g', { class: `node ${cls}`.trim(), 'data-id': n.id }, world);
    el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 5 }, g);
    const text = el('text', { x: b.x + b.w / 2, y: b.y + b.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
    text.textContent = n.label;
    nodeEls.push(g);
  }

  return { nodeEls, hardEdgeEls, box: { x: 0, y: 0, w: W, h: H } };
}

/**
 * Hover tooltip (delegated): label + spine badge, tier/cluster/hours,
 * one_line, and school weights. When a lens is active the active school's
 * weight gets its own line; otherwise all recorded weights are listed.
 */
export function bindTooltip(viewer: Viewer, graph: SkillGraph, getActiveSchool: () => string | null): void {
  const esc = (s: unknown): string =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  viewer.svg.addEventListener('pointerover', (e) => {
    const g = (e.target as Element).closest('[data-id]') as SVGGElement | null;
    if (!g) return;
    const n = graph.byId.get(g.dataset.id!);
    if (!n) return;
    const schoolName = (id: string): string => graph.schools.find((s) => s.id === id)?.name ?? id;

    const parts = [
      `<b>${esc(n.label)}</b>${n.spine ? ' <span class="tip-spine">★ spine</span>' : ''}`,
      `Tier ${n.tier} · ${esc(graph.clusterMeta.get(n.cluster)?.name ?? n.cluster)} · ${n.hours} h${n.hasBody ? '' : ' · no body yet'}`,
      n.one_line ? `<div class="tip-line">${esc(n.one_line)}</div>` : '',
    ];

    const lens = getActiveSchool();
    if (lens) {
      const school = graph.schools.find((s) => s.id === lens);
      const w = n.school_weights[lens];
      if (w) parts.push(`<div class="tip-line tip-w ${w}">${esc(school?.name ?? lens)}: ${w}</div>`);
      else parts.push(`<div class="tip-line">${esc(school?.name ?? lens)}: neutral (no weight entry)</div>`);
    } else if (Object.keys(n.school_weights).length) {
      const sw = Object.entries(n.school_weights)
        .map(([k, v]) => `${esc(schoolName(k))}: ${v}`)
        .join(' · ');
      parts.push(`<div class="tip-line">${sw}</div>`);
    }

    viewer.tooltip.innerHTML = parts.filter(Boolean).join('<br>');
    viewer.tooltip.hidden = false;
  });

  viewer.svg.addEventListener('pointermove', (e) => {
    if (viewer.tooltip.hidden) return;
    const r = viewer.tooltip.getBoundingClientRect();
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    viewer.tooltip.style.left = `${x}px`;
    viewer.tooltip.style.top = `${y}px`;
  });

  viewer.svg.addEventListener('pointerout', (e) => {
    const rt = e.relatedTarget as Element | null;
    if (!rt || !rt.closest || !rt.closest('#world')) {
      viewer.tooltip.hidden = true;
    }
  });
}


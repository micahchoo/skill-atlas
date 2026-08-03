/**
 * variants.js — three STRUCTURALLY different full-tree layouts for the
 * grant-writing tree. Each variant answers a different "what is the primary
 * spatial unit?" question:
 *
 *   A — tier is primary (columns), cluster is a secondary lane strip.
 *   B — tier is primary (horizontal bands), cluster is a pure overlay (hull).
 *   C — cluster is primary (panels), tier is a mini-axis inside each panel.
 *
 * Each variant.render(graph, world, draw, opts) fully owns layout and drawing;
 * it shares only the viewer (zoom/pan/tooltip) and primitives from render.js.
 */

import { nodeSize, bezier, bezierV, clusterColor } from './render.js';

const topoIndex = (graph) => new Map(graph.topoOrder.map((id, i) => [id, i]));
const cellStack = (nodes, g, byTopo) => [...nodes].sort((a, b) => byTopo.get(a.id) - byTopo.get(b.id));
const spinePoly = (graph, pos, gold) => {
  const pts = graph.spine.filter((id) => pos.has(id)).map((id) => ({ x: pos.get(id).x + pos.get(id).w / 2, y: pos.get(id).y + pos.get(id).h / 2 }));
  if (pts.length < 2) return null;
  return gold.polyline(pts);
};

/* ============================================================ A — tiered columns + cluster lanes */
const A = {
  key: 'A',
  name: 'A · Tiered columns + cluster lanes',

  render(graph, world, draw, opts) {
    const COL_W = 200, NODE_H = 24, CELL_GAP = 6, LANE_GAP = 24, TIER_HEADER = 36, LANE_PAD = 10;
    const byTopo = topoIndex(graph);
    const lanes = graph.clusters.map((c) => ({
      cluster: c.id,
      depth: Math.max(1, ...[...new Set(graph.nodes.filter((n) => n.cluster === c.id).map((n) => n.tier))]
        .map((t) => graph.nodes.filter((n) => n.cluster === c.id && n.tier === t).length)),
    }));
    let y = TIER_HEADER;
    const laneY = new Map();
    for (const l of lanes) { laneY.set(l.cluster, y); y += l.depth * (NODE_H + CELL_GAP) + LANE_PAD * 2 + LANE_GAP; }
    const W = graph.tiers.length * COL_W;

    // positions: x from tier column, y from lane + in-cell stack
    const pos = new Map();
    const cells = new Map(); // "cluster/tier" -> [nodes]
    for (const n of graph.nodes) {
      const k = `${n.cluster}/${n.tier}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(n);
    }
    for (const [k, ns] of cells) {
      const [cluster, tier] = k.split('/');
      const stack = cellStack(ns, graph, byTopo);
      stack.forEach((n, i) => {
        const { w } = nodeSize(n.label);
        pos.set(n.id, { x: (tier - 1) * COL_W + (COL_W - w) / 2, y: laneY.get(cluster) + LANE_PAD + i * (NODE_H + CELL_GAP), w, h: NODE_H });
      });
    }
    const H = y - LANE_GAP;

    // background: lane strips + labels
    for (const l of lanes) {
      const ly = laneY.get(l.cluster);
      const col = clusterColor(graph, l.cluster);
      draw.rect(world, 0, ly, W, l.depth * (NODE_H + CELL_GAP) + LANE_PAD * 2, { fill: col, fillOpacity: 0.05, stroke: col, strokeOpacity: 0.18, rx: 8, class: 'lane' });
      draw.text(world, 8, ly + 15, graph.clusterMeta.get(l.cluster).name, { fill: col, weight: 600, size: 10.5, anchor: 'start' });
    }
    // tier headers
    graph.tiers.forEach((t) => {
      const cx = (t - 1) * COL_W + COL_W / 2;
      draw.text(world, cx, 14, `Tier ${t} · ${graph.tierNodes(t).length}`, { fill: '#475569', size: 11, weight: 600, anchor: 'middle' });
    });

    // edges (hard + optional soft), spine path, then nodes on top
    for (const e of graph.hardEdges) drawEdgeFromTo(world, draw, graph, e, pos, 'hard');
    if (opts.showSoft) for (const e of graph.softEdges) drawEdgeFromTo(world, draw, graph, e, pos, 'soft');
    if (opts.showSpine) {
      const gold = draw.goldLayer(world);
      spinePoly(graph, pos, gold);
    }
    for (const n of graph.nodes) draw.node(world, n, pos.get(n.id).x, pos.get(n.id).y, n.spine && opts.showSpine ? 'spine' : '');
    return { x: 0, y: 0, w: W, h: H };
  },
};

function drawEdgeFromTo(world, draw, graph, e, pos, cls) {
  const s = pos.get(e.from), t = pos.get(e.to);
  if (!s || !t) return;
  draw.edge(world, s.x + s.w, s.y + s.h / 2, t.x, t.y + t.h / 2, cls, bezier(s.x + s.w, s.y + s.h / 2, t.x, t.y + t.h / 2, 0.5));
}

/* ============================================================ B — tiered rows + cluster hulls */
const B = {
  key: 'B',
  name: 'B · Tiered rows + cluster hulls',

  render(graph, world, draw, opts) {
    const ROW_BUDGET = 1260, NODE_H = 24, NODE_GAP = 10, ROW_GAP = 10, BAND_GAP = 26, BAND_HEADER = 24, PAD = 14;
    const byTopo = topoIndex(graph);

    // barycenter ordering per tier: nodes sit near their prereqs' mean x
    const placed = new Map(); // id -> x
    let bandY = BAND_HEADER;
    const rows = []; // {y, x, nodes:[...]} per placed node: rowsByTier[t] = [{y, nodes:[{n,x}]}]
    const pos = new Map();
    const rowOf = new Map(); // id -> {y, x}
    const bandInfo = [];
    const placeNode = (n, x, y) => {
      const { w } = nodeSize(n.label);
      pos.set(n.id, { x, y, w, h: NODE_H });
      placed.set(n.id, x + w / 2);
    };

    for (const t of graph.tiers) {
      const nodes = graph.tierNodes(t);
      const bary = new Map(nodes.map((n) => {
        const ps = n.prereqs.map((p) => placed.get(p)).filter((v) => v !== undefined);
        return [n.id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : byTopo.get(n.id) * 1000];
      }));
      nodes.sort((a, b) => bary.get(a.id) - bary.get(b.id) || (a.label < b.label ? -1 : 1));

      let row = [], rowX = PAD, rowIdx = 0;
      const rowsHere = [];
      for (const n of nodes) {
        const { w } = nodeSize(n.label);
        if (rowX + w > ROW_BUDGET && row.length) { rowsHere.push(row); row = []; rowX = PAD; rowIdx++; }
        row.push({ n, x: rowX });
        rowX += w + NODE_GAP;
      }
      if (row.length) rowsHere.push(row);
      const bandTop = bandY + BAND_HEADER;
      rowsHere.forEach((r, i) => {
        r.forEach(({ n, x }) => placeNode(n, x, bandTop + i * (NODE_H + ROW_GAP)));
      });
      const bandH = rowsHere.length * (NODE_H + ROW_GAP) - ROW_GAP + PAD * 2;
      bandInfo.push({ t, top: bandY, h: bandH + BAND_HEADER, count: nodes.length, rows: rowsHere.length });
      bandY += bandH + BAND_HEADER + BAND_GAP;
    }
    const W = ROW_BUDGET + PAD * 2, H = bandY - BAND_GAP;

    // hulls: bounding rounded rect per cluster (overlay, no layout authority)
    const hulls = [];
    for (const c of graph.clusters) {
      const ns = graph.nodes.filter((n) => n.cluster === c.id);
      const ps = ns.map((n) => pos.get(n.id));
      const x0 = Math.min(...ps.map((p) => p.x)) - 12, y0 = Math.min(...ps.map((p) => p.y)) - 12;
      const x1 = Math.max(...ps.map((p) => p.x + p.w)) + 12, y1 = Math.max(...ps.map((p) => p.y + p.h)) + 12;
      hulls.push({ id: c.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    for (const h of hulls) {
      const col = clusterColor(graph, h.id);
      draw.rect(world, h.x, h.y, h.w, h.h, { fill: col, fillOpacity: 0.05, stroke: col, strokeOpacity: 0.3, dash: '5 4', rx: 14, class: 'hull' });
      draw.text(world, h.x + 14, h.y + 17, graph.clusterMeta.get(h.id).name, { fill: col, weight: 700, size: 11, anchor: 'start' });
    }
    // band labels
    for (const b of bandInfo) {
      draw.text(world, PAD - 2, b.top + 13, `Tier ${b.t} · ${b.count}`, { fill: '#475569', size: 11, weight: 600, anchor: 'start' });
      draw.line(world, PAD - 2, b.top + 18, W - PAD, b.top + 18, '#cbd5e1', 1);
    }

    // edges: prereq above, dependent below — vertical beziers
    for (const e of graph.hardEdges) {
      const s = pos.get(e.from), t = pos.get(e.to);
      if (!s || !t) continue;
      draw.edge(world, s.x + s.w / 2, s.y + s.h, t.x + t.w / 2, t.y, 'hard', bezierV(s.x + s.w / 2, s.y + s.h, t.x + t.w / 2, t.y, 0.45));
    }
    if (opts.showSoft) for (const e of graph.softEdges) {
      const s = pos.get(e.from), t = pos.get(e.to);
      if (!s || !t) continue;
      draw.edge(world, s.x + s.w / 2, s.y + s.h, t.x + t.w / 2, t.y, 'soft', bezierV(s.x + s.w / 2, s.y + s.h, t.x + t.w / 2, t.y, 0.45));
    }
    if (opts.showSpine) spinePoly(graph, pos, draw.goldLayer(world));
    for (const n of graph.nodes) draw.node(world, n, pos.get(n.id).x, pos.get(n.id).y, n.spine && opts.showSpine ? 'spine' : '');
    return { x: 0, y: 0, w: W, h: H };
  },
};

/* ============================================================ C — cluster-first panels */
const C = {
  key: 'C',
  name: 'C · Cluster-first panels',

  render(graph, world, draw, opts) {
    const COL = 118, NODE_H = 24, CELL_GAP = 6, PANEL_PAD = 12, HEADER = 34, GRID_GAP = 28;
    const byTopo = topoIndex(graph);

    // per-cluster mini-layout: tier = mini-column, stack = cell
    const panel = (cid) => {
      const nodes = graph.nodes.filter((n) => n.cluster === cid);
      const tiers = [...new Set(nodes.map((n) => n.tier))].sort((a, b) => a - b);
      const cells = new Map();
      for (const n of nodes) {
        const k = `${n.tier}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(n);
      }
      let depth = 1;
      for (const ns of cells.values()) depth = Math.max(depth, ns.length);
      const pos = new Map();
      for (const [k, ns] of cells) {
        const stack = cellStack(ns, graph, byTopo);
        stack.forEach((n, i) => {
      const w = Math.min(112, nodeSize(n.label).w);
          pos.set(n.id, { x: PANEL_PAD + (Number(k) - tiers[0]) * COL + (COL - w) / 2, y: HEADER + 4 + i * (NODE_H + CELL_GAP), w, h: NODE_H });
        });
      }
      // panel width must contain the widest node in the last tier column
      const lastTier = String(tiers[tiers.length - 1]);
      const maxLastW = Math.max(...cells.get(lastTier).map((n) => Math.min(112, nodeSize(n.label).w)));
      const w = (tiers.length - 1) * COL + PANEL_PAD + (COL + maxLastW) / 2 + 10;
      const h = depth * (NODE_H + CELL_GAP) - CELL_GAP + HEADER + 10;
      return { id: cid, pos, w, h };
    };

    const panels = graph.clusters.map((c) => panel(c.id));
    const COLS = 3;
    const maxW = Math.max(...panels.map((p) => p.w)) + 40;
    const maxH = Math.max(...panels.map((p) => p.h)) + 40;
    const offset = new Map();
    panels.forEach((p, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      offset.set(p.id, { x: col * (maxW + GRID_GAP), y: row * (maxH + GRID_GAP) });
    });
    const W = COLS * (maxW + GRID_GAP), H = Math.ceil(panels.length / COLS) * (maxH + GRID_GAP);

    // panel cards + headers
    for (const p of panels) {
      const o = offset.get(p.id);
      const meta = graph.clusterMeta.get(p.id);
      const col = clusterColor(graph, p.id);
      draw.rect(world, o.x, o.y, p.w, p.h, { fill: col, fillOpacity: 0.045, stroke: col, strokeOpacity: 0.35, rx: 10, class: 'panel' });
      const hd = draw.text(world, o.x + 12, o.y + 20, meta.name, { fill: col, weight: 700, size: 12, anchor: 'start' });
      hd.setAttribute('title', meta.gist);
      const tiersOf = (cid) => { const ts = graph.nodes.filter((n) => n.cluster === cid).map((n) => n.tier); return [Math.min(...ts), Math.max(...ts)]; };
      const [t0, t1] = tiersOf(p.id);
      draw.text(world, o.x + 12, o.y + 32, `${p.pos.size} nodes · tiers ${t0}-${t1}`, { fill: '#64748b', size: 9, anchor: 'start' });
    }

    // intra-panel hard edges
    for (const e of graph.hardEdges) {
      const o = offset.get(graph.clusterOf(e.from));
      const s = graph.clusterOf(e.from) === graph.clusterOf(e.to) ? posIn(o, panels, e, graph) : null;
      if (!s) continue;
      draw.edge(world, o.x + s.from.x + s.from.w, o.y + s.from.y + s.from.h / 2, o.x + s.to.x, o.y + s.to.y + s.to.h / 2, 'hard', bezier(o.x + s.from.x + s.from.w, o.y + s.from.y + s.from.h / 2, o.x + s.to.x, o.y + s.to.y + s.to.h / 2, 0.5));
    }
    // cross-panel hard edges (4 in real data) — connectors between panels
    for (const e of graph.hardEdges) {
      if (graph.clusterOf(e.from) === graph.clusterOf(e.to)) continue;
      const o1 = offset.get(graph.clusterOf(e.from)), o2 = offset.get(graph.clusterOf(e.to));
      const p1 = panelPos(graph, panels, e.from), p2 = panelPos(graph, panels, e.to);
      if (!p1 || !p2) continue;
      draw.edge(world, o1.x + p1.x + p1.w, o1.y + p1.y + p1.h / 2, o2.x + p2.x, o2.y + p2.y + p2.h / 2, 'cross', bezier(o1.x + p1.x + p1.w, o1.y + p1.y + p1.h / 2, o2.x + p2.x, o2.y + p2.y + p2.h / 2, 0.5));
    }
    if (opts.showSoft) {
      for (const e of graph.softEdges) {
        const p1 = panelPos(graph, panels, e.from), p2 = panelPos(graph, panels, e.to);
        if (!p1 || !p2) continue;
        const o1 = offset.get(graph.clusterOf(e.from)), o2 = offset.get(graph.clusterOf(e.to));
        draw.edge(world, o1.x + p1.x + p1.w, o1.y + p1.y + p1.h / 2, o2.x + p2.x, o2.y + p2.y + p2.h / 2, 'soft', bezier(o1.x + p1.x + p1.w, o1.y + p1.y + p1.h / 2, o2.x + p2.x, o2.y + p2.y + p2.h / 2, 0.5));
      }
    }
    // spine: golden path through consecutive spine nodes, across panels
    if (opts.showSpine) {
      const gold = draw.goldLayer(world);
      const pts = [];
      for (const id of graph.spine) {
        const p = panelPos(graph, panels, id);
        if (!p) continue;
        const o = offset.get(graph.clusterOf(id));
        pts.push({ x: o.x + p.x + p.w / 2, y: o.y + p.y + p.h / 2 });
      }
      if (pts.length > 1) {
        gold.polyline(pts);
      }
    }
    for (const n of graph.nodes) {
      const o = offset.get(n.cluster);
      const p = panelPos(graph, panels, n.id);
      draw.node(world, n, o.x + p.x, o.y + p.y, n.spine && opts.showSpine ? 'spine' : '', p.w);
    }
    return { x: 0, y: 0, w: W, h: H };
  },
};

function posIn(o, panels, e, graph) {
  const p = panels.find((x) => x.id === graph.clusterOf(e.from));
  return p ? { from: p.pos.get(e.from), to: p.pos.get(e.to) } : null;
}
function panelPos(graph, panels, id) {
  const p = panels.find((x) => x.id === graph.clusterOf(id));
  return p ? p.pos.get(id) : null;
}

/* ============================================================ shared draw toolbox */
function makeDraw() {
  const draw = {
    rect(world, x, y, w, h, o = {}) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      for (const [k, v] of Object.entries({ x, y, width: w, height: h, rx: o.rx ?? 0 })) r.setAttribute(k, v);
      if (o.fill) r.setAttribute('fill', o.fill);
      if (o.fillOpacity != null) r.setAttribute('fill-opacity', o.fillOpacity);
      if (o.stroke) r.setAttribute('stroke', o.stroke);
      if (o.strokeOpacity != null) r.setAttribute('stroke-opacity', o.strokeOpacity);
      if (o.dash) r.setAttribute('stroke-dasharray', o.dash);
      if (o.class) r.setAttribute('class', o.class);
      world.appendChild(r);
      return r;
    },
    text(world, x, y, content, o = {}) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      for (const [k, v] of Object.entries({ x, y, 'text-anchor': o.anchor ?? 'middle', 'dominant-baseline': 'central' })) t.setAttribute(k, v);
      t.setAttribute('font-size', o.size ?? 10);
      if (o.weight) t.setAttribute('font-weight', o.weight);
      if (o.fill) t.setAttribute('fill', o.fill);
      t.textContent = content;
      world.appendChild(t);
      return t;
    },
    line(world, x1, y1, x2, y2, stroke, width) {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('stroke', stroke); l.setAttribute('stroke-width', width);
      world.appendChild(l);
      return l;
    },
    edge(world, x1, y1, x2, y2, cls, d) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('class', `edge ${cls}`);
      p.setAttribute('marker-end', cls.includes('soft') ? 'url(#arrow-soft)' : 'url(#arrow)');
      world.appendChild(p);
      return p;
    },
    node(world, n, x, y, cls = '', w = null) {
      const { h } = nodeSize(n.label);
      const width = w ?? nodeSize(n.label).w;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `node ${cls}`.trim());
      g.setAttribute('data-id', n.id);
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', width); r.setAttribute('height', h); r.setAttribute('rx', 5);
      g.appendChild(r);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x + width / 2); t.setAttribute('y', y + h / 2);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
      t.setAttribute('font-size', 10);
      t.textContent = n.label;
      g.appendChild(t);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = n.label;
      g.appendChild(title);
      world.appendChild(g);
      return g;
    },
    /** Layer for the golden spine path — drawn above edges, below nodes. */
    goldLayer(world) {
      const layer = { polyline: null };
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'spine-layer');
      layer.polyline = (pts) => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        p.setAttribute('points', pts.map((q) => `${q.x},${q.y}`).join(' '));
        p.setAttribute('fill', 'none');
        g.appendChild(p);
        return p;
      };
      world.appendChild(g);
      return layer;
    },
  };
  return draw;
}

export const VARIANTS = [A, B, C];
export function getVariant(key) {
  return VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];
}
export { makeDraw };

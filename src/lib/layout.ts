/**
 * layout.ts — tiered-columns + cluster-lanes geometry (ticket 005 decision 1-2).
 *
 * Pure math, no DOM: computes node boxes from a graph, plus the bezier path
 * strings edges need. The renderer just draws what this returns.
 */
import type { Edge } from './graph';
import type { SkillGraph } from './graph';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Node box size from label length — shared so tree and tooltips agree. */
export function nodeSize(label: string): { w: number; h: number } {
  return { w: Math.min(178, Math.max(90, 16 + label.length * 5.4)), h: 24 };
}

export interface LaneLayout {
  /** node id -> box in world coordinates */
  pos: Map<string, Box>;
  width: number;
  height: number;
  /** cluster id -> top y of its lane strip */
  laneY: Map<string, number>;
  /** cluster id -> depth in node rows (max nodes in any of its (cluster,tier) cells) */
  laneDepth: Map<string, number>;
}

const COL_W = 200;
const NODE_H = 24;
const CELL_GAP = 6;
const LANE_GAP = 24;
const TIER_HEADER = 36;
const LANE_PAD = 10;

/**
 * Variant-A layout: tier = column (1 left), cluster = horizontal lane strip,
 * nodes stacked per (cluster, tier) cell in topological order.
 */
export function layoutLanes(graph: SkillGraph): LaneLayout {
  const byTopo = new Map(graph.topoOrder.map((id, i) => [id, i]));

  // cluster/tier -> nodes in that cell
  const cells = new Map<string, typeof graph.nodes>();
  for (const n of graph.nodes) {
    const k = `${n.cluster}/${n.tier}`;
    const list = cells.get(k);
    if (list) list.push(n);
    else cells.set(k, [n]);
  }

  let y = TIER_HEADER;
  const laneY = new Map<string, number>();
  const laneDepth = new Map<string, number>();
  for (const c of graph.clusters) {
    const clusterNodes = graph.nodes.filter((n) => n.cluster === c.id);
    const tiersOf = [...new Set(clusterNodes.map((n) => n.tier))];
    const depth = Math.max(1, ...tiersOf.map((t) => (cells.get(`${c.id}/${t}`) ?? []).length));
    laneY.set(c.id, y);
    laneDepth.set(c.id, depth);
    y += depth * (NODE_H + CELL_GAP) + LANE_PAD * 2 + LANE_GAP;
  }

  const pos = new Map<string, Box>();
  for (const [k, ns] of cells) {
    const [cluster, tierStr] = k.split('/');
    const tier = Number(tierStr);
    const stack = [...ns].sort((a, b) => byTopo.get(a.id)! - byTopo.get(b.id)!);
    stack.forEach((n, i) => {
      const { w } = nodeSize(n.label);
      pos.set(n.id, {
        x: (tier - 1) * COL_W + (COL_W - w) / 2,
        y: laneY.get(cluster)! + LANE_PAD + i * (NODE_H + CELL_GAP),
        w,
        h: NODE_H,
      });
    });
  }

  return { pos, width: graph.tiers.length * COL_W, height: y - LANE_GAP, laneY, laneDepth };
}

/** Horizontal-tangent cubic bezier between two points. */
export function bezierPath(x1: number, y1: number, x2: number, y2: number, bend = 0.5): string {
  const dx = (x2 - x1) * bend;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** Edge path between two node boxes (prereq right edge -> dependent left edge). */
export function edgePath(layout: LaneLayout, e: Edge): string | null {
  const s = layout.pos.get(e.from);
  const t = layout.pos.get(e.to);
  if (!s || !t) return null;
  return bezierPath(s.x + s.w, s.y + s.h / 2, t.x, t.y + t.h / 2, 0.5);
}

/** Spine polyline points (node centers), in spine order. */
export function spinePoints(layout: LaneLayout, spine: string[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const id of spine) {
    const b = layout.pos.get(id);
    if (!b) continue;
    pts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  }
  return pts;
}

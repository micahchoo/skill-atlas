/**
 * graph.ts — pure graph utilities for a skill tree (ticket 005 decision 7).
 *
 * DOM/fetch-free by design: this is the seam route planning reuses wholesale.
 * buildGraph() consumes a fully merged DomainData (skeleton + all body
 * batches) and returns a read-only graph handle.
 *
 * Edge direction convention: every edge flows prereq -> dependent
 * ({from: prereqId, to: dependentId}). Tiers strictly increase along every
 * hard edge, so the graph is a DAG and edge direction is always left-to-right
 * in the tiered layout.
 */
import type { Cluster, DomainData, MergedNode, School } from './types';

export interface Edge {
  from: string;
  to: string;
}

export interface GraphQuery {
  node(id: string): MergedNode | undefined;
  clusterOf(id: string): string | undefined;
  tierOf(id: string): number | undefined;
  tierNodes(t: number): MergedNode[];
  incoming(id: string): Edge[];
  outgoing(id: string): Edge[];
  softIncoming(id: string): Edge[];
  softOutgoing(id: string): Edge[];
  /** Transitive closure backward over hard prereqs (optionally including soft). */
  ancestors(id: string, opts?: { soft?: boolean }): string[];
  /** Transitive closure forward over hard edges (optionally including soft). */
  descendants(id: string, opts?: { soft?: boolean }): string[];
}

export interface SkillGraph extends GraphQuery {
  domain: string;
  level: string;
  schools: School[];
  clusters: Cluster[];
  nodes: MergedNode[];
  byId: Map<string, MergedNode>;
  spine: string[];
  spineSet: Set<string>;
  /** Consecutive spine pairs — the golden path is drawn through these. */
  spinePath: Edge[];
  tiers: number[];
  hardEdges: Edge[];
  softEdges: Edge[];
  clusterOrder: Map<string, number>;
  clusterMeta: Map<string, Cluster>;
  /** Stable Kahn topological order (cluster order, then label) — deterministic layout. */
  topoOrder: string[];
}

export function buildGraph(data: DomainData): SkillGraph {
  const clusterOrder = new Map(data.clusters.map((c, i) => [c.id, i]));
  const clusterMeta = new Map(data.clusters.map((c) => [c.id, c]));
  const byId = new Map(data.nodes.map((n) => [n.id, n]));

  const spine = [...data.spine];
  const spineSet = new Set(spine);
  const spinePath: Edge[] = [];
  for (let i = 0; i + 1 < spine.length; i++) {
    spinePath.push({ from: spine[i], to: spine[i + 1] });
  }

  const hardEdges: Edge[] = [];
  const softEdges: Edge[] = [];
  for (const n of data.nodes) {
    for (const p of n.prereqs) hardEdges.push({ from: p, to: n.id });
    for (const p of n.soft_prereqs) softEdges.push({ from: p, to: n.id });
  }

  const tiers = [...new Set(data.nodes.map((n) => n.tier))].sort((a, b) => a - b);

  // Stable Kahn topological order — deterministic across builds.
  const indeg = new Map(data.nodes.map((n) => [n.id, n.prereqs.length]));
  const succ = new Map(data.nodes.map((n) => [n.id, [] as string[]]));
  for (const e of hardEdges) succ.get(e.from)!.push(e.to);
  const key = (id: string): string => {
    const n = byId.get(id)!;
    return `${String(clusterOrder.get(n.cluster) ?? 99).padStart(2, '0')}:${n.label}:${id}`;
  };
  const ready = data.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const order: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    const id = ready.shift()!;
    order.push(id);
    for (const j of succ.get(id)!) {
      indeg.set(j, indeg.get(j)! - 1);
      if (indeg.get(j) === 0) ready.push(j);
    }
  }
  if (order.length !== data.nodes.length) {
    throw new Error('graph contains a cycle — invalid skill tree');
  }

  const graph: SkillGraph = {
    domain: data.domain,
    level: data.level,
    schools: data.schools,
    clusters: data.clusters,
    nodes: data.nodes,
    byId,
    spine,
    spineSet,
    spinePath,
    tiers,
    hardEdges,
    softEdges,
    clusterOrder,
    clusterMeta,
    topoOrder: order,
    node: (id) => byId.get(id),
    clusterOf: (id) => byId.get(id)?.cluster,
    tierOf: (id) => byId.get(id)?.tier,
    tierNodes: (t) => data.nodes.filter((n) => n.tier === t),
    incoming: (id) => hardEdges.filter((e) => e.to === id),
    outgoing: (id) => hardEdges.filter((e) => e.from === id),
    softIncoming: (id) => softEdges.filter((e) => e.to === id),
    softOutgoing: (id) => softEdges.filter((e) => e.from === id),
    ancestors(id, opts = {}) {
      const seen = new Set<string>();
      const stack = [...(byId.get(id)?.prereqs ?? [])];
      if (opts.soft) stack.push(...(byId.get(id)?.soft_prereqs ?? []));
      while (stack.length) {
        const p = stack.pop()!;
        if (seen.has(p)) continue;
        seen.add(p);
        const n = byId.get(p);
        if (!n) continue;
        stack.push(...n.prereqs);
        if (opts.soft) stack.push(...n.soft_prereqs);
      }
      return [...seen];
    },
    descendants(id, opts = {}) {
      const seen = new Set<string>();
      const walk = (from: string, edges: Edge[]) => {
        for (const e of edges) {
          if (e.from !== from || seen.has(e.to)) continue;
          seen.add(e.to);
          walk(e.to, edges);
        }
      };
      walk(id, hardEdges);
      if (opts.soft) walk(id, softEdges);
      return [...seen];
    },
  };

  return graph;
}

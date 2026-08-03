/**
 * graph.js — pure graph utilities for the grant-writing skill tree.
 *
 * DOM-free by design (no document/window/fetch, works in Node too): this is the
 * seam that route planning reuses. The caller owns I/O — fetch the JSON files,
 * then hand them to buildGraph() and treat the result as read-only data.
 *
 * Merge rule (authoritative, mirrors domains/ docs): the SKELETON defines the
 * graph (nodes, tiers, clusters, hard prereqs, spine). BODIES, keyed by node id,
 * only ADD soft_prereqs and school_weights; anything else in a body is ignored.
 *
 * Edge direction convention: every edge flows prereq -> dependent
 * ({from: prereqId, to: dependentId}). Tiers are strictly increasing along
 * every hard edge, so the graph is a DAG and edge direction is always
 * left-to-right / top-to-bottom in every layout.
 */

/** Build the merged graph. Throws if a hard prereq references an unknown node. */
export function buildGraph(skeleton, bodies) {
  const clusterOrder = new Map((skeleton.clusters || []).map((c, i) => [c.id, i]));
  const clusterMeta = new Map((skeleton.clusters || []).map((c) => [c.id, c]));

  const bodyById = new Map((bodies?.nodes || []).map((n) => [n.id, n]));

  const nodes = (skeleton.nodes || []).map((n) => {
    const body = bodyById.get(n.id);
    return {
      id: n.id,
      label: n.label,
      tier: n.tier,
      cluster: n.cluster,
      prereqs: [...(n.prereqs || [])],
      soft_prereqs: body ? [...(body.soft_prereqs || [])] : [],
      school_weights: body?.school_weights || null,
      one_line: n.one_line || '',
      hours: n.hours,
      spine: false,
      hasBody: !!body,
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const spine = [...(skeleton.spine || [])];
  for (const id of spine) {
    const n = byId.get(id);
    if (n) n.spine = true;
  }

  const hardEdges = [];
  for (const n of nodes) {
    for (const p of n.prereqs) {
      if (!byId.has(p)) throw new Error(`unknown hard prereq "${p}" of "${n.id}"`);
      hardEdges.push({ from: p, to: n.id });
    }
  }
  const softEdges = [];
  for (const n of nodes) {
    for (const p of n.soft_prereqs) {
      if (!byId.has(p)) throw new Error(`unknown soft prereq "${p}" of "${n.id}"`);
      softEdges.push({ from: p, to: n.id });
    }
  }

  const tiers = [...new Set(nodes.map((n) => n.tier))].sort((a, b) => a - b);
  const spinePath = [];
  for (let i = 0; i + 1 < spine.length; i++) {
    if (byId.has(spine[i]) && byId.has(spine[i + 1])) {
      spinePath.push({ from: spine[i], to: spine[i + 1] });
    }
  }

  // Stable Kahn topological order (cluster order, then label) — used for
  // deterministic layout and, later, for route planning phases.
  const indeg = new Map(nodes.map((n) => [n.id, n.prereqs.length]));
  const succ = new Map(nodes.map((n) => [n.id, []]));
  for (const e of hardEdges) succ.get(e.from).push(e.to);
  const key = (id) => {
    const n = byId.get(id);
    return `${String(clusterOrder.get(n.cluster) ?? 99).padStart(2, '0')}:${n.label}:${id}`;
  };
  const ready = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id).sort(key);
  const order = [];
  while (ready.length) {
    ready.sort(key);
    const id = ready.shift();
    order.push(id);
    for (const j of succ.get(id)) {
      indeg.set(j, indeg.get(j) - 1);
      if (indeg.get(j) === 0) ready.push(j);
    }
  }
  if (order.length !== nodes.length) throw new Error('graph contains a cycle — invalid skill tree');

  const graph = {
    domain: skeleton.domain,
    level: skeleton.level,
    schools: skeleton.schools || [],
    clusters: skeleton.clusters || [],
    nodes,
    byId,
    spine,
    spineSet: new Set(spine),
    spinePath,
    tiers,
    hardEdges,
    softEdges,
    clusterOrder,
    clusterMeta,
    topoOrder: order,
  };

  graph.node = (id) => byId.get(id);
  graph.clusterOf = (id) => byId.get(id)?.cluster;
  graph.tierOf = (id) => byId.get(id)?.tier;
  graph.tierNodes = (t) => nodes.filter((n) => n.tier === t);
  graph.incoming = (id) => hardEdges.filter((e) => e.to === id);
  graph.outgoing = (id) => hardEdges.filter((e) => e.from === id);
  graph.softIncoming = (id) => softEdges.filter((e) => e.to === id);
  graph.softOutgoing = (id) => softEdges.filter((e) => e.from === id);

  /** Transitive closure over hard prereqs (optionally including soft). */
  graph.ancestors = (id, { soft = false } = {}) => {
    const seen = new Set();
    const stack = [...(byId.get(id)?.prereqs || [])];
    if (soft) stack.push(...(byId.get(id)?.soft_prereqs || []));
    while (stack.length) {
      const p = stack.pop();
      if (seen.has(p)) continue;
      seen.add(p);
      const n = byId.get(p);
      if (!n) continue;
      stack.push(...n.prereqs);
      if (soft) stack.push(...n.soft_prereqs);
    }
    return [...seen];
  };

  /** Transitive closure forward over hard edges (optionally including soft). */
  graph.descendants = (id, { soft = false } = {}) => {
    const seen = new Set();
    const walk = (from, edges) => {
      for (const e of edges) {
        if (e.from !== from || seen.has(e.to)) continue;
        seen.add(e.to);
        walk(e.to, edges);
      }
    };
    walk(id, hardEdges);
    if (soft) walk(id, softEdges);
    return [...seen];
  };

  return graph;
}

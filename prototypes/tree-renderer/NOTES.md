# Tree renderer prototype — NOTES.md (ticket 005)

Throwaway UI prototype at `prototypes/tree-renderer/` — three structurally different
full-tree layouts of the REAL 51-node grant-writing tree. The code is disposable; the
decisions below are the deliverable. All data facts were measured from
`domains/grant-writing/skeleton.json` + `bodies/batch-001.json` (served read-only).

Run: `cd skill-tree && python3 -m http.server 8000` → open
`http://localhost:8000/prototypes/tree-renderer/?variant=A` (B and C via the switcher or
`?variant=` param). Zero dependencies, no build step.

Variants (switch via bottom bar, arrow keys, or `?variant=`):
- **A** `Tiered columns + cluster lanes` — tier = column (1 left), cluster = horizontal
  lane strip, nodes in per-(cluster,tier) stacks. Content box 1000×944.
- **B** `Tiered rows + cluster hulls` — tier = horizontal band (1 top), clusters drawn as
  dashed hull overlays on a barycenter-ordered flow. 1272×564 (2.25:1, wider than tall).
- **C** `Cluster-first panels` — 7 cluster cards in a 3-column grid, tier = mini-column
  inside each card, 4 cross-panel edges + golden spine crossing the grid. 1930×520.

All share: spine-highlight toggle, soft-edge toggle (dashed faint), hover tooltip
(label · spine badge · tier/cluster/hours · one_line · school weights), wheel zoom about
cursor, drag pan, zoom slider + Fit, URL-persisted variant.

---

## 1. Tiers: columns vs rows

**Observed.** 5 tiers; widths 13 / 16 / 12 / 9 / 1 (51 nodes). Tier 2 is the widest —
the tree fattens before it thins. Zero backward edges: every one of the 53 hard edges is
strictly tier-increasing, so either orientation has a single consistent flow direction.

**Implemented.** A = tier columns (1 left), B = tier bands (1 top). Both fit the whole
tree; B is genuinely wider-than-tall (2.25:1) per its brief.

**RECOMMENDED: columns (variant A).** The 13-wide tier 1 becomes a readable vertical
stack (max 3 deep per lane) instead of a 13-node horizontal band, the spine reads
left-to-right like prose, and the single tier-5 node (revision-loop) is a natural
endpoint on the right. Rows (B) are fine for a wide 16:9 panel but push tier 1 into the
least comfortable reading shape.

## 2. Clusters: lanes vs hulls

**Observed (measured, this is the key fact).** ALL 7 clusters span multiple tiers:
landscape & portfolio span tiers 1–3, strategy/budget/compliance/stewardship span 1–4,
proposal spans all 1–5. Every cluster starts at tier 1. No cluster is contained in one
tier column/band, so lanes and hulls MUST cross tier boundaries — there is no layout in
which clusters live inside single tier slices.

**Implemented.** A lanes: structural horizontal strips per cluster (all 51 nodes inside
their lane, verified). B hulls: dashed bounding outlines over flow positions; all nodes
inside their hull, but hulls are tall 3–5-band blobs whose per-band x-ranges interleave
under barycenter ordering, so hulls visually crowd each other at full zoom.

**RECOMMENDED: lanes.** Hulls answer "where does this cluster live" nicely but at 51
nodes the 7 blobs overlap in footprint and compete with the edges; a lane is structural,
zero-cost, and scales to any tier count. Hulls are the better *cluster-summary* visual,
not the full-tree layout.

## 3. Edge routing at ~50 nodes

**Observed.** 53 hard edges; only 4 cross clusters (project-narrative←smart-objectives,
attachment-pack←budget-narrative, funder-relationship←funder-fit,
opportunity-calendar←funder-watch); 49 stay inside a cluster. 49 of 53 edges span
exactly one tier step.

**Implemented.** Cubic beziers with horizontal tangents (A/C, left→right flow) and
vertical tangents (B, top→bottom). Measured crossings on the real data:

| variant | node-crossings | edge-crossings |
|---|---|---|
| A | 10 | 43 |
| B | 46 | 183 |
| C | 16 | 18 |

**RECOMMENDED: A-style left-to-right beziers.** 53 edges at 10 node-crossings is
comfortably readable; B's barycenter flow needs orthogonal routing or edge bundling to
survive (its soup is the finding, not a bug); C is cleanest overall only because panels
localize 49 of 53 edges — cross-panel routing is trivial because cross-cluster edges are
rare (4) and can be drawn as distinct arcs.

## 4. Soft prereqs as faint dashed edges

**Observed.** 12 soft edges exist in the current data (all 11 spine bodies carry
`soft_prereqs`; skeleton has none — the layer only exists after the body merge). They
mostly fan out of the strategy core: logic-model is soft-prereq'd by 4 nodes
(problem-statement, smart-objectives, proposal-outline, budget-basics). No soft edges
target unknown nodes.

**Implemented.** Dashed faint layer, default on, toggleable, count shown in the toolbar
(`Soft edges (12)`).

**RECOMMENDED: keep, default-on is fine.** At 12 edges the layer adds real information
(the "return to strategy" loops) with zero noise; it is genuinely exercised by the data,
not dead UI. Revisit the default if a later batch pushes the count toward the hard-edge
count.

## 5. Spine golden path

**Observed (important authoring finding).** The spine is NOT a path in the hard-edge
graph. Of its 10 consecutive hops, only 4 are backed by a hard prereq
(theory-of-change→logic-model, problem-statement→smart-objectives,
proposal-outline→project-narrative, budget-basics→budget-narrative); the other 6
(funder-types→candid-search, candid-search→funder-fit, funder-fit→problem-statement,
logic-model→smart-objectives, smart-objectives→proposal-outline,
project-narrative→budget-basics) have no edge at all. The spine is a *curriculum
sequence*, not an edge chain.

**Implemented.** Spine drawn as its own gold dashed path through consecutive spine node
centers (verified: passes all 11 spine nodes, max deviation 0 in every variant),
completely independent of the edge layers.

**RECOMMENDED: draw the spine as an explicit path, never as "thicker edges".** Rendering
it as thickened hard edges would silently break at 6 of 11 hops. Also: the 6 edge-less
hops are an open authoring question — either the spine should get edges, or it should be
documented as an intentional sequence of self-study jumps (2 of the 6 are soft-prereq'd).

## 6. Label density at full-tree zoom

**Observed.** Longest label 31 chars ("Narrative & financial reporting"); label length
drives node width (16 + 5.4px/char, capped 178px). 51 labels at fit zoom (A ≈ 0.83
scale, 10px font) are legible; nothing clips in A or B (verified: 0 clipped).

**Implemented.** Label-on-node everywhere; hover tooltip adds one_line + hours (+ school
weights when the body has them, + "no body yet" when it doesn't). C compresses nodes to
112px in panels and clips 7 long labels (full text is in the tooltip).

**RECOMMENDED: label-on-node + tooltip for detail.** Fit zoom (0.8–1.0) is the
comfortable reading zoom; below ~0.6 the tree is a shape, not text, and that's fine.
Panel layouts (C) must accept minor label clipping or widen panels to ~140px columns —
tooltip covers the loss.

## 7. The graph-vs-drawing seam

**Observed.** Layouts only needed: node positions, per-node size, edge endpoints, spine
sequence, cluster metadata — all derivable from the merged graph.

**Implemented.** `graph.js` is 100% DOM/fetch-free (runs in Node): `buildGraph(skeleton,
bodies)` returns nodes (merged with soft_prereqs/school_weights/hasBody), byId,
clusters, tiers, hardEdges/softEdges ({from: prereq, to: dependent}), spine + spinePath
(consecutive pairs), stable topoOrder, and topology queries — incoming/outgoing,
ancestors/descendants (transitive, soft optional), tierNodes, clusterOf, tierOf.
`render.js` owns only SVG primitives + viewer (zoom/pan/tooltip). Each variant computes
its own layout and ignores any primitive it doesn't need.

**RECOMMENDED: keep this split.** Route planning reuses graph.js wholesale — merge,
topology, ancestors/descendants — and renders with its own component; it never needs a
DOM. The one contract to preserve: edges as `{from: prereqId, to: dependentId}` with
strictly-increasing tiers.

---

## Data problems the render exposed (missed by the pilot)

1. **Clusters all span ≥3 tiers and all start at tier 1.** Any design assuming "one
   cluster per tier band" or cluster-local tiers is wrong; cluster grouping is inherently
   cross-tier.
2. **The spine is not a valid hard-edge path** — 6 of 10 hops lack an edge. Either
   author the missing edges or bless the hops as intentional soft jumps.
3. **Tier 2 is the widest (16), not tier 1 (13)** — the tree bulges in the middle;
   layouts should budget height/width for tier 2, not tier 1.
4. **The soft-prereq layer is concentrated on the strategy core** (logic-model is the
   soft target of 4 nodes) — soft edges are "return to strategy" loops, worth calling
   out as such in any legend.
5. **Only 11 of 51 nodes have bodies** (exactly the spine). 40 nodes render as
   "no body yet" — the tooltip makes the coverage gap visible at a glance.
6. **6 of 11 bodies carry non-empty school_weights** — the school lens has real data to
   surface, but school_weights are currently only in the tooltip.
7. Cross-cluster coupling is tiny (4 edges) and precisely located: proposal is the sink
   (2 incoming), landscape the source (2 outgoing).

## Prototype internals (for the driver, not the design)

- `index.html` — host: toolbar (facts, spine/soft toggles, zoom slider + Fit), floating
  bottom switcher (‹ › + label), arrow-key cycling that ignores focused inputs,
  `history.replaceState` so `?variant=` is shareable and reload-stable.
- `graph.js` — pure merge + topology (the reuse seam, §7).
- `render.js` — viewer (wheel-zoom, drag-pan, tooltip) + SVG primitives.
- `variants.js` — A/B/C layouts; each fully owns its geometry; all measured facts above
  come from geometry audits run against the live page (overlaps, clipping, containment,
  spine proximity, edge crossings).

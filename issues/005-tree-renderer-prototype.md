---
title: Tree renderer prototype
labels: [wayfinder:prototype]
status: closed
assignee: Main
parent: map.md
blocked-by: [003-grant-writing-tree.md]
---

## Question

Render the real grant-writing tree as a tiered tech-tree SVG and settle by
looking: tiers as columns vs rows · clusters as lanes vs hulls when a
cluster spans tiers · edge routing that survives ~50 nodes and cross-lane
prereqs · soft prereqs as faint dashed edges without becoming noise · spine
as a legible golden path · label density at full-tree zoom. Output is a
throwaway prototype (via /prototype) plus the layout decisions it forces —
the keep is the decisions, not the code. Also decide here how far graph
logic (topo order, prereq chains) stays separate from drawing, since route
planning wants those utilities later.

## Resolution

Prototype: `prototypes/tree-renderer/` — three structurally distinct layouts
of the real 51-node tree (A · tiered columns + lanes, B · tiered rows + hulls,
C · cluster-first panels), `?variant=` switcher, spine/soft-edge toggles,
tooltip, zoom/pan. Throwaway — the Astro scaffold re-implements the decisions,
not the code. Verified by the driver in a headless browser: 51 nodes × 3
variants, switcher + URL param, toggles functional, 0 console errors.

**Decisions (from the prototype's NOTES.md, driver-verified where possible):**

1. **Tiers: columns** (variant A). The 13-wide tier 1 stacks as a readable
   column and the spine flows left-to-right like prose.
2. **Clusters: lanes over hulls.** Measured: all 7 clusters span 3–5 tiers, so
   hulls become overlapping blobs at 51 nodes; lanes are structural.
3. **Edge routing: left-to-right beziers** (A-style). Measured 10 node / 43
   edge crossings on 53 edges vs B's flow layout at 46/183.
4. **Soft prereqs: faint dashed layer, default-on.** 12 real soft edges exist
   (all in spine bodies); they read as return-loops, not noise.
5. **Spine: its own gold path layer**, never thicker edges. A gapped spine
   renders broken — the pilot data was fixed (see pilot notes follow-up) to a
   connected 5-node chain.
6. **Label density: label-on-node + hover tooltip** (one_line, hours, school
   weights); fit zoom is comfortable in A/B.
7. **Seam: graph.js stays DOM-free** — pure buildGraph, topo order, ancestor/
   descendant queries, edges as {from, to}. Route planning reuses it wholesale.

**Data problems the render exposed (all fixed or accepted in the pilot):**
spine was not a path (fixed — 5-node chain); tier 2 is the widest tier at 16
(the mid-tree bulge, accepted); the prototype merges only batch-001 (header
showed "2 with bodies") — the scaffold must merge ALL `bodies/*.json` batches.

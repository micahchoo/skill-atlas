---
title: Side panel — node body presentation
labels: [wayfinder:prototype]
status: closed
assignee: Main
parent: map.md
blocked-by: [005-tree-renderer-prototype.md]
---

## Question

A node body has up to eight sections (know_what, know_how, habits, know_why,
checkpoint, common_failure, school_weights, sources) of 5–12 bullets each.
Prototype the side panel: section order and visual hierarchy · how
checkpoint (the pass/fail performance) gets top billing · how know_why's
claim/because/disputed_by renders as a disagreement, not a paragraph · what
the panel shows for a skeleton-only node (bodies not yet generated) · how
the prereq chain highlight in the tree ties to the panel.

## Resolution

Prototype: `prototypes/side-panel/` — throwaway. Verified by the driver in a
headless browser: header counter "Bodies merged: 14 (batch-001 11 + batch-002
3) — ALL batches"; body node shows CHECKPOINT · PASS/FAIL card + BUILDS ON / ALSO
USEFUL rows; skeleton-only node shows the intentional pending state with its
real one_line.

**Decisions:**

1. **Section order**: checkpoint → know_what → know_how → habits →
   common_failure → know_why → school_weights → sources. Collapse only
   school_weights + sources (annotation layers); every list section gets a
   bullet count.
2. **Checkpoint top billing**: its own dark navy card with an amber left rail
   and a "CHECKPOINT · PASS / FAIL" kicker, pinned as the FIRST body element —
   the only colored block in the panel, so the gate reads as THE thing.
3. **know_why as a disagreement**: a two-camp grid — claim+because (blue
   card) VS disputed_by (red card) with a VS divider and a source footer.
   Rendered only when present (4 of 14 bodies have one — the brief said one;
   the real data has four).
4. **Skeleton-only (37/51)**: the same panel chrome with real skeleton
   content (label, tier, cluster, hours, one_line, prereqs) + a dashed amber
   "CONTENT PENDING — tree done, body not yet generated" card listing the 8
   sections; dashed node outline in the tree so pending reads intentional.
5. **Chain highlight**: click = full transitive hard chain in the tree
   (amber ancestors, teal descendants, gold selected, amber edges) mirrored
   as clickable Ancestors → This node → Unlocks chips in the panel — either
   surface drives the other.
6. **Soft prereqs**: separate rows — "Builds on" (hard, solid chips) vs
   "Also useful" (soft, dashed chips) — never merged; soft edges stay
   dashed-faint in the tree (ticket 005 decision). The asymmetry (soft lives
   only in the body layer) is honest, not a bug.

**Data observations the prototype forced** (feed the scaffold): skeleton-only
is structural — compliance (8), stewardship (7), portfolio (7) have zero
bodies, so the pending state is a cluster-coverage story worth a per-cluster
signal; checkpoint and common_failure are single strings (split
common_failure on ';' for bullets — keep checkpoint one sentence);
school_weights only uses high/low in real data; 5 of 16 soft-prereq targets
have no body (the soft layer is one-directional).

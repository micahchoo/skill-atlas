# Side-panel prototype — NOTES.md (ticket 006)

Throwaway UI prototype at `prototypes/side-panel/` — the tree (variant-A lanes, reused
read-only from `prototypes/tree-renderer/`) with a right-side panel that opens when a
node is clicked. The code is disposable; the six decisions below are the deliverable.
All data facts were measured from `domains/grant-writing/skeleton.json` +
**ALL** bodies batches (`bodies/batch-001.json` + `bodies/batch-002.json`).

Run: `cd skill-tree && python3 -m http.server 8000` → open
`http://localhost:8000/prototypes/side-panel/`. Zero dependencies, no build step.
Header counter verifies the merge: **Bodies merged: 14 (batch-001 11 + batch-002 3)** —
the earlier tree-renderer only merged batch-001 (11); this prototype merges every batch.

Interaction model: click a node → panel fills + prereq chain highlights in the tree;
click empty tree → deselect; chips inside the panel navigate the selection; status bar
at the bottom surfaces the full state after every interaction (selected id, body yes/no,
chain counts, soft-prereq count, bodies merged).

---

## 0. Data facts the panel had to absorb (measured)

- 51 nodes, 7 clusters, 5 tiers, 53 hard edges, 16 soft edges, spine of 5.
- 14 bodies; **37 of 51 nodes are skeleton-only**. Every skeleton node (all 51) carries
  real `label`, `tier`, `cluster`, `prereqs`, `one_line`, `hours` — nothing to fake.
- All 14 bodies carry all 8 section keys, but the shapes differ:
  - `know_what` 5–8 bullets · `know_how` exactly 6 · `habits` 5–6 · `sources` exactly 3.
  - `know_why` is a dict on **4 of 14** bodies (theory-of-change, logic-model,
    smart-objectives, review-criteria-mapping); `null` on the other 10.
  - `school_weights` is non-empty on 6 of 14; values observed are only `high`/`low`
    (`normal`/`rejected` are dead vocabulary in today's data).
  - **`checkpoint` and `common_failure` are single strings, not arrays** — the only
    list-shaped sections that aren't lists.
- Body coverage is cluster-lopsided: only 4 of 7 clusters have bodies (landscape 3,
  strategy 4, proposal 5, budget 2). **Compliance (8), stewardship (7), portfolio (7)
  are 100% skeleton-only.**
- Soft prereqs exist **only on body nodes** (13 of 14 bodies; skeleton has none), and
  **5 of their 16 targets are skeleton-only nodes** (prior-awards, need-stats,
  outcome-measures, personnel, indirect-costs) — the soft layer points into
  content-pending territory, never out of it.
- Hard chain of the showcase node `review-criteria-mapping`: 5 ancestors (loi,
  proposal-outline, project-narrative, smart-objectives, problem-statement) + 1
  descendant (revision-loop) = **7 nodes, 6 chain edges** (measured via
  `graph.ancestors`/`graph.descendants`).

## 1. Section order + visual hierarchy

**Observed.** Two of the eight sections are single strings (checkpoint, common_failure)
rather than bullet lists; know_what is the longest list (5–8); know_why exists on only
4 of 14 bodies; school_weights and sources are annotation layers (6/14 and 3 items).

**Implemented.** Panel body order: **checkpoint card → know_what → know_how → habits →
common_failure → know_why → school_weights → sources**. Collapsible (`<details>`):
school_weights and sources only. Every other section stays open; each gets a header
rule with a bullet count (`What you must know · 5`).

**RECOMMENDED: checkpoint → know_what → know_how → habits → common_failure → know_why
→ school_weights → sources, collapsing only the two annotation layers.** The checkpoint
is the destination, the rest is the path to it; know_why goes late because only 4 of 14
bodies have it — placed earlier it would punch a hole mid-path in 10 panels. Habit list
first, then the "avoid this" warning, keeps the practical content contiguous before the
intellectual-context (know_why) and reference (school_weights, sources) tail.

## 2. Checkpoint top billing

**Observed.** Checkpoint is one 150–220-char performance sentence ("Produce a criteria
map for a real draft with every published criterion tagged answered, partial, or
unanswered…") — the only evaluable, pass/fail content a node has. The rest of the body
explains how to pass it.

**Implemented.** A dark-navy card with a 5px amber left rail and a `CHECKPOINT · PASS /
FAIL` kicker, rendered as the **first** element of the body (after the header and
prereq strip). It is the only section with a background fill; every other section is
white/neutral, so the gate dominates without burying the path.

**RECOMMENDED: give checkpoint its own dark, amber-railed card pinned above the path
sections — the only colored block in the panel.** Nothing else competes; the path below
visibly "leads to" the card above it. It also survives the 10/14 panels where know_why
is absent, keeping the panel's anchor stable across nodes.

## 3. know_why as a disagreement, not a paragraph

**Observed.** `know_why` is a 4-field dict — `claim`, `because`, `disputed_by`, `source`.
The brief called review-criteria-mapping "the one real know_why node" — **the merged
data has four** (theory-of-change, logic-model, smart-objectives are batch-001;
review-criteria-mapping is batch-002). `disputed_by` is always a named camp ("some
program officers warn that criteria-mirroring reads as gaming the review…").

**Implemented.** A two-camp grid: left card **The claim** (claim + `Because:` in blue),
`VS` divider, right card **The dispute** (disputed_by in red), footer **Debate sourced
from** `source`. Shown only when the body has a dict; the 10 null bodies correctly
render nothing. Verified on review-criteria-mapping.

**RECOMMENDED: the side-by-side claim/dispute grid with a source footer.** The dict
*is* a disagreement, so render two camps, never a joined paragraph. Fix the ticket's
"one node" claim in the tracker: four bodies carry know_why; batch-002 contributed the
showcase one.

## 4. Skeleton-only state (37 of 51 nodes)

**Observed.** Every skeleton node has real `one_line` + `hours` + hard prereqs; whole
clusters (compliance, stewardship, portfolio) have zero bodies — pending state is
structural, not scattered; 5 pending nodes are even soft-prereq targets of real bodies.

**Implemented.** Same panel chrome as body nodes (label, tier, cluster, hours, one_line,
hard-prereq chips — all real skeleton data) plus a dashed amber card: **"Content pending
— tree done, body not yet generated"**, listing the 8 sections that will appear. In the
tree, skeleton-only nodes get a dashed outline (legend in the toolbar), so "mapped but
not written" reads as intentional in both surfaces. Verified on `need-stats` (also a
soft-prereq target without a body).

**RECOMMENDED: render pending as a first-class state, not an error** — same header,
real skeleton content, dashed treatment in both tree and panel. The cluster-lopsided
coverage suggests the Astro build should also surface a per-cluster "N of M bodies"
signal; the panel itself should never imply the node is broken.

## 5. Prereq chain tie-in

**Observed.** `graph.ancestors`/`graph.descendants` (hard edges, transitive) give real
chains: review-criteria-mapping = 5 ancestors + 1 descendant = 7 nodes, 6 chain edges.

**Implemented.** Clicking a node highlights the full hard chain in the tree — amber
ancestors, teal descendants, gold selected node, amber chain edges (both endpoints in
the chain). The panel mirrors the chain as clickable chips (**Ancestors → This node →
Unlocks**) so either surface can drive the other; the status bar shows live counts
(`chain: 7 nodes (5 anc · 1 desc)`).

**RECOMMENDED: select = highlight the transitive hard chain, and make the chain
clickable in both directions.** Hard-prereq edges are the tree's only true dependency
story; highlighting ancestors *and* descendants answers both "what must I have" and
"what does this unlock". (The spine is a curriculum sequence, not an edge path — ticket
005 finding — so the chain highlight deliberately follows hard edges, not the spine.)

## 6. Soft prereqs vs hard

**Observed.** 16 soft edges; soft_prereqs exist only on body nodes (13 of 14; skeleton
has none), and 5 soft targets are skeleton-only. They read as "return to context" loops
(e.g. project-narrative ← logic-model + budget-basics), not as an enforced ordering.

**Implemented.** Panel keeps two separate rows: **Builds on** (solid chips, hard) and
**Also useful** (dashed chips, soft), never merged; the tree keeps soft edges dashed and
faint (ticket-005 decision, toggleable). Status bar reports the soft count separately.

**RECOMMENDED: always split hard/soft into labeled rows with different chip styles —
dashed = optional, solid = required.** The data asymmetry (soft lives in the body layer)
means skeleton-only nodes never show soft prereqs; that is honest, not a bug — a pending
node's soft edges appear only once its body lands.

---

## What the real data forced me to notice

1. **There are 4 know_why nodes, not 1** — the brief's "one real know_why node" was
   batch-001-centric; the showcase (review-criteria-mapping) arrived in batch-002. Any
   panel must render the disagreement for all four, not special-case one.
2. **Skeleton-only is structural, not scattered**: compliance/stewardship/portfolio
   (22 nodes) have *zero* bodies — the pending state is a cluster-coverage story, worth
   a per-cluster coverage signal in the Astro build.
3. **checkpoint + common_failure are strings** while every other list section is an
   array. The renderer has to split common_failure on `;` to get bullets — authoring it
   as an array (like know_what) would remove the special case; checkpoint should stay a
   single sentence (it *is* one performance).
4. **school_weights only ever uses high/low** today — normal/rejected are dead
   vocabulary; keep the renderer's chip colors for all four values but don't design
   around the unused ones.
5. **Soft prereqs point into pending territory**: 5 of 16 soft targets have no body —
   the soft layer is one-directional (body → body-or-pending, never pending → anything).
6. **The batch-001-only merge bug was real**: tree-renderer showed 11 bodies; this
   prototype's counter (14) is the fix — the Astro build must merge all `bodies/*.json`.
7. The hard chain of review-criteria-mapping is exactly 7 nodes / 6 edges — a small
   enough chain that full-highlight (ancestors + descendants) never becomes noise.

## Prototype internals (for the driver, not the design)

- `index.html` — host: toolbar (facts, body counter, soft/spine toggles, zoom, legend),
  tree stage + 430px panel, bottom status bar.
- `main.js` — fetches skeleton + **both** batches, merges, builds graph; renders
  variant A via read-only relative imports (`../tree-renderer/graph.js`,
  `render.js`, `variants.js` — only their exported seams are used); click → select →
  chain highlight; panel renderer; status bar.
- Verified live (headless Chromium, real data): 51 nodes / 37 dashed-pending / 14-body
  counter; body panel shows checkpoint card → 5 open sections → 2 collapsed details →
  chain chips; know_why renders two-camp for all four nodes; skeleton-only panel shows
  the pending card; chain highlight = 7 nodes / 6 edges on review-criteria-mapping;
  chip navigation, toggles, and deselect all keep the status bar in sync.

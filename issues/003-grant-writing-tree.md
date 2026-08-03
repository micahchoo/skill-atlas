---
title: Pilot domain — generate the grant-writing tree
labels: [wayfinder:task]
status: closed
assignee: Main
parent: map.md
blocked-by: [001-data-layout.md]
---

## Question

Produce the first real dataset: run `SKELETON: grant-writing` and then
`BODIES:` passes through the Mr. KTG prompt, place the output per the
data-layout decision. This is the pilot — record what the prompt gets wrong
in practice (granularity drift, generic bullets, invented prereqs) as facts
later tickets and the validator can use. Everything visual downstream needs
this real data; toy data would hide the layout problems. Also record the
**BODIES cadence decision**: with skeleton-only trees now legal (data-layout
decision), run bodies for all ~50 nodes up front or lazily in batches —
report what generation actually costs and which the pilot chose.

## Resolution

Delivered: `domains/grant-writing/` — `skeleton.json` (51 nodes, 7 clusters,
5 schools, 5 tiers, spine of 11, tier-1 width 13), `bodies/batch-001.json`
(11 spine bodies, know_why 3/11, sources named), `pilot-notes.md` (findings
asset).

Verified by the driver against the real files: every graph rule passes
(prereq existence, acyclicity, computed tiers, reachability, ≤3 prereqs,
hours 5–60, node count 51, exact 7-field skeleton, spine 11 distinct starting
at tier 1); bodies match skeleton fields exactly; envelope ids == body ids;
5–12 bullets per section; valid school_weights; checkpoints performance-
shaped; sources ≥1 named.

Findings (pilot-notes.md): granularity drift is the main failure mode — the
loud check loop caught a too-big "proposal writing" node and split it into a
six-node chain; tier arithmetic errors recur and must be checked loudly
(declared-vs-computed caught 3); a 25% tier-1 width was accepted per
"meshes not trees" rather than inventing prereqs; know_why density needs
enforcement (would have shipped 5–6/11 contested instead of 3); the 5–12
habits floor improved content rather than padding.

**Cadence decision: spine-first lazy.** 11 spine bodies ≈ 3.5h of generation
vs ~4× for all 51; the long tail (single-audit, regranting, …) is never
exercised by the first renders. Deferral is optionality, not debt — the
marginal body cost is constant, so remaining ~40 bodies stream in later
batches as the renderer and panel mature.

Validator suggestions from the pilot (c.1–c.9) were folded into ticket
"Validator — the data contract as code".

**Follow-up (driver):** the spine was reworked after the validator and the
renderer both flagged it — the 11-node thematic spine was not a path. See the
follow-up section in pilot-notes.md; batch-002 adds bodies for the three new
spine nodes.

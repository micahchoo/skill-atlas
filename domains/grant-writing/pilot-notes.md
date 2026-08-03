# Pilot notes — grant-writing tree (ticket 003)

Domain: `grant-writing` · level: serious amateur aiming at professional competence
Final counts: **51 nodes, 7 clusters, 5 schools, 5 tiers (13 tier-1), 11 spine nodes**.
Deliverables: `skeleton.json` (Pass A), `bodies/batch-001.json` (Pass B, 11 spine bodies).
All graph rules verified in code (`/tmp/ktg_scratch/check_skeleton.mjs`, `check_bodies.mjs`) — declared tiers
computed against prereq graph, acyclicity, reachability, prereq existence, hours range, field sets, spine
shape, bullet counts, know_why density, school_weights enum.

## (a) What the prompt got wrong in practice

- **Granularity drift (the main failure).** My first instinct was one "Proposal writing" node — too big to
  checkpoint. The frame's two-part size test (pass/fail checkpoint + 5–60 hours) forced a split into
  LOI → outline → executive summary → narrative → abstract → revision loop. Without a loud check, this
  drift would have shipped as a 30-hour "understand X" node.
- **Tier arithmetic errors (caught before emission).** The declared-vs-computed check caught the classic
  mistakes: `executive-summary` and `abstract` sit on a chain (outline → summary → abstract), so they are
  tiers 3 and 4, not 2 and 3; `impact-stories` prereqs `narrative-reporting` (t3), so it is t4, not t3.
  All three were fixed before the first run — the check then passed clean. This is exactly the error the
  frame says to self-check silently and it *will* recur; it must be loud.
- **Invented prerequisites.** The "meshes not trees" rule pulled against forcing hierarchy: making
  `budget-basics` require `proposal-outline` would have looked tidy but is a lie. Accepted a wide tier 1
  (13/51 ≈ 25%) instead of inventing edges. The frame's own calibration note tolerates this, but a
  tier-1-width warning is still worth adding (see (c)).
- **Generic bullets.** Early drafts of `one_line` read like "understand the funding landscape". The
  "what you couldn't do before" phrasing plus named tools (Candid, Grants.gov, SAM.gov, 990s, 2 CFR 200,
  de minimis 10%, NIH 12-page limit) is what keeps a bullet domain-specific. The frame says "cut any
  bullet that could appear in another domain's tree" — worth a validator heuristic, not just prose.
- **know_why density.** Without enforcement I'd have written contested rationales on 5–6 of 11 spine
  nodes. The 1-in-4 rule forced picking only the genuinely contested three (theory-of-change,
  logic-model, SMART objectives) and nulling the rest.
- **Bullet-count floor.** `habits` naturally came out at 3–4 bullets per node; the 5–12 floor forced two
  more *real* habits each, which improved the content rather than padding it.
- **Page-limit realism.** The frame never mentions that proposal sections have hard page caps; the
  outline and narrative nodes had to carry that constraint explicitly or they'd be wrong about the craft.

## (b) BODIES cadence decision

**Chosen: spine-first lazy.** The skeleton renders fine on its own (the renderer only needs the graph),
and the spine is the demo path: someone who does only the necessary things. Cost observed: skeleton
(51 nodes) ≈ 2h of generation + 1 check iteration; 11 spine bodies ≈ 3.5h of generation + 1 check
iteration (habits floor). Extrapolating, all ~50 bodies up front would be ~4× the body work and the
bulk of it (non-spine nodes like `single-audit`, `regranting`) is never exercised by the first renders.
Recommended: keep bodies batched spine-first; the long tail streams in later batches as the renderer
and side panel mature. Not comparable to all-up-front — the marginal body cost is constant, so deferring
is pure optionality, not deferred debt.

## (c) Validator rules the frame lacks (suggestions for ticket 002)

1. **Skeleton field set is exact**: reject any key beyond `id, label, tier, cluster, prereqs, one_line,
   hours`. The frame says "nothing else" but never enforces it.
2. **Body fields must equal skeleton fields exactly**: for a requested id, `id, label, tier, cluster,
   prereqs, one_line, hours` must be byte-identical between passes — catches Pass B drift.
3. **Pass B must emit exactly the requested ids**: no additions, no omissions, no reordering surprises.
4. **know_why density**: warn when fewer than ~10% or more than ~40% of emitted bodies carry `know_why`.
5. **school_weights validation**: keys must be known school ids, values from
   `high|normal|low|rejected` — the frame names the enum but never checks it.
6. **checkpoint performance heuristic**: require an action verb and an observable outcome (length +
   verb check); the frame's "not a feeling" rule is unenforceable prose otherwise.
7. **sources named**: non-empty strings, at least one per body.
8. **Tier-1 width warning**: warn if > ~35% of nodes are tier 1 — wide tiers are legal, but a sudden
   widening usually means prereqs were dropped to dodge hierarchy.
9. **Page-limit realism is domain content, not validator** — noted here so the grant-writing domain
   keeps its caps when the tree is regenerated (stable ids make that safe).

## Follow-up: spine rework (driver, after validator + renderer both flagged it)

**Finding: the frame's spine target is arithmetically impossible for mesh domains.** Tiers strictly
increase along any hard-prereq chain, so the longest possible chain equals the tier count (5 here) —
an 8–12 node spine cannot exist in a 4–6 tier tree. The original 11-node thematic spine was not a
path at all (only 3 of 10 consecutive pairs were even transitively connected).

**Fix applied to the data:** the spine is now the honest proposal-craft chain — `loi` →
`proposal-outline` → `project-narrative` → `review-criteria-mapping` → `revision-loop` (tiers 1–5),
the longest chain in the graph, verified ancestrally connected. The validator's spine check was
correspondingly refined: length is a calibration warning (band 6–16), and consecutive entries must be
connected in the graph's transitive closure — a gap is an error, not a warning.

**Bodies follow the spine:** batch-002 adds bodies for `loi`, `review-criteria-mapping`, and
`revision-loop` (the three new spine nodes without bodies), so the golden path remains the fully-
populated demo path. Combined know_why density 4/14 ≈ 29%.

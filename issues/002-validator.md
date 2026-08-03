---
title: Validator — the data contract as code
labels: [wayfinder:task]
status: closed
assignee: Main
parent: map.md
blocked-by: [001-data-layout.md]
---

## Question

Build the build-time validator that makes a bad KTG paste unshippable.
Encode the schema from [ktg-prompt.md](../ktg-prompt.md) plus the graph
rules: every prereq ID exists · acyclic · tier = 1 + max tier of hard
prereqs · tier-1 nodes have no prereqs · ≤3 hard prereqs · every node
reachable from tier 1 · spine is 8–12 existing nodes · hours 5–60 · node
count 40–60 ±30% · school_weights reference real schools. Decide which
violations are errors vs warnings (e.g. node count is a calibration target,
not a law). Plus an **id-stability mode** for regeneration: diff a new
skeleton against the previous one (per the data-layout decision) — removed or
renamed ids are errors, brand-new ids pass, body batches orphaned by the new
skeleton warn. Runs as an npm script; later wired into CI for community PRs.

## Resolution

Delivered: `package.json` (scripts `validate` / `validate:stability`, zero deps)
and `scripts/validate.mjs` (zero-dep Node ESM).

**Check surface.** Errors: skeleton JSON/schema; node id pattern with cluster
segment; cluster/school id uniqueness and references; exact 7-field skeleton
nodes (extra field = pass-B paste); prereq existence, ≤3 hard prereqs, tier-1
rules, computed tiers, acyclicity, reachability; spine existing/distinct/
tier-1-headed and consecutively chain-connected (transitive closure); hours
5–60; body contract (skeleton-field match, required fields, 5–12 bullets,
sources ≥1, know_why shape, school_weights enum, soft-prereq existence,
unknown-field typo guard); batch envelope ids contract. Warnings: calibration
bands (nodes/clusters/tiers/schools), missing level, spine length band,
orphaned batches, checkpoint-feeling heuristic, know_why density 10–40%,
tier-1 width >35%. Stability mode: missing prev id = error per id, new ids =
notes, orphaned batches = warning.

**Verified by the driver:** real pilot data exits 0 with 0 errors (one
calibration warning — see spine note below); broken-tier fixture exits 1 with
exact per-node messages; stability drift (id only in previous skeleton) exits
1 with the removed-or-renamed message; the agent's own 30/30 fixture classes
plus a real-data run.

**Refinements made during verification (driver):**

- Spine length: ERROR (8–12) downgraded to a calibration WARNING (band 6–16).
  Tiers strictly increase along any prereq chain, so the longest possible
  spine equals the tier count — in a 4–6 tier mesh domain an 8–12 spine is
  arithmetically impossible. Recorded in the pilot's notes as a frame
  inconsistency.
- Spine connectivity: direct-hard-edge warning upgraded to an ERROR on
  transitive-closure reachability — a gap means the spine is not a path and
  would render as disconnected gold.
- Pilot content heuristics folded in: sources ≥1 (no 5–12 floor), know_why
  density 10–40%, tier-1 width >35%.
- The validator caught a real defect in the driver's own batch-002 bodies
  (habits at 4 bullets) — the gate works on live data.

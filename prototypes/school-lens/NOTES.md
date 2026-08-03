# School lens prototype — NOTES.md (ticket 007)

Throwaway UI prototype at `prototypes/school-lens/` — select a school, the tree re-tints by
that school's real `school_weights`. The code is disposable; the six decisions below are the
deliverable. All data facts were measured from `domains/grant-writing/skeleton.json` +
`bodies/batch-001.json` + `bodies/batch-002.json` (all three served read-only).

Run: `cd skill-tree && python3 -m http.server 8000` → open
`http://localhost:8000/prototypes/school-lens/` (optionally `?school=grantsmanship` or
`?node=grant-writing.proposal.project-narrative&school=grantsmanship`). Zero dependencies, no
build step. Reuses `prototypes/tree-renderer/graph.js` (merge/topology) and variant-A lane
layout via read-only relative imports (`../tree-renderer/…`).

---

## The real weight distribution (measured, current data)

**Bodies:** ALL batches merged = **14** (batch-001: 11, batch-002: 3; no id overlap).
**Weighted nodes: exactly 6 of 14.** The other 8 bodies carry `"school_weights": {}` (neutral),
and 37 of 51 nodes have no body at all (neutral).

| node | weights |
|---|---|
| Candid foundation search | `federal: low` |
| Theory of change | `grantsmanship: low` |
| Logic model | `grantsmanship: low` |
| SMART objectives | `evaluation: high`, `grantsmanship: low` |
| Project narrative | `grantsmanship: high`, `evaluation: low` |
| Budget narrative | `federal: high`, `corporate: low` |

**Value counts:** `high` ×3, `low` ×6, `normal` ×0 (never written — it IS the absent default),
`rejected` ×0 (**appears nowhere in the data**).

**Per-school profile (what each lens actually does today):**
`federal` 2 (high budget-narrative, low candid-search) · `foundation` **0** (a no-op lens) ·
`corporate` 1 (low budget-narrative) · `grantsmanship` 4 (high project-narrative; low
theory-of-change / logic-model / smart-objectives) · `evaluation` 2 (high smart-objectives,
low project-narrative).

**Semantics the data already encodes:** grantsmanship↔evaluation each mark the other's flagship
nodes `low` (project-narrative, smart-objectives) — the mutual quarrel is embodied in the
weights, not just the `quarrels_with` field. Foundation weights nothing, so its lens is
visually silent today; the selector count `foundation (0)` makes that explicit rather than
confusing.

> Data-drift flag for the driver: ticket 005's NOTES.md says "11 spine nodes / 11 bodies"
> (measured then). The CURRENT skeleton has **spine = 5** and merged bodies = **14** — 005's
> numbers are stale; this prototype measures the current data. Also, 005 only merged batch-001;
> this prototype merges both batches per the repo instruction.

---

## 1. Visual grammar for high / normal / low / rejected

**Observed.** Only `high` (3) and `low` (6) exist; `normal` is the silent default (45 of 51
nodes are neutral under any lens); `rejected` has zero occurrences, so it must be *designed*
against a distribution that doesn't exercise it.

**Built.** Two-axis grammar, additive on top of the unchanged tree:
- `high` → **glow**: amber fill `#fef3c7`, amber stroke, soft drop-shadow, `H` badge.
- `normal` → **neutral**: unchanged white node (the lens adds nothing).
- `low` → **dim**: group opacity .72, slate fill/stroke, muted label, `L` badge.
- `rejected` → **struck**: red dashed outline, line-through label, `R` badge (visible, not
  hidden — the school is *telling you not to go there*, which is information).

Badge letters (H/L/R) let the grammar be read without relying on color alone. Spine conflict
resolved: spine nodes under a lens take the lens fill (lens rule wins), and spine-ness is
carried by the gold spine path through the node + a corner ★ + the tooltip badge.

**RECOMMENDED: glow / neutral / dim / struck, as a strictly additive overlay.**
Glow-vs-dim survives color-blind users via the stroke + badge; "normal = untouched" is the
cheapest possible invariant (see Q6); struck is the right treatment for a level the data
doesn't use yet because it keeps the node legible while unmistakably negative. Rejected should
NOT be "hidden": a rejected node is a deliberate school judgment.

## 2. Where optimises_for / gives_up / quarrels_with lives

**Observed.** 3 of 5 schools give up non-trivial trade-offs (foundation: "predictable process
and fast decisions", evaluation: "narrative warmth and speed") that the weights alone can't
express; the school text is the *reason* behind the tint.

**Built.** A **lens strip** pinned directly under the selector (dark band, always on screen
while the lens is active): school name + `optimises_for` + `gives_up` + `quarrels_with` +
weighted-node count. It appears on selection, disappears (becomes the off-state band) when the
lens clears. The per-node tooltip ALSO shows the active school's weight for the hovered node.

**RECOMMENDED: a header strip bound to the active lens.** The lens is a transient mode, so
the text should live in transient chrome, not a permanent sidebar that competes with the tree;
tooltip-only buries it (the requirement was "visible, not buried"). The strip doubles as the
state surface (what's selected, why, who it fights), which is exactly what a mode indicator
should do.

## 3. quarrels_with as a visible relationship between lens options

**Observed.** The quarrel graph is **asymmetric** in the data: federal↔foundation and
grantsmanship↔evaluation are mutual; foundation→grantsmanship and corporate→foundation are
one-way. (Total: 5 directed edges, 4 of 5 schools involved; foundation is the most fought-over.)

**Built.** Two layers. (a) Always on: every chip's tooltip lists that school's
`quarrels_with` names, and the chip shows its weighted-node count. (b) Lens active: the
schools the active lens quarrels with get a **red dashed ring + red label** in the selector,
and the strip renders `⚔ quarrels_with: …`. The active lens's enemies are therefore legible at
a glance inside the selector itself.

**RECOMMENDED: annotate the selector — active lens's enemies get the enemy ring; tooltip on
every option always carries its quarrels.** Because the graph is directed, only the *active*
school's outgoing quarrels should get the red ring (mirroring it would invent mutual fights
the data doesn't claim). The ring + red name reads instantly and the tooltip preserves the
full directed graph without cluttering the row.

## 4. What "no lens" looks like

**Observed.** The default view IS the correct authored tree — 45 of 51 nodes are neutral under
any lens, so a lens is a narrow highlight on top of it. The failure mode to avoid is a default
that reads as "you haven't chosen yet".

**Built.** "No lens · overview" is a **real first option** (dashed outline, distinct from the
school chips), not an empty state. While it's active, the strip becomes an explicit off-state
band: *"No school lens — overview. The tree as authored. Pick a school above to re-tint it by
that school's weights."* The legend (high/normal/low/rejected) is always visible, and the
toolbar state line reads `no lens`. Selecting it back from a lens is a normal click, so the
round trip is closed.

**RECOMMENDED: model "no lens" as an explicit mode with its own chip and explanatory
strip.** An empty dropdown placeholder reads as missing state; a labeled off-mode with a
one-line explanation reads as a choice. The legend being permanent means the grammar is
established before any lens is picked.

## 5. Does lens state belong in the URL?

**Observed.** Ticket 004 settled the deep-link scheme `/<domain>?node=<id>`; the lens is a
second, orthogonal page state on the same page.

**Built.** Yes — `?school=<id>`, composed through a **single shared `URLSearchParams`
object** so `?node=…&school=…` and `?school=…&node=…` both survive (whatever order the user
lands in, changing either param preserves the other). `history.replaceState` on every change
(reload-stable, back/forward stays clean, same pattern as the prototype's `?variant=`).
Parse is lenient: unknown `school` → treated as no lens and the param is dropped; unknown
`node` → simply not highlighted. `?node=` renders a persistent blue ring on that node and a
"deep link:" chip in the strip.

**RECOMMENDED: yes, `?school=` belongs in the URL, sharing the params object with `?node=`**
so the two compose by construction. The lens is cheap to serialize (one id), high-value to
share (a tinted tree is an argument), and the lenient-parse rule keeps bad URLs from breaking
the page. This feeds ticket 004's follow-through: the scheme is `/<domain>?node=<id>[&school=<id>]`.

## 6. Neutral treatment: no-lens vs lens-active, nodes without a weight entry

**Observed.** Three distinct "no entry" populations: 37 nodes with no body (`school_weights:
null` after merge), 8 bodies with `school_weights: {}`, and any school/node pair where the
node's weight object simply lacks that school's key (e.g. budget-narrative has no `foundation`
entry).

**Built.** The lens is **strictly additive**: a node only gets a lens class when
`school_weights[activeSchool]` exists; every other node renders with the identical default CSS
in both modes. So a node with `{}` and a node with no body are visually identical under every
lens, and are also identical to the no-lens rendering of themselves. The tooltip still
distinguishes the populations ("no body yet" vs neutral-with-body vs the specific weight), so
the consistency is in the *tree*, not the *information*.

**RECOMMENDED: keep the invariant "no entry ⇒ untouched node"** — it is the cheapest
possible rule (the lens cannot accidentally break 45 of 51 nodes), it makes "normal" mean
"the author/school said nothing", and it settles Q1's normal swatch by construction. Only the
tooltip should differentiate `null` (no body) from `{}` (deliberately neutral) from "not
weighted by this school", because that is information-detail territory, not tint territory.

---

## Prototype internals (for the driver, not the design)

- `index.html` — self-contained; imports `buildGraph` from `../tree-renderer/graph.js`,
  `setupViewer` from `../tree-renderer/render.js`, and `getVariant('A')` + `makeDraw` from
  `../tree-renderer/variants.js` (all read-only). Lens classes (`lens-high/low/rejected`) are
  applied to the node groups after variant-A renders, so the layout is identical across modes
  and only the tint differs.
- State surface after every interaction: strip (school text / off-state explanation),
  toolbar `state` line (lens + weighted count + current URL), chip active/enemy styling,
  `data-lens` on `<body>`.
- Lens switches preserve the user's zoom/pan (fit only on first render); Fit + wheel zoom +
  drag pan are the tree-renderer's viewer.

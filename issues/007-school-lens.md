---
title: School lens semantics
labels: [wayfinder:prototype]
status: closed
assignee: Main
parent: map.md
blocked-by: [005-tree-renderer-prototype.md]
---

## Question

The signature interaction: select a school, the tree re-tints by that
school's weights. Prototype and decide: the exact visual grammar for
high/normal/low/rejected (glow / neutral / dim / struck?) · where the
school's optimises_for, gives_up, quarrels_with text appears while the lens
is active · whether quarrels_with renders as a visible relationship between
lens options · what "no lens" looks like so the default view doesn't feel
like a missing state · whether the lens state belongs in the URL (feeds the
URL-scheme decision).

## Resolution

Prototype: `prototypes/school-lens/` — throwaway. Verified by the driver in a
headless browser: 51 nodes, selector with No lens + 5 real schools (weighted
counts federal 2 / foundation 0 / corporate 1 / grantsmanship 4 / evaluation
2); grantsmanship lens tints exactly its 4 real weights (H project-narrative,
L theory-of-change / logic-model / smart-objectives); enemy ring renders
(grantsmanship → evaluation); `?school=` composes with `?node=`;
no-lens off-state explicit.

**Decisions:**

1. **Grammar: strictly additive overlay.** High = amber glow + H badge;
   normal = untouched; low = 0.72 opacity + L badge; rejected = red dashed +
   line-through + R badge. Stroke + badge survive color-blindness; rejected
   stays visible — a rejection is information, not something to hide.
   (Current data: high 3, low 6; normal and rejected never occur — designed
   anyway.)
2. **School text: header strip** pinned under the selector while the lens is
   active (name, optimises_for, gives_up, quarrels_with, weighted count). A
   transient mode gets transient chrome — not a permanent sidebar, not
   tooltip-only.
3. **quarrels_with: annotated selector.** The active lens's enemies get a red
   dashed ring in the chip row; every chip's tooltip always carries its
   quarrels. Quarrels are asymmetric in the data — only the active school's
   outgoing edges get the ring.
4. **No lens: an explicit mode**, not a missing state — a real "No lens ·
   overview" chip, an explanatory off-state strip, and a permanent legend.
5. **Lens state belongs in the URL**: `?school=<id>`, sharing one
   URLSearchParams object with `?node=` so the two compose by construction;
   lenient parse (unknown school → no lens, param dropped); replaceState for
   reload-stability.
6. **Neutral invariant: no entry ⇒ untouched node.** Nodes without a
   school_weights entry for the active school get NO lens class and render
   identically to no-lens mode; only the tooltip distinguishes no-body vs
   `{}` vs not-weighted-by-this-school.

**Data facts:** 14 bodies merged (both batches), 6 weighted nodes;
grantsmanship↔evaluation mutually low each other's flagship nodes — the
quarrels are embodied in the weights; foundation is a no-op lens today (0
weights; the strip warns rather than pretending).

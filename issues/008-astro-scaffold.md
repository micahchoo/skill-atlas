---
title: Astro scaffold
labels: [wayfinder:task]
status: closed
assignee: Main
parent: map.md
blocked-by: [002-validator.md, 004-url-id-scheme.md]
---

## Question

Stand up the real site skeleton: Astro project, data loading from the
domain JSON per the data-layout decision, validator wired into the build,
routes per the URL-scheme decision, one static page per domain, plain-list
index page (real atlas index stays in fog). The renderer prototype's
decisions get re-implemented cleanly here — the prototype itself is not
promoted. Resolved when `npm run build` emits a browsable static site with
the grant-writing tree on it.

## Resolution

Built: Astro 5 static site — `src/lib/types.ts` / `data.ts` (merge: skeleton +
ALL bodies batches, later batch wins, envelopes) / `graph.ts` (DOM-free
buildGraph, topo, ancestors/descendants — the route-planning seam) /
`layout.ts` (variant-A lanes + beziers) / `render.ts` (SVG viewer) /
`src/scripts/tree-client.ts` (zero-framework panel + lens + URL); pages
`index.astro` + `[domain].astro` (unknown slug → 404). Validator gate: build
fails on validation errors via `npm run validate` → `scripts/validate-all.mjs`
(the one deviation: the bare validate.mjs needs a target argument, so a
wrapper validates every domain dir; validate.mjs itself untouched).

Verified by the driver against a fresh `npm run build` (exit 0, 2 pages) and
the served dist/: index lists grant-writing with coverage; /grant-writing
renders 51 nodes / 7 lanes / gold spine / soft-edge + spine toggles;
`?node=…&school=…` deep link opens the panel (checkpoint navy card first,
section order, two-camp know_why, CONTENT PENDING card on skeleton-only
nodes with real one_line) and the grantsmanship lens (L/L/L/H badges, enemy
ring, header strip); unknown slug 404. Deps: astro ^5.18.2, typescript
^5.9.3, @types/node ^26.1.2.

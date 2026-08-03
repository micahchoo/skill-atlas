---
title: Astro scaffold
labels: [wayfinder:task]
status: open
assignee: null
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

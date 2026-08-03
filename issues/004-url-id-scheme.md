---
title: URL & ID scheme
labels: [wayfinder:grilling]
status: closed
assignee: Main
parent: map.md
blocked-by: []
---

## Question

Node IDs are `domain.cluster.node` and stable forever. Decide the site's URL
scheme: routes for a domain page, deep links to a node (open-in-side-panel
state in the URL?), and — the reason this is a decision and not a default —
a shape that cross-domain links can use later without breaking. Also: does
the cluster segment in the ID create a trap (a node can't move clusters
without an ID change — accept or work around)?

## Resolution

**ID contract — settled by ktg-prompt.md, accepted (no divergence):** node ids
are `<domain>.<cluster>.<node>`, lowercase slugs, stable forever. The cluster
segment is part of the id, so a node moving clusters is an id change — surfaced
by the regeneration stability diff as remove+add; the old id's deep links die,
which is correct because the node's identity changed. The validator enforces
the pattern (id cluster segment == node's cluster field).

**URL scheme:**

- `/` — atlas index (plain list; the discovery design stays in fog).
- `/<domain-slug>` — one static page per domain: the tiered tree.
- `/<domain-slug>?node=<full node id>` — deep link: page loads with the side
  panel open on that node. The id in the query is the stable id itself — no
  separate slug namespace, no second page type.
- Cross-domain links (future): absolute URLs of the same shape
  (`/ethnomusicography?node=…`). The URL half of that fog is now settled; what
  remains is KTG-frame syntax for cross-domain references.

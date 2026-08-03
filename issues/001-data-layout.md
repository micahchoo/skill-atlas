---
title: On-disk data layout for domains
labels: [wayfinder:grilling]
status: closed
assignee: Main
parent: map.md
blocked-by: []
---

## Question

How does KTG output land on disk? Pass A emits a skeleton, pass B emits node
bodies in batches — decide: one merged JSON file per domain vs skeleton +
bodies kept separate and merged at build time; where partial trees (skeleton
only, bodies pending) are allowed; and the regeneration workflow that
preserves stable IDs when a domain is re-run. This shapes what the validator
validates and what Astro loads, so it goes first.

## Resolution

1. **Files.** Per domain: `domains/<slug>/skeleton.json` (pass A output,
   verbatim) plus `domains/<slug>/bodies/*.json` (one file per `BODIES:` pass,
   verbatim). Build-time merge: the skeleton defines structure; body batches
   key by node id; a later batch wins per node. No hand-merging ever.
2. **Partial trees.** Skeleton required and sufficient — a domain ships when
   its skeleton passes the graph rules. Bodies are optional, arriving in any
   batch subset; the site renders a stub panel for bodyless nodes (see ticket
   "Side panel — node body presentation").
3. **Regeneration.** Replaces `skeleton.json` only. The old skeleton is fed to
   the prompt as context, then diffed against the new one: removed or renamed
   ids fail the check, new ids pass. Body batches persist untouched, keyed by
   id; batches orphaned by the new skeleton render nothing and warn. The diff
   is the enforcement mechanism for the frame's "IDs stable forever" rule —
   see the id-stability mode added to ticket "Validator — the data contract as
   code".

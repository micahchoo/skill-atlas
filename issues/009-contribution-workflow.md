---
title: Contribution workflow for community trees
labels: [wayfinder:grilling]
status: closed
assignee: Main
parent: map.md
blocked-by: [002-validator.md, 003-grant-writing-tree.md]
---

## Question

Community trees arrive by PR. Decide the contributor path: is the
deliverable "run the KTG prompt yourself and open a PR with the JSON", or
"open an issue naming a domain and the maintainer generates it"? What does
CONTRIBUTING.md promise about review — does a human check content quality,
or is passing the validator enough? Who owns a domain's regeneration (stable
IDs make this a real ownership question)? Informed by whatever the
grant-writing pilot revealed about how hands-on generation actually is.

## Resolution

- **Path: both, PR as path of record.** A contributor runs the KTG prompt
  themselves (the pilot shows it is a craft loop — ~2h skeleton + a loud check
  iteration + ~3.5h spine bodies), self-checks, validates, opens a PR with the
  JSON. The issue path stays for domain experts who cannot run prompts: they
  open an issue naming a domain, the maintainer generates it. Both feed the
  same validator gate.
- **Review: validator-pass is enough.** CONTRIBUTING.md promises exactly that:
  the validator is the gate (runs in CI on every PR); a paste that fails does
  not merge; there is no separate human content-review step. Accepted tradeoff:
  the validator's content heuristics (from the pilot, folded into ticket
  "Validator — the data contract as code") are the content bar — structurally
  valid but generic trees can ship.
- **Regeneration: open to anyone, diff-guarded, no provenance file.** Anyone
  may regenerate a domain; the id-stability diff is the guard (drift fails,
  so regeneration cannot silently renumber). The diff is the audit trail;
  recording generator/date/prompt-version per domain was offered and declined.

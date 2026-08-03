---
title: Arcanum redesign — semantic zoom, game UX
labels: [wayfinder:decision]
status: closed
assignee: Main
parent: map.md
blocked-by: [008-astro-scaffold.md]
---

## Question

The shipped UI (tickets 005–008) read as an engineer's cockpit: the whole
51-node graph fitted into one viewport (labels ~6px), five bands of chrome,
batch diagnostics in the header. User verdict: "the ui and ux both suck",
then "i wanted a game like ux". What replaces it?

## Resolution (validated in prototypes/semantic-zoom, since folded into src/)

- **Structure: semantic zoom.** Three altitudes — domain overview (clusters as
  discipline panels, no node labels), cluster board (one cluster fully labeled
  at scale 1), node reading page. Rule: text renders at readable size or not
  at all; you descend to see more, you never squint. Largest cluster is 8
  nodes / 5 tiers, so every board fits a laptop viewport with no fitting math.
- **Skin: Arcanum (RPG talent board)** — chosen over Constellation (star
  atlas) and Expedition (parchment quest map) variants. Tier rows run
  bottom-up like a game tree; skills are sockets; pending bodies are locked
  (🔒); the spine is the MAIN QUEST with a gold-lit path. Game vocabulary
  replaces app vocabulary: Trial (checkpoint), tome (body), locked (pending),
  "Where travelers fall" (common_failure).
- **Preview sidebar** (user addition): clicking a socket selects it (?sel=)
  and fills a sticky sidebar — trial, first know_what bullets, builds-on /
  unlocks chips. "Open the tome →" is the deliberate jump to the reading
  page. Esc unwinds: reading page → selection → overview.
- **URL contract extended, not replaced** (ticket 004): ?cluster= / ?node= /
  ?sel= / ?school= compose in one URLSearchParams; unknown ids drop leniently;
  ?node= deep links still land on the reading page.
- **School lens survives** (ticket 007) on the board: chips + additive socket
  tinting (high glow / low dim / rejected struck); enemy chips dashed red.
- **Cluster icons are spec**: clusters[].icon (one emoji) added to
  ktg-prompt.md, the pilot skeleton, and validate.mjs (warn when absent).
  Renderers fall back to ✦.
- **Deleted:** src/lib/layout.ts, render.ts, palette.ts (lane layout, SVG
  pan/zoom viewer, cluster palette — the poster view they served is gone),
  and prototypes/semantic-zoom after fold-in. Cross-cluster edges measured
  during prototyping: only 4 hard, 8 of 16 soft — rendered as travel chips
  ("doors"), not drawn lines.

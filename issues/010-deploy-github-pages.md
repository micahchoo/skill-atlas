---
title: Deploy to GitHub Pages with validator CI
labels: [wayfinder:task]
status: closed
assignee: Main
parent: map.md
blocked-by: [008-astro-scaffold.md]
---

## Question

Graduated from the Deployment fog (decided by grilling): GitHub Pages via an
Actions workflow; the repo is git-initialized (first commit 887b100, branch
main); the validator is the review gate for community PRs. Remaining work:
`.github/workflows/validate.yml` (validator gate on every PR — makes the
"validator-pass is enough" contribution promise mechanical), a Pages
build+deploy workflow, and pushing to a new GitHub repo (the human's step —
needs the user's GitHub account; recorded as a checklist when everything else
is done).

## Resolution

Done: git initialized (main, first commit 887b100 — map, tickets, data,
validator, site); `.github/workflows/validate.yml` (validator gate on every
PR — the "validator-pass is enough" contribution promise is now mechanical;
zero-dep, no install step) and `.github/workflows/deploy.yml` (Pages build +
deploy on push to main, standard configure-pages / upload-pages-artifact /
deploy-pages flow).

**Remaining human step (push):**

1. Create a new empty GitHub repo (e.g. `skill-atlas`, no README).
2. `git remote add origin git@github.com:<you>/skill-atlas.git`
3. `git push -u origin main`
4. GitHub → Settings → Pages → Source: GitHub Actions (the deploy workflow
   publishes `dist/` automatically on the next push).

After the push, every future PR runs the validator; every merge to main
rebuilds and redeploys.

## Resolution

(recorded when the scaffold exists and the workflows are in place)

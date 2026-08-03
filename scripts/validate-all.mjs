#!/usr/bin/env node
/**
 * validate-all.mjs — the build gate (ticket 008): runs scripts/validate.mjs
 * against every domain under domains/ and fails the build if any domain has
 * validation errors. A domain that fails validation is a broken build.
 *
 * scripts/validate.mjs itself is read-only — this script only orchestrates it.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "domains");
if (!fs.existsSync(root)) {
  console.error("ERROR: domains/ not found");
  process.exit(1);
}

const dirs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "skeleton.json")))
  .map((d) => d.name)
  .sort();

if (dirs.length === 0) {
  console.error("ERROR: no domains found under domains/");
  process.exit(1);
}

let failed = false;
for (const dir of dirs) {
  const res = spawnSync(process.execPath, [path.resolve("scripts/validate.mjs"), path.join(root, dir)], {
    stdio: "inherit",
  });
  if (res.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);

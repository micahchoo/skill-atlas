#!/usr/bin/env node
/**
 * validate.mjs — build-time validator for KTG skill-tree data (ticket 002).
 *
 * The contract is ktg-prompt.md (the two-pass prompt) plus the on-disk layout
 * from issue 001: a domain ships as domains/<slug>/skeleton.json (pass A,
 * verbatim) and optional domains/<slug>/bodies/*.json (one file per BODIES:
 * pass, verbatim). Body batches may be a bare array of node objects or an
 * envelope { domain, batch, ids, nodes }.
 *
 * Usage:
 *   node scripts/validate.mjs <target> [--against <prev-skeleton.json>] [--stability]
 *
 * <target> is a path to a domain directory or a bare slug resolved to
 * domains/<slug>.
 *
 * Errors print as "ERROR: ..." and force exit code 1. Warnings print as
 * "WARN: ..." and notes as "note: ..."; neither affects the exit code.
 */

import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const USAGE =
  "Usage: node scripts/validate.mjs <target> [--against <prev-skeleton.json>] [--stability]";

// ---------------------------------------------------------------- CLI

const argv = process.argv.slice(2);
const cli = { target: null, against: null, stability: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--against") {
    cli.against = argv[++i];
    if (cli.against === undefined) {
      console.error("ERROR: --against requires a file path");
      console.error(USAGE);
      process.exit(1);
    }
  } else if (a === "--stability") {
    cli.stability = true;
  } else if (a.startsWith("-")) {
    console.error(`ERROR: unknown flag ${a}`);
    console.error(USAGE);
    process.exit(1);
  } else if (cli.target === null) {
    cli.target = a;
  } else {
    console.error(`ERROR: unexpected argument ${a}`);
    console.error(USAGE);
    process.exit(1);
  }
}
if (cli.target === null) {
  console.error("ERROR: no target given");
  console.error(USAGE);
  process.exit(1);
}
if (cli.stability && cli.against === null) {
  console.error("ERROR: --stability requires --against <prev-skeleton.json>");
  process.exit(1);
}

// ---------------------------------------------------------------- output

let errorCount = 0;
let warnCount = 0;
const error = (msg) => {
  console.error(`ERROR: ${msg}`);
  errorCount += 1;
};
const warn = (msg) => {
  console.warn(`WARN: ${msg}`);
  warnCount += 1;
};
const note = (msg) => {
  console.log(`note: ${msg}`);
};

// ---------------------------------------------------------------- helpers

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isStrArr = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bulletOk = (v, min, max) =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every(isNonEmptyString);

function resolveTarget(t) {
  const direct = path.resolve(t);
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;
  if (!t.includes("/") && !t.includes(path.sep) && !t.endsWith(".json")) {
    const slugDir = path.resolve("domains", t);
    if (fs.existsSync(slugDir) && fs.statSync(slugDir).isDirectory()) return slugDir;
  }
  return direct; // missing dirs surface via the skeleton.json error below
}
const target = resolveTarget(cli.target);

// Returns { ok: true, value } on success, { ok: false } after reporting the error.
function readJson(filePath, what) {
  if (!fs.existsSync(filePath)) {
    error(`${what} not found: ${filePath}`);
    return { ok: false };
  }
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    error(`cannot read ${filePath}: ${e.message}`);
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    error(`${what} is not valid JSON: ${e.message}`);
    return { ok: false };
  }
}

// ---------------------------------------------------------------- skeleton

const SKELETON_FIELDS = ["id", "label", "tier", "cluster", "prereqs", "one_line", "hours"];

const skelRes = readJson(path.join(target, "skeleton.json"), "skeleton.json");
const skel = skelRes.ok ? skelRes.value : undefined;

let domain = null;
let schools = [];
let clusters = [];
let spine = [];
let skelNodes = [];
let skelOk = false;

if (skel === undefined) {
  // readJson already reported the missing/unparseable file
} else if (skel === null || typeof skel !== "object" || Array.isArray(skel)) {
  error("skeleton.json must be a JSON object");
} else {
  skelOk = true;
  if (!isNonEmptyString(skel.domain)) error("top-level 'domain' must be a non-empty string");
  else domain = skel.domain;
  if (skel.level === undefined) {
    warn("level missing (defaults to 'serious amateur aiming at professional competence')");
  } else if (typeof skel.level !== "string") {
    error("top-level 'level' must be a string");
  }
  for (const key of ["schools", "clusters", "spine", "nodes"]) {
    if (!Array.isArray(skel[key])) error(`top-level '${key}' must be an array`);
  }
  schools = Array.isArray(skel.schools) ? skel.schools : [];
  clusters = Array.isArray(skel.clusters) ? skel.clusters : [];
  spine = Array.isArray(skel.spine) ? skel.spine : [];
  skelNodes = Array.isArray(skel.nodes) ? skel.nodes : [];
}

const idSet = new Set(); // valid skeleton node ids
const byId = new Map(); // node id -> node (first occurrence wins)

if (skelOk) {
  // ---- schools: ids first (quarrels_with may reference any school), then fields
  const schoolIds = new Set();
  for (const s of schools) {
    if (s && typeof s === "object" && !Array.isArray(s) && isNonEmptyString(s.id)) schoolIds.add(s.id);
  }
  const seenSchool = new Set();
  for (let i = 0; i < schools.length; i++) {
    const s = schools[i];
    if (s === null || typeof s !== "object" || Array.isArray(s)) {
      error(`schools[${i}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(s.id)) {
      error(`schools[${i}] missing non-empty string 'id'`);
      continue;
    }
    if (seenSchool.has(s.id)) error(`duplicate school id: ${s.id}`);
    seenSchool.add(s.id);
    for (const f of ["name", "optimises_for", "gives_up"]) {
      if (!isNonEmptyString(s[f])) error(`school '${s.id}' missing non-empty string '${f}'`);
    }
    if (!Array.isArray(s.quarrels_with)) {
      error(`school '${s.id}' 'quarrels_with' must be an array`);
    } else {
      for (const q of s.quarrels_with) {
        if (!isNonEmptyString(q)) error(`school '${s.id}' quarrels_with entries must be strings`);
        else if (!schoolIds.has(q)) error(`school '${s.id}' quarrels_with references unknown school '${q}'`);
      }
    }
  }

  // ---- clusters: ids first, then fields
  const clusterIds = new Set();
  for (const c of clusters) {
    if (c && typeof c === "object" && !Array.isArray(c) && isNonEmptyString(c.id)) clusterIds.add(c.id);
  }
  const seenCluster = new Set();
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    if (c === null || typeof c !== "object" || Array.isArray(c)) {
      error(`clusters[${i}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(c.id)) {
      error(`clusters[${i}] missing non-empty string 'id'`);
      continue;
    }
    if (seenCluster.has(c.id)) error(`duplicate cluster id: ${c.id}`);
    seenCluster.add(c.id);
    for (const f of ["name", "gist"]) {
      if (!isNonEmptyString(c[f])) error(`cluster '${c.id}' missing non-empty string '${f}'`);
    }
    // icon is part of the spec (renderers fall back to a generic glyph) — warn, don't fail
    if (!isNonEmptyString(c.icon)) warn(`cluster '${c.id}' has no 'icon' (an emoji) — renderers will use a fallback glyph`);
  }

  // ---- skeleton nodes, pass 1: shape, identity, cluster membership, hours
  const domainRe = domain ? new RegExp(`^${escapeRegExp(domain)}\\.([a-z0-9-]+)\\.([a-z0-9-]+)$`) : null;
  for (let i = 0; i < skelNodes.length; i++) {
    const n = skelNodes[i];
    const what = (n && typeof n === "object" && isNonEmptyString(n.id)) ? n.id : `nodes[${i}]`;
    if (n === null || typeof n !== "object" || Array.isArray(n)) {
      error(`nodes[${i}] must be an object`);
      continue;
    }
    const keys = Object.keys(n);
    const missing = SKELETON_FIELDS.filter((k) => !(k in n));
    const extra = keys.filter((k) => !SKELETON_FIELDS.includes(k));
    if (missing.length || extra.length) {
      error(
        `skeleton node '${what}' must carry exactly [${SKELETON_FIELDS.join(", ")}]` +
          (missing.length ? `; missing: ${missing.join(", ")}` : "") +
          (extra.length ? `; extra fields (pass-B paste in the wrong file?): ${extra.join(", ")}` : ""),
      );
    }
    if (!isNonEmptyString(n.id)) {
      error(`skeleton node '${what}' missing non-empty string 'id'`);
      continue;
    }
    if (idSet.has(n.id)) {
      error(`duplicate node id: ${n.id}`);
      continue;
    }
    idSet.add(n.id);
    byId.set(n.id, n);
    if (domainRe) {
      const m = n.id.match(domainRe);
      if (!m) {
        error(`node id '${n.id}' must match ^${domain}\\.[a-z0-9-]+\\.[a-z0-9-]+$`);
      } else if (m[1] !== n.cluster) {
        error(`node '${n.id}' id cluster '${m[1]}' does not match its cluster field '${n.cluster}'`);
      }
    }
    if (!clusterIds.has(n.cluster)) error(`node '${n.id}' references unknown cluster '${n.cluster}'`);
    if (!isNonEmptyString(n.label)) error(`node '${n.id}' missing non-empty string 'label'`);
    if (!Number.isInteger(n.tier) || n.tier < 1) error(`node '${n.id}' tier must be an integer >= 1`);
    if (!isStrArr(n.prereqs)) error(`node '${n.id}' 'prereqs' must be an array of strings`);
    if (!isNonEmptyString(n.one_line)) error(`node '${n.id}' missing non-empty string 'one_line'`);
    if (typeof n.hours !== "number" || !Number.isFinite(n.hours)) {
      error(`node '${n.id}' hours must be a number`);
    } else if (n.hours < 5 || n.hours > 60) {
      error(`node '${n.id}' hours ${n.hours} outside 5-60`);
    }
  }

  // ---- graph pass: prereq existence, counts, tiers, cycles, reachability
  const tier1Ids = [];
  for (const n of skelNodes) {
    if (!idSet.has(n.id)) continue; // identity errors already reported
    const prereqs = Array.isArray(n.prereqs) ? n.prereqs.filter((p) => isNonEmptyString(p)) : [];
    for (const p of prereqs) {
      if (!idSet.has(p)) error(`node '${n.id}' hard prereq '${p}' does not exist`);
    }
    if (prereqs.length > 3) error(`node '${n.id}' has ${prereqs.length} hard prereqs (max 3)`);
    if (Number.isInteger(n.tier)) {
      if (n.tier === 1 && prereqs.length > 0) error(`tier-1 node '${n.id}' must have zero hard prereqs`);
      if (n.tier > 1 && prereqs.length === 0) error(`node '${n.id}' has no hard prereqs but tier is ${n.tier}`);
      const maxPrereqTier = prereqs.reduce((m, p) => Math.max(m, byId.get(p)?.tier ?? 0), 0);
      const expected = maxPrereqTier + 1;
      if (n.tier !== expected) error(`node '${n.id}' tier ${n.tier} but hard prereqs imply tier ${expected}`);
    }
    if (Number.isInteger(n.tier) && n.tier === 1) tier1Ids.push(n.id);
  }

  const state = new Map(); // 0 unvisited, 1 visiting, 2 done
  const stack = [];
  let cycleReported = false;
  const visit = (id) => {
    if (cycleReported) return;
    const st = state.get(id) ?? 0;
    if (st === 1) {
      error(`cycle detected: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}`);
      cycleReported = true;
      return;
    }
    if (st === 2) return;
    state.set(id, 1);
    stack.push(id);
    for (const p of byId.get(id)?.prereqs ?? []) {
      if (idSet.has(p)) visit(p);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of idSet) visit(id);

  const dependents = new Map(); // prereq id -> [dependent node ids]
  for (const n of skelNodes) {
    if (!idSet.has(n.id)) continue;
    for (const p of n.prereqs ?? []) {
      if (!idSet.has(p)) continue;
      if (!dependents.has(p)) dependents.set(p, []);
      dependents.get(p).push(n.id);
    }
  }
  const seen = new Set();
  const queue = [...tier1Ids];
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of dependents.get(id) ?? []) queue.push(d);
  }
  for (const id of idSet) {
    if (!seen.has(id)) error(`node '${id}' is not reachable from any tier-1 node`);
  }

  // ---- spine
  // Length is a calibration target, not a law: tiers strictly increase along
  // any prereq chain, so in a 4-6 tier mesh domain an 8-12 entry spine is
  // arithmetically impossible (max chain = max tier). Warn outside the
  // ±30% band [6,16]; the graph test below is what makes it a real path.
  if (spine.length < 6 || spine.length > 16) {
    warn(`spine length ${spine.length} is outside the calibration band 6-16 (target 8-12 ±30%)`);
  }
  const seenSpine = new Set();
  for (const s of spine) {
    if (!isNonEmptyString(s)) error("spine entries must be strings");
    else if (!idSet.has(s)) error(`spine entry '${s}' does not exist`);
    else if (seenSpine.has(s)) error(`spine contains duplicate entry '${s}'`);
    seenSpine.add(s);
  }
  if (spine.length > 0) {
    const firstNode = byId.get(spine[0]);
    if (firstNode && Number.isInteger(firstNode.tier) && firstNode.tier !== 1) {
      error(`spine must start at a tier-1 node, '${spine[0]}' is tier ${firstNode.tier}`);
    }
  }
  // Consecutive spine entries must form a chain in the graph's transitive
  // closure — "shortest path from a tier-1 node to competence" read honestly.
  // A gap here is a data defect: the spine would render as disconnected gold.
  const ancestorOf = (from, to) => {
    const stack = [...(byId.get(to)?.prereqs ?? [])];
    const seenSet = new Set();
    while (stack.length) {
      const p = stack.pop();
      if (p === from) return true;
      if (seenSet.has(p)) continue;
      seenSet.add(p);
      for (const pp of byId.get(p)?.prereqs ?? []) stack.push(pp);
    }
    return false;
  };
  for (let i = 0; i + 1 < spine.length; i++) {
    const a = spine[i];
    const b = spine[i + 1];
    if (!idSet.has(a) || !idSet.has(b)) continue;
    if (!ancestorOf(a, b)) {
      error(`spine gap: '${a}' is not a hard-prereq ancestor of the next spine entry '${b}'`);
    }
  }

  // ---------------------------------------------------------------- bodies

  const bodiesDir = path.join(target, "bodies");
  const bodyNodes = []; // every body node across batches
  const bodyIds = new Set(); // node ids that have a body
  const BODY_REQUIRED = ["soft_prereqs", "know_what", "know_how", "habits", "know_why", "school_weights", "checkpoint", "common_failure", "sources"];
  const BODY_ALLOWED = new Set([...SKELETON_FIELDS, ...BODY_REQUIRED]);
  const WEIGHT_VALUES = new Set(["high", "normal", "low", "rejected"]);

  if (fs.existsSync(bodiesDir)) {
    let files = [];
    try {
      files = fs.readdirSync(bodiesDir).filter((f) => f.endsWith(".json")).sort();
    } catch (e) {
      error(`cannot read bodies dir: ${e.message}`);
    }
    for (const file of files) {
      const batchPath = path.join(bodiesDir, file);
      const dataRes = readJson(batchPath, `bodies/${file}`);
      if (!dataRes.ok) continue;
      const data = dataRes.value;

      let nodes = null;
      let ids = null;
      if (Array.isArray(data)) {
        nodes = data;
      } else if (typeof data === "object" && !Array.isArray(data)) {
        if (!Array.isArray(data.nodes)) {
          error(`bodies/${file} envelope must have a 'nodes' array`);
          continue;
        }
        nodes = data.nodes;
        if (data.ids !== undefined && !isStrArr(data.ids)) {
          error(`bodies/${file} envelope 'ids' must be an array of strings`);
          continue;
        }
        ids = Array.isArray(data.ids) ? data.ids : null;
        if (domain !== null && data.domain !== undefined && data.domain !== domain) {
          error(`bodies/${file} envelope domain '${data.domain}' does not match skeleton domain '${domain}'`);
        }
      } else {
        error(`bodies/${file} must be an array of nodes or an envelope { ids, nodes }`);
        continue;
      }

      // The envelope's ids array is the "exactly the requested ids" contract.
      if (ids !== null) {
        const idsSet = new Set(ids);
        const nodeIdsInBatch = nodes.map((n) => (n && typeof n === "object" && isNonEmptyString(n.id)) ? n.id : null);
        const nodeSet = new Set(nodeIdsInBatch);
        for (const id of ids) if (!nodeSet.has(id)) error(`bodies/${file} envelope ids lists '${id}' but no such node is present`);
        for (const id of nodeIdsInBatch) if (id !== null && !idsSet.has(id)) error(`bodies/${file} node '${id}' is present but not listed in envelope ids`);
        if (ids.length !== idsSet.size) error(`bodies/${file} envelope ids contains duplicates`);
      }

      const seenBody = new Set();
      for (const n of nodes) {
        const id = n && typeof n === "object" ? n.id : null;
        if (isNonEmptyString(id)) {
          if (seenBody.has(id)) error(`bodies/${file} contains duplicate node id '${id}'`);
          seenBody.add(id);
        }
      }
      bodyNodes.push(...nodes);
    }
  }

  for (const n of bodyNodes) {
    if (n === null || typeof n !== "object" || Array.isArray(n)) {
      error("body node must be an object");
      continue;
    }
    if (!isNonEmptyString(n.id)) {
      error("body node missing non-empty string 'id'");
      continue;
    }
    const id = n.id;
    const skelNode = byId.get(id);
    if (!skelNode) {
      warn(`orphaned body batch: node '${id}' is absent from the skeleton`);
      continue;
    }
    bodyIds.add(id);

    for (const k of SKELETON_FIELDS) {
      if (k in n && !isDeepStrictEqual(n[k], skelNode[k])) {
        error(`body for '${id}' redefines skeleton field '${k}'`);
      }
    }
    const unknown = Object.keys(n).filter((k) => !BODY_ALLOWED.has(k));
    if (unknown.length) error(`body for '${id}' has unknown fields: ${unknown.join(", ")}`);
    for (const k of BODY_REQUIRED) {
      if (!(k in n)) error(`body for '${id}' missing required field '${k}'`);
    }

    if (n.soft_prereqs !== undefined) {
      if (!isStrArr(n.soft_prereqs)) error(`body for '${id}' soft_prereqs must be an array of strings`);
      else for (const sp of n.soft_prereqs) if (!idSet.has(sp)) error(`body for '${id}' soft_prereq '${sp}' does not exist in the skeleton`);
    }
    for (const k of ["know_what", "know_how", "habits"]) {
      if (n[k] !== undefined && !bulletOk(n[k], 5, 12)) {
        error(`body for '${id}' ${k} must have 5-12 non-empty string bullets`);
      }
    }
    if (n.sources !== undefined && !bulletOk(n.sources, 1, Number.POSITIVE_INFINITY)) {
      error(`body for '${id}' sources must have at least 1 non-empty string`);
    }
    if (n.know_why !== undefined && n.know_why !== null) {
      const kw = n.know_why;
      const ok =
        typeof kw === "object" &&
        !Array.isArray(kw) &&
        isDeepStrictEqual(Object.keys(kw).sort(), ["because", "claim", "disputed_by", "source"]) &&
        Object.values(kw).every((v) => typeof v === "string");
      if (!ok) error(`body for '${id}' know_why must be null or { claim, because, disputed_by, source }`);
    }
    if (n.school_weights !== undefined) {
      const sw = n.school_weights;
      if (sw === null || typeof sw !== "object" || Array.isArray(sw)) {
        error(`body for '${id}' school_weights must be an object`);
      } else {
        const schoolIds = new Set(schools.map((s) => s.id));
        for (const [k, v] of Object.entries(sw)) {
          if (!schoolIds.has(k)) error(`body for '${id}' school_weights references unknown school '${k}'`);
          if (!WEIGHT_VALUES.has(v)) error(`body for '${id}' school_weights['${k}'] has invalid value '${v}' (high|normal|low|rejected)`);
        }
      }
    }
    if (n.checkpoint !== undefined && !isNonEmptyString(n.checkpoint)) error(`body for '${id}' checkpoint must be a non-empty string`);
    if (n.common_failure !== undefined && !isNonEmptyString(n.common_failure)) error(`body for '${id}' common_failure must be a non-empty string`);
    if (isNonEmptyString(n.checkpoint) && /\b(understand|feels? like|knows? that)\b/i.test(n.checkpoint)) {
      warn(`body for '${id}' checkpoint reads like a feeling, not a performance: "${n.checkpoint.slice(0, 80)}"`);
    }
  }

  // ---------------------------------------------------------------- warns & notes

  const withKw = bodyNodes.filter((n) => n && typeof n === "object" && n.know_why !== null && typeof n.know_why === "object").length;
  if (bodyNodes.length > 0) {
    const ratio = withKw / bodyNodes.length;
    if (ratio < 0.1 || ratio > 0.4) {
      warn(`know_why present on ${withKw}/${bodyNodes.length} bodies (${Math.round(ratio * 100)}%); expected roughly 1 in 4 (10-40%)`);
    }
  }

  const t1Count = skelNodes.filter((n) => Number.isInteger(n.tier) && n.tier === 1).length;
  if (skelNodes.length > 0 && t1Count / skelNodes.length > 0.35) {
    warn(`tier-1 width is ${t1Count}/${skelNodes.length} (${Math.round((t1Count / skelNodes.length) * 100)}%); wide tier 1 suggests missing hierarchy`);
  }

  const tierCount = new Set(skelNodes.map((n) => n.tier).filter((t) => Number.isInteger(t))).size;
  const calibration = [
    ["node", skelNodes.length, 40, 60],
    ["cluster", clusters.length, 5, 8],
    ["tier", tierCount, 4, 6],
    ["school", schools.length, 3, 5],
  ];
  for (const [what, count, lo, hi] of calibration) {
    if (count < lo * 0.7 || count > hi * 1.3) {
      warn(`${what} count ${count} outside ${lo}-${hi} (+-30%: ${Math.ceil(lo * 0.7)}-${Math.floor(hi * 1.3)})`);
    }
  }

  const bodyless = skelNodes.filter((n) => !bodyIds.has(n.id)).length;
  if (bodyless > 0) note(`${bodyless} of ${skelNodes.length} nodes have no body yet (informational)`);

  // ---------------------------------------------------------------- stability

  if (cli.stability) {
    const prevRes = readJson(path.resolve(cli.against), "previous skeleton");
    const prev = prevRes.ok ? prevRes.value : undefined;
    if (prev !== undefined && prev !== null && typeof prev === "object" && !Array.isArray(prev)) {
      let prevIds = [];
      if (Array.isArray(prev.nodes)) prevIds = prev.nodes.map((n) => n && n.id).filter(isNonEmptyString);
      else if (prev.nodes && typeof prev.nodes === "object" && !Array.isArray(prev.nodes)) prevIds = Object.keys(prev.nodes);
      else error("previous skeleton has no node ids (expected { nodes: [...] })");
      const prevSet = new Set(prevIds);
      for (const id of prevSet) {
        if (!idSet.has(id)) error(`stability: id '${id}' was in the previous skeleton but is missing (removed or renamed)`);
      }
      for (const id of idSet) {
        if (!prevSet.has(id)) note(`stability: new id '${id}'`);
      }
      // Orphaned body batches vs the new skeleton already warn above.
    }
  }
}

// ---------------------------------------------------------------- summary

console.log(`OK: ${cli.target} — ${skelNodes.length} nodes, ${errorCount} errors, ${warnCount} warnings`);
process.exit(errorCount > 0 ? 1 : 0);

/**
 * data.ts — the build-time data layer (server-side only; uses node:fs).
 *
 * Loads every domain dir under domains/, merges the skeleton with ALL
 * bodies/*.json batches per domain (skeleton defines structure; bodies are
 * keyed by node id, later batch wins), and returns typed DomainData.
 * Read-only over domains/ — this never writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BodyNode, DomainData, MergedNode, SkeletonNode } from './types';

const DOMAINS_ROOT = path.resolve(process.cwd(), 'domains');

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** All domain slugs under domains/ (directories containing a skeleton.json). */
export function listDomains(): string[] {
  if (!fs.existsSync(DOMAINS_ROOT)) return [];
  return fs
    .readdirSync(DOMAINS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(DOMAINS_ROOT, d.name, 'skeleton.json')))
    .map((d) => d.name)
    .sort();
}

/** Load and merge one domain; null when the slug has no skeleton.json. */
export function loadDomain(slug: string): DomainData | null {
  const dir = path.join(DOMAINS_ROOT, slug);
  const skelPath = path.join(dir, 'skeleton.json');
  if (!fs.existsSync(skelPath)) return null;

  const skel = readJson(skelPath) as {
    domain: string;
    level?: string;
    schools?: DomainData['schools'];
    clusters?: DomainData['clusters'];
    spine?: string[];
    nodes?: SkeletonNode[];
  };

  // Merge ALL bodies batches — later batch wins per node id (filename order
  // is the batch order; the envelope {domain, batch, ids, nodes} is supported).
  const bodies: Record<string, BodyNode> = {};
  const batches: DomainData['batches'] = [];
  const bodiesDir = path.join(dir, 'bodies');
  if (fs.existsSync(bodiesDir)) {
    const files = fs.readdirSync(bodiesDir).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
      const envelope = readJson(path.join(bodiesDir, f)) as {
        domain?: string;
        batch?: unknown;
        ids?: string[];
        nodes?: BodyNode[];
      };
      const nodes = envelope.nodes ?? [];
      batches.push({ id: f.replace(/\.json$/, ''), count: nodes.length });
      for (const n of nodes) bodies[n.id] = n; // later batch wins
    }
  }

  const spineSet = new Set(skel.spine ?? []);
  const nodes: MergedNode[] = (skel.nodes ?? []).map((n) => {
    const body = bodies[n.id];
    return {
      ...n,
      one_line: n.one_line ?? '',
      soft_prereqs: body?.soft_prereqs ?? [],
      school_weights: body?.school_weights ?? {},
      hasBody: body !== undefined,
      spine: spineSet.has(n.id),
    };
  });

  return {
    domain: skel.domain,
    level: skel.level ?? '',
    schools: skel.schools ?? [],
    clusters: skel.clusters ?? [],
    spine: skel.spine ?? [],
    nodes,
    bodies,
    batches,
  };
}

/** All domains, sorted by slug. */
export function loadAllDomains(): DomainData[] {
  return listDomains()
    .map((slug) => loadDomain(slug))
    .filter((d): d is DomainData => d !== null);
}

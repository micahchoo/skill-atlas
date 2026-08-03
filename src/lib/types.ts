/**
 * types.ts — the KTG data contract (ktg-prompt.md schema) plus the merged
 * shapes the site builds on. Shared by the server-side data layer and the
 * client-side tree renderer.
 */

export interface School {
  id: string;
  name: string;
  optimises_for: string;
  gives_up: string;
  quarrels_with: string[];
}

export interface Cluster {
  id: string;
  name: string;
  gist: string;
}

/** A node exactly as the skeleton defines it (pass-A of the KTG frame). */
export interface SkeletonNode {
  id: string;
  label: string;
  tier: number;
  cluster: string;
  prereqs: string[];
  one_line: string;
  hours: number;
}

export interface KnowWhy {
  claim: string;
  because: string;
  disputed_by: string;
  source: string;
}

export type SchoolWeight = 'high' | 'normal' | 'low' | 'rejected';

/** A node exactly as a body batch defines it (pass-B of the KTG frame). */
export interface BodyNode {
  id: string;
  label: string;
  tier: number;
  cluster: string;
  prereqs: string[];
  soft_prereqs?: string[];
  one_line: string;
  hours: number;
  know_what?: string[];
  know_how?: string[];
  habits?: string[];
  know_why?: KnowWhy | null;
  school_weights?: Partial<Record<string, SchoolWeight>>;
  checkpoint?: string;
  common_failure?: string;
  sources?: string[];
}

/** A node after the merge: skeleton structure + everything bodies add. */
export interface MergedNode extends SkeletonNode {
  soft_prereqs: string[];
  school_weights: Partial<Record<string, SchoolWeight>>;
  hasBody: boolean;
  spine: boolean;
}

/**
 * A fully merged domain: skeleton defines the graph, every bodies/*.json
 * batch contributes per-node bodies (later batch wins on overlap).
 */
export interface DomainData {
  domain: string;
  level: string;
  schools: School[];
  clusters: Cluster[];
  spine: string[];
  nodes: MergedNode[];
  bodies: Record<string, BodyNode>;
  /** one entry per bodies/*.json file, in filename order */
  batches: { id: string; count: number }[];
}

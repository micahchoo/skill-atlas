/**
 * palette.ts — shared color vocabulary (cluster hues + lens grammar).
 * Pure constants so server-rendered chrome and the client SVG agree.
 */

/** 7 cluster hues, indexed by cluster order (prototype palette). */
export const CLUSTER_COLORS = ['#2563eb', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#4f772d'];

export function clusterColor(order: number): string {
  return CLUSTER_COLORS[((order % CLUSTER_COLORS.length) + CLUSTER_COLORS.length) % CLUSTER_COLORS.length];
}

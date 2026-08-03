/**
 * render.js — SVG drawing primitives + viewer chrome for the tree-renderer
 * prototype. Shared by all three variants (each variant still owns its layout
 * and may ignore these helpers freely). No layout knowledge here.
 *
 * Viewer: one <svg> holding a transformable <g id="world">. Wheel zooms about
 * the cursor, drag on empty space pans, and the host can wire slider/buttons.
 */

const NS = 'http://www.w3.org/2000/svg';

export function el(name, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/** Node box size from label length — shared so all three variants agree. */
export function nodeSize(label) {
  return { w: Math.min(178, Math.max(90, 16 + label.length * 5.4)), h: 24 };
}

/** Horizontal-tangent cubic bezier between two points. bend = tangent fraction. */
export function bezier(x1, y1, x2, y2, bend = 0.5) {
  const dx = x2 - x1;
  return `M ${x1} ${y1} C ${x1 + dx * bend} ${y1}, ${x2 - dx * bend} ${y2}, ${x2} ${y2}`;
}

/** Vertical-tangent cubic bezier (for top-to-bottom flows). */
export function bezierV(x1, y1, x2, y2, bend = 0.45) {
  const dy = y2 - y1;
  return `M ${x1} ${y1} C ${x1} ${y1 + dy * bend}, ${x2} ${y2 - dy * bend}, ${x2} ${y2}`;
}

/**
 * Create the svg + world group + tooltip overlay. Returns a viewer handle:
 *   fit(box, pad)  — zoom/pan so content box is fully visible
 *   zoomBy(f, cx, cy) — scale about a point in screen space
 *   setView(k, tx, ty), getView(), clear()
 *   onZoom(cb) — fired after any view change
 */
export function setupViewer(container) {
  const svg = el('svg', { class: 'viewer', tabindex: 0 });
  const defs = el('defs', {}, svg);
  // arrowhead marker for hard edges
  el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs)
    .appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#8a93a6' }));
  el('marker', { id: 'arrow-soft', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs)
    .appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#a6adbb' }));
  const world = el('g', { id: 'world' }, svg);
  const tooltip = el('div', { class: 'tooltip', hidden: '' }, container);
  container.appendChild(svg);

  const view = { k: 1, tx: 0, ty: 0 };
  const zoomCbs = [];

  function apply() {
    world.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.k})`);
    for (const cb of zoomCbs) cb(view.k);
  }
  function setView(k, tx, ty) {
    view.k = Math.min(3, Math.max(0.08, k));
    view.tx = tx; view.ty = ty;
    apply();
  }
  function zoomBy(f, cx, cy) {
    const k2 = Math.min(3, Math.max(0.08, view.k * f));
    const r = k2 / view.k;
    setView(k2, cx - (cx - view.tx) * r, cy - (cy - view.ty) * r);
  }
  function fit(box, pad = 40) {
    const vb = svg.getBoundingClientRect();
    const k = Math.min(3, Math.max(0.08, Math.min((vb.width - pad * 2) / box.w, (vb.height - pad * 2) / box.h)));
    setView(k, (vb.width - box.w * k) / 2 - box.x * k, (vb.height - box.h * k) / 2 - box.y * k);
  }
  function clear() {
    while (world.firstChild) world.removeChild(world.firstChild);
    tooltip.hidden = true;
  }

  // --- wheel zoom about cursor ---
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // --- drag to pan (ignore node elements so hover stays easy) ---
  let dragging = false, lx = 0, ly = 0;
  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-id]')) return; // nodes drag nothing
    dragging = true; lx = e.clientX; ly = e.clientY;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    setView(view.k, view.tx + (e.clientX - lx), view.ty + (e.clientY - ly));
    lx = e.clientX; ly = e.clientY;
  });
  svg.addEventListener('pointerup', () => { dragging = false; svg.classList.remove('panning'); });
  svg.addEventListener('pointercancel', () => { dragging = false; svg.classList.remove('panning'); });

  return {
    svg, world, tooltip, setView, zoomBy, fit, clear, getView: () => ({ ...view }),
    onZoom(cb) { zoomCbs.push(cb); },
  };
}

/** Draw one node rect + centered label. Returns the <g> (has data-id).
 * Pass w to override the auto-sized width (variants with tight columns use this). */
export function drawNode(world, node, x, y, cls = '', w = null) {
  const size = nodeSize(node.label);
  const width = w ?? size.w;
  const h = size.h;
  const g = el('g', { class: `node ${cls}`.trim(), 'data-id': node.id }, world);
  g.appendChild(el('rect', { x, y, width, height: h, rx: 5 }));
  const text = el('text', { x: x + width / 2, y: y + h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
  text.textContent = node.label;
  return g;
}

/** Draw a hard edge (arrow) or soft edge (no arrow) between two points. */
export function drawEdge(world, x1, y1, x2, y2, cls, d) {
  return el('path', { d, class: `edge ${cls}`.trim(), fill: 'none', 'marker-end': cls.includes('soft') ? 'url(#arrow-soft)' : 'url(#arrow)' }, world);
}

/**
 * Hover tooltip (delegated): shows label, spine badge, tier/cluster/hours,
 * one_line, and school weights when the body data has any.
 */
export function bindTooltip(viewer, graph) {
  viewer.svg.addEventListener('pointerover', (e) => {
    const g = e.target.closest('[data-id]');
    if (!g) return;
    const n = graph.byId.get(g.dataset.id);
    if (!n) return;
    const parts = [
      `<b>${n.label}</b>${n.spine ? ' <span class="tip-spine">★ spine</span>' : ''}`,
      `Tier ${n.tier} · ${graph.clusterMeta.get(n.cluster)?.name ?? n.cluster} · ${n.hours} h${n.hasBody ? '' : ' · no body yet'}`,
      n.one_line ? `<div class="tip-line">${n.one_line}</div>` : '',
    ];
    if (n.school_weights && Object.keys(n.school_weights).length) {
      const sw = Object.entries(n.school_weights)
        .map(([k, v]) => `${graph.schools.find((s) => s.id === k)?.name ?? k}: ${v}`)
        .join(' · ');
      parts.push(`<div class="tip-line">${sw}</div>`);
    }
    viewer.tooltip.innerHTML = parts.filter(Boolean).join('<br>');
    viewer.tooltip.hidden = false;
  });
  viewer.svg.addEventListener('pointermove', (e) => {
    if (viewer.tooltip.hidden) return;
    const r = viewer.tooltip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    viewer.tooltip.style.left = x + 'px';
    viewer.tooltip.style.top = y + 'px';
  });
  viewer.svg.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('#world')) {
      viewer.tooltip.hidden = true;
    }
  });
}

/** Palette of 7 cluster hues, index by clusterOrder. */
export const CLUSTER_COLORS = ['#2563eb', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#4f772d'];
export function clusterColor(graph, clusterId) {
  return CLUSTER_COLORS[graph.clusterOrder.get(clusterId) % CLUSTER_COLORS.length];
}

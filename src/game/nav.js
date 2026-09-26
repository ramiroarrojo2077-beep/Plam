// Grafo de navegación con Dijkstra sobre los puntos de paso del plano.
import * as THREE from 'three';
import { WAYPOINTS, EDGES } from '../world/layout.js';

const nodes = {};
for (const [id, p] of Object.entries(WAYPOINTS)) nodes[id] = { id, pos: new THREE.Vector3(...p), adj: [] };
for (const [a, b] of EDGES) {
  const d = nodes[a].pos.distanceTo(nodes[b].pos);
  nodes[a].adj.push([b, d]);
  nodes[b].adj.push([a, d]);
}

export function wp(id) {
  return nodes[id].pos;
}

export function findPath(from, to) {
  if (from === to) return [nodes[to].pos.clone()];
  const dist = { [from]: 0 };
  const prev = {};
  const open = new Set([from]);
  while (open.size) {
    let best = null;
    for (const id of open) if (best === null || dist[id] < dist[best]) best = id;
    open.delete(best);
    if (best === to) break;
    for (const [n, d] of nodes[best].adj) {
      const nd = dist[best] + d;
      if (dist[n] === undefined || nd < dist[n]) {
        dist[n] = nd;
        prev[n] = best;
        open.add(n);
      }
    }
  }
  if (dist[to] === undefined) return null;
  const ids = [];
  for (let c = to; c !== undefined; c = prev[c]) ids.unshift(c);
  ids.shift();
  return ids.map((id) => nodes[id].pos.clone());
}

export function pathLength(points, start) {
  let d = 0;
  let p = start;
  for (const q of points) {
    d += p.distanceTo(q);
    p = q;
  }
  return d;
}

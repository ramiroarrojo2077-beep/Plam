// Utilidades de geometría: esculpido de esferas, tornos, cápsulas, colores por vértice
// y un "batcher" que fusiona la geometría estática por material para reducir draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
export const simplex = new SimplexNoise({ random: mulberryRandom(1234) });

function mulberryRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const gauss = (x, mu, s) => Math.exp(-((x - mu) * (x - mu)) / (2 * s * s));

// Recalcula normales y promedia las de vértices duplicados en costuras (esferas, tornos).
export function smoothNormals(geo) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let arr = map.get(k);
    if (!arr) map.set(k, (arr = []));
    arr.push(i);
  }
  for (const arr of map.values()) {
    if (arr.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of arr) {
      x += nor.getX(i);
      y += nor.getY(i);
      z += nor.getZ(i);
    }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of arr) nor.setXYZ(i, x / l, y / l, z / l);
  }
  nor.needsUpdate = true;
  return geo;
}

// Esfera unitaria deformada por una función (recibe un Vector3 sobre la esfera unidad).
export function sculptSphere(ws, hs, fn) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const r = fn(_v.clone()) || _v;
    p.setXYZ(i, r.x, r.y, r.z);
  }
  return smoothNormals(g);
}

export function ellipsoid(rx, ry, rz, ws = 32, hs = 24) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return smoothNormals(g);
}

// Perfil [[radio, y], ...] de abajo hacia arriba.
export function lathe(profile, seg = 32) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
  const g = new THREE.LatheGeometry(pts, seg);
  return smoothNormals(g);
}

// Cápsula cónica a lo largo de -Y, desde y=0 (radio r0) hasta y=-len (radio r1).
export function capsuleProfile(len, r0, r1, capSeg = 6, bulge = 0, mid = 8) {
  const pts = [];
  for (let i = 0; i <= capSeg; i++) {
    const a = -Math.PI / 2 + (i / capSeg) * (Math.PI / 2);
    pts.push([Math.cos(a) * r1, -len + Math.sin(a) * r1 * 0.9 + r1 * 0.9]);
  }
  for (let i = 1; i < mid; i++) {
    const t = i / mid;
    const y = -len + r1 * 0.9 + t * (len - r1 * 0.9 - r0 * 0.9);
    const r = r1 + (r0 - r1) * t + Math.sin(t * Math.PI) * bulge;
    pts.push([r, y]);
  }
  for (let i = 0; i <= capSeg; i++) {
    const a = (i / capSeg) * (Math.PI / 2);
    pts.push([Math.cos(a) * r0, -r0 * 0.9 + Math.sin(a) * r0 * 0.9]);
  }
  return pts;
}

export function capsule(len, r0, r1, seg = 24, bulge = 0) {
  return lathe(capsuleProfile(len, r0, r1, 6, bulge), seg);
}

export function roundedBox(w, h, d, r = 0.02, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

export function tube(points, radius = 0.01, seg = 32, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  return new THREE.TubeGeometry(curve, seg, radius, radial, closed);
}

// Asigna colores por vértice. `c` puede ser THREE.Color o función (pos, normal) => THREE.Color.
export function colorize(geo, c) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const arr = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let cc;
    if (typeof c === 'function') {
      _v.fromBufferAttribute(pos, i);
      if (nor) _n.fromBufferAttribute(nor, i);
      cc = c(_v, _n, col);
    } else cc = c;
    arr[i * 3] = cc.r;
    arr[i * 3 + 1] = cc.g;
    arr[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Oscurece los colores por vértice con ruido 3D (suciedad / desgaste).
export function grime(geo, amount = 0.25, scale = 6, seed = 0, offset = null) {
  const pos = geo.attributes.position;
  let colAttr = geo.attributes.color;
  if (!colAttr) {
    colorize(geo, new THREE.Color(1, 1, 1));
    colAttr = geo.attributes.color;
  }
  const o = offset || new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) + o.x) * scale + seed * 13.1;
    const y = (pos.getY(i) + o.y) * scale;
    const z = (pos.getZ(i) + o.z) * scale;
    let nn = simplex.noise3d(x, y, z) * 0.6 + simplex.noise3d(x * 3.1, y * 3.1, z * 3.1) * 0.4;
    nn = Math.max(0, nn);
    const k = 1 - amount * nn;
    colAttr.setXYZ(i, colAttr.getX(i) * k, colAttr.getY(i) * k, colAttr.getZ(i) * k);
  }
  colAttr.needsUpdate = true;
  return geo;
}

// UV por proyección cúbica en coordenadas de mundo (tras aplicar la matriz).
export function boxUV(geo, scale = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) {
      u = x; v = z;
    } else if (nx >= nz) {
      u = z; v = y;
    } else {
      u = x; v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Agrupa geometrías estáticas por material y las fusiona en pocas mallas.
export class StaticBatcher {
  constructor() {
    this.groups = new Map();
  }

  add(geo, material, matrix = null, { cast = true, receive = true, worldUV = 0 } = {}) {
    let g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (worldUV) g = boxUV(g, worldUV);
    const key = `${material.uuid}|${cast ? 1 : 0}|${receive ? 1 : 0}`;
    let entry = this.groups.get(key);
    if (!entry) {
      entry = { material, cast, receive, geos: [] };
      this.groups.set(key, entry);
    }
    entry.geos.push(g);
    return g;
  }

  addMesh(mesh, opts) {
    mesh.updateMatrixWorld(true);
    return this.add(mesh.geometry, mesh.material, mesh.matrixWorld, opts);
  }

  build(parent) {
    const meshes = [];
    for (const entry of this.groups.values()) {
      const wantColor = !!entry.material.vertexColors;
      const list = entry.geos.map((g0) => {
        let g = g0.index ? g0.toNonIndexed() : g0;
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (wantColor && !g.attributes.color) colorize(g, new THREE.Color(1, 1, 1));
        if (!wantColor && g.attributes.color) g.deleteAttribute('color');
        g.morphAttributes = {};
        return g;
      });
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, entry.material);
      mesh.castShadow = entry.cast;
      mesh.receiveShadow = entry.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
}

// Fusiona, por material, las mallas hijas estáticas de cada nodo (reduce draw calls
// de los animatrónicos sin afectar a las articulaciones). Las mallas con userData.keep se respetan.
export function mergeStaticChildren(root) {
  const nodes = [];
  root.traverse((n) => nodes.push(n));
  for (const node of nodes) {
    const meshes = node.children.filter((c) => c.isMesh && !c.userData.keep && c.children.length === 0);
    if (meshes.length < 2) continue;
    const groups = new Map();
    for (const m of meshes) {
      const k = `${m.material.uuid}|${m.castShadow ? 1 : 0}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const wantColor = !!list[0].material.vertexColors;
      const geos = list.map((m) => {
        m.updateMatrix();
        let g = m.geometry.clone();
        if (g.index) g = g.toNonIndexed();
        g.applyMatrix4(m.matrix);
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        }
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (wantColor && !g.attributes.color) colorize(g, new THREE.Color(1, 1, 1));
        if (!wantColor && g.attributes.color) g.deleteAttribute('color');
        return g;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = true;
      for (const m of list) node.remove(m);
      node.add(mesh);
    }
  }
}

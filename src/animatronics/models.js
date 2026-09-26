// Modelado procedural de los animatrónicos: Bruno (oso), Bastián (conejo),
// Chiqui (pollo) y Rufo (zorro). Todo se esculpe a partir de primitivas deformadas,
// tornos y tubos, con colores por vértice (costuras, parches, suciedad) y un
// endoesqueleto metálico visible en cuello, codos, muñecas, rodillas y tobillos.
import * as THREE from 'three';
import { Animatronic } from './rig.js';
import { sculptSphere, ellipsoid, lathe, colorize, tube, roundedBox, gauss, smoothNormals, mergeStaticChildren, simplex } from '../core/geom.js';
import { furMaterial } from '../core/materials.js';
import { genEye } from '../core/textures.js';

const TAU = Math.PI * 2;
const C = (hex) => new THREE.Color(hex);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
// Superelipsoide: lleva un punto de la esfera unidad hacia un cubo redondeado (e < 1 = más cuadrado).
const sq = (v, ex, ey = ex, ez = ex) => new THREE.Vector3(spow(v.x, ex), spow(v.y, ey), spow(v.z, ez));

// Convierte las secciones circulares de un torno (alrededor de Y) en "cuadrados redondeados".
function squircle(geo, n = 2.6, keepWidth = true) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const c = Math.abs(x / r);
    const s = Math.abs(z / r);
    let f = 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
    if (keepWidth) f = 1 + (f - 1) * 0.85;
    p.setX(i, x * f);
    p.setZ(i, z * f);
  }
  return smoothNormals(geo);
}

export const CHARACTERS = {
  bear: {
    name: 'Bruno', species: 'oso', fur: 0x6a4424, belly: 0xcda274, sheen: 0x8a6040, eye: 0x4d86d8, scale: 0.84, headScale: 1.14, lidRest: 0.22, jawMax: 0.62, jawRest: 0.13,
    desc: 'La estrella del escenario. Casi nunca abandona el escenario... hasta que los demás se han ido. Evita las cámaras y se mueve a oscuras.',
  },
  bunny: {
    name: 'Bastián', species: 'conejo', fur: 0x5852c4, belly: 0xb3aaea, sheen: 0x8a82e0, eye: 0xd0105a, scale: 0.82, headScale: 1.1, lidRest: 0.16, jawMax: 0.55, jawRest: 0.13,
    desc: 'El guitarrista. El más inquieto de todos: recorre el ala oeste y aparece sin avisar en la puerta izquierda.',
  },
  chicken: {
    name: 'Chiqui', species: 'pollo', fur: 0xe2ac22, belly: 0xf3d58a, sheen: 0xe0bc70, eye: 0x7a3cc8, scale: 0.83, headScale: 1.12, lidRest: 0.12, jawMax: 0.6, jawRest: 0.1,
    desc: 'Siempre con su magdalena. Merodea por la cocina y los baños antes de acercarse por el ala este.',
  },
  fox: {
    name: 'Rufo', species: 'zorro', fur: 0xa0301f, belly: 0xcca67c, sheen: 0xc06448, eye: 0xe8b400, scale: 0.88, headScale: 1.08, lidRest: 0.2, jawMax: 0.95, jawRest: 0.1,
    desc: 'El pirata de la Cueva, fuera de servicio. Si no lo vigilas, sale corriendo por el pasillo oeste.',
  },
};

// ------------------------------------------------------------------ utilidades
function add(geo, mat, parent, pos = null, rot = null, scale = null, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Colores del traje: variación de tono a baja frecuencia (fieltro desteñido) y
// suciedad parda acumulada, con más mugre en las zonas bajas de cada pieza.
const DIRT = new THREE.Color(0x2a1c10);
function furGeo(geo, color, amount = 0.28, seed = 0, scale = 6) {
  colorize(geo, color);
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const hgt = Math.max(1e-3, bb.max.y - bb.min.y);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    const fade = simplex.noise3d(x * 2.2 + seed, y * 2.2, z * 2.2) * 0.07;
    const hue = simplex.noise3d(x * 3.1, y * 3.1 + seed, z * 3.1) * 0.025;
    c.offsetHSL(hue, fade * 0.6, fade);
    let d = simplex.noise3d(x * scale + seed * 3.7, y * scale, z * scale) * 0.5 + simplex.noise3d(x * scale * 2.7, y * scale * 2.7, z * scale * 2.7 + seed) * 0.3;
    d = Math.max(0, d + 0.05) * amount * 1.2;
    d += amount * 0.45 * sstep(0.45, 0.0, (y - bb.min.y) / hgt);
    c.lerp(DIRT, Math.min(0.75, d));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return geo;
}

// Costura: oscurece una franja fina alrededor de ciertos ángulos (lathe alrededor de Y).
function seamed(base, angles, width = 0.035, dark = 0.55) {
  return (p) => {
    const a = Math.atan2(p.x, p.z);
    let m = 0;
    for (const s of angles) m = Math.max(m, sstep(width, 0, Math.abs(wrapA(a - s))));
    const c = typeof base === 'function' ? base(p) : base.clone();
    return c.multiplyScalar(1 - m * (1 - dark));
  };
}

function registry(A) {
  if (A) return { joint: (n, p, x, y, z) => A.addJoint(n, p, x, y, z), lids: A.lids, eyes: A.eyes, fingers: A.fingers };
  return {
    joint: (n, p, x, y, z) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      p.add(o);
      return o;
    },
    lids: [],
    eyes: [],
    fingers: { L: [], R: [] },
  };
}

// Segmento de traje acolchado a lo largo de -Y: extremos casi planos con bisel redondeado.
function segmentGeo(len, r0, r1, { bulge = 0.01, fillet = 0.035, back = 0, seg = 32, square = 2.5 } = {}) {
  const f1 = Math.min(fillet, r1 * 0.6);
  const f0 = Math.min(fillet, r0 * 0.6);
  const pts = [[0.001, -len]];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push([r1 - f1 + Math.cos(a) * f1, -len + f1 + Math.sin(a) * f1]);
  }
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    pts.push([r1 + (r0 - r1) * t + Math.sin(t * Math.PI) * bulge, -len + f1 + t * (len - f1 - f0)]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([r0 - f0 + Math.cos(a) * f0, -f0 + Math.sin(a) * f0]);
  }
  pts.push([0.001, 0]);
  const g = lathe(pts, seg);
  if (square > 2.01) squircle(g, square);
  if (back) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z < 0) p.setZ(i, z * (1 + back * gauss(p.getY(i), -len * 0.38, len * 0.22)));
    }
    smoothNormals(g);
  }
  return g;
}

// Hunde la superficie de una esfera unitaria alrededor de ciertas direcciones (cuencas).
function dent(v, dirs, depth, width) {
  let k = 0;
  for (const d of dirs) {
    const cosA = v.x * d.x + v.y * d.y + v.z * d.z;
    const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
    k = Math.max(k, gauss(ang, 0, width));
  }
  return 1 - depth * k;
}

// Quita triángulos (agujeros de desgarro). Devuelve los vértices del borde.
function cutHole(geo, test) {
  const idx = geo.index.array;
  const pos = geo.attributes.position;
  const keep = [];
  const removedV = new Set();
  const keptV = new Set();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    d.fromBufferAttribute(pos, idx[i + 2]);
    c.copy(a).add(b).add(d).multiplyScalar(1 / 3);
    if (test(c)) {
      removedV.add(idx[i]).add(idx[i + 1]).add(idx[i + 2]);
    } else {
      keep.push(idx[i], idx[i + 1], idx[i + 2]);
      keptV.add(idx[i]).add(idx[i + 1]).add(idx[i + 2]);
    }
  }
  geo.setIndex(keep);
  const border = [];
  for (const v of removedV) if (keptV.has(v)) border.push(new THREE.Vector3().fromBufferAttribute(pos, v));
  return border;
}

function addEye(reg, parent, x, y, z, r, eyeMat, fur, lidColor, lower = true) {
  const pivot = new THREE.Object3D();
  pivot.position.set(x, y, z);
  parent.add(pivot);
  const g = new THREE.SphereGeometry(r, 40, 28);
  g.rotateX(Math.PI / 2);
  const mesh = add(g, eyeMat, pivot);
  mesh.userData.keep = true;
  const lidGeo = furGeo(new THREE.SphereGeometry(r * 1.12, 36, 12, 0, TAU, 0, Math.PI / 2), lidColor, 0.18, 3, 20);
  const lid = add(lidGeo, fur, pivot);
  lid.userData.keep = true;
  reg.lids.push(lid);
  // Borde grueso del párpado (fieltro doblado)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.1, r * 0.09, 8, 36), fur);
  colorize(rim.geometry, lidColor.clone().multiplyScalar(0.8));
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = false;
  lid.add(rim);
  if (lower) {
    const low = furGeo(new THREE.SphereGeometry(r * 1.08, 36, 6, 0, TAU, Math.PI * 0.76, Math.PI * 0.24), lidColor, 0.18, 4, 20);
    add(low, fur, pivot, null, [-0.3, 0, 0]);
  }
  reg.eyes.push({ pivot, mesh, yaw: 0, pitch: 0 });
  return pivot;
}

// Diente esculpido: raíz arriba (+Y), punta abajo. Cara frontal plana, bordes redondeados,
// marfil amarillento con manchas en la raíz y el borde gastado.
const IVORY = new THREE.Color(0xe9dfc6);
const STAIN = new THREE.Color(0x6b5230);
function toothGeo(w, h, d, fang, seed) {
  const g = sculptSphere(18, 14, (v0) => {
    const v = sq(v0, fang ? 0.75 : 0.5, 0.75, fang ? 0.75 : 0.5);
    const tip = (1 - v0.y) / 2;
    const taper = fang ? Math.max(0.04, 1 - tip * 0.95) : 1 - tip * 0.18;
    const z = v.z * (d / 2) * (1 - tip * (fang ? 0.5 : 0.35)) - (v0.z < 0 ? 0 : tip * d * 0.08);
    return v0.set(v.x * (w / 2) * taper, v.y * (h / 2), z);
  });
  const shade = 0.82 + Math.abs(Math.sin(seed * 12.9898)) * 0.22;
  colorize(g, (p) => {
    const root = sstep(-h * 0.1, h * 0.5, p.y);
    const n = simplex.noise3d(p.x * 90 + seed, p.y * 90, p.z * 90) * 0.5 + 0.5;
    return IVORY.clone().multiplyScalar(shade).lerp(STAIN, Math.min(0.85, root * 0.55 + n * 0.18 + (fang ? 0.08 : 0)));
  });
  return g;
}

function teethRow(parent, M, { count, rx, rz, y, zc, size, pointed = false, arc = 1.05, up = false, big = null, gap = null, seed = 1 }) {
  const rootY = y;
  const gumPts = [];
  for (let i = 0; i <= 16; i++) {
    const a = -arc * 1.08 + (2 * arc * 1.08 * i) / 16;
    gumPts.push(new THREE.Vector3(Math.sin(a) * rx * 0.98, rootY + (up ? -0.004 : 0.004), zc + Math.cos(a) * rz * 0.98 - 0.004));
  }
  add(tube(gumPts, size * 0.32, 32, 8), M.gum, parent, null, null, null, false);
  const spacing = (2 * arc * Math.hypot(rx, rz) * 0.5) / Math.max(1, count - 1);
  for (let i = 0; i < count; i++) {
    if (gap && gap.includes(i)) continue;
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = -arc + 2 * arc * t;
    const rnd = Math.abs(Math.sin((i + 1) * 78.233 + seed * 3.1));
    const isBig = big && big.includes(i);
    const s = (isBig ? 1.65 : 1) * (0.9 + rnd * 0.2);
    const edge = Math.abs(t - 0.5) * 2;
    const w = Math.min(spacing * 0.92, size * 0.95) * (isBig ? 1.4 : 1) * (1 - edge * 0.15);
    const h = size * (pointed ? 1.7 : 1.25) * s * (1 - edge * (pointed ? 0.1 : 0.25));
    const d = size * (pointed ? 0.55 : 0.5);
    const geo = toothGeo(w, h, d, pointed, i + seed * 10);
    const m = add(geo, M.teethV, parent, [Math.sin(a) * rx, rootY + (up ? 1 : -1) * h * 0.42, zc + Math.cos(a) * rz], [0, a, 0], null, false);
    m.rotateX((up ? -1 : 1) * 0.12 + (rnd - 0.5) * 0.12);
    m.rotateZ((rnd - 0.5) * 0.16);
    if (up) m.rotateZ(Math.PI);
  }
}

function endoRod(parent, M, from, to, r = 0.018, mat = null) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 10);
  const m = add(g, mat || M.metal, parent);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// Articulación metálica (eje X por defecto): cubo de acero, tapas, tornillos y bieletas.
function metalJoint(parent, M, r, len, pos = [0, 0, 0], axis = 'x', rods = true) {
  const rot = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  add(new THREE.CylinderGeometry(r, r, len, 22), M.metal, parent, pos, rot);
  add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, len + 0.016, 16), M.darkMetal, parent, pos, rot);
  add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, len + 0.03, 8), M.chrome, parent, pos, rot);
  if (axis === 'x') {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        add(new THREE.CylinderGeometry(r * 0.1, r * 0.1, 0.008, 6), M.chrome, parent, [pos[0] + sx * (len / 2 + 0.004), pos[1] + Math.sin(a) * r * 0.78, pos[2] + Math.cos(a) * r * 0.78], [0, 0, Math.PI / 2], null, false);
      }
    }
    if (rods) {
      endoRod(parent, M, [pos[0] + 0.02, pos[1] + 0.07, pos[2] + r * 0.55], [pos[0] + 0.02, pos[1] - 0.08, pos[2] + r * 0.55], 0.009, M.chrome);
      endoRod(parent, M, [pos[0] - 0.025, pos[1] + 0.06, pos[2] - r * 0.6], [pos[0] - 0.025, pos[1] - 0.07, pos[2] - r * 0.6], 0.011);
      add(tube([[pos[0] + r * 0.9, pos[1] + 0.07, pos[2]], [pos[0] + r * 1.15, pos[1], pos[2] + 0.01], [pos[0] + r * 0.9, pos[1] - 0.07, pos[2]]], 0.005, 10, 4), M.cable, parent, null, null, null, false);
    }
  }
}

// ------------------------------------------------------------------ manos y pies
function buildHand(reg, wrist, side, ctx, color, endo = false) {
  const { fur, M } = ctx;
  const s = side > 0 ? 'L' : 'R';
  const mat = endo ? M.metal : fur;
  const col = (g) => (endo ? g : furGeo(g, color, 0.25, side * 7, 12));
  if (endo) {
    add(roundedBox(0.035, 0.11, 0.12, 0.012), M.darkMetal, wrist, [0, -0.09, 0]);
    for (const z of [-0.035, 0.035]) endoRod(wrist, M, [0, 0.0, z * 0.5], [0, -0.15, z], 0.008, M.chrome);
  } else {
    // Palma tipo manopla: superelipse, más plana en X (la palma mira hacia el cuerpo)
    const palm = sculptSphere(32, 24, (v) => {
      const x = spow(v.x, 0.85) * 0.06;
      const z = spow(v.z, 0.7) * 0.1;
      const y = v.y * 0.105 - (v.y < 0 ? Math.abs(v.z) * 0.012 : 0);
      return v.set(x + (x * side < 0 ? 0 : x * 0.15), y, z);
    });
    add(col(palm), mat, wrist, [0, -0.105, 0.005]);
    // Puño del guante
    add(col(segmentGeo(0.05, 0.085, 0.082, { fillet: 0.02 })), mat, wrist, [0, 0.01, 0]);
  }
  const zs = [-0.068, -0.023, 0.023, 0.068];
  const lens = [0.078, 0.06, 0.05];
  for (let f = 0; f < 4; f++) {
    const chain = [];
    let parent = reg.joint(`f${s}${f}`, wrist, side * -0.004, -0.195, zs[f] * 0.95);
    parent.rotation.x = (f - 1.5) * 0.07;
    const scaleF = f === 0 ? 0.86 : f === 3 ? 0.93 : 1;
    for (let k = 0; k < 3; k++) {
      const L = lens[k] * scaleF;
      if (endo) {
        add(new THREE.CylinderGeometry(0.009, 0.009, L, 8).translate(0, -L / 2, 0), M.metal, parent);
        add(new THREE.SphereGeometry(0.013, 8, 6), M.darkMetal, parent);
      } else {
        const r = 0.027 - k * 0.0028;
        add(col(segmentGeo(L + r * 0.4, r, r * 0.9, { fillet: r * 0.9, bulge: 0.002, seg: 14 })), mat, parent, [0, r * 0.2, 0]);
      }
      chain.push(parent);
      if (k < 2) parent = reg.joint(`f${s}${f}_${k}`, parent, 0, -L, 0);
    }
    reg.fingers[s].push(chain);
  }
  // Pulgar
  const tb = new THREE.Object3D();
  tb.position.set(side * -0.035, -0.07, 0.1);
  tb.rotation.set(-0.55, 0, side * -0.45);
  wrist.add(tb);
  const t0 = reg.joint(`t${s}0`, tb, 0, 0, 0);
  const t1 = reg.joint(`t${s}1`, t0, 0, -0.062, 0);
  if (endo) {
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 8).translate(0, -0.03, 0), M.metal, t0);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8).translate(0, -0.025, 0), M.metal, t1);
  } else {
    add(col(segmentGeo(0.07, 0.031, 0.028, { fillet: 0.025, seg: 14 })), mat, t0, [0, 0.008, 0]);
    add(col(segmentGeo(0.058, 0.028, 0.024, { fillet: 0.022, seg: 14 })), mat, t1);
  }
  const thumb = [t0, t1];
  thumb.thumb = true;
  reg.fingers[s].push(thumb);
}

function buildFoot(ankle, ctx, color, kind, seed) {
  const { fur, M } = ctx;
  if (kind === 'chicken') {
    // Pata de ave: tres dedos largos hacia delante y uno atrás, con garras
    add(furGeo(sculptSphere(24, 16, (v) => v.set(v.x * 0.09, Math.max(v.y, -0.6) * 0.07, v.z * 0.1)), color, 0.3, seed), fur, ankle, [0, -0.07, 0.02]);
    for (const [ry, len] of [[-0.42, 0.22], [0, 0.26], [0.42, 0.22], [Math.PI, 0.12]]) {
      const toe = new THREE.Group();
      toe.position.set(0, -0.09, 0.02);
      toe.rotation.y = ry;
      ankle.add(toe);
      add(furGeo(segmentGeo(len, 0.038, 0.03, { fillet: 0.025, seg: 16 }), color, 0.3, seed + 1), fur, toe, [0, 0, 0.0], [-Math.PI / 2, 0, 0]);
      add(new THREE.ConeGeometry(0.016, 0.06, 8), M.plasticBlack, toe, [0, -0.01, len + 0.025], [Math.PI / 2 + 0.3, 0, 0]);
    }
    return;
  }
  const g = sculptSphere(40, 26, (v) => {
    let y = v.y;
    if (y < -0.5) y = -0.5 - (y + 0.5) * 0.06;
    const front = Math.max(0, v.z);
    const x = spow(v.x, 0.8) * 0.142 * (1 + front * 0.16);
    const z = v.z * 0.25 + (v.z > 0 ? 0.035 * v.z : 0);
    return v.set(x, y * 0.09 - front * front * 0.012, z);
  });
  add(furGeo(g, color, 0.42, seed), fur, ankle, [0, -0.072, 0.075]);
  // Dedos
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.07;
    add(furGeo(ellipsoid(0.042, 0.036, 0.05, 16, 12), color, 0.42, seed + i), fur, ankle, [x, -0.09, 0.33 - Math.abs(i - 1) * 0.02]);
  }
  // Tobillera metálica que asoma
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 16), M.darkMetal, ankle, [0, -0.02, 0.0]);
}

// ------------------------------------------------------------------ cuerpo común
function buildBody(A, cfg, ctx, opts = {}) {
  const { fur, M } = ctx;
  const cF = C(cfg.fur);
  const cB = C(cfg.belly);
  const reg = registry(A);
  A.body.scale.setScalar(cfg.scale);
  const hipY = 0.06 + 0.46 + 0.42 + 0.118;
  A.hipBase = hipY;
  const hips = A.addJoint('hips', A.body, 0, hipY, 0);
  const pantsC = opts.pantsColor ? C(opts.pantsColor) : cF;
  const pelvis = sculptSphere(40, 28, (v0) => {
    const v = sq(v0, 0.72, 0.85, 0.75);
    const y = v.y < 0 ? v.y * 0.21 : v.y * 0.2;
    return v0.set(v.x * 0.295 * (1 - Math.max(0, -v0.y) * 0.14), y, v.z * (v.z > 0 ? 0.25 : 0.26));
  });
  add(furGeo(pelvis, seamed(pantsC, [0, Math.PI], 0.03, 0.6), 0.32, 1), fur, hips, [0, -0.035, 0]);

  const spine = A.addJoint('spine', hips, 0, 0.1, 0);
  const prof = opts.torsoProfile || [
    [0.001, -0.17], [0.19, -0.155], [0.28, -0.08], [0.335, 0.04], [0.36, 0.17], [0.362, 0.3], [0.35, 0.42], [0.335, 0.52], [0.322, 0.6], [0.295, 0.67], [0.225, 0.735], [0.12, 0.775], [0.001, 0.79],
  ];
  const tw = opts.torsoW ?? 1.1;
  const td = opts.torsoD ?? 0.84;
  const bellyF = opts.bellyF ?? 0.2;
  const shapeTorso = (g, push = 0) => {
    const tp = g.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i);
      const x = tp.getX(i) * (tw + 0.13 * gauss(y, 0.6, 0.1));
      let z = tp.getZ(i);
      if (z > 0) z *= td + bellyF * gauss(y, 0.18, 0.16) - 0.05 * gauss(y, 0.52, 0.1);
      else z *= 0.8 + 0.04 * gauss(y, 0.4, 0.2);
      tp.setXYZ(i, x, y, z);
    }
    smoothNormals(g);
    if (push) {
      const nr = g.attributes.normal;
      for (let i = 0; i < tp.count; i++) tp.setXYZ(i, tp.getX(i) + nr.getX(i) * push, tp.getY(i) + nr.getY(i) * push, tp.getZ(i) + nr.getZ(i) * push);
    }
    return g;
  };
  const tg = shapeTorso(squircle(lathe(prof, 64), opts.torsoSquare ?? 2.7));
  if (opts.bib) {
    const sub = [];
    for (let i = 0; i <= 12; i++) {
      const y = opts.bib[0] + (opts.bib[1] - opts.bib[0]) * (i / 12);
      let r = 0;
      for (let k = 0; k < prof.length - 1; k++) {
        const [r0, y0] = prof[k];
        const [r1, y1] = prof[k + 1];
        if (y >= y0 && y <= y1) r = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      }
      sub.push(new THREE.Vector2(r, y));
    }
    const bg = shapeTorso(squircle(new THREE.LatheGeometry(sub, 32, -0.85, 1.7), opts.torsoSquare ?? 2.7), 0.012);
    const bib = add(bg, M.bib, spine);
    bib.castShadow = false;
  }
  const bellyCol = (p) => {
    const e = (p.x / (opts.bellyW ?? 0.22)) ** 2 + ((p.y - 0.25) / 0.24) ** 2;
    const n = simplex.noise3d(p.x * 9, p.y * 9, 3.3) * 0.08;
    const m = sstep(1.08 + n, 0.78 + n, e) * sstep(0.05, 0.2, p.z);
    return cF.clone().lerp(cB, m);
  };
  const torsoCol = seamed(opts.bellyPatch === false ? cF : bellyCol, [Math.PI / 2, -Math.PI / 2, Math.PI], 0.022, 0.62);
  furGeo(tg, torsoCol, 0.3, 2, 5);
  if (opts.torsoHole) cutHole(tg, opts.torsoHole);
  const torsoMesh = add(tg, opts.torsoHole ? A.furDouble : fur, spine);
  if (opts.torsoHole) {
    torsoMesh.userData.keep = true;
    // Interior visible: placa del pecho, costillas metálicas, columna, motor y cableado
    add(sculptSphere(28, 20, (v0) => { const v = sq(v0, 0.8); return v0.set(v.x * 0.24, v.y * 0.3, v.z * 0.16); }), M.darkMetal, spine, [0.02, 0.34, -0.03]);
    for (let i = 0; i < 4; i++) {
      const y = 0.25 + i * 0.055;
      endoRod(spine, M, [-0.07, y, 0.16], [0.19, y + 0.01, 0.16], 0.009, M.metal);
    }
    endoRod(spine, M, [0.06, 0.2, 0.18], [0.06, 0.5, 0.18], 0.014, M.chrome);
    endoRod(spine, M, [0.02, 0.0, 0.02], [0.02, 0.7, 0.02], 0.032, M.darkMetal);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 16), M.metal, spine, [0.1, 0.33, 0.14], [Math.PI / 2, 0, 0]);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 10), M.chrome, spine, [0.1, 0.33, 0.16], [Math.PI / 2, 0, 0]);
    add(tube([[-0.02, 0.24, 0.1], [0.05, 0.3, 0.22], [0.12, 0.26, 0.2], [0.16, 0.18, 0.12]], 0.01, 16, 5), M.cableRed, spine);
    add(tube([[0.12, 0.46, 0.1], [0.04, 0.4, 0.22], [-0.03, 0.3, 0.19]], 0.01, 16, 5), M.cableYellow, spine);
    add(tube([[0.0, 0.46, 0.12], [0.09, 0.38, 0.25], [0.13, 0.33, 0.24]], 0.008, 12, 5), M.cable, spine);
  }

  const chest = A.addJoint('chest', spine, 0, 0.45, 0);

  // Cuello: endoesqueleto con fuelle de goma y cables
  const neck = A.addJoint('neck', chest, 0, 0.33, 0.01);
  endoRod(neck, M, [0, -0.16, 0], [0, 0.16, 0], 0.035);
  const ridges = [];
  for (let i = 0; i <= 16; i++) ridges.push([0.058 + (i % 2 ? 0.012 : 0), -0.075 + (i / 16) * 0.15]);
  add(lathe(ridges, 22), M.boot, neck);
  add(new THREE.CylinderGeometry(0.075, 0.09, 0.03, 20), M.darkMetal, neck, [0, -0.09, 0]);
  add(tube([[0.05, -0.18, 0.04], [0.075, -0.02, 0.05], [0.05, 0.12, 0.04]], 0.008, 12, 5), M.cableRed, neck);
  add(tube([[-0.05, -0.18, 0.03], [-0.08, 0.0, 0.02], [-0.05, 0.13, 0.03]], 0.008, 12, 5), M.cable, neck);
  add(tube([[0.0, -0.18, -0.06], [0.02, 0.0, -0.085], [0.0, 0.13, -0.05]], 0.009, 12, 5), M.cableYellow, neck);

  const head = A.addJoint('head', neck, 0, 0.12, 0.02);
  head.scale.setScalar(cfg.headScale || 1);

  // Brazos
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R';
    const sh = A.addJoint('shoulder' + s, chest, side * 0.38, 0.19, -0.01);
    const pad = sculptSphere(32, 24, (v0) => {
      const v = sq(v0, 0.75);
      return v0.set(v.x * 0.135, v.y * (v.y > 0 ? 0.12 : 0.135), v.z * 0.135);
    });
    add(furGeo(pad, cF, 0.3, 5 + side), fur, sh, [side * 0.015, 0.0, 0]);
    add(furGeo(segmentGeo(0.33, 0.106, 0.094, { bulge: 0.012 }), seamed(cF, [side * -Math.PI / 2], 0.05, 0.65), 0.28, 6 + side), fur, sh, [0, -0.02, 0]);
    const el = A.addJoint('elbow' + s, sh, 0, -0.39, 0);
    metalJoint(el, M, 0.042, 0.13);
    const endoFore = opts.endoForearm && opts.endoForearm.includes(s);
    if (endoFore) {
      endoRod(el, M, [0.025, 0, 0], [0.02, -0.34, 0], 0.016);
      endoRod(el, M, [-0.025, 0, 0.01], [-0.02, -0.34, 0.01], 0.012, M.darkMetal);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12), M.darkMetal, el, [0, -0.12, 0.02]);
      add(tube([[0, -0.02, 0.04], [0.03, -0.18, 0.05], [0, -0.33, 0.03]], 0.006, 12, 4), M.cableRed, el);
      const torn = segmentGeo(0.09, 0.098, 0.092, { fillet: 0.02 });
      const tp = torn.attributes.position;
      for (let i = 0; i < tp.count; i++) if (tp.getY(i) < -0.05) tp.setY(i, Math.max(tp.getY(i), -0.06 - Math.abs(Math.sin(Math.atan2(tp.getZ(i), tp.getX(i)) * 6)) * 0.035));
      smoothNormals(torn);
      add(furGeo(torn, cF, 0.45, 9), A.furDouble || fur, el, [0, -0.03, 0]);
    } else {
      add(furGeo(segmentGeo(0.3, 0.096, 0.082, { bulge: 0.014 }), seamed(cF, [side * -Math.PI / 2], 0.05, 0.65), 0.28, 7 + side), fur, el, [0, -0.03, 0]);
    }
    const wr = A.addJoint('wrist' + s, el, 0, -0.37, 0);
    metalJoint(wr, M, 0.032, 0.05, [0, 0.012, 0], 'z', false);
    if (opts.hook && s === 'R') buildHook(wr, M);
    else buildHand(reg, wr, side, ctx, cF, endoFore);
  }

  // Piernas
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R';
    const th = A.addJoint('thigh' + s, hips, side * 0.165, -0.06, 0);
    const tgeo = segmentGeo(0.41, 0.152, 0.122, { bulge: 0.014, fillet: 0.045 });
    if (opts.pantsColor) {
      const p = tgeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < -0.3) p.setY(i, Math.max(y, -0.34 - Math.abs(Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 5)) * 0.06));
      }
      smoothNormals(tgeo);
    }
    add(furGeo(tgeo, seamed(pantsC, [side * -Math.PI / 2], 0.04, 0.65), 0.32, 8 + side), opts.pantsColor ? A.furDouble || fur : fur, th);
    const kn = A.addJoint('knee' + s, th, 0, -0.46, 0);
    metalJoint(kn, M, 0.05, 0.17);
    if (opts.endoShins) {
      endoRod(kn, M, [0.04, 0, 0], [0.035, -0.4, 0], 0.02);
      endoRod(kn, M, [-0.04, 0, 0], [-0.035, -0.4, 0], 0.02);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12), M.darkMetal, kn, [0, -0.16, 0.035]);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10), M.chrome, kn, [0, -0.28, 0.035]);
      const scrap = segmentGeo(0.13, 0.12, 0.112, { fillet: 0.03 });
      const sp = scrap.attributes.position;
      for (let i = 0; i < sp.count; i++) if (sp.getY(i) < -0.08) sp.setY(i, Math.max(sp.getY(i), -0.09 - Math.abs(Math.sin(Math.atan2(sp.getZ(i), sp.getX(i)) * 4 + side)) * 0.05));
      smoothNormals(scrap);
      add(furGeo(scrap, cF, 0.45, 11 + side), A.furDouble || fur, kn, [0, -0.03, 0]);
      add(tube([[0.02, -0.05, 0.05], [0.05, -0.2, 0.06], [0.02, -0.36, 0.04]], 0.007, 12, 4), M.cableYellow, kn);
    } else {
      add(furGeo(segmentGeo(0.37, 0.122, 0.1, { back: 0.14, fillet: 0.04 }), seamed(cF, [side * -Math.PI / 2], 0.04, 0.65), 0.3, 9 + side), fur, kn, [0, -0.035, 0]);
    }
    const an = A.addJoint('ankle' + s, kn, 0, -0.42, 0);
    metalJoint(an, M, 0.04, 0.11, [0, 0, 0], 'x', false);
    buildFoot(an, ctx, opts.footColor ? C(opts.footColor) : cF, opts.feet, 10 + side);
  }
  return { hips, spine, chest, neck, head, reg, cF, cB };
}

function buildHook(wr, M) {
  add(new THREE.CylinderGeometry(0.065, 0.075, 0.09, 20), M.darkMetal, wr, [0, -0.05, 0]);
  add(new THREE.TorusGeometry(0.068, 0.008, 6, 20), M.chrome, wr, [0, -0.01, 0], [Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(0.014, 0.018, 0.06, 10), M.chrome, wr, [0, -0.115, 0]);
  const hook = tube([[0, -0.12, 0], [0, -0.2, 0.0], [0, -0.27, 0.04], [0, -0.27, 0.12], [0, -0.2, 0.15], [0, -0.155, 0.13]], 0.013, 40, 10);
  add(hook, M.chrome, wr);
  add(new THREE.ConeGeometry(0.013, 0.035, 10), M.chrome, wr, [0, -0.145, 0.12], [0.5, 0, 0]);
}

// ------------------------------------------------------------------ cabezas
export function buildHead(kind, parent, ctx, reg) {
  switch (kind) {
    case 'bear': return bearHead(parent, ctx, reg);
    case 'bunny': return bunnyHead(parent, ctx, reg);
    case 'chicken': return chickenHead(parent, ctx, reg);
    case 'fox': return foxHead(parent, ctx, reg);
    default: return null;
  }
}

function mouthInterior(head, jaw, M, pos, size, jawPos, jawSize) {
  add(ellipsoid(size[0], size[1], size[2], 20, 14), M.mouth, head, pos, null, null, false);
  add(ellipsoid(jawSize[0], jawSize[1], jawSize[2], 20, 10), M.mouth, jaw, jawPos, null, null, false);
}

const eyeDirs = (ex, ey, ez, cy, rx, ry, rz) => [V3(ex / rx, (ey - cy) / ry, ez / rz).normalize(), V3(-ex / rx, (ey - cy) / ry, ez / rz).normalize()];

function bearHead(head, ctx, reg) {
  const { fur, M, eyeMat, colors } = ctx;
  const cF = C(colors.fur);
  const cB = C(colors.belly);
  const E = [0.1, 0.255, 0.238];
  const dirs = eyeDirs(E[0], E[1], E[2], 0.2, 0.3, 0.265, 0.28);
  const hg = sculptSphere(72, 54, (v) => {
    const k = dent(v, dirs, 0.08, 0.19);
    const b = sq(v, 0.8, 0.85, v.z > 0 ? 0.62 : 0.85);
    let x = b.x * 0.29;
    let y = b.y * 0.255;
    let z = b.z * 0.25;
    const cheek = gauss(v.y, -0.3, 0.28) * Math.max(0, Math.abs(v.x) - 0.25) * Math.max(0, v.z + 0.2);
    x += Math.sign(v.x) * cheek * 0.09;
    z += 0.034 * gauss(v.y, 0.34, 0.1) * Math.max(0, v.z) ** 2;
    if (v.y > 0.6) y -= (v.y - 0.6) * 0.06;
    return v.set(x * k, y * k + 0.2, z * k);
  });
  add(furGeo(hg, cF, 0.3, 21, 7), fur, head);
  // Hocico superior: grande y dominante, con la base plana donde asientan los dientes
  const mg = sculptSphere(56, 36, (v0) => {
    const v = sq(v0, 0.6, 0.65, 0.6);
    let y = v.y;
    if (y < -0.35) y = -0.35 + (y + 0.35) * 0.15;
    const f = Math.max(0, v.z);
    return v0.set(v.x * (0.17 - f * 0.025), y * 0.105 + f * 0.01, v.z * 0.14 + f * 0.03);
  });
  add(furGeo(mg, cB, 0.3, 22, 9), fur, head, [0, 0.1, 0.19]);
  add(sculptSphere(28, 18, (v) => v.set(v.x * 0.062 * (v.y > 0 ? 1 : 0.8), v.y * 0.038 + Math.max(0, v.z) * 0.006, v.z * 0.045)), M.noseBlack, head, [0, 0.165, 0.365], [-0.3, 0, 0]);
  // Mandíbula (más estrecha y retrasada que el hocico)
  const jaw = reg.joint('jaw', head, 0, 0.068, 0.09);
  const jg = sculptSphere(44, 28, (v0) => {
    const v = sq(v0, 0.6, 0.7, 0.62);
    return v0.set(v.x * 0.135 * (1 - Math.max(0, -v0.y) * 0.18), Math.min(v.y, 0.25) * 0.066, v.z * 0.135 + Math.max(0, v.z) * 0.01);
  });
  add(furGeo(jg, cB, 0.32, 23, 9), fur, jaw, [0, -0.018, 0.105]);
  mouthInterior(head, jaw, M, [0, 0.055, 0.17], [0.135, 0.05, 0.13], [0, -0.004, 0.11], [0.12, 0.03, 0.12]);
  teethRow(head, M, { count: 9, rx: 0.13, rz: 0.13, y: 0.058, zc: 0.195, size: 0.036, arc: 1.0, seed: 1 });
  teethRow(jaw, M, { count: 9, rx: 0.12, rz: 0.118, y: 0.0, zc: 0.108, size: 0.032, arc: 1.0, up: true, gap: [2], seed: 2 });
  for (const sx of [1, -1]) {
    addEye(reg, head, sx * E[0], E[1], E[2], 0.056, eyeMat, fur, cF);
    add(new THREE.TorusGeometry(0.068, 0.011, 8, 32, Math.PI * 0.85), M.hatBlack, head, [sx * 0.098, 0.3, 0.255], [0.25, sx * 0.25, Math.PI * 0.08 + (sx > 0 ? 0 : Math.PI * 0.0) + (sx > 0 ? 0.12 : -0.12) + Math.PI * 0.0]);
    const ear = reg.joint(sx > 0 ? 'earL' : 'earR', head, sx * 0.2, 0.43, -0.03);
    ear.rotation.z = -sx * 0.2;
    const eo = sculptSphere(32, 24, (v0) => {
      const v = sq(v0, 0.85, 0.85, 0.45);
      return v0.set(v.x * 0.088, v.y * 0.085, v.z * 0.036 - (v0.z > 0 ? gauss(Math.hypot(v0.x, v0.y), 0, 0.5) * 0.014 : 0));
    });
    add(furGeo(eo, cF, 0.3, 24 + sx), fur, ear, [0, 0.045, 0]);
    add(furGeo(ellipsoid(0.06, 0.06, 0.018, 20, 12), cB, 0.3, 25 + sx), fur, ear, [0, 0.043, 0.02]);
  }
  // Sombrero de copa
  const hat = new THREE.Group();
  hat.position.set(0.02, 0.456, -0.01);
  hat.rotation.set(-0.06, 0, -0.1);
  head.add(hat);
  const brim = lathe([[0.001, 0], [0.155, 0.0], [0.16, 0.008], [0.155, 0.016], [0.1, 0.014], [0.001, 0.014]], 40);
  add(brim, M.hatBlack, hat);
  add(lathe([[0.094, 0.01], [0.096, 0.08], [0.099, 0.155], [0.09, 0.163], [0.001, 0.164]], 40), M.hatBlack, hat);
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.028, 40, 1, true), M.plasticBlack, hat, [0, 0.03, 0]);
  return { jaw };
}

function bunnyHead(head, ctx, reg) {
  const { fur, M, eyeMat, colors } = ctx;
  const cF = C(colors.fur);
  const cB = C(colors.belly);
  const pink = C(0xd97aa6);
  const E = [0.102, 0.27, 0.222];
  const dirs = eyeDirs(E[0], E[1], E[2], 0.21, 0.275, 0.295, 0.27);
  const hg = sculptSphere(72, 54, (v0) => {
    const v = v0;
    const k = dent(v, dirs, 0.08, 0.19);
    const b = sq(v, 0.78, 0.85, v.z > 0 ? 0.62 : 0.85);
    let x = b.x * 0.265 * (1 + Math.max(0, -v.y) * 0.14 - Math.max(0, v.y) * 0.1);
    let y = b.y * 0.29;
    let z = b.z * 0.245;
    const cheek = gauss(v.y, -0.35, 0.3) * Math.max(0, Math.abs(v.x) - 0.15) * Math.max(0, v.z + 0.4);
    x += Math.sign(v.x) * cheek * 0.1;
    z += cheek * 0.03;
    z += 0.022 * gauss(v.y, 0.28, 0.14) * Math.max(0, v.z) ** 2;
    return v.set(x * k, y * k + 0.21, z * k);
  });
  add(furGeo(hg, cF, 0.3, 31, 7), fur, head);
  const mg = sculptSphere(56, 36, (v0) => {
    const v = sq(v0, 0.62, 0.68, 0.62);
    let y = v.y;
    if (y < -0.35) y = -0.35 + (y + 0.35) * 0.15;
    const f = Math.max(0, v.z);
    return v0.set(v.x * (0.152 - f * 0.022), y * 0.098 + f * 0.01, v.z * 0.13 + f * 0.028);
  });
  add(furGeo(mg, cB, 0.3, 32, 9), fur, head, [0, 0.1, 0.18]);
  add(sculptSphere(24, 16, (v) => v.set(v.x * 0.046, v.y * 0.032 + Math.max(0, v.y) * 0.004, v.z * 0.036)), new THREE.MeshPhysicalMaterial({ color: pink, roughness: 0.35, clearcoat: 0.6 }), head, [0, 0.165, 0.335]);
  const jaw = reg.joint('jaw', head, 0, 0.068, 0.085);
  const jg = sculptSphere(44, 28, (v0) => {
    const v = sq(v0, 0.6, 0.7, 0.62);
    return v0.set(v.x * 0.125 * (1 - Math.max(0, -v0.y) * 0.18), Math.min(v.y, 0.25) * 0.062, v.z * 0.125 + Math.max(0, v.z) * 0.01);
  });
  add(furGeo(jg, cB, 0.3, 33, 9), fur, jaw, [0, -0.018, 0.1]);
  mouthInterior(head, jaw, M, [0, 0.052, 0.16], [0.12, 0.048, 0.12], [0, -0.004, 0.1], [0.11, 0.028, 0.11]);
  teethRow(head, M, { count: 8, rx: 0.117, rz: 0.122, y: 0.058, zc: 0.185, size: 0.034, arc: 0.95, big: [3, 4], seed: 3 });
  teethRow(jaw, M, { count: 8, rx: 0.11, rz: 0.108, y: 0.0, zc: 0.103, size: 0.03, arc: 0.95, up: true, seed: 4 });
  for (const sx of [1, -1]) {
    addEye(reg, head, sx * E[0], E[1], E[2], 0.058, eyeMat, fur, cF);
    const s = sx > 0 ? 'L' : 'R';
    const ear = reg.joint('ear' + s, head, sx * 0.1, 0.47, -0.03);
    ear.rotation.set(-0.12, 0, -sx * 0.14);
    const earCol = (p) => {
      const m = sstep(0.0, 0.012, p.z) * sstep(0.048, 0.022, Math.abs(p.x));
      return cF.clone().lerp(cB, m * 0.9);
    };
    const e1 = sculptSphere(28, 24, (v) => v.set(v.x * 0.064 * (1 - Math.max(0, -v.y) * 0.3), v.y * 0.19 + 0.17, v.z * 0.034 - (v.z > 0 ? gauss(v.x, 0, 0.45) * 0.014 : 0)));
    add(furGeo(e1, earCol, 0.28, 34 + sx), fur, ear);
    const ear2 = reg.joint('ear2' + s, ear, 0, 0.32, 0);
    const e2 = sculptSphere(28, 24, (v) => v.set(v.x * 0.06 * (1 - Math.max(0, v.y) * 0.25), v.y * 0.16 + 0.13, v.z * 0.032 - (v.z > 0 ? gauss(v.x, 0, 0.45) * 0.012 : 0)));
    add(furGeo(e2, earCol, 0.28, 35 + sx), fur, ear2);
    if (sx < 0) ear2.rotation.x = 0.55;
  }
  return { jaw };
}

function chickenHead(head, ctx, reg) {
  const { fur, M, eyeMat, colors } = ctx;
  const cF = C(colors.fur);
  const E = [0.102, 0.285, 0.215];
  const dirs = eyeDirs(E[0], E[1], E[2], 0.21, 0.27, 0.285, 0.27);
  const hg = sculptSphere(72, 54, (v) => {
    const k = dent(v, dirs, 0.075, 0.19);
    const b = sq(v, 0.82, 0.88, v.z > 0 ? 0.7 : 0.88);
    let x = b.x * 0.265 * (1 + Math.max(0, -v.y) * 0.08);
    let y = b.y * 0.28;
    let z = b.z * 0.255;
    const cheek = gauss(v.y, -0.3, 0.35) * Math.max(0, Math.abs(v.x) - 0.2) * Math.max(0, v.z + 0.3);
    x += Math.sign(v.x) * cheek * 0.075;
    z += 0.02 * gauss(v.y, 0.3, 0.15) * Math.max(0, v.z) ** 2;
    return v.set(x * k, y * k + 0.21, z * k);
  });
  add(furGeo(hg, cF, 0.28, 41, 7), fur, head);
  // Pico superior con caballete y punta hacia abajo
  const beakU = sculptSphere(56, 32, (v0) => {
    const v = sq(v0, 0.72, 0.8, 0.8);
    let y = v.y;
    if (y < -0.3) y = -0.3 + (y + 0.3) * 0.2;
    const f = Math.max(0, v.z);
    const ridge = gauss(v.x, 0, 0.35) * Math.max(0, v.y) * 0.012;
    return v0.set(v.x * 0.14 * (1 - f * 0.42), y * 0.062 + ridge - f * f * 0.024, v.z * 0.18 + f * 0.035);
  });
  add(furGeo(beakU, C(0xe07a1c), 0.22, 46, 14), M.beak, head, [0, 0.13, 0.2]);
  const jaw = reg.joint('jaw', head, 0, 0.1, 0.1);
  const beakL = sculptSphere(44, 24, (v0) => {
    const v = sq(v0, 0.72, 0.8, 0.8);
    const f = Math.max(0, v.z);
    return v0.set(v.x * 0.12 * (1 - f * 0.4), Math.min(v.y, 0.3) * 0.048, v.z * 0.155 + f * 0.022);
  });
  add(furGeo(beakL, C(0xd26c16), 0.25, 47, 14), M.beak, jaw, [0, -0.022, 0.1]);
  mouthInterior(head, jaw, M, [0, 0.1, 0.17], [0.105, 0.042, 0.12], [0, -0.014, 0.1], [0.1, 0.02, 0.12]);
  teethRow(head, M, { count: 9, rx: 0.102, rz: 0.125, y: 0.1, zc: 0.17, size: 0.026, arc: 1.0, seed: 5 });
  teethRow(jaw, M, { count: 9, rx: 0.096, rz: 0.118, y: -0.014, zc: 0.085, size: 0.024, arc: 1.0, up: true, seed: 6 });
  for (const sx of [1, -1]) {
    addEye(reg, head, sx * E[0], E[1], E[2], 0.057, eyeMat, fur, cF);
    add(new THREE.TorusGeometry(0.062, 0.009, 8, 30, Math.PI * 0.8), M.hatBlack, head, [sx * 0.1, 0.33, 0.232], [0.3, sx * 0.3, Math.PI * 0.1 + (sx > 0 ? 0.25 : -0.25)]);
  }
  // Penacho: abanico de plumas
  for (let i = 0; i < 5; i++) {
    const t = i / 4 - 0.5;
    const f = sculptSphere(18, 14, (v) => v.set(v.x * 0.03 * (1 - Math.max(0, v.y) * 0.5), v.y * 0.1 + 0.085, v.z * 0.012));
    add(furGeo(f, C(0xecb42a), 0.2, 44 + i), fur, head, [t * 0.06, 0.465, 0.03 - Math.abs(t) * 0.05], [-0.25 + Math.abs(t) * 0.3, 0, -t * 1.3]);
  }
  return { jaw };
}

function foxHead(head, ctx, reg) {
  const { fur, M, eyeMat, colors } = ctx;
  const cF = C(colors.fur);
  const cB = C(colors.belly);
  const E = [0.098, 0.28, 0.205];
  const dirs = eyeDirs(E[0], E[1], E[2], 0.21, 0.255, 0.255, 0.27);
  const hg = sculptSphere(72, 54, (v) => {
    const k = dent(v, dirs, 0.08, 0.19);
    const b = sq(v, 0.78, 0.85, v.z > 0 ? 0.65 : 0.85);
    let x = b.x * 0.25;
    let y = b.y * 0.25;
    let z = b.z * 0.245;
    const cheek = gauss(v.y, -0.3, 0.3) * Math.max(0, Math.abs(v.x) - 0.25) * Math.max(0, v.z + 0.2);
    x += Math.sign(v.x) * cheek * 0.11;
    z += 0.022 * gauss(v.y, 0.3, 0.13) * Math.max(0, v.z) ** 2;
    return v.set(x * k, y * k + 0.21, z * k);
  });
  add(furGeo(hg, cF, 0.36, 51, 7), fur, head);
  // Hocico alargado bicolor
  const snoutCol = (p) => cF.clone().lerp(cB, sstep(0.0, -0.03, p.y));
  const sg = sculptSphere(56, 34, (v0) => {
    const v = sq(v0, 0.66, 0.7, 0.8);
    let y = v.y;
    if (y < -0.4) y = -0.4 + (y + 0.4) * 0.15;
    const f = Math.max(0, v.z);
    return v0.set(v.x * 0.115 * (1 - f * 0.38), y * 0.092 * (1 - f * 0.22) + f * 0.018, v.z * 0.21);
  });
  add(furGeo(sg, snoutCol, 0.36, 52, 9), fur, head, [0, 0.14, 0.22]);
  add(ellipsoid(0.042, 0.029, 0.032, 16, 12), M.noseBlack, head, [0, 0.183, 0.425]);
  const jaw = reg.joint('jaw', head, 0, 0.088, 0.08);
  const jg = sculptSphere(44, 24, (v0) => {
    const v = sq(v0, 0.66, 0.75, 0.8);
    const f = Math.max(0, v.z);
    return v0.set(v.x * 0.096 * (1 - f * 0.32), Math.min(v.y, 0.25) * 0.05, v.z * 0.19);
  });
  add(furGeo(jg, cB, 0.36, 53, 9), fur, jaw, [0, -0.012, 0.15]);
  mouthInterior(head, jaw, M, [0, 0.085, 0.2], [0.09, 0.045, 0.17], [0, -0.002, 0.15], [0.085, 0.02, 0.16]);
  teethRow(head, M, { count: 10, rx: 0.085, rz: 0.17, y: 0.078, zc: 0.2, size: 0.03, arc: 0.85, pointed: true, big: [1, 8], seed: 7 });
  teethRow(jaw, M, { count: 10, rx: 0.08, rz: 0.16, y: -0.004, zc: 0.14, size: 0.028, arc: 0.85, pointed: true, up: true, gap: [6], big: [1, 8], seed: 8 });
  for (const sx of [1, -1]) {
    addEye(reg, head, sx * E[0], E[1], E[2], 0.053, eyeMat, fur, cF);
    add(new THREE.TorusGeometry(0.062, 0.011, 8, 30, Math.PI * 0.8), M.mouth, head, [sx * 0.095, 0.325, 0.218], [0.3, sx * 0.3, Math.PI * 0.1 + (sx > 0 ? 0.35 : -0.35)]);
    const s = sx > 0 ? 'L' : 'R';
    const ear = reg.joint('ear' + s, head, sx * 0.15, 0.4, -0.04);
    ear.rotation.set(-0.1, 0, -sx * 0.35);
    const torn = sx < 0;
    const eg = sculptSphere(28, 22, (v) => {
      const t = (v.y + 1) / 2;
      let y = t * 0.25;
      if (torn && t > 0.8) y = 0.8 * 0.25 + (t - 0.8) * 0.05;
      return v.set(v.x * 0.088 * (1 - t * 0.9), y, v.z * 0.036 * (1 - t * 0.7) - (v.z > 0 ? (1 - t) * 0.01 : 0));
    });
    const earCol = (p) => cF.clone().lerp(cB, sstep(0.004, 0.018, p.z) * sstep(0.2, 0.05, p.y) * 0.8);
    add(furGeo(eg, earCol, 0.36, 54 + sx), fur, ear);
  }
  // Parche del ojo levantado sobre la frente + correa que sigue la superficie de la cabeza
  const surf = (d) => {
    const b = sq(d, 0.78, 0.85, d.z > 0 ? 0.65 : 0.85);
    return V3(b.x * 0.25, b.y * 0.25 + 0.21, b.z * 0.245);
  };
  const pd = V3(-0.42, 0.72, 0.56).normalize();
  const pc = surf(pd);
  const e = 0.004;
  const nrm = surf(V3(pd.x + e, pd.y, pd.z).normalize()).sub(pc).cross(surf(V3(pd.x, pd.y + e, pd.z).normalize()).sub(pc)).normalize();
  if (nrm.dot(pd) < 0) nrm.negate();
  const patch = add(sculptSphere(24, 14, (v0) => { const v = sq(v0, 0.8, 0.8, 1); return v0.set(v.x * 0.058, v.y * 0.048, v.z * 0.011); }), M.plasticBlack, head, [pc.x + nrm.x * 0.01, pc.y + nrm.y * 0.01, pc.z + nrm.z * 0.01]);
  patch.quaternion.setFromUnitVectors(V3(0, 0, 1), nrm);
  const axis = new THREE.Vector3().crossVectors(pd, V3(1, 0, -0.35).normalize()).normalize();
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const d = pd.clone().applyAxisAngle(axis, (i / 64) * TAU);
    const p = surf(d);
    pts.push(p.add(d.multiplyScalar(0.006)));
  }
  add(tube(pts, 0.0045, 128, 5, true), M.plasticBlack, head, null, null, null, false);
  return { jaw };
}

// ------------------------------------------------------------------ accesorios
function makeGuitar(M) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, -0.22);
  s.bezierCurveTo(0.21, -0.22, 0.2, -0.03, 0.11, 0.02);
  s.bezierCurveTo(0.17, 0.1, 0.17, 0.21, 0.09, 0.21);
  s.lineTo(0.035, 0.12);
  s.lineTo(-0.035, 0.12);
  s.bezierCurveTo(-0.11, 0.25, -0.21, 0.18, -0.13, 0.04);
  s.bezierCurveTo(-0.22, -0.05, -0.21, -0.22, 0, -0.22);
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.009, bevelSegments: 3, curveSegments: 28 });
  body.translate(0, 0, -0.0225);
  add(body, M.guitar, g);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.6 });
  add(new THREE.BoxGeometry(0.05, 0.52, 0.025), wood, g, [0, 0.37, 0.01]);
  add(new THREE.BoxGeometry(0.075, 0.16, 0.02), M.guitar, g, [0, 0.7, 0.005], [-0.12, 0, 0]);
  add(new THREE.BoxGeometry(0.1, 0.04, 0.01), M.plasticBlack, g, [0, -0.02, 0.034]);
  add(new THREE.BoxGeometry(0.1, 0.04, 0.01), M.plasticBlack, g, [0, 0.06, 0.034]);
  add(new THREE.BoxGeometry(0.08, 0.02, 0.012), M.chrome, g, [0, -0.14, 0.034]);
  for (let i = 0; i < 4; i++) {
    add(new THREE.BoxGeometry(0.0015, 0.8, 0.0015), M.chrome, g, [(i - 1.5) * 0.009, 0.26, 0.036], null, null, false);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), M.chrome, g, [0.042 * (i < 2 ? -1 : 1), 0.66 + (i % 2) * 0.05, 0.01], [0, 0, Math.PI / 2]);
  }
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12), M.plasticBlack, g, [0.09 - i * 0.03, -0.1 - i * 0.02, 0.034], [Math.PI / 2, 0, 0]);
  return g;
}

function makeCupcake(M) {
  const g = new THREE.Group();
  add(new THREE.CylinderGeometry(0.13, 0.11, 0.015, 32), M.porcelain, g);
  const wrap = [];
  for (let i = 0; i <= 6; i++) wrap.push([0.05 + i * 0.006, 0.008 + i * 0.008]);
  const base = lathe(wrap, 24);
  const bp = base.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i));
    const k = 1 + Math.sin(a * 16) * 0.05;
    bp.setX(i, bp.getX(i) * k);
    bp.setZ(i, bp.getZ(i) * k);
  }
  smoothNormals(base);
  add(base, M.cupcake, g);
  const fr = sculptSphere(32, 20, (v) => {
    const a = Math.atan2(v.z, v.x);
    const sw = 1 + Math.sin(a * 5 + v.y * 6) * 0.08;
    return v.set(v.x * 0.1 * sw, Math.max(v.y, -0.3) * 0.06 + 0.07, v.z * 0.1 * sw);
  });
  add(fr, M.frosting, g);
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 10), M.porcelain, g, [0, 0.16, 0]);
  add(new THREE.ConeGeometry(0.009, 0.025, 10), M.candleFlame, g, [0, 0.205, 0], null, null, false);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(0.018, 12, 8), white, g, [sx * 0.03, 0.1, 0.075]);
    add(new THREE.SphereGeometry(0.009, 8, 6), M.plasticBlack, g, [sx * 0.03, 0.1, 0.09]);
  }
  add(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), M.mouth, g, [0, 0.075, 0.09], [0, 0, Math.PI]);
  return g;
}

function makeMic(M) {
  const g = new THREE.Group();
  add(new THREE.CylinderGeometry(0.017, 0.013, 0.17, 12), M.plasticBlack, g, [0, 0, 0.04], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(0.036, 16, 12), M.darkMetal, g, [0, 0, 0.14]);
  add(new THREE.CylinderGeometry(0.03, 0.02, 0.02, 12), M.chrome, g, [0, 0, 0.11], [Math.PI / 2, 0, 0]);
  return g;
}

function bowTie(parent, mat, pos) {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.rotation.x = -0.25;
  parent.add(g);
  for (const sx of [-1, 1]) {
    const w = sculptSphere(20, 14, (v) => {
      const t = (v.x * sx + 1) / 2;
      const pinch = 0.35 + t * 0.65;
      return v.set(v.x * 0.07, v.y * 0.05 * pinch + Math.sin(v.x * 3) * 0.004, v.z * 0.022 * (0.6 + t * 0.4));
    });
    add(w, mat, g, [sx * 0.062, 0, 0], [0, 0, sx * 0.08]);
  }
  add(ellipsoid(0.024, 0.027, 0.024, 12, 10), mat, g);
  return g;
}

// ------------------------------------------------------------------ constructor principal
export function createAnimatronic(kind, M, T) {
  const cfg = CHARACTERS[kind];
  const A = new Animatronic(kind, cfg.name);
  const fur = furMaterial(T, cfg.sheen, 3);
  const eyeTex = genEye(cfg.eye);
  const hollowTex = genEye(cfg.eye, true);
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex.map, emissiveMap: eyeTex.emissive, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
  const eyeMatHollow = new THREE.MeshPhysicalMaterial({ map: hollowTex.map, emissiveMap: hollowTex.emissive, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.1, clearcoat: 1 });
  A.eyeMat = eyeMat;
  A.eyeMatHollow = eyeMatHollow;
  A.fur = fur;
  A.lidRest = cfg.lidRest;
  A.jawMax = cfg.jawMax;
  A.jawRest = cfg.jawRest || 0;
  const ctx = { fur, M, eyeMat, colors: cfg };

  const bodyOpts = {};
  if (kind === 'bear') {
    bodyOpts.bellyF = 0.22;
  }
  if (kind === 'bunny') {
    bodyOpts.bellyF = 0.14;
    bodyOpts.bellyW = 0.2;
  }
  if (kind === 'chicken') {
    bodyOpts.torsoProfile = [[0.001, -0.17], [0.2, -0.155], [0.295, -0.08], [0.35, 0.04], [0.375, 0.17], [0.378, 0.3], [0.362, 0.42], [0.34, 0.52], [0.318, 0.6], [0.29, 0.67], [0.22, 0.735], [0.12, 0.775], [0.001, 0.79]];
    bodyOpts.bellyF = 0.2;
    bodyOpts.footColor = 0xe0761a;
    bodyOpts.feet = 'chicken';
    bodyOpts.bib = [0.36, 0.66];
  }
  if (kind === 'fox') {
    bodyOpts.torsoProfile = [[0.001, -0.17], [0.18, -0.155], [0.26, -0.08], [0.305, 0.04], [0.325, 0.17], [0.335, 0.3], [0.335, 0.42], [0.325, 0.52], [0.312, 0.6], [0.285, 0.67], [0.215, 0.735], [0.115, 0.775], [0.001, 0.79]];
    bodyOpts.bellyF = 0.06;
    bodyOpts.bellyW = 0.17;
    bodyOpts.pantsColor = 0x4a3524;
    bodyOpts.endoForearm = ['L'];
    bodyOpts.endoShins = true;
    bodyOpts.hook = true;
    bodyOpts.torsoHole = (c) => {
      if (c.z < 0.1) return false;
      const edge = 1 + simplex.noise3d(c.x * 14, c.y * 14, 1.7) * 0.22 + simplex.noise3d(c.x * 40, c.y * 40, 4.1) * 0.07;
      return ((c.x - 0.06) / 0.115) ** 2 + ((c.y - 0.35) / 0.125) ** 2 < edge;
    };
    A.furDouble = fur.clone();
    A.furDouble.side = THREE.DoubleSide;
  }
  const B = buildBody(A, cfg, ctx, bodyOpts);
  buildHead(kind, B.head, ctx, B.reg);

  // Accesorios
  if (kind === 'bear') {
    bowTie(B.chest, M.hatBlack, [0, 0.275, 0.2]);
    const mic = makeMic(M);
    mic.position.set(-0.01, -0.17, 0.0);
    A.j.wristR.add(mic);
    A.props.mic = mic;
  }
  if (kind === 'bunny') {
    bowTie(B.chest, M.plasticRed, [0, 0.275, 0.2]);
    const guitar = makeGuitar(M);
    guitar.position.set(-0.04, -0.2, 0.43);
    guitar.rotation.set(0.1, 0.12, -1.0);
    B.chest.add(guitar);
    A.props.guitar = guitar;
  }
  if (kind === 'chicken') {
    const cup = makeCupcake(M);
    cup.position.set(0.31, -0.15, 0.5);
    B.chest.add(cup);
    A.props.cupcake = cup;
  }

  mergeStaticChildren(A.root);
  A.setPose('stand');
  A.snapPose();
  return A;
}

// Cabezas de repuesto y cráneo de endoesqueleto para la trastienda.
export function buildSpareParts(scene, M, T) {
  const group = new THREE.Group();
  const reg = registry(null);
  const put = (kind, pos, rot) => {
    const cfg = CHARACTERS[kind];
    const fur = furMaterial(T, cfg.sheen, 3);
    const hollow = genEye(cfg.eye, true);
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: hollow.map, emissiveMap: hollow.emissive, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.1 });
    const h = new THREE.Group();
    h.position.set(...pos);
    h.rotation.set(...rot);
    h.scale.setScalar(cfg.scale * (cfg.headScale || 1));
    buildHead(kind, h, { fur, M, eyeMat, colors: cfg }, reg);
    mergeStaticChildren(h);
    group.add(h);
    return h;
  };
  put('bear', [-15.6, 1.12, -36.68], [0.05, 0.25, 0.08]);
  put('bunny', [-13.4, 1.85, -36.68], [0.1, -0.3, -0.15]);
  put('chicken', [-14.6, 0.43, -36.66], [0.2, 0.1, 0.3]);

  // Cráneo de endoesqueleto sobre la mesa de trabajo
  const skull = new THREE.Group();
  skull.position.set(-16.0, 0.95, -33.8);
  skull.rotation.set(0, 1.2, 0);
  const cran = sculptSphere(36, 24, (v) => v.set(v.x * 0.16, v.y * 0.14 + 0.14, v.z * 0.17));
  add(cran, M.metal, skull);
  const skullEye = genEye(0x888888, true);
  const skullEyeMat = new THREE.MeshPhysicalMaterial({ map: skullEye.map, emissiveMap: skullEye.emissive, emissive: 0xffffff, emissiveIntensity: 1.2 });
  for (const sx of [-1, 1]) {
    add(new THREE.TorusGeometry(0.045, 0.012, 8, 20), M.darkMetal, skull, [sx * 0.07, 0.17, 0.14]);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12).rotateX(Math.PI / 2), skullEyeMat);
    eye.position.set(sx * 0.07, 0.17, 0.13);
    skull.add(eye);
    endoRod(skull, M, [sx * 0.12, 0.05, 0.05], [sx * 0.08, 0.0, 0.14], 0.012);
  }
  add(roundedBox(0.18, 0.04, 0.12, 0.01), M.darkMetal, skull, [0, 0.02, 0.1]);
  for (let i = 0; i < 7; i++) add(roundedBox(0.016, 0.03, 0.012, 0.004), M.teeth, skull, [-0.05 + i * 0.017, 0.055, 0.155]);
  for (let i = 0; i < 7; i++) add(roundedBox(0.016, 0.03, 0.012, 0.004), M.teeth, skull, [-0.05 + i * 0.017, 0.02, 0.15]);
  group.add(skull);
  add(tube([[-16.05, 0.95, -33.7], [-15.9, 0.94, -33.3], [-16.1, 0.93, -33.0]], 0.01, 12, 5), M.cableRed, group);
  scene.add(group);
  return group;
}

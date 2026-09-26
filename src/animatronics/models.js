// Modelado procedural de los animatrónicos: Bruno (oso), Bastián (conejo),
// Chiqui (pollo) y Rufo (zorro). Todo se esculpe a partir de primitivas deformadas,
// tornos y tubos, con colores por vértice, suciedad y endoesqueleto metálico visible.
import * as THREE from 'three';
import { Animatronic } from './rig.js';
import { sculptSphere, ellipsoid, lathe, capsule, colorize, grime, tube, roundedBox, gauss, smoothNormals, mergeStaticChildren } from '../core/geom.js';
import { furMaterial } from '../core/materials.js';
import { genEye } from '../core/textures.js';

const TAU = Math.PI * 2;
const C = (hex) => new THREE.Color(hex);
const sstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const CHARACTERS = {
  bear: {
    name: 'Bruno', species: 'oso', fur: 0x5d3a1f, belly: 0xc39a6c, sheen: 0xa37550, eye: 0x4d86d8, scale: 0.86, lidRest: 0.3, jawMax: 0.62,
    desc: 'La estrella del escenario. Casi nunca abandona el escenario... hasta que los demás se han ido. Evita las cámaras y se mueve a oscuras.',
  },
  bunny: {
    name: 'Bastián', species: 'conejo', fur: 0x5450c0, belly: 0xb3acea, sheen: 0x9c94ff, eye: 0xd0105a, scale: 0.84, lidRest: 0.18, jawMax: 0.55,
    desc: 'El guitarrista. El más inquieto de todos: recorre el ala oeste y aparece sin avisar en la puerta izquierda.',
  },
  chicken: {
    name: 'Chiqui', species: 'pollo', fur: 0xdea91a, belly: 0xf2d48a, sheen: 0xffe08a, eye: 0x7a3cc8, scale: 0.84, lidRest: 0.12, jawMax: 0.6,
    desc: 'Siempre con su magdalena. Merodea por la cocina y los baños antes de acercarse por el ala este.',
  },
  fox: {
    name: 'Rufo', species: 'zorro', fur: 0x982b1b, belly: 0xc9a37a, sheen: 0xd86a4a, eye: 0xe8b400, scale: 0.9, lidRest: 0.22, jawMax: 0.95,
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

function furGeo(geo, color, amount = 0.28, seed = 0, scale = 6) {
  if (typeof color === 'function') colorize(geo, color);
  else colorize(geo, color);
  return grime(geo, amount, scale, seed);
}

// Quita triángulos cuyo centroide cumple la condición (agujeros en el traje).
function cutHole(geo, test) {
  const g = geo.index ? geo : geo;
  const idx = g.index.array;
  const pos = g.attributes.position;
  const keep = [];
  const c = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    d.fromBufferAttribute(pos, idx[i + 2]);
    c.copy(a).add(b).add(d).multiplyScalar(1 / 3);
    if (!test(c)) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(keep);
  return g;
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

function addEye(reg, parent, x, y, z, r, eyeMat, fur, lidColor, lower = true) {
  const pivot = new THREE.Object3D();
  pivot.position.set(x, y, z);
  parent.add(pivot);
  const g = new THREE.SphereGeometry(r, 32, 24);
  g.rotateX(Math.PI / 2);
  const mesh = add(g, eyeMat, pivot);
  mesh.userData.keep = true;
  const lidGeo = furGeo(new THREE.SphereGeometry(r * 1.13, 32, 12, 0, TAU, 0, Math.PI / 2), lidColor, 0.2, 3, 20);
  const lid = add(lidGeo, fur, pivot);
  lid.userData.keep = true;
  reg.lids.push(lid);
  if (lower) {
    const low = furGeo(new THREE.SphereGeometry(r * 1.1, 32, 8, 0, TAU, Math.PI * 0.66, Math.PI * 0.34), lidColor, 0.2, 4, 20);
    add(low, fur, pivot, null, [-0.25, 0, 0]);
  }
  reg.eyes.push({ pivot, mesh, yaw: 0, pitch: 0 });
  return pivot;
}

function teethRow(parent, M, { count, rx, rz, y, zc, size, pointed = false, arc = 1.05, up = false, big = null }) {
  const geoFlat = roundedBox(size * 0.8, size, size * 0.55, size * 0.2, 2);
  const geoPoint = new THREE.ConeGeometry(size * 0.42, size * 1.5, 8);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = -arc + 2 * arc * t;
    const x = Math.sin(a) * rx;
    const z = zc + Math.cos(a) * rz;
    let g = pointed ? geoPoint : geoFlat;
    let s = 1;
    if (big && big.includes(i)) {
      s = 1.7;
    }
    const m = add(g, M.teeth, parent, [x, y + (up ? 1 : -1) * size * 0.35 * s, z], [pointed ? (up ? 0 : Math.PI) : 0, a, 0], [s, s, s]);
    m.castShadow = false;
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

function servo(parent, M, r, len, pos = [0, 0, 0], axis = 'x') {
  const g = new THREE.CylinderGeometry(r, r, len, 18);
  const rot = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  add(g, M.darkMetal, parent, pos, rot);
  const cap = new THREE.CylinderGeometry(r * 0.45, r * 0.45, len + 0.012, 12);
  add(cap, M.boot, parent, pos, rot);
}

// ------------------------------------------------------------------ cuerpo común
function buildHand(reg, wrist, side, ctx, color, endo = false) {
  const { fur, M } = ctx;
  const s = side > 0 ? 'L' : 'R';
  const mat = endo ? M.metal : fur;
  const col = (g) => (endo ? g : furGeo(g, color, 0.25, side * 7, 12));
  if (endo) {
    add(roundedBox(0.03, 0.1, 0.1, 0.01), M.darkMetal, wrist, [0, -0.07, 0]);
    endoRod(wrist, M, [0, 0.01, 0], [0, -0.03, 0], 0.02);
  } else {
    const palm = sculptSphere(24, 18, (v) => v.set(v.x * 0.05, v.y * 0.082, v.z * 0.078 + (v.y < 0 ? 0.004 : 0)));
    add(col(palm), mat, wrist, [0, -0.08, 0.004]);
  }
  const zs = [-0.05, -0.017, 0.017, 0.05];
  const lens = [0.064, 0.05, 0.042];
  for (let f = 0; f < 4; f++) {
    const chain = [];
    let parent = reg.joint(`f${s}${f}`, wrist, side * -0.004, -0.148, zs[f]);
    const scaleF = f === 0 ? 0.85 : f === 3 ? 0.92 : 1;
    for (let k = 0; k < 3; k++) {
      const L = lens[k] * scaleF;
      const r = endo ? 0.009 : 0.0195 - k * 0.0018;
      const g = endo ? new THREE.CylinderGeometry(r, r, L, 8).translate(0, -L / 2, 0) : capsule(L, r, r * 0.92, 12);
      add(col(g), mat, parent);
      if (endo) add(new THREE.SphereGeometry(0.012, 8, 6), M.darkMetal, parent);
      chain.push(parent);
      if (k < 2) parent = reg.joint(`f${s}${f}_${k}`, parent, 0, -L, 0);
    }
    reg.fingers[s].push(chain);
  }
  // Pulgar
  const tb = new THREE.Object3D();
  tb.position.set(side * -0.025, -0.055, 0.07);
  tb.rotation.set(-0.55, 0, side * -0.35);
  wrist.add(tb);
  const t0 = reg.joint(`t${s}0`, tb, 0, 0, 0);
  add(col(endo ? new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8).translate(0, -0.025, 0) : capsule(0.05, 0.024, 0.022, 12)), mat, t0);
  const t1 = reg.joint(`t${s}1`, t0, 0, -0.05, 0);
  add(col(endo ? new THREE.CylinderGeometry(0.009, 0.009, 0.04, 8).translate(0, -0.02, 0) : capsule(0.042, 0.022, 0.019, 12)), mat, t1);
  const thumb = [t0, t1];
  thumb.thumb = true;
  reg.fingers[s].push(thumb);
}

function buildBody(A, cfg, ctx, opts = {}) {
  const { fur, M } = ctx;
  const cF = C(cfg.fur);
  const cB = C(cfg.belly);
  const reg = registry(A);
  A.body.scale.setScalar(cfg.scale);
  const thighLen = 0.46;
  const shinLen = 0.42;
  const footDrop = 0.12;
  const hipY = 0.05 + thighLen + shinLen + footDrop;
  A.hipBase = hipY;
  const hips = A.addJoint('hips', A.body, 0, hipY, 0);
  add(furGeo(ellipsoid(0.3, 0.2, 0.25, 32, 20), opts.pantsColor ? C(opts.pantsColor) : cF, 0.3, 1), fur, hips, [0, -0.02, 0]);

  const spine = A.addJoint('spine', hips, 0, 0.1, 0);
  const prof = opts.torsoProfile || [
    [0.001, -0.14], [0.2, -0.12], [0.29, -0.02], [0.35, 0.12], [0.375, 0.28], [0.37, 0.42], [0.35, 0.55], [0.31, 0.65], [0.22, 0.73], [0.1, 0.78], [0.001, 0.8],
  ];
  const bulge = opts.bulge ?? 0.07;
  const shapeTorso = (g, push = 0) => {
    const tp = g.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i) * (opts.torsoW ?? 1.13);
      const y = tp.getY(i);
      let z = tp.getZ(i) * (opts.torsoD ?? 0.88);
      if (z > 0) z += bulge * gauss(y, 0.2, 0.15) * (z / 0.33);
      if (z < 0) z *= 0.95;
      tp.setXYZ(i, x, y, z);
    }
    smoothNormals(g);
    if (push) {
      const nr = g.attributes.normal;
      for (let i = 0; i < tp.count; i++) {
        tp.setXYZ(i, tp.getX(i) + nr.getX(i) * push, tp.getY(i) + nr.getY(i) * push, tp.getZ(i) + nr.getZ(i) * push);
      }
    }
    return g;
  };
  const tg = shapeTorso(lathe(prof, 48));
  if (opts.bib) {
    const sub = [];
    for (let i = 0; i <= 10; i++) {
      const y = opts.bib[0] + (opts.bib[1] - opts.bib[0]) * (i / 10);
      let r = 0;
      for (let k = 0; k < prof.length - 1; k++) {
        const [r0, y0] = prof[k];
        const [r1, y1] = prof[k + 1];
        if (y >= y0 && y <= y1) r = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      }
      sub.push(new THREE.Vector2(r, y));
    }
    const bg = shapeTorso(new THREE.LatheGeometry(sub, 28, -0.85, 1.7), 0.012);
    const bib = add(bg, M.bib, spine);
    bib.castShadow = false;
  }
  const bellyCol = (p) => {
    const e = (p.x / 0.21) ** 2 + ((p.y - 0.27) / 0.23) ** 2;
    const m = sstep(1.05, 0.7, e) * sstep(0.05, 0.2, p.z);
    return cF.clone().lerp(cB, m);
  };
  furGeo(tg, opts.bellyPatch === false ? cF : bellyCol, 0.3, 2, 5);
  if (opts.torsoHole) cutHole(tg, opts.torsoHole);
  add(tg, fur, spine);
  if (opts.torsoHole) {
    // Interior visible: endoesqueleto
    add(ellipsoid(0.22, 0.3, 0.18, 24, 16), M.darkMetal, spine, [0, 0.32, 0]);
    for (let i = 0; i < 4; i++) endoRod(spine, M, [-0.16, 0.2 + i * 0.08, 0.1], [0.16, 0.2 + i * 0.08, 0.1], 0.012);
    endoRod(spine, M, [0, 0.05, 0.05], [0, 0.65, 0.05], 0.03);
    add(tube([[-0.05, 0.3, 0.14], [0.02, 0.36, 0.2], [0.08, 0.28, 0.16], [0.1, 0.18, 0.12]], 0.01, 16, 5), M.cableRed, spine);
    add(tube([[0.05, 0.45, 0.12], [-0.04, 0.4, 0.2], [-0.1, 0.3, 0.16]], 0.01, 16, 5), M.cableYellow, spine);
  }

  const chest = A.addJoint('chest', spine, 0, 0.45, 0);

  // Cuello: endoesqueleto con fuelle de goma y cables
  const neck = A.addJoint('neck', chest, 0, 0.33, 0.01);
  endoRod(neck, M, [0, -0.16, 0], [0, 0.16, 0], 0.035);
  const ridges = [];
  for (let i = 0; i <= 18; i++) {
    const y = -0.08 + (i / 18) * 0.18;
    ridges.push([0.062 + (i % 2 ? 0.012 : 0), y]);
  }
  add(lathe(ridges, 20), M.boot, neck);
  add(tube([[0.05, -0.18, 0.04], [0.07, -0.02, 0.05], [0.05, 0.12, 0.04]], 0.008, 12, 5), M.cableRed, neck);
  add(tube([[-0.05, -0.18, 0.03], [-0.075, 0.0, 0.02], [-0.05, 0.13, 0.03]], 0.008, 12, 5), M.cable, neck);
  add(tube([[0.0, -0.18, -0.06], [0.02, 0.0, -0.08], [0.0, 0.13, -0.05]], 0.009, 12, 5), M.cableYellow, neck);

  const head = A.addJoint('head', neck, 0, 0.14, 0.02);

  // Brazos
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R';
    const sh = A.addJoint('shoulder' + s, chest, side * 0.4, 0.2, 0);
    add(furGeo(ellipsoid(0.145, 0.13, 0.14, 24, 16), cF, 0.3, 5 + side), fur, sh, [side * 0.01, 0.0, 0]);
    add(furGeo(capsule(0.36, 0.115, 0.095, 24, 0.008), cF, 0.28, 6 + side), fur, sh);
    const el = A.addJoint('elbow' + s, sh, 0, -0.4, 0);
    servo(el, M, 0.055, 0.12);
    const endoFore = opts.endoForearm && opts.endoForearm.includes(s);
    if (endoFore) {
      endoRod(el, M, [0.025, 0, 0], [0.02, -0.36, 0], 0.016);
      endoRod(el, M, [-0.025, 0, 0.01], [-0.02, -0.36, 0.01], 0.012, M.darkMetal);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12), M.darkMetal, el, [0, -0.12, 0.02]);
      add(tube([[0, -0.02, 0.04], [0.03, -0.18, 0.05], [0, -0.34, 0.03]], 0.006, 12, 4), M.cableRed, el);
      // Jirones de pelaje en el codo
      add(furGeo(capsule(0.08, 0.098, 0.09, 20), cF, 0.4, 9), fur, el, [0, -0.02, 0]);
    } else {
      add(furGeo(capsule(0.32, 0.098, 0.082, 24, 0.006), cF, 0.28, 7 + side), fur, el, [0, -0.025, 0]);
    }
    const wr = A.addJoint('wrist' + s, el, 0, -0.375, 0);
    servo(wr, M, 0.04, 0.05, [0, 0.012, 0], 'z');
    if (opts.hook && s === 'R') buildHook(wr, M);
    else buildHand(reg, wr, side, ctx, cF, endoFore);
  }

  // Piernas
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R';
    const th = A.addJoint('thigh' + s, hips, side * 0.17, -0.05, 0);
    const thighCol = opts.pantsColor ? C(opts.pantsColor) : cF;
    const tgeo = capsule(0.42, 0.148, 0.122, 24, 0.012);
    if (opts.pantsColor) {
      // Pantalón roto: borde inferior irregular
      const p = tgeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < -0.3) {
          const a = Math.atan2(p.getZ(i), p.getX(i));
          p.setY(i, Math.max(y, -0.34 - Math.abs(Math.sin(a * 5)) * 0.06));
        }
      }
      smoothNormals(tgeo);
    }
    add(furGeo(tgeo, thighCol, 0.32, 8 + side), fur, th);
    const kn = A.addJoint('knee' + s, th, 0, -0.46, 0);
    servo(kn, M, 0.065, 0.16);
    if (opts.endoShins) {
      endoRod(kn, M, [0.04, 0, 0], [0.035, -0.4, 0], 0.02);
      endoRod(kn, M, [-0.04, 0, 0], [-0.035, -0.4, 0], 0.02);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12), M.darkMetal, kn, [0, -0.16, 0.035]);
      add(furGeo(capsule(0.12, 0.118, 0.11, 20), cF, 0.45, 11 + side), fur, kn, [0, -0.02, 0]);
      add(tube([[0.02, -0.05, 0.05], [0.05, -0.2, 0.06], [0.02, -0.36, 0.04]], 0.007, 12, 4), M.cableYellow, kn);
    } else {
      add(furGeo(capsule(0.37, 0.122, 0.1, 24, 0.01), cF, 0.3, 9 + side), fur, kn, [0, -0.02, 0]);
    }
    const an = A.addJoint('ankle' + s, kn, 0, -0.42, 0);
    servo(an, M, 0.045, 0.1);
    const footGeo = sculptSphere(28, 18, (v) => {
      let y = v.y;
      if (y < -0.8) y = -0.8 - (y + 0.8) * 0.1;
      const wide = v.z > 0 ? 1 + v.z * 0.12 : 1;
      return v.set(v.x * 0.125 * wide, y * 0.075, v.z * 0.2 + (v.z > 0 ? v.z * 0.02 : 0));
    });
    add(furGeo(footGeo, opts.footColor ? C(opts.footColor) : cF, 0.4, 10 + side), fur, an, [0, -0.06, 0.06]);
  }
  return { hips, spine, chest, neck, head, reg, cF, cB };
}

function buildHook(wr, M) {
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 18), M.darkMetal, wr, [0, -0.05, 0]);
  add(new THREE.CylinderGeometry(0.014, 0.018, 0.06, 10), M.chrome, wr, [0, -0.11, 0]);
  const hook = tube([[0, -0.12, 0], [0, -0.2, 0.0], [0, -0.26, 0.04], [0, -0.26, 0.11], [0, -0.2, 0.14], [0, -0.16, 0.12]], 0.012, 32, 8);
  add(hook, M.chrome, wr);
  add(new THREE.ConeGeometry(0.012, 0.03, 8), M.chrome, wr, [0, -0.15, 0.115], [0.6, 0, 0]);
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

function bearHead(head, ctx, reg) {
  const { fur, M, eyeMat, colors } = ctx;
  const cF = C(colors.fur);
  const cB = C(colors.belly);
  const hg = sculptSphere(56, 40, (v) => {
    let x = v.x * 0.3;
    let y = v.y * 0.265;
    let z = v.z * 0.28;
    const cheek = gauss(v.y, -0.25, 0.3) * Math.max(0, Math.abs(v.x) - 0.2) * Math.max(0, v.z + 0.3);
    x += Math.sign(v.x) * cheek * 0.08;
    z += 0.025 * gauss(v.y, 0.3, 0.14) * Math.max(0, v.z) ** 2;
    if (v.y > 0.55) y -= (v.y - 0.55) * 0.05;
    if (v.z < -0.2) z *= 0.94;
    return v.set(x, y + 0.2, z);
  });
  add(furGeo(hg, cF, 0.3, 21, 7), fur, head);
  // Hocico superior
  const mg = sculptSphere(40, 28, (v) => {
    let y = v.y;
    if (y < -0.45) y = -0.45 + (y + 0.45) * 0.25;
    const z = v.z * 0.14 + (v.z > 0 ? 0.02 * (1 - v.y * v.y) : 0);
    return v.set(v.x * 0.17, y * 0.105, z);
  });
  add(furGeo(mg, cB, 0.3, 22, 9), fur, head, [0, 0.1, 0.2]);
  add(sculptSphere(24, 16, (v) => v.set(v.x * 0.058, v.y * 0.036 + Math.max(0, v.z) * 0.006, v.z * 0.042)), M.noseBlack, head, [0, 0.162, 0.335], [-0.25, 0, 0]);
  // Mandíbula
  const jaw = reg.joint('jaw', head, 0, 0.075, 0.09);
  const jg = sculptSphere(36, 24, (v) => v.set(v.x * 0.152, Math.min(v.y, 0.2) * 0.075, v.z * 0.15));
  add(furGeo(jg, cB, 0.3, 23, 9), fur, jaw, [0, -0.01, 0.12]);
  mouthInterior(head, jaw, M, [0, 0.06, 0.17], [0.13, 0.055, 0.13], [0, 0.004, 0.12], [0.125, 0.03, 0.125]);
  teethRow(head, M, { count: 9, rx: 0.12, rz: 0.115, y: 0.058, zc: 0.19, size: 0.026, arc: 1.05 });
  teethRow(jaw, M, { count: 9, rx: 0.115, rz: 0.11, y: 0.004, zc: 0.105, size: 0.024, arc: 1.05, up: true });
  // Ojos, cejas, orejas
  for (const sx of [1, -1]) {
    addEye(reg, head, sx * 0.1, 0.255, 0.245, 0.055, eyeMat, fur, cF);
    add(capsule(0.085, 0.014, 0.012, 10), M.hatBlack, head, [sx * 0.058, 0.338, 0.262], [0, 0, sx * (Math.PI / 2 + 0.2)]);
    const ear = reg.joint(sx > 0 ? 'earL' : 'earR', head, sx * 0.2, 0.43, -0.03);
    ear.rotation.z = -sx * 0.2;
    add(furGeo(ellipsoid(0.088, 0.088, 0.036, 24, 16), cF, 0.3, 24 + sx), fur, ear, [0, 0.045, 0]);
    add(furGeo(ellipsoid(0.058, 0.058, 0.02, 20, 12), cB, 0.3, 25 + sx), fur, ear, [0, 0.042, 0.022]);
  }
  // Sombrero de copa
  const hat = new THREE.Group();
  hat.position.set(0.02, 0.458, -0.01);
  hat.rotation.set(-0.06, 0, -0.1);
  head.add(hat);
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.014, 40), M.hatBlack, hat, [0, 0.007, 0]);
  add(new THREE.CylinderGeometry(0.092, 0.098, 0.15, 40), M.hatBlack, hat, [0, 0.089, 0]);
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.026, 40), M.plasticBlack, hat, [0, 0.028, 0]);
  return { jaw };
}

function bunnyHead(head, ctx, reg) {
  const { fur, M, eyeMat, colors } = ctx;
  const cF = C(colors.fur);
  const cB = C(colors.belly);
  const pink = C(0xd97aa6);
  const hg = sculptSphere(56, 40, (v) => {
    let x = v.x * 0.275;
    let y = v.y * 0.295;
    let z = v.z * 0.27;
    const cheek = gauss(v.y, -0.35, 0.3) * Math.max(0, Math.abs(v.x) - 0.15) * Math.max(0, v.z + 0.4);
    x += Math.sign(v.x) * cheek * 0.09;
    z += cheek * 0.03;
    z += 0.02 * gauss(v.y, 0.28, 0.14) * Math.max(0, v.z) ** 2;
    if (v.y < -0.5) x *= 0.95;
    return v.set(x, y + 0.21, z);
  });
  add(furGeo(hg, cF, 0.3, 31, 7), fur, head);
  const mg = sculptSphere(40, 28, (v) => {
    let y = v.y;
    if (y < -0.45) y = -0.45 + (y + 0.45) * 0.25;
    return v.set(v.x * 0.155, y * 0.1, v.z * 0.13 + (v.z > 0 ? 0.015 : 0));
  });
  add(furGeo(mg, cB, 0.3, 32, 9), fur, head, [0, 0.105, 0.185]);
  add(ellipsoid(0.045, 0.03, 0.035, 20, 14), new THREE.MeshPhysicalMaterial({ color: pink, roughness: 0.35, clearcoat: 0.6 }), head, [0, 0.165, 0.31]);
  const jaw = reg.joint('jaw', head, 0, 0.072, 0.085);
  const jg = sculptSphere(36, 24, (v) => v.set(v.x * 0.14, Math.min(v.y, 0.2) * 0.07, v.z * 0.14));
  add(furGeo(jg, cB, 0.3, 33, 9), fur, jaw, [0, -0.01, 0.11]);
  mouthInterior(head, jaw, M, [0, 0.055, 0.16], [0.12, 0.05, 0.12], [0, 0.003, 0.11], [0.115, 0.028, 0.115]);
  teethRow(head, M, { count: 8, rx: 0.11, rz: 0.105, y: 0.056, zc: 0.18, size: 0.024, arc: 1.0, big: [3, 4] });
  teethRow(jaw, M, { count: 8, rx: 0.105, rz: 0.1, y: 0.004, zc: 0.1, size: 0.022, arc: 1.0, up: true });
  for (const sx of [1, -1]) {
    addEye(reg, head, sx * 0.1, 0.27, 0.228, 0.058, eyeMat, fur, cF);
    const s = sx > 0 ? 'L' : 'R';
    const ear = reg.joint('ear' + s, head, sx * 0.1, 0.47, -0.03);
    ear.rotation.set(-0.12, 0, -sx * 0.14);
    const earCol = (p) => {
      const m = sstep(0.0, 0.015, p.z) * sstep(0.05, 0.025, Math.abs(p.x));
      return cF.clone().lerp(cB, m * 0.9);
    };
    const e1 = sculptSphere(24, 20, (v) => v.set(v.x * 0.062, v.y * 0.19 + 0.17, v.z * 0.032 + (v.z > 0 ? -0.004 : 0)));
    add(furGeo(e1, earCol, 0.28, 34 + sx), fur, ear);
    const ear2 = reg.joint('ear2' + s, ear, 0, 0.32, 0);
    const e2 = sculptSphere(24, 20, (v) => v.set(v.x * 0.058, v.y * 0.16 + 0.13, v.z * 0.03));
    add(furGeo(e2, earCol, 0.28, 35 + sx), fur, ear2);
    if (sx < 0) ear2.rotation.x = 0.55;
  }
  return { jaw };
}

function chickenHead(head, ctx, reg) {
  const { fur, M, eyeMat, colors } = ctx;
  const cF = C(colors.fur);
  const hg = sculptSphere(56, 40, (v) => {
    let x = v.x * 0.27;
    let y = v.y * 0.28;
    let z = v.z * 0.27;
    const cheek = gauss(v.y, -0.3, 0.35) * Math.max(0, Math.abs(v.x) - 0.2) * Math.max(0, v.z + 0.3);
    x += Math.sign(v.x) * cheek * 0.07;
    z += 0.02 * gauss(v.y, 0.3, 0.15) * Math.max(0, v.z) ** 2;
    return v.set(x, y + 0.21, z);
  });
  add(furGeo(hg, cF, 0.28, 41, 7), fur, head);
  // Pico superior
  const beakU = sculptSphere(40, 24, (v) => {
    let y = v.y;
    if (y < -0.3) y = -0.3 + (y + 0.3) * 0.2;
    const f = Math.max(0, v.z);
    return v.set(v.x * 0.13 * (1 - f * 0.45), y * 0.06 - f * f * 0.02, v.z * 0.17 + f * 0.03);
  });
  add(beakU, M.beak, head, [0, 0.13, 0.2]);
  const jaw = reg.joint('jaw', head, 0, 0.1, 0.1);
  const beakL = sculptSphere(36, 20, (v) => {
    const f = Math.max(0, v.z);
    return v.set(v.x * 0.115 * (1 - f * 0.4), Math.min(v.y, 0.3) * 0.045, v.z * 0.15 + f * 0.02);
  });
  add(beakL, M.beak, jaw, [0, -0.02, 0.1]);
  mouthInterior(head, jaw, M, [0, 0.1, 0.17], [0.1, 0.04, 0.12], [0, -0.012, 0.1], [0.095, 0.02, 0.12]);
  teethRow(head, M, { count: 9, rx: 0.1, rz: 0.12, y: 0.098, zc: 0.17, size: 0.022, arc: 1.0 });
  teethRow(jaw, M, { count: 9, rx: 0.095, rz: 0.115, y: -0.01, zc: 0.085, size: 0.02, arc: 1.0, up: true });
  for (const sx of [1, -1]) {
    addEye(reg, head, sx * 0.1, 0.28, 0.22, 0.056, eyeMat, fur, cF);
    add(capsule(0.07, 0.012, 0.01, 10), M.hatBlack, head, [sx * 0.05, 0.36, 0.235], [0, 0, sx * (Math.PI / 2 - 0.25)]);
  }
  // Plumas en la coronilla
  for (let i = 0; i < 3; i++) {
    const f = sculptSphere(16, 12, (v) => v.set(v.x * 0.028, v.y * 0.085 + 0.07, v.z * 0.014));
    add(furGeo(f, C(0xf0b82a), 0.2, 44 + i), fur, head, [(i - 1) * 0.03, 0.46, 0.02 - Math.abs(i - 1) * 0.02], [-0.2 + Math.abs(i - 1) * 0.1, 0, (i - 1) * 0.45]);
  }
  return { jaw };
}

function foxHead(head, ctx, reg) {
  const { fur, M, eyeMat, colors } = ctx;
  const cF = C(colors.fur);
  const cB = C(colors.belly);
  const hg = sculptSphere(56, 40, (v) => {
    let x = v.x * 0.255;
    let y = v.y * 0.255;
    let z = v.z * 0.27;
    const cheek = gauss(v.y, -0.3, 0.3) * Math.max(0, Math.abs(v.x) - 0.25) * Math.max(0, v.z + 0.2);
    x += Math.sign(v.x) * cheek * 0.1;
    z += 0.02 * gauss(v.y, 0.3, 0.13) * Math.max(0, v.z) ** 2;
    return v.set(x, y + 0.21, z);
  });
  add(furGeo(hg, cF, 0.35, 51, 7), fur, head);
  // Hocico alargado bicolor
  const snoutCol = (p) => cF.clone().lerp(cB, sstep(0.0, -0.03, p.y));
  const sg = sculptSphere(44, 28, (v) => {
    let y = v.y;
    if (y < -0.45) y = -0.45 + (y + 0.45) * 0.25;
    const f = Math.max(0, v.z);
    return v.set(v.x * 0.115 * (1 - f * 0.35), y * 0.092 * (1 - f * 0.2) + f * 0.015, v.z * 0.2);
  });
  add(furGeo(sg, snoutCol, 0.35, 52, 9), fur, head, [0, 0.14, 0.22]);
  add(ellipsoid(0.04, 0.028, 0.03, 16, 12), M.noseBlack, head, [0, 0.182, 0.415]);
  const jaw = reg.joint('jaw', head, 0, 0.09, 0.08);
  const jg = sculptSphere(36, 20, (v) => {
    const f = Math.max(0, v.z);
    return v.set(v.x * 0.1 * (1 - f * 0.3), Math.min(v.y, 0.2) * 0.05, v.z * 0.19);
  });
  add(furGeo(jg, cB, 0.35, 53, 9), fur, jaw, [0, -0.01, 0.15]);
  mouthInterior(head, jaw, M, [0, 0.085, 0.2], [0.09, 0.045, 0.17], [0, 0.0, 0.15], [0.085, 0.02, 0.16]);
  teethRow(head, M, { count: 10, rx: 0.085, rz: 0.17, y: 0.075, zc: 0.2, size: 0.028, arc: 0.85, pointed: true });
  teethRow(jaw, M, { count: 10, rx: 0.08, rz: 0.16, y: 0.0, zc: 0.14, size: 0.026, arc: 0.85, pointed: true, up: true });
  for (const sx of [1, -1]) {
    addEye(reg, head, sx * 0.098, 0.28, 0.205, 0.052, eyeMat, fur, cF);
    add(capsule(0.08, 0.014, 0.011, 10), M.mouth, head, [sx * 0.058, 0.36, 0.225], [0, 0, sx * (Math.PI / 2 + 0.3)]);
    const s = sx > 0 ? 'L' : 'R';
    const ear = reg.joint('ear' + s, head, sx * 0.15, 0.4, -0.04);
    ear.rotation.set(-0.1, 0, -sx * 0.35);
    const torn = sx < 0;
    const eg = sculptSphere(24, 18, (v) => {
      const t = (v.y + 1) / 2;
      let y = t * 0.24;
      if (torn && t > 0.8) y = 0.8 * 0.24 + (t - 0.8) * 0.05;
      return v.set(v.x * 0.085 * (1 - t * 0.9), y, v.z * 0.035 * (1 - t * 0.7));
    });
    const earCol = (p) => cF.clone().lerp(cB, sstep(0.005, 0.02, p.z) * sstep(0.2, 0.05, p.y) * 0.8);
    add(furGeo(eg, earCol, 0.35, 54 + sx), fur, ear);
  }
  // Parche en el ojo (levantado sobre la frente)
  add(ellipsoid(0.058, 0.048, 0.012, 20, 12), M.plasticBlack, head, [-0.11, 0.39, 0.19], [-0.7, -0.35, 0.2]);
  const strap = new THREE.TorusGeometry(0.262, 0.006, 6, 60);
  add(strap, M.plasticBlack, head, [0, 0.27, 0.0], [1.2, 0.35, 0.25]);
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
  parent.add(g);
  for (const sx of [-1, 1]) {
    const w = sculptSphere(16, 12, (v) => {
      const t = (v.x * sx + 1) / 2;
      return v.set(v.x * 0.065, v.y * 0.045 * (0.35 + t * 0.65), v.z * 0.022);
    });
    add(w, mat, g, [sx * 0.058, 0, 0]);
  }
  add(ellipsoid(0.022, 0.025, 0.022, 12, 10), mat, g);
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
  const ctx = { fur, M, eyeMat, colors: cfg };

  const bodyOpts = {};
  if (kind === 'chicken') {
    bodyOpts.torsoProfile = [[0.001, -0.14], [0.21, -0.12], [0.3, -0.02], [0.36, 0.12], [0.385, 0.27], [0.375, 0.42], [0.345, 0.55], [0.3, 0.65], [0.21, 0.73], [0.1, 0.78], [0.001, 0.8]];
    bodyOpts.footColor = 0xe0761a;
    bodyOpts.bib = [0.36, 0.66];
  }
  if (kind === 'fox') {
    bodyOpts.torsoProfile = [[0.001, -0.14], [0.19, -0.12], [0.27, -0.02], [0.31, 0.12], [0.33, 0.28], [0.34, 0.42], [0.335, 0.55], [0.3, 0.65], [0.21, 0.73], [0.1, 0.78], [0.001, 0.8]];
    bodyOpts.bulge = 0.03;
    bodyOpts.pantsColor = 0x4a3524;
    bodyOpts.endoForearm = ['L'];
    bodyOpts.endoShins = true;
    bodyOpts.hook = true;
    bodyOpts.torsoHole = (c) => c.z > 0.12 && ((c.x - 0.06) / 0.13) ** 2 + ((c.y - 0.34) / 0.14) ** 2 < 1;
  }
  if (kind === 'bunny') bodyOpts.bulge = 0.05;
  const B = buildBody(A, cfg, ctx, bodyOpts);
  buildHead(kind, B.head, ctx, B.reg);

  // Accesorios
  if (kind === 'bear') {
    bowTie(B.chest, M.hatBlack, [0, 0.27, 0.19]);
    const mic = makeMic(M);
    mic.position.set(-0.01, -0.13, 0.0);
    A.j.wristR.add(mic);
    A.props.mic = mic;
  }
  if (kind === 'bunny') {
    bowTie(B.chest, M.plasticRed, [0, 0.27, 0.19]);
    const guitar = makeGuitar(M);
    guitar.position.set(-0.04, -0.2, 0.42);
    guitar.rotation.set(0.1, 0.12, -1.0);
    B.chest.add(guitar);
    A.props.guitar = guitar;
  }
  if (kind === 'chicken') {
    const cup = makeCupcake(M);
    cup.position.set(0.24, -0.02, 0.48);
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
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: genEye(cfg.eye, true).map, emissiveMap: genEye(cfg.eye, true).emissive, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.1 });
    const h = new THREE.Group();
    h.position.set(...pos);
    h.rotation.set(...rot);
    h.scale.setScalar(cfg.scale);
    buildHead(kind, h, { fur, M, eyeMat, colors: cfg }, reg);
    mergeStaticChildren(h);
    group.add(h);
    return h;
  };
  put('bear', [-15.6, 1.11, -36.68], [0.05, 0.25, 0.08]);
  put('bunny', [-13.4, 1.84, -36.68], [0.1, -0.3, -0.15]);
  put('chicken', [-14.6, 0.42, -36.66], [0.2, 0.1, 0.3]);

  // Cráneo de endoesqueleto sobre la mesa de trabajo
  const skull = new THREE.Group();
  skull.position.set(-16.0, 0.95, -33.8);
  skull.rotation.set(0, 1.2, 0);
  const cran = sculptSphere(36, 24, (v) => v.set(v.x * 0.16, v.y * 0.14 + 0.14, v.z * 0.17));
  add(cran, M.metal, skull);
  for (const sx of [-1, 1]) {
    add(new THREE.TorusGeometry(0.045, 0.012, 8, 20), M.darkMetal, skull, [sx * 0.07, 0.17, 0.14]);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: genEye(0x888888, true).map, emissiveMap: genEye(0x888888, true).emissive, emissive: 0xffffff, emissiveIntensity: 1.2 }));
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

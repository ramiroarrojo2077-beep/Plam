// Arquitectura de la pizzería: salas, paredes con huecos, marcos, techo, escenario,
// fluorescentes, tuberías, cámaras de seguridad y carteles.
import * as THREE from 'three';
import { StaticBatcher, mat4, roundedBox, tube } from '../core/geom.js';
import { ROOMS, DOOR, WINDOW, STAGE, CAMS } from './layout.js';
import { posterMaterial } from '../core/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function uvPair(mat) {
  const u = mat.userData.uv ?? 2;
  return Array.isArray(u) ? u : [u, u];
}

function makeGeo(pos, nor, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Pared vertical de a=[x,z] a b=[x,z]; su normal apunta a la izquierda del recorrido (dentro de la sala).
function wallGeo(a, b, y0, y1, openings, uvW, uvH) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L = Math.hypot(dx, dz);
  const ux = dx / L;
  const uz = dz / L;
  const nx = -uz;
  const nz = ux;
  const pos = [];
  const nor = [];
  const uv = [];
  const quad = (s0, s1, ya, yb) => {
    if (s1 - s0 < 1e-4 || yb - ya < 1e-4) return;
    const c = [[s0, ya], [s1, ya], [s1, yb], [s0, ya], [s1, yb], [s0, yb]];
    for (const [s, y] of c) {
      pos.push(a[0] + ux * s, y, a[1] + uz * s);
      nor.push(nx, 0, nz);
      uv.push(s / uvW, y / uvH);
    }
  };
  const ops = openings
    .map((o) => ({ s0: Math.max(0, o.s0), s1: Math.min(L, o.s1), y0: o.y0, y1: o.y1 }))
    .sort((p, q) => p.s0 - q.s0);
  let s = 0;
  for (const o of ops) {
    if (o.s0 > s) quad(s, o.s0, y0, y1);
    if (o.y0 > y0) quad(o.s0, o.s1, y0, Math.min(o.y0, y1));
    if (o.y1 < y1) quad(o.s0, o.s1, Math.max(o.y1, y0), y1);
    s = Math.max(s, o.s1);
  }
  if (s < L) quad(s, L, y0, y1);
  return makeGeo(pos, nor, uv);
}

function planeXZ(x0, z0, x1, z1, y, up, uvs) {
  const pts = up ? [[x0, z1], [x1, z1], [x1, z0], [x0, z0]] : [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const idx = [0, 1, 2, 0, 2, 3];
  const pos = [];
  const nor = [];
  const uv = [];
  for (const i of idx) {
    const [x, z] = pts[i];
    pos.push(x, y, z);
    nor.push(0, up ? 1 : -1, 0);
    uv.push(x / uvs, -z / uvs);
  }
  return makeGeo(pos, nor, uv);
}

// Cuadrilátero con orientación automática según la normal deseada.
function quadAuto(P, n) {
  const e1 = new THREE.Vector3().subVectors(P[1], P[0]);
  const e2 = new THREE.Vector3().subVectors(P[2], P[0]);
  const fn = new THREE.Vector3().crossVectors(e1, e2);
  const order = fn.dot(n) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  const pos = [];
  const nor = [];
  const uv = [];
  for (const i of order) {
    pos.push(P[i].x, P[i].y, P[i].z);
    nor.push(n.x, n.y, n.z);
    uv.push(0, 0);
  }
  return makeGeo(pos, nor, uv);
}

// Jambas para un hueco en una pared perpendicular a X (plano x = cte) de grosor [xa, xb].
function jambsX(B, mat, xa, xb, z0, z1, y0, y1) {
  B.add(quadAuto([V(xa, y0, z0), V(xb, y0, z0), V(xb, y1, z0), V(xa, y1, z0)], V(0, 0, 1)), mat, null, { worldUV: 1 });
  B.add(quadAuto([V(xa, y0, z1), V(xb, y0, z1), V(xb, y1, z1), V(xa, y1, z1)], V(0, 0, -1)), mat, null, { worldUV: 1 });
  B.add(quadAuto([V(xa, y1, z0), V(xb, y1, z0), V(xb, y1, z1), V(xa, y1, z1)], V(0, -1, 0)), mat, null, { worldUV: 1 });
  if (y0 > 0.001) B.add(quadAuto([V(xa, y0, z0), V(xb, y0, z0), V(xb, y0, z1), V(xa, y0, z1)], V(0, 1, 0)), mat, null, { worldUV: 1 });
}

function jambsZ(B, mat, za, zb, x0, x1, y0, y1) {
  B.add(quadAuto([V(x0, y0, za), V(x0, y0, zb), V(x0, y1, zb), V(x0, y1, za)], V(1, 0, 0)), mat, null, { worldUV: 1 });
  B.add(quadAuto([V(x1, y0, za), V(x1, y0, zb), V(x1, y1, zb), V(x1, y1, za)], V(-1, 0, 0)), mat, null, { worldUV: 1 });
  B.add(quadAuto([V(x0, y1, za), V(x1, y1, za), V(x1, y1, zb), V(x0, y1, zb)], V(0, -1, 0)), mat, null, { worldUV: 1 });
}

// Marco de puerta (dos postes + dintel) a ambos lados de una pared en x = cte.
function doorFrameX(B, mat, xa, xb, z0, z1, h) {
  const t = 0.07;
  const d = xb - xa + 0.1;
  const cx = (xa + xb) / 2;
  const box = new THREE.BoxGeometry(d, h + t, t);
  B.add(box, mat, mat4(cx, (h + t) / 2, z0 - t / 2));
  B.add(box, mat, mat4(cx, (h + t) / 2, z1 + t / 2));
  B.add(new THREE.BoxGeometry(d, t, z1 - z0 + 2 * t), mat, mat4(cx, h + t / 2, (z0 + z1) / 2));
}

function doorFrameZ(B, mat, za, zb, x0, x1, h) {
  const t = 0.07;
  const d = zb - za + 0.1;
  const cz = (za + zb) / 2;
  const box = new THREE.BoxGeometry(t, h + t, d);
  B.add(box, mat, mat4(x0 - t / 2, (h + t) / 2, cz));
  B.add(box, mat, mat4(x1 + t / 2, (h + t) / 2, cz));
  B.add(new THREE.BoxGeometry(x1 - x0 + 2 * t, t, d), mat, mat4((x0 + x1) / 2, h + t / 2, cz));
}

function room(B, r, o) {
  const { floor, ceil, lower, upper, lowerH = 1.4, open = {}, skip = {} } = o;
  if (floor) B.add(planeXZ(r.x0, r.z0, r.x1, r.z1, 0, true, floor.userData.uv ?? 2), floor, null, { cast: false });
  if (ceil) B.add(planeXZ(r.x0, r.z0, r.x1, r.z1, r.h, false, ceil.userData.uv ?? 2), ceil, null, { cast: false });
  const walls = {
    n: { a: [r.x0, r.z0], b: [r.x1, r.z0], toS: (x) => x - r.x0 },
    s: { a: [r.x1, r.z1], b: [r.x0, r.z1], toS: (x) => r.x1 - x },
    w: { a: [r.x0, r.z1], b: [r.x0, r.z0], toS: (z) => r.z1 - z },
    e: { a: [r.x1, r.z0], b: [r.x1, r.z1], toS: (z) => z - r.z0 },
  };
  for (const k of ['n', 's', 'w', 'e']) {
    if (skip[k]) continue;
    const w = walls[k];
    const ops = (open[k] || []).map((op) => {
      const s0 = w.toS(op.a);
      const s1 = w.toS(op.b);
      return { s0: Math.min(s0, s1), s1: Math.max(s0, s1), y0: op.y0 ?? 0, y1: op.y1 };
    });
    if (lower) {
      const [uw, uh] = uvPair(lower);
      B.add(wallGeo(w.a, w.b, 0, lowerH, ops, uw, uh), lower);
      const [pw, ph] = uvPair(upper);
      B.add(wallGeo(w.a, w.b, lowerH, r.h, ops, pw, ph), upper);
    } else {
      const [pw, ph] = uvPair(upper);
      B.add(wallGeo(w.a, w.b, 0, r.h, ops, pw, ph), upper);
    }
  }
}

export function poster(B, mat, x, y, z, w, h, ry, tilt = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  B.add(g, mat, mat4(x, y, z, 0, ry, tilt), { cast: false });
}

export function buildBuilding(scene, M, T, rig) {
  const B = new StaticBatcher();
  const group = new THREE.Group();
  group.name = 'building';
  const R = ROOMS;
  const dz = { y1: DOOR.h };

  // ---------------- Oficina
  room(B, R.office, {
    floor: M.floor,
    ceil: M.ceiling,
    lower: M.wainscot,
    upper: M.plaster,
    open: {
      w: [{ a: DOOR.z0, b: DOOR.z1, ...dz }, { a: WINDOW.z0, b: WINDOW.z1, y0: WINDOW.y0, y1: WINDOW.y1 }],
      e: [{ a: DOOR.z0, b: DOOR.z1, ...dz }, { a: WINDOW.z0, b: WINDOW.z1, y0: WINDOW.y0, y1: WINDOW.y1 }],
    },
  });

  // ---------------- Pasillos
  const hallOpen = (x0, x1, sideDoorWall) => ({
    [sideDoorWall]: [
      { a: DOOR.z0, b: DOOR.z1, ...dz },
      { a: WINDOW.z0, b: WINDOW.z1, y0: WINDOW.y0, y1: WINDOW.y1 },
    ],
  });
  const westOpen = hallOpen(0, 0, 'e');
  westOpen.e.push({ a: -9.9, b: -8.7, y1: 2.3 }); // armario
  room(B, R.westHall, { floor: M.floor, ceil: M.ceiling, lower: M.wainscot, upper: M.plaster, open: westOpen, skip: { n: true } });
  room(B, R.eastHall, { floor: M.floor, ceil: M.ceiling, lower: M.wainscot, upper: M.plaster, open: hallOpen(0, 0, 'w'), skip: { n: true } });

  // Jambas y marcos de las puertas de la oficina (grosor de pared 3.5 - 3.8)
  for (const sx of [-1, 1]) {
    const xa = sx < 0 ? -3.8 : 3.5;
    const xb = sx < 0 ? -3.5 : 3.8;
    jambsX(B, M.trim, xa, xb, DOOR.z0, DOOR.z1, 0, DOOR.h);
    jambsX(B, M.trim, xa, xb, WINDOW.z0, WINDOW.z1, WINDOW.y0, WINDOW.y1);
    doorFrameX(B, M.darkMetal, xa, xb, DOOR.z0, DOOR.z1, DOOR.h);
    // Marco de ventana y cristal
    const cx = (xa + xb) / 2;
    const t = 0.05;
    const fw = xb - xa + 0.08;
    B.add(new THREE.BoxGeometry(fw, t, WINDOW.z1 - WINDOW.z0 + 2 * t), M.darkMetal, mat4(cx, WINDOW.y0 - t / 2, (WINDOW.z0 + WINDOW.z1) / 2));
    B.add(new THREE.BoxGeometry(fw, t, WINDOW.z1 - WINDOW.z0 + 2 * t), M.darkMetal, mat4(cx, WINDOW.y1 + t / 2, (WINDOW.z0 + WINDOW.z1) / 2));
    B.add(new THREE.BoxGeometry(fw, WINDOW.y1 - WINDOW.y0, t), M.darkMetal, mat4(cx, (WINDOW.y0 + WINDOW.y1) / 2, WINDOW.z0 - t / 2));
    B.add(new THREE.BoxGeometry(fw, WINDOW.y1 - WINDOW.y0, t), M.darkMetal, mat4(cx, (WINDOW.y0 + WINDOW.y1) / 2, WINDOW.z1 + t / 2));
    B.add(new THREE.BoxGeometry(0.03, WINDOW.y1 - WINDOW.y0, 0.03), M.darkMetal, mat4(cx, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.z1 - WINDOW.z0, WINDOW.y1 - WINDOW.y0), M.glass);
    glass.position.set(cx, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2);
    glass.rotation.y = Math.PI / 2;
    glass.renderOrder = 5;
    group.add(glass);
  }
  // Puerta del armario
  jambsX(B, M.trim, -3.8, -3.5, -9.9, -8.7, 0, 2.3);
  doorFrameX(B, M.trim, -3.8, -3.5, -9.9, -8.7, 2.3);

  // ---------------- Comedor
  room(B, R.dining, {
    floor: M.floor,
    ceil: M.ceiling,
    lower: M.wainscot,
    upper: M.plaster,
    open: {
      s: [{ a: -6.2, b: -3.8, y1: 3.0 }, { a: 3.8, b: 6.2, y1: 3.0 }],
      w: [{ a: -27.5, b: -22.5, y1: 2.9 }, { a: -34.2, b: -32.8, y1: 2.3 }],
      e: [{ a: -34.2, b: -32.8, y1: 2.3 }, { a: -25.2, b: -23.8, y1: 2.3 }],
    },
  });
  jambsX(B, M.trim, -11.3, -11, -27.5, -22.5, 0, 2.9);
  jambsX(B, M.trim, -11.3, -11, -34.2, -32.8, 0, 2.3);
  jambsX(B, M.trim, 11, 11.3, -34.2, -32.8, 0, 2.3);
  jambsX(B, M.trim, 11, 11.3, -25.2, -23.8, 0, 2.3);
  doorFrameX(B, M.trim, -11.3, -11, -34.2, -32.8, 2.3);
  doorFrameX(B, M.trim, 11, 11.3, -34.2, -32.8, 2.3);
  doorFrameX(B, M.trim, 11, 11.3, -25.2, -23.8, 2.3);
  // Marco decorativo de la cueva
  doorFrameX(B, M.woodPanel, -11.3, -11, -27.5, -22.5, 2.9);

  // ---------------- Cueva pirata
  room(B, R.cove, { floor: M.wood, ceil: M.ceiling, lower: null, upper: M.plasterDark, open: { e: [{ a: -27.5, b: -22.5, y1: 2.9 }] } });
  B.add(new THREE.BoxGeometry(R.cove.x1 - R.cove.x0, 0.3, R.cove.z1 - R.cove.z0), M.wood, mat4((R.cove.x0 + R.cove.x1) / 2, 0.15, (R.cove.z0 + R.cove.z1) / 2), { worldUV: 2.4 });

  // ---------------- Tras bastidores, baños, cocina, armario
  room(B, R.backstage, { floor: M.concrete, ceil: M.ceiling, lower: null, upper: M.plasterDark, open: { e: [{ a: -34.2, b: -32.8, y1: 2.3 }] } });
  room(B, R.restrooms, { floor: M.floor, ceil: M.ceiling, lower: M.tileWall, upper: M.plaster, lowerH: 1.4, open: { w: [{ a: -34.2, b: -32.8, y1: 2.3 }] } });
  room(B, R.kitchen, { floor: M.floor, ceil: M.ceiling, lower: M.tileWall, upper: M.plaster, open: { w: [{ a: -25.2, b: -23.8, y1: 2.3 }] } });
  room(B, R.closet, { floor: M.concrete, ceil: M.ceiling, lower: null, upper: M.plasterDark, open: { w: [{ a: -9.9, b: -8.7, y1: 2.3 }] } });

  // ---------------- Escenario
  const S = STAGE;
  const sw = S.x1 - S.x0;
  const sd = S.z1 - S.z0;
  B.add(new THREE.BoxGeometry(sw, 0.06, sd), M.wood, mat4(0, S.h - 0.03, (S.z0 + S.z1) / 2), { worldUV: 2.4 });
  B.add(new THREE.BoxGeometry(sw, S.h - 0.06, sd), M.woodPanel, mat4(0, (S.h - 0.06) / 2, (S.z0 + S.z1) / 2), { worldUV: 1.2 });
  B.add(new THREE.BoxGeometry(sw + 0.1, 0.08, 0.12), M.trim, mat4(0, S.h - 0.02, S.z1 + 0.02));
  for (let i = 0; i < 3; i++) {
    const h = 0.3 * (i + 1);
    const z = S.z1 + 1.2 - 0.4 * i - 0.2;
    B.add(new THREE.BoxGeometry(2.4, h, 0.4), M.wood, mat4(0, h / 2, z), { worldUV: 2.4 });
  }
  // Fondo con estrellas
  poster(B, M.backdrop, 0, (S.h + R.dining.h) / 2, S.z0 + 0.02, sw, R.dining.h - S.h, 0);
  // Letrero BRUNO'S
  B.add(new THREE.BoxGeometry(3.5, 0.95, 0.08), M.trim, mat4(0, 3.45, S.z0 + 0.08));
  poster(B, M.stageSign, 0, 3.45, S.z0 + 0.125, 3.3, 0.82, 0);
  // Altavoces
  for (const sx of [-1, 1]) {
    const x = sx * 5.6;
    const Ms = mat4(x, S.h + 0.65, -33.2, 0, -sx * 0.25);
    B.add(roundedBox(0.8, 1.3, 0.6, 0.03), M.plasticBlack, Ms);
    for (const [yy, rr] of [[0.3, 0.2], [-0.25, 0.13]]) {
      const cone = new THREE.CylinderGeometry(rr, rr * 0.6, 0.06, 24);
      B.add(cone, M.rubber, Ms.clone().multiply(mat4(0, yy, 0.3, Math.PI / 2, 0, 0)), { cast: false });
      B.add(new THREE.SphereGeometry(rr * 0.3, 12, 8), M.darkMetal, Ms.clone().multiply(mat4(0, yy, 0.3)), { cast: false });
    }
  }
  // Barra de focos del escenario
  B.add(new THREE.CylinderGeometry(0.04, 0.04, 11, 10), M.darkMetal, mat4(0, 4.2, -30.0, 0, 0, Math.PI / 2));
  for (const x of [-4.2, 0, 4.2]) {
    B.add(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6), M.darkMetal, mat4(x, 4.3, -30.0));
    const can = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.4, 20, 1, true), M.plasticBlack);
    body.rotation.x = Math.PI / 2;
    can.add(body);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), M.bulb);
    lens.position.z = 0.2;
    can.add(lens);
    can.position.set(x, 4.05, -30.1);
    can.lookAt(x * 0.62, 1.7, -34.6);
    can.updateMatrixWorld(true);
    B.addMesh(body, { cast: false });
    B.addMesh(lens, { cast: false });
  }

  // Telones laterales y bambalina (pliegues por geometría)
  const curtain = (w, h, folds, amp) => {
    const g = new THREE.PlaneGeometry(w, h, folds * 6, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, Math.sin((x / w) * folds * Math.PI * 2) * amp);
    }
    g.computeVertexNormals();
    return g;
  };
  for (const sx of [-1, 1]) {
    B.add(curtain(1.8, R.dining.h - S.h - 0.1, 7, 0.08), M.curtainRed, mat4(sx * 5.8, (R.dining.h + S.h) / 2, -32.2));
  }
  const valance = curtain(13.2, 0.75, 30, 0.05);
  B.add(valance, M.curtainRed, mat4(0, R.dining.h - 0.38, -32.1), { cast: false });

  // ---------------- Guirnaldas de banderines en el comedor
  const flagColors = [M.plasticRed, M.balloons[1], M.balloons[2], M.balloons[3], M.balloons[4]];
  const flag = new THREE.BufferGeometry();
  flag.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.28, 0], 3));
  flag.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  flag.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
  const garland = (a, b, sag, n) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t));
    }
    B.add(tube(pts, 0.006, 32, 4), M.cable, null, { cast: false });
    const ang = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag;
      const m = flagColors[i % flagColors.length];
      const fm = new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.7, side: THREE.DoubleSide });
      B.add(flag, flagColorsCache(fm), mat4(x, y, z, 0, ang, 0), { cast: false });
    }
  };
  const cache = new Map();
  function flagColorsCache(m) {
    const k = m.color.getHexString();
    if (!cache.has(k)) cache.set(k, m);
    return cache.get(k);
  }
  garland(V(-10.9, 4.2, -21), V(10.9, 4.2, -31), 0.9, 34);
  garland(V(-10.9, 4.2, -31), V(10.9, 4.2, -21), 0.9, 34);
  garland(V(-10.9, 4.0, -26), V(10.9, 4.0, -26), 0.6, 30);

  // ---------------- Fluorescentes y bombillas
  const fluoroFixture = (x, y, z, id, rotY = 0, len = 1.2) => {
    const mat = M.fluoro.clone();
    if (id) rig.registerFixture(id, mat);
    B.add(new THREE.BoxGeometry(0.3, 0.07, len + 0.1), M.paintedMetal, mat4(x, y + 0.035, z, 0, rotY), { cast: false });
    B.add(new THREE.BoxGeometry(0.2, 0.02, len), mat, mat4(x, y - 0.005, z, 0, rotY), { cast: false });
  };
  fluoroFixture(-5, 2.97, -17.5, 'wh1');
  fluoroFixture(-5, 2.97, -10.5, 'wh2');
  fluoroFixture(-5, 2.97, -4.2, 'whC');
  fluoroFixture(5, 2.97, -17.5, 'eh1');
  fluoroFixture(5, 2.97, -10.5, 'eh2');
  fluoroFixture(5, 2.97, -4.2, 'ehC');
  fluoroFixture(14.2, 3.17, -33.5, 'restroom', Math.PI / 2);
  fluoroFixture(14.2, 3.17, -24.5, 'kitchen', Math.PI / 2);

  const hangingBulb = (x, y, z, ceilY, id, shade = true) => {
    const mat = M.bulb.clone();
    if (id) rig.registerFixture(id, mat);
    B.add(new THREE.CylinderGeometry(0.006, 0.006, ceilY - y, 6), M.cable, mat4(x, (ceilY + y) / 2 + 0.05, z), { cast: false });
    B.add(new THREE.SphereGeometry(0.05, 16, 12), mat, mat4(x, y, z), { cast: false });
    if (shade) {
      const sh = new THREE.CylinderGeometry(0.08, 0.28, 0.2, 24, 1, true);
      B.add(sh, M.paintedMetal, mat4(x, y + 0.07, z), { cast: false });
    }
    return mat;
  };
  hangingBulb(-13.8, 2.62, -33.4, 3.2, 'bsBulb', false);
  hangingBulb(-2.0, 2.58, -9.3, 3.0, 'closetBulb', false);
  hangingBulb(0, 3.95, -26, 4.4, 'dining1');
  hangingBulb(-7.5, 3.95, -25, 4.4, 'dining2');
  hangingBulb(7.5, 3.95, -25, 4.4, 'dining3');
  hangingBulb(-13.2, 2.8, -25, 3.2, 'coveGlow');

  // ---------------- Tuberías y cables por los pasillos
  for (const sx of [-1, 1]) {
    const x = sx * 6.0;
    B.add(new THREE.CylinderGeometry(0.06, 0.06, 22.6, 12), M.darkMetal, mat4(x, 2.82, -8.9, Math.PI / 2, 0, 0), { cast: false });
    B.add(new THREE.CylinderGeometry(0.035, 0.035, 22.6, 10), M.paintedMetal, mat4(x + sx * -0.14, 2.9, -8.9, Math.PI / 2, 0, 0), { cast: false });
    for (let z = -19; z < 2; z += 3) {
      B.add(new THREE.TorusGeometry(0.075, 0.012, 6, 16), M.darkMetal, mat4(x, 2.82, z), { cast: false });
    }
    const cablePts = [];
    for (let i = 0; i <= 20; i++) {
      const z = -20 + i * 1.1;
      cablePts.push(V(sx * 3.9, 2.9 - Math.abs(Math.sin(i * 1.3)) * 0.12, z));
    }
    B.add(tube(cablePts, 0.012, 80, 5), M.cable, null, { cast: false });
  }

  // ---------------- Cámaras de seguridad (modelos físicos)
  const camModels = {};
  for (const c of CAMS) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(roundedBox(0.12, 0.1, 0.26, 0.02), M.plasticBeige);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 16), M.plasticBlack);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.15;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.3), M.plasticBeige);
    hood.position.y = 0.06;
    const ledMat = M.ledRed.clone();
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), ledMat);
    led.position.set(0.04, 0.03, 0.13);
    g.add(body, lens, hood, led);
    g.position.set(...c.pos);
    g.lookAt(V(...c.look));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), M.darkMetal);
    arm.position.set(c.pos[0], c.pos[1] + 0.14, c.pos[2]);
    group.add(g, arm);
    camModels[c.id] = { group: g, led: ledMat };
  }

  // ---------------- Carteles
  const signs = T.signs;
  poster(B, posterMaterial(signs.cove, { emissiveMap: signs.cove, emissive: 0x442266, emissiveIntensity: 0.3 }), -10.97, 3.35, -25, 2.6, 0.65, Math.PI / 2);
  poster(B, posterMaterial(signs.restrooms), 10.97, 2.62, -33.5, 1.2, 0.3, -Math.PI / 2);
  poster(B, posterMaterial(signs.kitchen), 10.97, 2.62, -24.5, 1.2, 0.3, -Math.PI / 2);
  poster(B, posterMaterial(signs.backstage), -10.97, 2.62, -33.5, 1.4, 0.3, Math.PI / 2);
  poster(B, posterMaterial(signs.staff), -3.83, 2.45, -9.3, 0.8, 0.2, -Math.PI / 2);
  // Salidas de emergencia (con batería: siguen encendidas en el apagón)
  poster(B, M.exitSign, 0, 3.7, -20.33, 0.6, 0.22, Math.PI);
  poster(B, M.exitSign, -5, 2.75, 2.47, 0.5, 0.18, Math.PI);
  poster(B, M.exitSign, 5, 2.75, 2.47, 0.5, 0.18, Math.PI);

  B.build(group);
  scene.add(group);
  return { group, camModels };
}

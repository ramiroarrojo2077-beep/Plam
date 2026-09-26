// Mobiliario y atrezo: mesas de fiesta, sillas, gorros, globos, recreativas, carteles,
// telón animado de la cueva pirata, trastienda, cocina, baños y armario.
import * as THREE from 'three';
import { StaticBatcher, mat4, roundedBox, tube, ellipsoid } from '../core/geom.js';
import { mulberry32 } from '../core/rng.js';
import { posterMaterial } from '../core/materials.js';
import { poster } from './building.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function chair(B, M, x, z, ry, rnd) {
  const Mc = mat4(x, 0, z, 0, ry + (rnd() - 0.5) * 0.25);
  const add = (geo, mat, m) => B.add(geo, mat, Mc.clone().multiply(m));
  add(roundedBox(0.44, 0.06, 0.42, 0.02), M.chairSeat, mat4(0, 0.46, 0));
  add(roundedBox(0.44, 0.34, 0.04, 0.015), M.chairSeat, mat4(0, 0.76, -0.2, -0.08, 0, 0));
  const leg = new THREE.CylinderGeometry(0.013, 0.013, 0.46, 8);
  for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) add(leg, M.chair, mat4(lx, 0.23, lz));
  const post = new THREE.CylinderGeometry(0.012, 0.012, 0.45, 8);
  for (const lx of [-0.19, 0.19]) add(post, M.chair, mat4(lx, 0.68, -0.2, -0.08, 0, 0));
}

function partyHat(B, M, x, y, z, rnd, lying = false) {
  const mat = rnd() < 0.5 ? M.partyHat : M.partyHat2;
  const m = lying ? mat4(x, y + 0.06, z, Math.PI / 2 - 0.2, rnd() * 6, 0) : mat4(x, y + 0.1, z, (rnd() - 0.5) * 0.2, rnd() * 6, (rnd() - 0.5) * 0.2);
  B.add(new THREE.ConeGeometry(0.065, 0.2, 18, 1, true), mat, m, { cast: true });
  B.add(new THREE.SphereGeometry(0.02, 8, 6), M.balloons[Math.floor(rnd() * 5)], m.clone().multiply(mat4(0, 0.1, 0)), { cast: false });
}

function partyTable(B, M, cx, z0, z1, rnd) {
  const w = 1.3;
  const h = 0.76;
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  B.add(new THREE.BoxGeometry(w, 0.04, len), M.deskWood, mat4(cx, h - 0.02, cz), { worldUV: 1.6 });
  B.add(new THREE.BoxGeometry(w + 0.06, 0.012, len + 0.06), M.cloth, mat4(cx, h + 0.006, cz), { worldUV: 1.2 });
  // faldones
  const skirt = (sx, sz, sw, ry) => {
    const g = new THREE.PlaneGeometry(sw, 0.34, Math.max(2, Math.round(sw * 8)), 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.012 * (0.5 - p.getY(i) / 0.34));
    g.computeVertexNormals();
    B.add(g, M.cloth, mat4(sx, h - 0.17, sz, 0, ry), { worldUV: 1.2 });
  };
  skirt(cx - w / 2 - 0.03, cz, len + 0.06, -Math.PI / 2);
  skirt(cx + w / 2 + 0.03, cz, len + 0.06, Math.PI / 2);
  skirt(cx, z0 - 0.03, w + 0.06, Math.PI);
  skirt(cx, z1 + 0.03, w + 0.06, 0);
  const leg = new THREE.CylinderGeometry(0.03, 0.03, h - 0.04, 8);
  for (const lz of [z0 + 0.3, cz, z1 - 0.3]) for (const lx of [-0.5, 0.5]) B.add(leg, M.chair, mat4(cx + lx, (h - 0.04) / 2, lz));
  const seats = Math.floor(len / 1.25);
  for (let i = 0; i < seats; i++) {
    const z = z0 + 0.65 + i * ((len - 1.3) / (seats - 1));
    for (const side of [-1, 1]) {
      const sx = cx + side * (w / 2 + 0.36);
      chair(B, M, sx, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, rnd);
      const px = cx + side * (w / 2 - 0.2);
      B.add(new THREE.CylinderGeometry(0.11, 0.095, 0.014, 24), M.porcelain, mat4(px, h + 0.02, z), { cast: false });
      if (rnd() < 0.7) partyHat(B, M, px + side * -0.05 + (rnd() - 0.5) * 0.1, h + 0.02, z + (rnd() - 0.5) * 0.3, rnd, rnd() < 0.35);
      if (rnd() < 0.6) B.add(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 14), M.plasticRed, mat4(px - side * 0.2, h + 0.065, z + 0.22));
    }
  }
  // Pizzas
  for (let i = 0; i < 2; i++) {
    const z = z0 + len * (0.3 + i * 0.4);
    B.add(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 32), M.chrome, mat4(cx, h + 0.02, z), { cast: false });
    B.add(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 32), M.pizza, mat4(cx, h + 0.035, z), { cast: false });
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.13;
      B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 12), M.plasticRed, mat4(cx + Math.cos(a) * r, h + 0.047, z + Math.sin(a) * r), { cast: false });
    }
  }
}

function balloonCluster(B, M, x, y, z, rnd, n = 3) {
  for (let i = 0; i < n; i++) {
    const bx = x + (rnd() - 0.5) * 0.4;
    const bz = z + (rnd() - 0.5) * 0.4;
    const by = y + 0.8 + rnd() * 0.5;
    const mat = M.balloons[Math.floor(rnd() * M.balloons.length)];
    B.add(ellipsoid(0.16, 0.2, 0.16, 20, 14), mat, mat4(bx, by, bz));
    B.add(new THREE.ConeGeometry(0.02, 0.04, 8), mat, mat4(bx, by - 0.21, bz, Math.PI, 0, 0), { cast: false });
    B.add(tube([V(x, y, z), V((x + bx) / 2 + 0.03, (y + by) / 2, (z + bz) / 2), V(bx, by - 0.22, bz)], 0.002, 12, 3), M.cable, null, { cast: false });
  }
}

function arcade(B, M, x, z, ry, screenMat, rnd) {
  const Ma = mat4(x, 0, z, 0, ry);
  const add = (geo, mat, m, o) => B.add(geo, mat, Ma.clone().multiply(m), o);
  add(new THREE.BoxGeometry(0.72, 1.85, 0.7), M.plasticBlack, mat4(0, 0.925, 0));
  add(new THREE.BoxGeometry(0.74, 1.4, 0.66), M.plasticRed, mat4(0, 0.9, -0.02));
  add(new THREE.BoxGeometry(0.66, 0.1, 0.35), M.plasticBlack, mat4(0, 1.0, 0.4, 0.35, 0, 0));
  add(new THREE.PlaneGeometry(0.55, 0.42), screenMat, mat4(0, 1.38, 0.33, -0.2, 0, 0), { cast: false });
  add(new THREE.BoxGeometry(0.72, 0.2, 0.1), M.plasticBlack, mat4(0, 1.74, 0.34), { cast: false });
  add(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8), M.chrome, mat4(-0.15, 1.1, 0.42, 0.35, 0, 0));
  add(new THREE.SphereGeometry(0.03, 12, 8), M.plasticRed, mat4(-0.15, 1.16, 0.44));
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), M.balloons[i + 1], mat4(0.05 + i * 0.08, 1.07, 0.42, 0.35, 0, 0), { cast: false });
}

export function buildProps(scene, M, T, rig) {
  const B = new StaticBatcher();
  const group = new THREE.Group();
  group.name = 'props';
  const rnd = mulberry32(777);

  // ---------------- Comedor
  partyTable(B, M, -4.4, -29, -22.6, rnd);
  partyTable(B, M, 4.4, -29, -22.6, rnd);
  balloonCluster(B, M, -4.4, 0.78, -22.8, rnd);
  balloonCluster(B, M, 4.4, 0.78, -22.8, rnd);
  balloonCluster(B, M, 6.2, 0.9, -35.4, rnd, 4);
  balloonCluster(B, M, -6.2, 0.9, -35.4, rnd, 4);
  // Sombreros caídos en el suelo
  for (let i = 0; i < 6; i++) partyHat(B, M, -2 + rnd() * 4, 0, -27 + rnd() * 5, rnd, true);

  const screenMat = new THREE.MeshStandardMaterial({ color: 0x0a0f18, emissive: 0x1a3a6a, emissiveIntensity: 0.6, roughness: 0.15 });
  rig.registerFixture('arcade', screenMat);
  arcade(B, M, 10.45, -29.4, -Math.PI / 2, screenMat, rnd);
  arcade(B, M, 10.45, -28.4, -Math.PI / 2, screenMat, rnd);

  // Mesa del escenario (donde se deja la magdalena) y soporte de guitarra
  B.add(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), M.deskWood, mat4(4.3, 1.62, -35.9));
  B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 10), M.chrome, mat4(4.3, 1.25, -35.9));
  B.add(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), M.chrome, mat4(4.3, 0.915, -35.9));
  B.add(new THREE.BoxGeometry(0.4, 0.03, 0.08), M.darkMetal, mat4(-4.3, 0.93, -35.9));
  B.add(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8), M.darkMetal, mat4(-4.3, 1.3, -36.0, -0.15, 0, 0));
  B.add(new THREE.BoxGeometry(0.3, 0.04, 0.06), M.darkMetal, mat4(-4.3, 1.02, -35.86));

  // ---------------- Carteles del comedor y pasillos
  const celebrate = posterMaterial(T.celebrate);
  poster(B, celebrate, -10.98, 2.3, -30.2, 0.95, 1.33, Math.PI / 2);
  poster(B, celebrate, 10.98, 2.3, -28.8, 0.95, 1.33, -Math.PI / 2);
  poster(B, celebrate, -6.18, 1.95, -7.2, 0.9, 1.26, Math.PI / 2, 0.03);
  poster(B, celebrate, 6.18, 1.95, -8.4, 0.9, 1.26, -Math.PI / 2, -0.02);
  poster(B, celebrate, -3.82, 1.95, -15.5, 0.9, 1.26, -Math.PI / 2, 0.02);
  poster(B, posterMaterial(T.rules), -1.9, 2.1, -20.32, 0.72, 0.96, Math.PI);
  poster(B, posterMaterial(T.newspaper), -6.18, 1.6, -12.6, 0.48, 0.64, Math.PI / 2, -0.04);
  const drawings = T.drawings.map((t) => posterMaterial(t));
  const whoRnd = mulberry32(99);
  for (let i = 0; i < 14; i++) {
    const x = -1.0 + (i % 7) * 0.62 + (whoRnd() - 0.5) * 0.1;
    const y = 1.55 + Math.floor(i / 7) * 0.62 + (whoRnd() - 0.5) * 0.1;
    poster(B, drawings[i % drawings.length], x, y, -20.32, 0.42, 0.42, Math.PI, (whoRnd() - 0.5) * 0.3);
  }
  for (let i = 0; i < 8; i++) {
    const z = -3 - i * 0.55 - Math.floor(i / 4) * 0.3;
    const y = 1.45 + (i % 2) * 0.55 + (whoRnd() - 0.5) * 0.08;
    poster(B, drawings[(i + 3) % drawings.length], 3.82, y, z, 0.4, 0.4, Math.PI / 2, (whoRnd() - 0.5) * 0.3);
  }

  // Cartel "fuera de servicio" delante de la cueva
  const sm = posterMaterial(T.signs.outOfOrder);
  const Ms = mat4(-10.2, 0, -21.9, 0, Math.PI / 2 + 0.35);
  B.add(new THREE.BoxGeometry(0.62, 0.46, 0.02), M.woodPanel, Ms.clone().multiply(mat4(0, 1.05, 0)));
  B.add(new THREE.PlaneGeometry(0.58, 0.42), sm, Ms.clone().multiply(mat4(0, 1.05, 0.012)), { cast: false });
  for (const lx of [-0.24, 0.24]) B.add(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 8), M.woodPanel, Ms.clone().multiply(mat4(lx, 0.5, -0.05, -0.1, 0, 0)));

  // ---------------- Telón de la cueva (animado)
  const cove = buildCoveCurtain(M);
  group.add(cove.group);

  // ---------------- Trastienda
  const shelf = (x0, x1, z, depth, levels, ry = 0) => {
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    const Mm = mat4(cx, 0, z, 0, ry);
    for (const y of levels) B.add(new THREE.BoxGeometry(w, 0.03, depth), M.paintedMetal, Mm.clone().multiply(mat4(0, y, 0)), { worldUV: 0.8 });
    const top = levels[levels.length - 1] + 0.05;
    for (const px of [-w / 2 + 0.02, w / 2 - 0.02]) for (const pz of [-depth / 2 + 0.02, depth / 2 - 0.02]) {
      B.add(new THREE.BoxGeometry(0.035, top, 0.035), M.paintedMetal, Mm.clone().multiply(mat4(px, top / 2, pz)));
    }
  };
  shelf(-16.3, -12.2, -36.7, 0.55, [0.35, 1.05, 1.75, 2.4]);
  B.add(new THREE.BoxGeometry(0.8, 0.06, 3), M.deskWood, mat4(-16.05, 0.9, -33.3), { worldUV: 1.6 });
  for (const z of [-34.6, -32]) for (const x of [-16.4, -15.7]) B.add(new THREE.BoxGeometry(0.05, 0.9, 0.05), M.paintedMetal, mat4(x, 0.45, z));
  const boxGeo = roundedBox(0.55, 0.45, 0.5, 0.01);
  for (let i = 0; i < 7; i++) {
    const x = -12.3 - (i % 3) * 0.6;
    const y = 0.225 + Math.floor(i / 3) * 0.45;
    B.add(boxGeo, M.cardboard, mat4(x, y, -30.6, 0, (rnd() - 0.5) * 0.3), { worldUV: 0.5 });
  }
  // Herramientas sobre la mesa
  B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), M.plasticRed, mat4(-16.1, 0.95, -32.6, 0, 0, Math.PI / 2));
  B.add(new THREE.BoxGeometry(0.08, 0.03, 0.2), M.chrome, mat4(-16.0, 0.945, -32.9, 0, 0.5, 0));
  B.add(tube([V(-16.2, 0.93, -34.6), V(-15.9, 0.95, -34.2), V(-16.0, 0.93, -33.8), V(-15.8, 0.94, -33.5)], 0.008, 20, 5), M.cableRed, null, { cast: false });

  // ---------------- Armario de limpieza
  shelf(-1.2, -0.55, -9.2, 3.2, [0.3, 0.9, 1.5, 2.1], Math.PI / 2);
  B.add(new THREE.CylinderGeometry(0.2, 0.17, 0.32, 20), new THREE.MeshStandardMaterial({ color: 0xb8a018, roughness: 0.5 }), mat4(-3.0, 0.16, -10.4));
  B.add(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 8), M.deskWood, mat4(-3.15, 0.75, -10.3, 0.1, 0, -0.25));
  for (let i = 0; i < 4; i++) B.add(boxGeo, M.cardboard, mat4(-0.9, 0.3 + 0.03 + 0.6 * i + 0.22, -8.3 - (i % 2) * 0.9, 0, 0.1 * i), { worldUV: 0.5 });
  B.add(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 12), M.plasticRed, mat4(-0.85, 1.05, -9.7));
  B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 12), M.balloons[1], mat4(-0.85, 1.04, -9.5));

  // ---------------- Cocina
  B.add(new THREE.BoxGeometry(0.8, 0.9, 6.2), M.paintedMetal, mat4(16.6, 0.45, -24.5), { worldUV: 0.8 });
  B.add(new THREE.BoxGeometry(0.84, 0.04, 6.3), M.chrome, mat4(16.58, 0.92, -24.5));
  for (const z of [-26.5, -22.5]) {
    B.add(new THREE.CylinderGeometry(0.25, 0.22, 0.3, 20, 1, true), M.chrome, mat4(16.5, 1.1, z));
    B.add(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), M.darkMetal, mat4(16.5, 0.96, z));
  }
  B.add(new THREE.BoxGeometry(0.9, 2.0, 0.8), M.chrome, mat4(12.0, 1.0, -27.5));
  B.add(new THREE.BoxGeometry(0.5, 0.02, 3), M.darkMetal, mat4(16.8, 1.9, -24.5));
  for (let i = 0; i < 4; i++) B.add(new THREE.CylinderGeometry(0.14, 0.12, 0.18, 16), M.darkMetal, mat4(16.75, 1.74, -25.8 + i * 0.8));

  // ---------------- Baños
  for (const [x, label] of [[13, T.signs.boys], [15.6, T.signs.girls]]) {
    B.add(new THREE.BoxGeometry(0.9, 2.1, 0.06), M.woodPanel, mat4(x, 1.05, -36.94), { worldUV: 1.2 });
    B.add(new THREE.BoxGeometry(1.0, 2.16, 0.04), M.trim, mat4(x, 1.08, -36.97));
    B.add(new THREE.SphereGeometry(0.035, 12, 8), M.chrome, mat4(x + 0.35, 1.0, -36.88));
    poster(B, posterMaterial(label), x, 1.75, -36.9, 0.4, 0.14, 0);
  }
  B.add(new THREE.BoxGeometry(0.55, 0.12, 2.6), M.porcelain, mat4(16.7, 0.85, -33.5));
  for (const z of [-34.3, -32.7]) B.add(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8), M.chrome, mat4(16.85, 1.0, z));
  const mirror = new THREE.MeshStandardMaterial({ color: 0x9aa4a6, metalness: 1, roughness: 0.12 });
  B.add(new THREE.PlaneGeometry(2.4, 0.9), mirror, mat4(16.98, 1.65, -33.5, 0, -Math.PI / 2, 0), { cast: false });
  B.add(new THREE.CylinderGeometry(0.2, 0.18, 0.6, 16), M.darkMetal, mat4(12, 0.3, -36.4));

  B.build(group);
  scene.add(group);
  return { group, cove };
}

// Telón de la cueva: dos mitades con pivote en el extremo exterior. setOpen(0..1).
function buildCoveCurtain(M) {
  const group = new THREE.Group();
  const halves = [];
  const x = -11.15;
  const h = 2.9;
  const w = 2.55;
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(w, h, 48, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i) + (side < 0 ? -w / 2 : w / 2);
      const ly = p.getY(i);
      p.setX(i, lx);
      p.setY(i, ly + h / 2);
      p.setZ(i, Math.sin((lx / w) * 9 * Math.PI) * 0.07 * (1 + (1 - (ly + h / 2) / h) * 0.3));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.curtainPurple);
    m.castShadow = true;
    m.receiveShadow = true;
    m.rotation.y = Math.PI / 2;
    m.position.set(x, 0, side < 0 ? -27.5 : -22.5);
    group.add(m);
    halves.push(m);
  }
  // Barra
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5.3, 10), M.darkMetal);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(x, 2.92, -25);
  group.add(rod);
  let open = 0;
  let sway = 0;
  return {
    group,
    get open() {
      return open;
    },
    setOpen(v) {
      open = v;
    },
    poke() {
      sway = 1;
    },
    update(dt, t) {
      sway = Math.max(0, sway - dt * 0.6);
      for (let i = 0; i < 2; i++) {
        const m = halves[i];
        const target = 1 - 0.78 * open;
        m.scale.x += (target - m.scale.x) * Math.min(1, dt * 3);
        m.rotation.z = Math.sin(t * 5 + i) * 0.015 * sway;
        m.rotation.x = Math.sin(t * 3.3 + i * 2) * 0.01 * sway;
      }
    },
  };
}

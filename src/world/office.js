// La oficina de seguridad: escritorio, monitores CRT, ventilador, lámparas, puertas
// de seguridad animadas y paneles de botones interactivos.
import * as THREE from 'three';
import { StaticBatcher, mat4, roundedBox, tube, sculptSphere } from '../core/geom.js';
import { posterMaterial } from '../core/materials.js';
import { poster } from './building.js';
import { DOOR } from './layout.js';
import { mulberry32 } from '../core/rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function crtMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, power: { value: 1 }, tint: { value: new THREE.Color(0x6f9fff) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float time; uniform float power; uniform vec3 tint;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        vec2 c = uv - 0.5;
        float vig = smoothstep(0.75, 0.2, length(c * vec2(1.0, 1.2)));
        float n = hash(floor(uv * vec2(160.0, 120.0)) + floor(time * 24.0));
        float scan = 0.75 + 0.25 * sin(uv.y * 420.0 + time * 8.0);
        float bar = smoothstep(0.0, 0.08, abs(fract(uv.y - time * 0.13) - 0.5));
        float text = step(0.5, hash(floor(vec2(uv.x * 28.0, uv.y * 14.0)))) * step(0.72, uv.y) * step(uv.x, 0.6) * step(0.08, uv.x);
        vec3 col = tint * (0.18 + 0.35 * n) * scan * (0.75 + 0.25 * bar) + vec3(0.5, 0.9, 0.6) * text * 0.35;
        gl_FragColor = vec4(col * vig * power * 1.6, 1.0);
      }
    `,
  });
}

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 40;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, 128, 40);
  ctx.fillStyle = '#e8e2c8';
  ctx.font = 'bold 26px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildOffice(scene, M, T, rig) {
  const B = new StaticBatcher();
  const group = new THREE.Group();
  group.name = 'office';
  const rnd = mulberry32(4242);

  // ---------------- Escritorio
  B.add(roundedBox(3.4, 0.05, 1.12, 0.012), M.deskWood, mat4(0, 0.755, -1.9), { worldUV: 1.6 });
  B.add(new THREE.BoxGeometry(0.04, 0.73, 1.0), M.paintedMetal, mat4(-1.64, 0.365, -1.9), { worldUV: 0.8 });
  B.add(new THREE.BoxGeometry(0.04, 0.73, 1.0), M.paintedMetal, mat4(1.64, 0.365, -1.9), { worldUV: 0.8 });
  B.add(new THREE.BoxGeometry(3.28, 0.55, 0.03), M.paintedMetal, mat4(0, 0.45, -2.4), { worldUV: 0.8 });
  B.add(new THREE.BoxGeometry(0.55, 0.72, 0.95), M.paintedMetal, mat4(-1.33, 0.37, -1.9), { worldUV: 0.8 });
  for (let i = 0; i < 3; i++) {
    B.add(new THREE.BoxGeometry(0.5, 0.2, 0.01), M.paintedMetal, mat4(-1.33, 0.14 + i * 0.23, -1.42));
    B.add(new THREE.BoxGeometry(0.14, 0.02, 0.025), M.chrome, mat4(-1.33, 0.2 + i * 0.23, -1.405));
  }

  // ---------------- Monitores CRT
  const screens = [];
  const crt = (x, z, s, ry) => {
    const Mc = mat4(x, 0.78, z, 0, ry, 0, s, s, s);
    const add = (geo, mat, m, o) => B.add(geo, mat, Mc.clone().multiply(m), o);
    add(roundedBox(0.52, 0.44, 0.42, 0.04), M.plasticBeige, mat4(0, 0.27, 0));
    add(roundedBox(0.4, 0.34, 0.3, 0.05), M.plasticBeige, mat4(0, 0.25, -0.28));
    add(roundedBox(0.3, 0.05, 0.3, 0.02), M.plasticBeige, mat4(0, 0.025, -0.02));
    add(new THREE.BoxGeometry(0.46, 0.36, 0.02), M.plasticBlack, mat4(0, 0.28, 0.205));
    const sm = crtMaterial();
    const sg = new THREE.PlaneGeometry(0.42, 0.32, 8, 8);
    const p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.018 * (1 - (p.getX(i) / 0.21) ** 2 * 0.5 - (p.getY(i) / 0.16) ** 2 * 0.5));
    sg.computeVertexNormals();
    const screen = new THREE.Mesh(sg, sm);
    screen.applyMatrix4(Mc.clone().multiply(mat4(0, 0.28, 0.212)));
    group.add(screen);
    screens.push(sm);
    add(new THREE.SphereGeometry(0.008, 8, 6), M.ledRed, mat4(0.2, 0.08, 0.21), { cast: false });
  };
  crt(-0.35, -2.02, 1.15, 0.12);
  crt(0.55, -2.12, 0.85, -0.18);
  B.add(roundedBox(0.46, 0.03, 0.16, 0.01), M.plasticBeige, mat4(-0.3, 0.795, -1.58, 0, 0.1));
  for (let r = 0; r < 4; r++) for (let k = 0; k < 12; k++) {
    B.add(new THREE.BoxGeometry(0.026, 0.012, 0.026), M.plasticBeige, mat4(-0.3 + (k - 5.5) * 0.034 * Math.cos(0.1), 0.815, -1.63 + r * 0.033 - (k - 5.5) * 0.0034), { cast: false });
  }
  B.add(tube([V(-0.35, 0.78, -2.3), V(-0.2, 0.77, -2.42), V(0.3, 0.02, -2.46), V(1.2, 0.01, -2.2)], 0.008, 30, 5), M.cable, null, { cast: false });

  // ---------------- Ventilador
  const fan = new THREE.Group();
  fan.position.set(1.18, 0.78, -1.78);
  fan.rotation.y = -0.42;
  const fanParts = new StaticBatcher();
  fanParts.add(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 24), M.darkMetal, mat4(0, 0.02, 0));
  fanParts.add(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 10), M.chrome, mat4(0, 0.17, 0));
  fanParts.add(sculptSphere(24, 16, (v) => v.set(v.x * 0.07, v.y * 0.07, v.z * 0.1 - 0.04)), M.darkMetal, mat4(0, 0.33, -0.02));
  fanParts.add(new THREE.TorusGeometry(0.17, 0.006, 6, 40), M.chrome, mat4(0, 0.33, 0.07));
  fanParts.add(new THREE.TorusGeometry(0.17, 0.006, 6, 40), M.chrome, mat4(0, 0.33, -0.03));
  fanParts.add(new THREE.TorusGeometry(0.1, 0.004, 6, 30), M.chrome, mat4(0, 0.33, 0.085));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    fanParts.add(new THREE.CylinderGeometry(0.003, 0.003, 0.17, 4), M.chrome, mat4(Math.cos(a) * 0.085, 0.33 + Math.sin(a) * 0.085, 0.085, 0, 0, a + Math.PI / 2), { cast: false });
    fanParts.add(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 4), M.chrome, mat4(Math.cos(a) * 0.17, 0.33 + Math.sin(a) * 0.17, 0.02, Math.PI / 2, 0, 0), { cast: false });
  }
  fanParts.build(fan);
  const blades = new THREE.Group();
  blades.position.set(0, 0.33, 0.03);
  const bladeGeo = sculptSphere(16, 10, (v) => v.set(v.x * 0.045, v.y * 0.075 + 0.08, v.z * 0.006 + v.x * 0.012));
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8c8a82, metalness: 0.7, roughness: 0.35 });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(bladeGeo, bladeMat);
    b.rotation.z = (i / 4) * Math.PI * 2;
    b.castShadow = true;
    blades.add(b);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 12), M.darkMetal);
  hub.rotation.x = Math.PI / 2;
  blades.add(hub);
  fan.add(blades);
  group.add(fan);

  // ---------------- Lámpara de escritorio
  B.add(new THREE.CylinderGeometry(0.08, 0.09, 0.03, 20), M.darkMetal, mat4(1.32, 0.795, -2.2));
  B.add(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 8), M.darkMetal, mat4(1.3, 1.0, -2.14, 0.3, 0, 0.05));
  B.add(new THREE.CylinderGeometry(0.01, 0.01, 0.25, 8), M.darkMetal, mat4(1.24, 1.25, -1.98, 1.1, 0, 0.2));
  B.add(new THREE.CylinderGeometry(0.03, 0.1, 0.15, 20, 1, true), M.plasticRed, mat4(1.18, 1.3, -1.95, 0.5, 0, 0.3), { cast: false });
  const lampBulb = M.bulb.clone();
  lampBulb.emissiveIntensity = 3;
  rig.registerFixture('deskLamp', lampBulb);
  B.add(new THREE.SphereGeometry(0.03, 12, 8), lampBulb, mat4(1.17, 1.27, -1.93), { cast: false });

  // ---------------- Objetos del escritorio
  const papers = [T.paperLines, T.paperLines2, T.paperBlank].map((t) => posterMaterial(t));
  for (let i = 0; i < 6; i++) {
    const g = new THREE.PlaneGeometry(0.21, 0.28);
    B.add(g, papers[i % 3], mat4(0.2 + rnd() * 0.9, 0.782 + i * 0.0015, -1.6 - rnd() * 0.3, -Math.PI / 2, 0, rnd() * 1.2 - 0.6), { cast: false });
  }
  B.add(new THREE.CylinderGeometry(0.045, 0.038, 0.15, 16), M.plasticRed, mat4(0.85, 0.855, -1.52));
  B.add(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), M.porcelain, mat4(0.86, 0.95, -1.52, 0.2, 0, 0.1));
  B.add(new THREE.CylinderGeometry(0.042, 0.04, 0.1, 16, 1, true), M.porcelain, mat4(-1.05, 0.83, -1.55));
  B.add(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), M.porcelain, mat4(-1.0, 0.83, -1.55, 0, 0, -Math.PI / 2));
  B.add(new THREE.CylinderGeometry(0.038, 0.038, 0.004, 16), new THREE.MeshStandardMaterial({ color: 0x2a1405, roughness: 0.1 }), mat4(-1.05, 0.87, -1.55), { cast: false });
  // Teléfono
  B.add(roundedBox(0.22, 0.07, 0.2, 0.02), M.plasticBeige, mat4(-0.95, 0.815, -2.05, 0, 0.3));
  B.add(roundedBox(0.24, 0.05, 0.06, 0.02), M.plasticBeige, mat4(-0.95, 0.87, -2.06, 0, 0.3));
  B.add(tube([V(-0.85, 0.83, -2.0), V(-0.8, 0.8, -1.95), V(-0.83, 0.79, -1.9), V(-0.9, 0.84, -2.02)], 0.004, 20, 4), M.cable, null, { cast: false });
  // Latas
  for (let i = 0; i < 3; i++) {
    B.add(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14), M.balloons[i], mat4(1.45 - i * 0.08, 0.84, -1.5 - i * 0.05));
  }
  // Papelera y cajas de pizza
  B.add(new THREE.CylinderGeometry(0.17, 0.14, 0.4, 20, 1, true), M.darkMetal, mat4(1.95, 0.2, -1.9));
  B.add(roundedBox(0.4, 0.05, 0.4, 0.005), M.cardboard, mat4(2.6, 0.025, -2.1, 0, 0.3), { worldUV: 0.5 });
  B.add(roundedBox(0.4, 0.05, 0.4, 0.005), M.cardboard, mat4(2.6, 0.075, -2.12, 0, 0.5), { worldUV: 0.5 });

  // ---------------- Carteles de la oficina
  poster(B, posterMaterial(T.celebrate), 0.0, 1.95, -2.48, 0.92, 1.29, 0);
  const drawings = T.drawings.map((t) => posterMaterial(t));
  const spots = [[-1.1, 1.75], [-1.55, 2.1], [-1.2, 2.35], [1.05, 1.8], [1.5, 2.2], [1.1, 2.4], [-2.2, 1.9], [2.2, 1.95]];
  spots.forEach(([x, y], i) => poster(B, drawings[i % drawings.length], x, y, -2.48, 0.36, 0.36, 0, (rnd() - 0.5) * 0.3));
  poster(B, posterMaterial(T.newspaper), -2.95, 1.9, -2.48, 0.36, 0.48, 0, 0.05);

  // ---------------- Lámpara del techo
  B.add(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 6), M.cable, mat4(0, 2.78, -0.4), { cast: false });
  B.add(new THREE.CylinderGeometry(0.06, 0.32, 0.22, 28, 1, true), M.paintedMetal, mat4(0, 2.52, -0.4), { cast: false });
  const ceilBulb = M.bulb.clone();
  rig.registerFixture('officeLamp', ceilBulb);
  B.add(new THREE.SphereGeometry(0.055, 14, 10), ceilBulb, mat4(0, 2.45, -0.4), { cast: false });
  // Conducto de ventilación
  B.add(new THREE.BoxGeometry(0.6, 0.02, 0.4), M.darkMetal, mat4(-1.6, 2.99, 1.2), { cast: false });

  // ---------------- Puertas de seguridad
  const doors = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const x = sx * 3.65;
    const doorGeo = new THREE.BoxGeometry(0.1, DOOR.h + 0.06, DOOR.z1 - DOOR.z0 + 0.1);
    const door = new THREE.Mesh(doorGeo, M.door);
    door.castShadow = true;
    door.receiveShadow = true;
    const cz = (DOOR.z0 + DOOR.z1) / 2;
    const openY = DOOR.h + (DOOR.h + 0.06) / 2 - 0.02;
    const closedY = (DOOR.h + 0.06) / 2 - 0.03;
    door.position.set(x, openY, cz);
    group.add(door);
    // Carcasa del mecanismo encima de la puerta (lado oficina)
    B.add(new THREE.BoxGeometry(0.14, 0.42, 1.75), M.darkMetal, mat4(sx * 3.43, 2.72, cz), { worldUV: 0.6 });
    B.add(new THREE.BoxGeometry(0.06, 0.08, 1.7), M.door, mat4(sx * 3.39, 2.5, cz));
    doors[side] = { mesh: door, openY, closedY, target: openY, y: openY, speed: 0 };

    // Panel de botones entre la puerta y la ventana
    const px = sx * 3.48;
    const pz = -0.18;
    B.add(roundedBox(0.035, 0.6, 0.3, 0.01), M.darkMetal, mat4(px, 1.32, pz));
    B.add(new THREE.BoxGeometry(0.02, 0.62, 0.32), M.trim, mat4(sx * 3.495, 1.32, pz));
    const mkButton = (y, baseMat, action, label) => {
      const mat = baseMat.clone();
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.05, 28), mat);
      btn.rotation.z = Math.PI / 2;
      btn.position.set(sx * 3.44, y, pz);
      btn.userData.action = action;
      btn.castShadow = true;
      group.add(btn);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 8, 28), M.chrome);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(sx * 3.462, y, pz);
      group.add(ring);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshStandardMaterial({ map: labelTexture(label), roughness: 0.6 }));
      lab.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
      lab.position.set(sx * 3.459, y - 0.095, pz);
      group.add(lab);
      return btn;
    };
    doors[side].doorBtn = mkButton(1.45, M.buttonRed, 'door' + side, 'PUERTA');
    doors[side].lightBtn = mkButton(1.17, M.buttonLight, 'light' + side, 'LUZ');
  }

  B.build(group);
  scene.add(group);

  const buttons = [doors.L.doorBtn, doors.L.lightBtn, doors.R.doorBtn, doors.R.lightBtn];
  let fanSpeed = 1;

  return {
    group,
    doors,
    buttons,
    screens,
    setDoor(side, closed) {
      doors[side].target = closed ? doors[side].closedY : doors[side].openY;
    },
    update(dt, t, state) {
      for (const side of ['L', 'R']) {
        const d = doors[side];
        const dir = Math.sign(d.target - d.y);
        if (dir !== 0) {
          const v = dir < 0 ? 9 : 5;
          d.y += dir * v * dt;
          if (Math.sign(d.target - d.y) !== dir) d.y = d.target;
          d.mesh.position.y = d.y;
        }
        d.doorBtn.material.emissiveIntensity = state[`door${side}`] ? 2.2 : 0.05;
        d.lightBtn.material.emissiveIntensity = state[`light${side}`] ? 2.5 : 0.05;
        if (state.broken?.[side]) {
          d.doorBtn.material.emissiveIntensity = 0;
          d.lightBtn.material.emissiveIntensity = 0;
        }
      }
      const targetFan = state.power ? 1 : 0;
      fanSpeed += (targetFan - fanSpeed) * Math.min(1, dt * 0.5);
      blades.rotation.z -= dt * 38 * fanSpeed;
      for (const s of screens) {
        s.uniforms.time.value = t;
        s.uniforms.power.value = state.power ? 1 : 0;
      }
    },
  };
}

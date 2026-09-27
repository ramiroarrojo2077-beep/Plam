// Visor de desarrollo para iterar el modelado de los animatrónicos (dev/models.html).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as TX from '../core/textures.js';
import { createMaterials } from '../core/materials.js';
import { createAnimatronic } from '../animatronics/models.js';
import { setFurShells } from '../animatronics/fur.js';

const W = +(new URLSearchParams(location.search).get('w') || 900);
const H = +(new URLSearchParams(location.search).get('h') || 700);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0c0e);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.15;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);

const T = {
  floor: TX.genFloor(128), wainscot: TX.genWainscot(128, 64), plaster: TX.genPlaster(64), ceiling: TX.genCeiling(64),
  wood: TX.genWood(64), concrete: TX.genConcrete(64), curtainPurple: TX.genCurtain(64), curtainRed: TX.genCurtain(64),
  curtainNavy: TX.genCurtain(64), cloth: TX.genCloth(64), door: TX.genDoorMetal(64, 128), metal: TX.genMetal(256),
  fur: TX.genFur(1024), furStrands: TX.genFurStrands(512), celebrate: null, stageSign: TX.genStageSign(128, 32), bib: TX.genBib(), partyHat: TX.genStripes(['#c00', '#fff'], 32, 32),
  partyHat2: TX.genStripes(['#00c', '#ff0'], 32, 32), exitSign: TX.genSign('X', { w: 32, h: 16, age: false }),
};
const M = createMaterials(T);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const key = new THREE.SpotLight(0xfff2e0, 60, 14, 0.6, 0.6, 2);
key.position.set(2.2, 3.6, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const rim = new THREE.SpotLight(0x9ab8ff, 40, 12, 0.7, 0.6, 2);
rim.position.set(-2.5, 3.2, -3);
scene.add(rim, rim.target);
const fill = new THREE.PointLight(0xffc9a0, 4, 10, 2);
fill.position.set(-2.5, 1.5, 2.5);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0x8090b0, 0x201810, 0.15));

const chars = {};
for (const k of ['bear', 'bunny', 'chicken', 'fox']) {
  chars[k] = createAnimatronic(k, M, T);
  setFurShells(chars[k].root, [chars[k].fur, chars[k].furDouble].filter(Boolean), T.furStrands, +(new URLSearchParams(location.search).get('shells') ?? 8));
  chars[k].root.visible = false;
  scene.add(chars[k].root);
}

window.shoot = (kind, view = 'full', pose = null, yaw = 0.35, extra = {}) => {
  for (const k in chars) chars[k].root.visible = k === kind;
  const c = chars[kind];
  c.place(new THREE.Vector3(0, 0, 0), 0);
  c.setPose(pose || { bear: 'stageBear', bunny: 'guitar', chicken: 'cupcake', fox: 'coveHunch' }[kind]);
  c.snapPose();
  c.twitch.rate = 0;
  c.sway = 0;
  c.jaw.target = extra.jaw || 0;
  c.jaw.value = extra.jaw || 0;
  c.setHollow(!!extra.hollow);
  c.eyeGlow = c.eyeGlowTarget = extra.glow ?? 0.4;
  c.lookAt(null);
  for (let i = 0; i < 3; i++) {
    c.update(0.016, 0);
    scene.updateMatrixWorld(true);
  }
  const head = c.j.head.getWorldPosition(new THREE.Vector3());
  head.y += 0.2 * c.body.scale.x;
  const dirs = { full: [yaw, 0.05, 4.6, 1.1, 30], face: [yaw, 0.05, 1.25, null, 30], icon: [yaw, 0.06, 1.75, null, 30], side: [Math.PI / 2, 0.05, 4.6, 1.1, 30], back: [Math.PI + 0.3, 0.1, 4.6, 1.1, 30], hands: [yaw, -0.1, 2.0, 0.9, 30], feet: [yaw, 0.3, 2.0, 0.2, 30], torso: [yaw, 0.0, 2.4, 1.4, 30] };
  const [a, p, d, cy, fov] = dirs[view];
  const target = cy === null ? head : new THREE.Vector3(0, cy, 0);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.position.set(target.x + Math.sin(a) * Math.cos(p) * d, target.y + Math.sin(p) * d, target.z + Math.cos(a) * Math.cos(p) * d);
  camera.lookAt(target);
  renderer.render(scene, camera);
  return true;
};
window.ready = true;

// Simulación de locomoción para revisar pasos e IK: prep() prepara la escena y adv() avanza
// n fotogramas y renderiza con una cámara lateral que sigue al personaje.
let simT = 0;
window.prep = (kind, mode = 'walk', extra = {}) => {
  for (const k in chars) chars[k].root.visible = k === kind;
  const c = chars[kind];
  c.place(new THREE.Vector3(0, 0, extra.z0 ?? -3), extra.h0 ?? 0);
  c.setPose(extra.pose || 'stand');
  c.snapPose();
  c.twitch.rate = 0;
  c.sway = 1;
  c.lookAt(null);
  c.treadmill = null;
  if (mode === 'walk' || mode === 'run') {
    const speed = extra.speed || (mode === 'run' ? 5.5 : 1.1);
    c.walkTo([new THREE.Vector3(0, 0, extra.z1 ?? 3)], { speed, style: mode, faceAt: extra.faceAt ? new THREE.Vector3(...extra.faceAt) : null });
  } else if (mode === 'turn') c.faceTowards(extra.tx ?? 3, extra.tz ?? -3);
  window.cur = c;
  return true;
};
window.adv = (n, view = 'side', dt = 1 / 60) => {
  const c = window.cur;
  for (let i = 0; i < n; i++) {
    simT += dt;
    c.update(dt, simT);
  }
  scene.updateMatrixWorld(true);
  const p = c.root.position;
  const a = view === 'side' ? Math.PI / 2 : view === 'front' ? 0.25 : view === 'back' ? Math.PI - 0.4 : 0.9;
  const d = view === 'legs' ? 2.6 : 4.4;
  const cy = view === 'legs' ? 0.5 : 1.0;
  camera.fov = 30;
  camera.updateProjectionMatrix();
  camera.position.set(p.x + Math.sin(a) * d, cy + 0.15, p.z + Math.cos(a) * d);
  camera.lookAt(p.x, cy, p.z);
  floor.position.set(p.x, 0, p.z);
  key.position.set(p.x + 2.2, 3.6, p.z + 3.2);
  key.target.position.copy(p);
  renderer.render(scene, camera);
  return { z: +p.z.toFixed(2), h: +c.heading.toFixed(2), feet: c.feet.map((F) => (F.swing ? 'S' : 'P') + F.pitch.toFixed(2)) };
};

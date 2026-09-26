// Sondas de reflexión locales: se captura el propio local desde varios puntos con una
// CubeCamera y se prefiltra con PMREM. Cada vista usa la sonda de su zona como entorno,
// lo que da reflejos creíbles (suelo, ojos, metal) y luz rebotada aproximada.
import * as THREE from 'three';
import { VIEW_LIGHTS } from './layout.js';

export const PROBES = {
  office: { pos: [0, 1.4, 0.3], lights: VIEW_LIGHTS.office },
  westHall: { pos: [-5, 1.5, -9], lights: ['wh1', 'wh2', 'whC'] },
  eastHall: { pos: [5, 1.5, -9], lights: ['eh1', 'eh2', 'ehC'] },
  dining: { pos: [0, 2.0, -26], lights: ['stageL', 'stageC', 'stageR', 'dining1', 'dining2', 'dining3', 'signGlow'] },
  stage: { pos: [0, 2.2, -33.4], lights: ['stageL', 'stageC', 'stageR', 'dining1', 'signGlow'] },
  cove: { pos: [-10.2, 1.5, -25], lights: ['coveSpot', 'coveGlow', 'dining2'] },
  backstage: { pos: [-14, 1.5, -33.5], lights: ['bsBulb'] },
  restrooms: { pos: [14, 1.5, -33.5], lights: ['restroom'] },
  closet: { pos: [-2, 1.3, -9.3], lights: ['closetBulb'] },
};

// Sonda por cámara de seguridad / vista.
export const CAM_PROBE = { '1A': 'stage', '1B': 'dining', '1C': 'cove', '2A': 'westHall', '2B': 'westHall', '3': 'closet', '4A': 'eastHall', '4B': 'eastHall', '5': 'backstage', '7': 'restrooms' };

export function captureProbes(renderer, scene, rig, hide = [], size = 128) {
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.05, 70, rt);
  scene.add(cubeCam);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const prevEnv = scene.environment;
  const prevFog = scene.fog;
  scene.environment = null;
  scene.fog = null;
  const hidden = hide.filter((o) => o.visible);
  for (const o of hidden) o.visible = false;
  rig.steady = true;
  const out = {};
  for (const [id, p] of Object.entries(PROBES)) {
    rig.setView(p.lights, 0.03);
    rig.update(0);
    cubeCam.position.set(...p.pos);
    cubeCam.update(renderer, scene);
    out[id] = pmrem.fromCubemap(rt.texture).texture;
  }
  rig.steady = false;
  for (const o of hidden) o.visible = true;
  scene.environment = prevEnv;
  scene.fog = prevFog;
  scene.remove(cubeCam);
  rt.dispose();
  pmrem.dispose();
  return out;
}

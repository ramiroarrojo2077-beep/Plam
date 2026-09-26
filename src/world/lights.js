// Pool fijo de luces reales reasignado según la vista activa. El número de luces nunca cambia,
// así los shaders se compilan una sola vez y el coste por píxel está acotado.
import * as THREE from 'three';
import { LIGHTS } from './layout.js';
import { noise1, hash2 } from '../core/rng.js';

const N_POINTS = 6;
const N_SPOTS = 4;

export class LightRig {
  constructor(scene, shadowSize = 1024) {
    this.scene = scene;
    this.points = [];
    this.spots = [];
    for (let i = 0; i < N_POINTS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.points.push({ light: l, id: null, def: null });
    }
    for (let i = 0; i < N_SPOTS; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 10, 0.5, 0.5, 2);
      l.castShadow = true;
      l.shadow.mapSize.set(shadowSize, shadowSize);
      l.shadow.bias = -0.0005;
      l.shadow.normalBias = 0.025;
      l.shadow.radius = 4;
      l.shadow.camera.near = 0.15;
      scene.add(l);
      scene.add(l.target);
      this.spots.push({ light: l, id: null, def: null });
    }
    this.hemi = new THREE.HemisphereLight(0x8a96b8, 0x1a120c, 0.04);
    scene.add(this.hemi);

    this.state = { lightL: false, lightR: false, power: true };
    this.mult = { faceLight: 0 }; // multiplicadores por id (p. ej. luz de cara de Bruno en apagón)
    this.fixtures = {}; // materiales emisivos sincronizados con una luz
    this.viewIds = [];
  }

  setShadowSize(size) {
    for (const s of this.spots) {
      s.light.shadow.mapSize.set(size, size);
      if (s.light.shadow.map) {
        s.light.shadow.map.dispose();
        s.light.shadow.map = null;
      }
      s.light.shadow.needsUpdate = true;
    }
  }

  registerFixture(id, material) {
    (this.fixtures[id] ||= []).push(material);
    material.userData.baseEmissive = material.emissiveIntensity;
  }

  setView(ids, hemi = 0.04) {
    this.viewIds = ids;
    this.hemi.intensity = hemi;
    for (const s of [...this.points, ...this.spots]) {
      s.id = null;
      s.def = null;
      s.light.intensity = 0;
    }
    let pi = 0;
    let si = 0;
    for (const id of ids) {
      const def = LIGHTS[id];
      if (!def) continue;
      if (def.type === 'spot') {
        if (si >= this.spots.length) continue;
        this.assignSpot(this.spots[si++], id, def);
      } else {
        if (pi >= this.points.length) continue;
        const slot = this.points[pi++];
        slot.id = id;
        slot.def = def;
        const l = slot.light;
        l.position.set(...def.pos);
        l.color.setHex(def.color);
        l.distance = def.distance || 10;
        l.decay = 2;
      }
    }
    for (let i = si; i < this.spots.length; i++) {
      const l = this.spots[i].light;
      l.shadow.intensity = 0;
      l.shadow.autoUpdate = false;
      l.shadow.needsUpdate = true;
    }
  }

  assignSpot(slot, id, def) {
    slot.id = id;
    slot.def = def;
    const l = slot.light;
    l.position.set(...def.pos);
    l.target.position.set(...def.target);
    l.target.updateMatrixWorld();
    l.color.setHex(def.color);
    l.distance = def.distance || 10;
    l.angle = def.angle || 0.5;
    l.penumbra = def.penumbra ?? 0.5;
    l.decay = 2;
    l.shadow.intensity = def.shadow ? 1 : 0;
    l.shadow.autoUpdate = !!def.shadow;
    l.shadow.needsUpdate = true;
    l.shadow.camera.far = (def.distance || 10) + 1;
    l.shadow.camera.updateProjectionMatrix();
  }

  // Mueve una luz dinámica (p. ej. la luz de la cara en el apagón).
  movePoint(id, pos, target) {
    for (const s of [...this.points, ...this.spots]) {
      if (s.id !== id) continue;
      s.light.position.copy(pos);
      if (target && s.light.target) {
        s.light.target.position.copy(target);
        s.light.target.updateMatrixWorld();
      }
    }
  }

  factor(id, def, t) {
    if (!def.battery && !this.state.power) return 0;
    if (def.toggle && !this.state[def.toggle]) return 0;
    let f = this.mult[id] ?? 1;
    const s = def.seed || 0;
    switch (def.flicker) {
      case 'fluoro': {
        const n = noise1(t * 0.55, s);
        if (n > 0.8) f *= hash2(Math.floor(t * 22), s, 3) > 0.45 ? 1 : 0.08;
        else f *= 0.95 + 0.05 * noise1(t * 40, s + 9);
        break;
      }
      case 'bulb': {
        f *= 0.9 + 0.1 * noise1(t * 5, s);
        if (noise1(t * 0.3, s + 4) > 0.86) f *= 0.35 + 0.65 * noise1(t * 35, s);
        break;
      }
      case 'buzz':
        f *= 0.92 + 0.08 * hash2(Math.floor(t * 50), 1, 2);
        break;
      case 'screen':
        f *= 0.85 + 0.15 * noise1(t * 12, 3);
        break;
      case 'menu': {
        const n = noise1(t * 0.8, 21);
        f *= n > 0.7 ? (hash2(Math.floor(t * 18), 5, 1) > 0.5 ? 1 : 0.05) : 0.85 + 0.15 * noise1(t * 3, 2);
        break;
      }
      case 'scare':
        f *= hash2(Math.floor(t * 24), 9, 1) > 0.35 ? 1 : 0.15;
        break;
      default:
        break;
    }
    return f;
  }

  update(t) {
    for (const s of [...this.points, ...this.spots]) {
      if (!s.def) continue;
      s.light.intensity = s.def.intensity * this.factor(s.id, s.def, t);
    }
    for (const id in this.fixtures) {
      const def = LIGHTS[id];
      const f = def ? this.factor(id, def, t) / (this.mult[id] ?? 1) : this.state.power ? 1 : 0;
      for (const m of this.fixtures[id]) m.emissiveIntensity = m.userData.baseEmissive * f;
    }
  }
}

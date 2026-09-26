// Atmósfera: haces de luz volumétricos con polvo en suspensión, manchas en el suelo,
// charcos reflectantes y telarañas en las esquinas.
import * as THREE from 'three';
import { LIGHTS } from './layout.js';
import { mulberry32, TileNoise, smoothstep } from '../core/rng.js';

const V = (a) => new THREE.Vector3(...a);

const BEAM_VS = /* glsl */ `
  uniform float uLen;
  varying vec3 vPosW;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vT;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    vT = clamp(-position.y / uLen, 0.0, 1.0);
    vec4 mv = viewMatrix * w;
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3 vPosW;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vT;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    float facing = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    float edge = pow(facing, 2.2);
    float along = smoothstep(0.0, 0.06, vT) * pow(1.0 - vT, 1.25) * (0.35 + 0.65 * (1.0 - vT));
    vec3 q = vPosW * 2.2 + vec3(0.0, uTime * 0.05, uTime * 0.03);
    float haze = 0.55 + 0.45 * (noise(q) * 0.65 + noise(q * 2.7) * 0.35);
    float a = uIntensity * edge * along * haze;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;
const DUST_VS = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uLen;
  uniform float uSize;
  varying float vFade;
  varying float vSeed;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.13 + aSeed * 20.0) * 0.07;
    p.y += sin(uTime * 0.07 + aSeed * 13.0) * 0.09;
    p.z += cos(uTime * 0.11 + aSeed * 7.0) * 0.07;
    vFade = 1.0 - clamp(-position.y / uLen, 0.0, 1.0);
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.5 + fract(aSeed * 91.7)) / max(0.3, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const DUST_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying float vFade;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    float tw = 0.5 + 0.5 * sin(uTime * (0.8 + vSeed * 2.0) + vSeed * 40.0);
    gl_FragColor = vec4(uColor * a * uIntensity * vFade * (0.4 + 0.6 * tw), 1.0);
  }
`;

// ------------------------------------------------------------ texturas de decals
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

function stainTexture(seed, tint = [34, 24, 14]) {
  const n = new TileNoise(seed);
  return canvasTex(256, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const r = Math.hypot(u - 0.5, v - 0.5) * 2;
        const f = n.fbm(u, v, 3, 5);
        const a = smoothstep(1.0, 0.35, r + (f - 0.5) * 0.9) * (0.35 + f * 0.65);
        const o = (y * w + x) * 4;
        img.data[o] = tint[0] * (0.7 + f * 0.6);
        img.data[o + 1] = tint[1] * (0.7 + f * 0.6);
        img.data[o + 2] = tint[2] * (0.7 + f * 0.6);
        img.data[o + 3] = Math.min(255, a * 230);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function puddleTexture(seed) {
  const n = new TileNoise(seed);
  return canvasTex(256, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const r = Math.hypot((u - 0.5) * 1.3, v - 0.5) * 2;
        const f = n.fbm(u, v, 2, 4);
        const a = smoothstep(0.95, 0.75, r + (f - 0.5) * 0.7);
        const o = (y * w + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = a * 255;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, false);
}

function webTexture(seed) {
  const rnd = mulberry32(seed);
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = 2;
    const spokes = 11;
    const ang = [];
    for (let i = 0; i < spokes; i++) ang.push(Math.PI * (0.02 + (0.96 * i) / (spokes - 1)) + (rnd() - 0.5) * 0.08);
    ctx.strokeStyle = 'rgba(235,235,230,0.55)';
    ctx.lineWidth = 1.1;
    for (const a of ang) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const L = w * (0.55 + rnd() * 0.4);
      ctx.quadraticCurveTo(cx + Math.cos(a) * L * 0.5, cy + Math.sin(a) * L * 0.55, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
      ctx.stroke();
    }
    ctx.lineWidth = 0.8;
    for (let ring = 1; ring < 14; ring++) {
      const R = ring * 13 + rnd() * 4;
      ctx.strokeStyle = `rgba(230,230,225,${0.25 + rnd() * 0.3})`;
      ctx.beginPath();
      for (let i = 0; i < spokes; i++) {
        const a = ang[i];
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const pa = (ang[i - 1] + a) / 2;
          ctx.quadraticCurveTo(cx + Math.cos(pa) * R * 0.86, cy + Math.sin(pa) * R * 0.86 + 3, x, y);
        }
      }
      ctx.stroke();
    }
    // Hebras rotas colgando
    ctx.strokeStyle = 'rgba(220,220,215,0.35)';
    for (let i = 0; i < 5; i++) {
      const x = rnd() * w;
      ctx.beginPath();
      ctx.moveTo(x, 10 + rnd() * 60);
      ctx.lineTo(x + (rnd() - 0.5) * 20, 120 + rnd() * 120);
      ctx.stroke();
    }
  });
}

export class Atmosphere {
  constructor(scene, rig) {
    this.scene = scene;
    this.rig = rig;
    this.group = new THREE.Group();
    this.group.name = 'atmosphere';
    scene.add(this.group);
    this.beams = [];
    this.dustOn = true;
    this.beamScale = 1;
    const beams = [
      ['doorL', 0.2, 90],
      ['doorR', 0.2, 90],
      ['stageL', 0.08, 110],
      ['stageC', 0.09, 110],
      ['stageR', 0.08, 110],
      ['coveSpot', 0.09, 60],
      ['deskLamp', 0.05, 40],
      ['galKey', 0.03, 40],
      ['galRim', 0.025, 0],
    ];
    for (const [id, s, d] of beams) this.addBeam(id, s, d);
    this.buildDecals();
  }

  addBeam(id, strength, dustCount) {
    const def = LIGHTS[id];
    const pos = V(def.pos);
    const dir = V(def.target).sub(pos).normalize();
    let L = (def.distance || 10) * 0.85;
    if (dir.y < -0.01) L = Math.min(L, pos.y / -dir.y);
    const R = Math.tan(def.angle || 0.5) * L * 0.92;
    const geo = new THREE.CylinderGeometry(0.02, R, L, 40, 16, true);
    geo.translate(0, -L / 2, 0);
    const color = new THREE.Color(def.color);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uIntensity: { value: 0 }, uTime: { value: 0 }, uLen: { value: L } },
      vertexShader: BEAM_VS,
      fragmentShader: BEAM_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    mesh.renderOrder = 20;
    mesh.userData.noAO = true;
    mesh.visible = false;
    this.group.add(mesh);
    let dust = null;
    if (dustCount) {
      const rnd = mulberry32(id.length * 97 + dustCount);
      const pts = new Float32Array(dustCount * 3);
      const seeds = new Float32Array(dustCount);
      for (let i = 0; i < dustCount; i++) {
        const t = 0.08 + rnd() * 0.85;
        const r = Math.sqrt(rnd()) * R * t * 0.85;
        const a = rnd() * Math.PI * 2;
        pts[i * 3] = Math.cos(a) * r;
        pts[i * 3 + 1] = -t * L;
        pts[i * 3 + 2] = Math.sin(a) * r;
        seeds[i] = rnd();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      const dm = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color.clone() }, uIntensity: { value: 0 }, uTime: { value: 0 }, uLen: { value: L }, uSize: { value: 18 } },
        vertexShader: DUST_VS,
        fragmentShader: DUST_FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      dust = new THREE.Points(g, dm);
      dust.renderOrder = 21;
      dust.visible = false;
      mesh.add(dust);
    }
    this.beams.push({ id, def, mesh, mat, dust, strength });
  }

  buildDecals() {
    const stains = [stainTexture(3), stainTexture(7, [40, 26, 12]), stainTexture(11, [22, 20, 18])];
    const stainMats = stains.map(
      (map) => new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    const puddle = puddleTexture(5);
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      roughness: 0.04,
      metalness: 0.0,
      alphaMap: puddle,
      transparent: true,
      depthWrite: false,
      envMapIntensity: 2.2,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const rnd = mulberry32(2024);
    const floorDecal = (mat, x, z, size, rot, y = 0.003) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * (0.7 + rnd() * 0.6)), mat);
      m.rotation.set(-Math.PI / 2, 0, rot);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      m.userData.noAO = true;
      m.renderOrder = 2;
      this.group.add(m);
    };
    const S = (x, z, size) => floorDecal(stainMats[Math.floor(rnd() * 3)], x, z, size, rnd() * 6.28);
    // Oficina
    S(1.9, 1.5, 1.0); S(-2.3, -1.2, 0.8); S(0.5, 0.6, 1.3); S(-0.8, -1.2, 0.7);
    // Pasillos
    for (let z = -19; z < 2; z += 2.2 + rnd() * 1.5) {
      S(-5 + (rnd() - 0.5) * 1.4, z, 0.6 + rnd() * 0.9);
      S(5 + (rnd() - 0.5) * 1.4, z + rnd(), 0.6 + rnd() * 0.9);
    }
    // Comedor, trastienda, baños, cocina, armario
    for (let i = 0; i < 14; i++) S(-10 + rnd() * 20, -36 + rnd() * 15, 0.7 + rnd() * 1.4);
    for (let i = 0; i < 4; i++) S(-16 + rnd() * 4.5, -36.5 + rnd() * 6, 0.8 + rnd());
    S(14.5, -34.5, 1.1); S(13, -31.5, 0.8); S(14, -24, 1.0); S(-2, -9.5, 0.9);
    // Charcos (goteras)
    floorDecal(puddleMat, -5.2, -14.6, 1.3, 0.4, 0.004);
    floorDecal(puddleMat, 4.8, -7.2, 0.9, 1.2, 0.004);
    floorDecal(puddleMat, 15.2, -35.2, 1.2, 2.1, 0.004);
    floorDecal(puddleMat, -13.4, -31.4, 1.0, 0.2, 0.004);

    // Telarañas en esquinas del techo
    const webMat = new THREE.MeshStandardMaterial({ map: webTexture(9), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, color: 0xd8d8d0 });
    const webMat2 = new THREE.MeshStandardMaterial({ map: webTexture(21), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, color: 0xd8d8d0 });
    const web = (cx, cz, sx, sz, h, a = 0.7) => {
      const w = a * Math.SQRT2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.8), rnd() < 0.5 ? webMat : webMat2);
      m.position.set(cx + (sx * a) / 2, h - w * 0.4 - 0.01, cz + (sz * a) / 2);
      m.rotation.y = Math.atan2(sx, sz);
      m.rotateX(-0.35);
      m.userData.noAO = true;
      m.renderOrder = 3;
      this.group.add(m);
    };
    web(-3.5, -2.5, 1, 1, 3.0, 0.8);
    web(3.5, -2.5, -1, 1, 3.0, 0.6);
    web(-3.5, 2.5, 1, -1, 3.0, 0.7);
    web(-6.2, -20.3 + 0.02, 1, 1, 3.0, 0.6);
    web(6.2, 2.5, -1, -1, 3.0, 0.7);
    web(-3.8, 2.5, -1, -1, 3.0, 0.5);
    web(-16.5, -37, 1, 1, 3.2, 0.9);
    web(-11.3, -30, -1, -1, 3.2, 0.6);
    web(-3.5, -11, 1, 1, 3.0, 0.7);
    web(-11, -20.3, 1, -1, 4.4, 1.0);
    web(11, -37, -1, 1, 4.4, 0.9);
    web(-15, -28, 1, 1, 3.2, 0.7);
    web(17, -37, -1, 1, 3.2, 0.8);
  }

  setQuality(q) {
    this.dustOn = q.dust;
    this.beamScale = q.beams ? 1 : 0;
  }

  update(t) {
    const rig = this.rig;
    const ids = rig.viewIds;
    for (const b of this.beams) {
      const on = this.beamScale > 0 && ids.includes(b.id);
      b.mesh.visible = on;
      if (b.dust) b.dust.visible = on && this.dustOn;
      if (!on) continue;
      const f = rig.factor(b.id, b.def, t);
      b.mat.uniforms.uIntensity.value = f * b.strength * this.beamScale;
      b.mat.uniforms.uTime.value = t;
      if (b.dust) {
        b.dust.material.uniforms.uIntensity.value = f * 0.9;
        b.dust.material.uniforms.uTime.value = t;
      }
    }
  }
}

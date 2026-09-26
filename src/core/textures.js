// Texturas 100% procedurales generadas en <canvas>. Sin assets externos.
import * as THREE from 'three';
import { TileNoise, mulberry32, hash2, clamp, smoothstep, lerp } from './rng.js';

let ANISO = 8;
export function setAnisotropy(a) {
  ANISO = a;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

class PixelMaps {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.albedo = new Uint8ClampedArray(w * h * 4);
    this.rough = new Float32Array(w * h);
    this.height = new Float32Array(w * h);
  }
  set(i, r, g, b) {
    const o = i * 4;
    this.albedo[o] = r;
    this.albedo[o + 1] = g;
    this.albedo[o + 2] = b;
    this.albedo[o + 3] = 255;
  }
  albedoCanvas() {
    const c = makeCanvas(this.w, this.h);
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(this.albedo, this.w, this.h), 0, 0);
    return c;
  }
  roughCanvas() {
    const c = makeCanvas(this.w, this.h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.rough.length; i++) {
      const v = clamp(this.rough[i], 0, 1) * 255;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  normalCanvas(strength = 2) {
    const { w, h, height } = this;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      const yu = (y - 1 + h) % h;
      const yd = (y + 1) % h;
      for (let x = 0; x < w; x++) {
        const xl = (x - 1 + w) % w;
        const xr = (x + 1) % w;
        const dx = (height[y * w + xr] - height[y * w + xl]) * strength;
        const dy = (height[yu * w + x] - height[yd * w + x]) * strength;
        const l = Math.hypot(dx, dy, 1);
        const o = (y * w + x) * 4;
        d[o] = (-dx / l * 0.5 + 0.5) * 255;
        d[o + 1] = (-dy / l * 0.5 + 0.5) * 255;
        d[o + 2] = (1 / l * 0.5 + 0.5) * 255;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  build(normalStrength = 2) {
    return {
      map: canvasTexture(this.albedoCanvas()),
      rough: canvasTexture(this.roughCanvas(), { srgb: false }),
      normal: canvasTexture(this.normalCanvas(normalStrength), { srgb: false }),
    };
  }
}

// Dibuja arañazos finos sobre un canvas (se usa sobre albedo y rugosidad).
function scratches(ctx, w, h, rnd, count, color, maxLen = 0.15, width = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * Math.PI * 2;
    const len = (0.01 + rnd() * maxLen) * w;
    ctx.lineWidth = width * (0.4 + rnd());
    ctx.beginPath();
    ctx.moveTo(x, y);
    const cx = x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * len * 0.3;
    const cy = y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * len * 0.3;
    ctx.quadraticCurveTo(cx, cy, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function crack(ctx, rnd, x, y, len, w) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rnd() - 0.5) * 1.1;
    x += Math.cos(a) * 4;
    y += Math.sin(a) * 4;
    ctx.lineTo(x, y);
    if (rnd() < 0.05) crack(ctx, rnd, x, y, len * 0.4, w * 0.6);
  }
  ctx.lineWidth = w;
  ctx.stroke();
}

// ---------------------------------------------------------------- Suelo
// Baldosas ajedrezadas tipo pizzería (4x4 baldosas por textura).
export function genFloor(size = 1024) {
  const n = new TileNoise(11);
  const rnd = mulberry32(5);
  const P = new PixelMaps(size, size);
  const N = 4;
  const tile = size / N;
  const grout = size * 0.0045;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const tx = Math.floor(x / tile);
      const ty = Math.floor(y / tile);
      const lx = x - tx * tile;
      const ly = y - ty * tile;
      const edge = Math.min(lx, ly, tile - lx, tile - ly);
      const tileMask = smoothstep(grout * 0.6, grout * 1.6, edge);
      const bevel = smoothstep(grout, grout * 5, edge);
      const black = ((tx + ty) & 1) === 1;
      const tr = hash2(tx, ty, 3) - 0.5;
      const g1 = n.fbm(u, v, 4, 5);
      const g2 = n.fbm(u + 0.37, v + 0.11, 2, 3);
      const dirt = smoothstep(0.45, 0.82, g1 * 0.55 + g2 * 0.55);
      const micro = n.fbm(u, v, 64, 2);
      let r, g, b;
      if (black) {
        r = 22; g = 22; b = 26;
      } else {
        r = 206; g = 200; b = 186;
      }
      const k = 1 + tr * 0.07 - dirt * 0.38 + (micro - 0.5) * 0.06;
      r *= k; g *= k; b *= k;
      if (!black) {
        r = lerp(r, 92, dirt * 0.4);
        g = lerp(g, 76, dirt * 0.4);
        b = lerp(b, 58, dirt * 0.4);
      }
      const gr = 56 - dirt * 22;
      r = lerp(gr, r, tileMask);
      g = lerp(gr * 0.97, g, tileMask);
      b = lerp(gr * 0.9, b, tileMask);
      P.set(i, r, g, b);
      P.rough[i] = lerp(0.95, 0.22 + dirt * 0.5 + micro * 0.08 + (black ? -0.04 : 0), tileMask);
      P.height[i] = tileMask * (0.55 + 0.45 * bevel) + (micro - 0.5) * 0.04;
    }
  }
  const albedo = P.albedoCanvas();
  const actx = albedo.getContext('2d');
  scratches(actx, size, size, rnd, 260, 'rgba(0,0,0,0.10)', 0.08, 1.2);
  scratches(actx, size, size, rnd, 120, 'rgba(255,255,255,0.05)', 0.05, 1);
  // Huellas de suciedad (manchas circulares tenues)
  for (let i = 0; i < 40; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 10 + rnd() * 50;
    const grd = actx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(40,30,20,0.18)');
    grd.addColorStop(1, 'rgba(40,30,20,0)');
    actx.fillStyle = grd;
    actx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const rough = P.roughCanvas();
  scratches(rough.getContext('2d'), size, size, mulberry32(5), 260, 'rgba(255,255,255,0.2)', 0.08, 1.2);
  return {
    map: canvasTexture(albedo),
    rough: canvasTexture(rough, { srgb: false }),
    normal: canvasTexture(P.normalCanvas(3), { srgb: false }),
  };
}

// ---------------------------------------------------------------- Zócalo
// Cubre 2.8 m x 1.4 m: rodapié, azulejo granate y franja ajedrezada.
export function genWainscot(w = 1024, h = 512) {
  const n = new TileNoise(21);
  const P = new PixelMaps(w, h);
  const W = 2.8;
  const Hm = 1.4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = x / w;
      const v = y / h;
      const xm = u * W;
      const ym = (1 - v) * Hm;
      const g = n.fbm(u, v, 4, 5);
      const floorDirt = smoothstep(0.55, 0.0, ym) * 0.5;
      const dirt = clamp(smoothstep(0.5, 0.85, g) + floorDirt * g, 0, 1);
      const micro = n.fbm(u, v, 48, 2);
      let r, gg, b, rough, height;
      if (ym < 0.12) {
        r = 34; gg = 30; b = 28;
        rough = 0.55;
        height = 0.9 - smoothstep(0.1, 0.12, ym) * 0.2;
      } else if (ym < 1.1) {
        const ts = 0.14;
        const gw = 0.006;
        const lx = xm % ts;
        const ly = (ym - 0.12) % ts;
        const e = Math.min(lx, ly, ts - lx, ts - ly);
        const m = smoothstep(gw * 0.4, gw, e);
        const tr = hash2(Math.floor(xm / ts), Math.floor((ym - 0.12) / ts), 9) - 0.5;
        const kk = 1 + tr * 0.12;
        r = lerp(70, 112 * kk, m);
        gg = lerp(64, 24 * kk, m);
        b = lerp(58, 26 * kk, m);
        rough = lerp(0.9, 0.18 + micro * 0.1, m);
        height = m * 0.8 + smoothstep(gw, gw * 3, e) * 0.2;
      } else if (ym < 1.3) {
        const cs = 0.1;
        const cx = Math.floor(xm / cs);
        const cy = Math.floor((ym - 1.1) / cs);
        const lx = xm % cs;
        const ly = (ym - 1.1) % cs;
        const e = Math.min(lx, ly, cs - lx, cs - ly);
        const m = smoothstep(0.002, 0.005, e);
        const black = ((cx + cy) & 1) === 1;
        const base = black ? 24 : 205;
        r = lerp(60, base, m);
        gg = lerp(58, base * (black ? 1 : 0.97), m);
        b = lerp(55, base * (black ? 1.1 : 0.9), m);
        rough = lerp(0.9, 0.3, m);
        height = m * 0.7;
      } else {
        r = 44; gg = 38; b = 36;
        rough = 0.5;
        height = 1.0 - Math.abs(ym - 1.35) * 8;
      }
      const k = 1 - dirt * 0.4 + (micro - 0.5) * 0.05;
      P.set(i, r * k, gg * k, b * k);
      P.rough[i] = clamp(rough + dirt * 0.35, 0, 1);
      P.height[i] = height + (micro - 0.5) * 0.03;
    }
  }
  return P.build(3);
}

// ---------------------------------------------------------------- Yeso (parte alta de la pared)
export function genPlaster(size = 512, tint = [128, 124, 114], seed = 31) {
  const n = new TileNoise(seed);
  const rnd = mulberry32(seed);
  const P = new PixelMaps(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const g = n.fbm(u, v, 3, 5);
      const streak = n.fbm2(u, v, 24, 2, 4);
      const drip = smoothstep(0.55, 0.8, streak) * smoothstep(0.2, 0.7, n.fbm(u, v, 2, 2));
      const spots = smoothstep(0.72, 0.8, n.fbm(u + 0.5, v, 16, 3));
      const micro = n.fbm(u, v, 64, 3);
      const k = 0.88 + g * 0.2 + (micro - 0.5) * 0.1 - drip * 0.3 - spots * 0.25;
      let r = tint[0] * k;
      let gg = tint[1] * k;
      let b = tint[2] * k;
      r = lerp(r, 88, drip * 0.4);
      gg = lerp(gg, 72, drip * 0.4);
      b = lerp(b, 50, drip * 0.4);
      P.set(i, r, gg, b);
      P.rough[i] = 0.82 + micro * 0.15;
      P.height[i] = micro * 0.6 + g * 0.4;
    }
  }
  const c = P.albedoCanvas();
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(30,26,22,0.35)';
  for (let i = 0; i < 6; i++) crack(ctx, rnd, rnd() * size, rnd() * size, 20 + rnd() * 40, 1);
  return {
    map: canvasTexture(c),
    rough: canvasTexture(P.roughCanvas(), { srgb: false }),
    normal: canvasTexture(P.normalCanvas(1.5), { srgb: false }),
  };
}

// ---------------------------------------------------------------- Techo de placas acústicas
export function genCeiling(size = 512) {
  const n = new TileNoise(41);
  const P = new PixelMaps(size, size);
  const tile = size / 2;
  const bar = size * 0.016;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const lx = x % tile;
      const ly = y % tile;
      const e = Math.min(lx, ly, tile - lx, tile - ly);
      const m = smoothstep(bar * 0.5, bar, e);
      const hole = (Math.sin(x * 0.9 + hash2(Math.floor(x / 7), Math.floor(y / 7), 2) * 6) * Math.sin(y * 0.9)) > 0.93 ? 1 : 0;
      const stain = smoothstep(0.6, 0.75, n.fbm(u, v, 3, 5));
      const ring = smoothstep(0.02, 0.0, Math.abs(n.fbm(u, v, 3, 5) - 0.62)) * 0.6;
      const micro = n.fbm(u, v, 64, 2);
      const k = 1 - hole * 0.35 - stain * 0.25 - ring * 0.3 + (micro - 0.5) * 0.08;
      let r = lerp(92, 168 * k, m);
      let g = lerp(90, 162 * k, m);
      let b = lerp(86, 146 * k, m);
      r = lerp(r, 130, stain * 0.3);
      g = lerp(g, 110, stain * 0.3);
      b = lerp(b, 70, stain * 0.3);
      P.set(i, r, g, b);
      P.rough[i] = lerp(0.5, 0.95, m);
      P.height[i] = m * 0.8 - hole * 0.3 + micro * 0.1;
    }
  }
  return P.build(2);
}

// ---------------------------------------------------------------- Pelaje / fieltro
// Pelaje de disfraz: fibras agrupadas en mechones con raíces oscuras y puntas claras,
// zonas apelmazadas y desgastadas, manchas y suciedad. Escala de grises con leve tinte:
// el color real lo ponen los vertex colors del animatrónico.
export function genFur(size = 1024, seed = 3) {
  const rnd = mulberry32(seed);
  const n = new TileNoise(seed);
  const N = size * size;
  const H = new Float32Array(N);
  const TIP = new Float32Array(N);
  const wrapI = (x) => ((Math.floor(x) % size) + size) % size;
  // Mechones: centros aleatorios con dirección propia
  const clumps = [];
  const nC = Math.round((size * size) / 190);
  for (let i = 0; i < nC; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const flow = Math.PI / 2 + (n.fbm(x / size, y / size, 3, 3) - 0.5) * 2.2;
    clumps.push({ x, y, a: flow + (rnd() - 0.5) * 0.6, r: 4 + rnd() * 5, len: 7 + rnd() * 10 });
  }
  for (const c of clumps) {
    const fibers = Math.round(c.r * c.r * 1.1);
    const dx = Math.cos(c.a);
    const dy = Math.sin(c.a);
    for (let f = 0; f < fibers; f++) {
      const ang = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * c.r;
      let x = c.x + Math.cos(ang) * rr;
      let y = c.y + Math.sin(ang) * rr;
      const len = c.len * (0.6 + rnd() * 0.6);
      // Las fibras convergen hacia el eje del mechón (efecto "punta")
      const conv = 0.35 + rnd() * 0.3;
      const tx = c.x + dx * len - x;
      const ty = c.y + dy * len - y;
      const ex = dx * len * (1 - conv) + tx * conv;
      const ey = dy * len * (1 - conv) + ty * conv;
      const L = Math.hypot(ex, ey);
      const sx = ex / L;
      const sy = ey / L;
      const w = 0.5 + rnd() * 0.5;
      for (let t = 0; t < L; t += 0.7) {
        const k = t / L;
        const px = wrapI(x + sx * t + Math.sin(k * 3 + f) * 0.6);
        const py = wrapI(y + sy * t);
        const i = py * size + px;
        H[i] += w * (0.55 + k * 0.45);
        TIP[i] += w * k * k;
      }
    }
  }
  // Pelusa fina suelta
  for (let f = 0; f < size * size * 0.06; f++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = rnd() * Math.PI * 2;
    const L = 3 + rnd() * 5;
    for (let t = 0; t < L; t++) {
      const i = wrapI(y + Math.sin(a) * t) * size + wrapI(x + Math.cos(a) * t);
      H[i] += 0.25;
      TIP[i] += 0.1;
    }
  }
  const sorted = Float32Array.from(H).sort();
  const maxH = sorted[Math.floor(N * 0.97)] || 1;
  const maxT = sorted.length ? Float32Array.from(TIP).sort()[Math.floor(N * 0.97)] || 1 : 1;
  const P = new PixelMaps(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const h = Math.min(1, H[i] / maxH);
      const tip = Math.min(1, TIP[i] / maxT);
      const matted = smoothstep(0.52, 0.72, n.fbm(u + 0.13, v + 0.61, 2, 4));
      const worn = smoothstep(0.62, 0.78, n.fbm(u + 0.7, v + 0.2, 3, 5));
      const stain = smoothstep(0.6, 0.8, n.fbm(u + 0.4, v + 0.9, 2, 5));
      const speck = smoothstep(0.78, 0.84, n.fbm(u, v, 24, 2));
      const cavity = 1 - h;
      // Albedo: raíz oscura -> punta clara; cavidades entre mechones sombreadas
      const clumpV = n.fbm(u, v, 32, 2);
      let val = 0.66 + (h - 0.5) * 0.16 + tip * 0.08 - cavity * 0.08 + (clumpV - 0.5) * 0.12;
      val = lerp(val, 0.74, matted * 0.4);
      val = lerp(val, 0.86, worn * 0.3);
      val *= 1 - stain * 0.3 - speck * 0.18;
      val = clamp(val, 0.08, 1);
      const r = val * 255 * (1 - stain * 0.05);
      const g = val * 255 * (1 - stain * 0.12);
      const b = val * 255 * (1 - stain * 0.22);
      P.set(i, r, g, b);
      P.rough[i] = clamp(0.95 - tip * 0.1 - matted * 0.25 - worn * 0.2 + stain * 0.05, 0.4, 1);
      // Relieve: se aplana en las zonas apelmazadas/desgastadas
      P.height[i] = (h * 0.8 + tip * 0.2) * (1 - matted * 0.55 - worn * 0.35) + n.fbm(u, v, 8, 3) * 0.15;
    }
  }
  return P.build(3.2);
}

// ---------------------------------------------------------------- Metal gastado
export function genMetal(size = 512, seed = 51) {
  const n = new TileNoise(seed);
  const rnd = mulberry32(seed);
  const P = new PixelMaps(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const brushed = n.fbm2(u, v, 2, 96, 3);
      const g = n.fbm(u, v, 4, 5);
      const rust = smoothstep(0.62, 0.78, n.fbm(u + 0.2, v + 0.4, 3, 5));
      const grime = smoothstep(0.45, 0.8, g);
      const k = 0.8 + brushed * 0.3 - grime * 0.35;
      let r = 168 * k;
      let gg = 170 * k;
      let b = 172 * k;
      r = lerp(r, 105, rust);
      gg = lerp(gg, 58, rust);
      b = lerp(b, 32, rust);
      P.set(i, r, gg, b);
      P.rough[i] = 0.3 + brushed * 0.15 + grime * 0.25 + rust * 0.45;
      P.height[i] = brushed * 0.3 + rust * 0.5 * n.fbm(u, v, 32, 2);
    }
  }
  const c = P.albedoCanvas();
  scratches(c.getContext('2d'), size, size, rnd, 180, 'rgba(230,230,230,0.25)', 0.06, 0.8);
  const rc = P.roughCanvas();
  scratches(rc.getContext('2d'), size, size, mulberry32(seed), 180, 'rgba(0,0,0,0.3)', 0.06, 0.8);
  return {
    map: canvasTexture(c),
    rough: canvasTexture(rc, { srgb: false }),
    normal: canvasTexture(P.normalCanvas(1.5), { srgb: false }),
  };
}

// ---------------------------------------------------------------- Madera (tablas del escenario)
export function genWood(size = 512, tint = [84, 54, 34], seed = 61) {
  const n = new TileNoise(seed);
  const P = new PixelMaps(size, size);
  const planks = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const pi = Math.floor(v * planks);
      const pv = v * planks - pi;
      const off = hash2(pi, 0, seed);
      const warp = n.fbm2(u + off, v, 2, 8, 3);
      const grain = Math.sin((pv * 3 + warp * 6 + off * 10) * Math.PI * 2) * 0.5 + 0.5;
      const fine = n.fbm2(u + off, v, 4, 128, 2);
      const gap = smoothstep(0.0, 0.025, pv) * smoothstep(1.0, 0.975, pv);
      const fu = (u + off) % 1;
      const endGap = smoothstep(0.0, 0.004, Math.abs(fu - 0.5));
      const m = gap * endGap;
      const wear = smoothstep(0.5, 0.85, n.fbm(u, v, 3, 4));
      const k = (0.75 + grain * 0.2 + fine * 0.15 + (off - 0.5) * 0.2) * (0.25 + 0.75 * m) + wear * 0.12;
      P.set(i, tint[0] * k, tint[1] * k, tint[2] * k);
      P.rough[i] = 0.55 + grain * 0.1 + (1 - m) * 0.3 - wear * 0.1;
      P.height[i] = m * 0.7 + grain * 0.1 + fine * 0.1;
    }
  }
  return P.build(2);
}

// ---------------------------------------------------------------- Telón de terciopelo con estrellas
export function genCurtain(size = 512, color = [72, 22, 96], stars = true, seed = 71) {
  const n = new TileNoise(seed);
  const rnd = mulberry32(seed);
  const P = new PixelMaps(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const velvet = n.fbm(u, v, 96, 2);
      const g = n.fbm(u, v, 3, 4);
      const k = 0.78 + velvet * 0.25 + g * 0.15;
      P.set(i, color[0] * k, color[1] * k, color[2] * k);
      P.rough[i] = 0.85 + velvet * 0.1;
      P.height[i] = velvet;
    }
  }
  const c = P.albedoCanvas();
  if (stars) {
    const ctx = c.getContext('2d');
    const grid = 4;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const cx = ((gx + 0.5 + (gy % 2) * 0.5) / grid) * size + (rnd() - 0.5) * 20;
        const cy = ((gy + 0.5) / grid) * size + (rnd() - 0.5) * 20;
        const r = size * (0.035 + rnd() * 0.02);
        const draw = (ox, oy) => {
          ctx.save();
          ctx.translate(cx + ox, cy + oy);
          ctx.rotate(rnd() * 0.6);
          ctx.beginPath();
          for (let k = 0; k < 10; k++) {
            const rr = k % 2 === 0 ? r : r * 0.42;
            const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(196,190,170,0.85)';
          ctx.fill();
          ctx.restore();
        };
        draw(0, 0);
        if (cx > size - r) draw(-size, 0);
      }
    }
  }
  return {
    map: canvasTexture(c),
    rough: canvasTexture(P.roughCanvas(), { srgb: false }),
    normal: canvasTexture(P.normalCanvas(1), { srgb: false }),
  };
}

// ---------------------------------------------------------------- Mantel
export function genCloth(size = 512, seed = 81) {
  const n = new TileNoise(seed);
  const P = new PixelMaps(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
      const stain = smoothstep(0.68, 0.76, n.fbm(u, v, 3, 5));
      const grime = n.fbm(u + 0.4, v, 4, 4);
      const k = 0.86 + weave * 0.06 - grime * 0.12;
      let r = 226 * k;
      let g = 222 * k;
      let b = 212 * k;
      r = lerp(r, 150, stain * 0.7);
      g = lerp(g, 60, stain * 0.7);
      b = lerp(b, 40, stain * 0.7);
      P.set(i, r, g, b);
      P.rough[i] = 0.9;
      P.height[i] = weave * 0.5;
    }
  }
  return P.build(1);
}

// ---------------------------------------------------------------- Hormigón
export function genConcrete(size = 512, seed = 91) {
  const n = new TileNoise(seed);
  const rnd = mulberry32(seed);
  const P = new PixelMaps(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const g = n.fbm(u, v, 4, 6);
      const spots = smoothstep(0.7, 0.75, n.fbm(u, v, 32, 2));
      const oil = smoothstep(0.62, 0.8, n.fbm(u + 0.3, v + 0.2, 2, 4));
      const k = 0.75 + g * 0.35 - spots * 0.2 - oil * 0.35;
      P.set(i, 112 * k, 108 * k, 102 * k);
      P.rough[i] = 0.85 - oil * 0.45;
      P.height[i] = g * 0.5 + n.fbm(u, v, 64, 2) * 0.5;
    }
  }
  const c = P.albedoCanvas();
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(20,20,20,0.4)';
  for (let i = 0; i < 5; i++) crack(ctx, rnd, rnd() * size, rnd() * size, 30 + rnd() * 40, 1.2);
  return {
    map: canvasTexture(c),
    rough: canvasTexture(P.roughCanvas(), { srgb: false }),
    normal: canvasTexture(P.normalCanvas(2), { srgb: false }),
  };
}

// ---------------------------------------------------------------- Puerta de seguridad (chapa ondulada)
export function genDoorMetal(w = 512, h = 1024, seed = 101) {
  const n = new TileNoise(seed);
  const P = new PixelMaps(w, h);
  const ridges = 22;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = x / w;
      const v = y / h;
      const vb = 1 - v; // 0 = parte inferior
      const s = Math.sin(v * ridges * Math.PI * 2);
      const ridge = s * 0.5 + 0.5;
      const g = n.fbm(u, v, 4, 5);
      const rustStreak = smoothstep(0.6, 0.85, n.fbm2(u, v, 18, 2, 4)) * smoothstep(0.3, 0.9, 1 - vb);
      const grime = smoothstep(0.4, 0.9, g) * 0.5 + smoothstep(0.25, 0, vb) * 0.4;
      let r, gg, b, rough;
      if (vb < 0.07) {
        const stripe = Math.floor((u * 8 + vb * 20) % 2);
        if (stripe === 0) { r = 196; gg = 158; b = 30; } else { r = 28; gg = 26; b = 24; }
        if (vb < 0.012) { r = 40; gg = 40; b = 42; }
        rough = 0.6;
      } else {
        const k = 0.72 + ridge * 0.22;
        r = 112 * k; gg = 118 * k; b = 122 * k;
        rough = 0.45 + (1 - ridge) * 0.15;
      }
      const kk = 1 - grime * 0.45;
      r = lerp(r * kk, 110, rustStreak * 0.6);
      gg = lerp(gg * kk, 62, rustStreak * 0.6);
      b = lerp(b * kk, 36, rustStreak * 0.6);
      P.set(i, r, gg, b);
      P.rough[i] = clamp(rough + grime * 0.3 + rustStreak * 0.3, 0, 1);
      P.height[i] = vb < 0.07 ? 0.5 : ridge;
    }
  }
  const t = P.build(6);
  t.map.wrapS = t.map.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------- Ojos
// La esfera del ojo se rota para que su polo apunte al frente: las filas superiores
// del canvas son la pupila, luego el iris, luego la esclerótica.
export function genEye(irisHex, hollow = false, size = 256) {
  const iris = new THREE.Color(irisHex);
  const ir = iris.r * 255;
  const ig = iris.g * 255;
  const ib = iris.b * 255;
  const n = new TileNoise(7);
  const c = makeCanvas(size, size);
  const e = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const ectx = e.getContext('2d');
  const img = ctx.createImageData(size, size);
  const eimg = ectx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const th = (y / size) * Math.PI;
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const az = x / size;
      let r, g, b;
      let er = 0, eg = 0, eb = 0;
      if (hollow) {
        const k = 8 + n.fbm(az, y / size, 8, 2) * 10;
        r = k; g = k; b = k;
        if (th < 0.06) { er = 255; eg = 250; eb = 240; }
        else if (th < 0.12) { const f = 1 - (th - 0.06) / 0.06; er = 180 * f; eg = 175 * f; eb = 170 * f; }
      } else if (th < 0.15) {
        r = 6; g = 6; b = 8;
        if (th < 0.045) { er = 255; eg = 250; eb = 240; }
      } else if (th < 0.45) {
        const t = (th - 0.15) / 0.3;
        const streak = n.fbm2(az, t, 64, 2, 3);
        const ring = smoothstep(0.75, 1.0, t);
        const inner = smoothstep(0.25, 0.0, t);
        const k = (0.55 + streak * 0.7) * (1 - ring * 0.7) * (1 - inner * 0.4);
        r = ir * k; g = ig * k; b = ib * k;
        er = ir * 0.18 * (1 - ring); eg = ig * 0.18 * (1 - ring); eb = ib * 0.18 * (1 - ring);
      } else {
        const t = (th - 0.45) / (Math.PI - 0.45);
        const vein = smoothstep(0.02, 0.0, Math.abs(n.fbm2(az, t, 24, 3, 3) - 0.5)) * smoothstep(0.1, 0.5, t);
        const k = 0.92 - t * 0.35;
        r = 232 * k; g = 226 * k; b = 212 * k;
        r = lerp(r, 170, vein * 0.6);
        g = lerp(g, 60, vein * 0.6);
        b = lerp(b, 60, vein * 0.6);
      }
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      eimg.data[o] = er; eimg.data[o + 1] = eg; eimg.data[o + 2] = eb; eimg.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ectx.putImageData(eimg, 0, 0);
  const map = canvasTexture(c, { repeat: false });
  const emissive = canvasTexture(e, { repeat: false });
  return { map, emissive };
}

// ---------------------------------------------------------------- Carteles y dibujos (canvas 2D)
function agePaper(ctx, w, h, seed, amount = 1) {
  const rnd = mulberry32(seed);
  const n = new TileNoise(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const g = n.fbm(x / w, y / h, 3, 4);
      const edge = Math.min(x, y, w - x, h - y) / Math.min(w, h);
      const vig = smoothstep(0.0, 0.12, edge);
      const k = (0.82 + g * 0.2) * (0.7 + 0.3 * vig);
      const yellow = (1 - vig) * 0.3 + g * 0.1;
      d[o] = d[o] * k * (1 - 0.05 * amount) + 30 * yellow * amount;
      d[o + 1] = d[o + 1] * k * (1 - 0.1 * amount) + 18 * yellow * amount;
      d[o + 2] = d[o + 2] * k * (1 - 0.25 * amount);
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const y = rnd() * h;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (rnd() - 0.5) * 40);
    ctx.stroke();
  }
}

function drawStar(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 === 0 ? r : r * 0.45;
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function cartoonBear(ctx, x, y, s) {
  ctx.fillStyle = '#6b4226';
  ctx.beginPath(); ctx.arc(x - s * 0.7, y - s * 0.75, s * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.7, y - s * 0.75, s * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c9a37a';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.35, s * 0.5, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.18, s * 0.16, s * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.35, y - s * 0.2, s * 0.16, 0, Math.PI * 2); ctx.arc(x + s * 0.35, y - s * 0.2, s * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a3f8f';
  ctx.beginPath(); ctx.arc(x - s * 0.33, y - s * 0.18, s * 0.08, 0, Math.PI * 2); ctx.arc(x + s * 0.37, y - s * 0.18, s * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(x - s * 0.45, y - s * 1.35, s * 0.9, s * 0.1);
  ctx.fillRect(x - s * 0.28, y - s * 1.8, s * 0.56, s * 0.48);
  ctx.strokeStyle = '#111'; ctx.lineWidth = s * 0.06;
  ctx.beginPath(); ctx.arc(x, y + s * 0.42, s * 0.25, 0.2, Math.PI - 0.2); ctx.stroke();
}

function cartoonBunny(ctx, x, y, s) {
  ctx.fillStyle = '#5b4fc9';
  ctx.save(); ctx.translate(x - s * 0.4, y - s * 1.3); ctx.rotate(-0.15);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.22, s * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x + s * 0.4, y - s * 1.3); ctx.rotate(0.25);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.22, s * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.9, s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b3aee8';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.4, s * 0.45, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e06b9a';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.22, s * 0.13, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.33, y - s * 0.2, s * 0.18, 0, Math.PI * 2); ctx.arc(x + s * 0.33, y - s * 0.2, s * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b3134a';
  ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.18, s * 0.09, 0, Math.PI * 2); ctx.arc(x + s * 0.36, y - s * 0.18, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c4161c';
  ctx.beginPath(); ctx.moveTo(x, y + s * 1.05); ctx.lineTo(x - s * 0.35, y + s * 0.9); ctx.lineTo(x - s * 0.35, y + s * 1.2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y + s * 1.05); ctx.lineTo(x + s * 0.35, y + s * 0.9); ctx.lineTo(x + s * 0.35, y + s * 1.2); ctx.closePath(); ctx.fill();
}

function cartoonChicken(ctx, x, y, s) {
  ctx.fillStyle = '#e8b923';
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.95, s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 1.0, s * 0.12, s * 0.28, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.12, y - s * 1.05, s * 0.12, s * 0.3, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f08a1c';
  ctx.beginPath(); ctx.moveTo(x - s * 0.4, y + s * 0.12); ctx.lineTo(x + s * 0.4, y + s * 0.12); ctx.lineTo(x, y + s * 0.62); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.33, y - s * 0.25, s * 0.18, 0, Math.PI * 2); ctx.arc(x + s * 0.33, y - s * 0.25, s * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6a2fb0';
  ctx.beginPath(); ctx.arc(x - s * 0.31, y - s * 0.22, s * 0.09, 0, Math.PI * 2); ctx.arc(x + s * 0.35, y - s * 0.22, s * 0.09, 0, Math.PI * 2); ctx.fill();
}

function cartoonFox(ctx, x, y, s) {
  ctx.fillStyle = '#9b3322';
  ctx.beginPath(); ctx.moveTo(x - s * 0.8, y - s * 0.4); ctx.lineTo(x - s * 0.55, y - s * 1.35); ctx.lineTo(x - s * 0.15, y - s * 0.75); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + s * 0.8, y - s * 0.4); ctx.lineTo(x + s * 0.55, y - s * 1.35); ctx.lineTo(x + s * 0.15, y - s * 0.75); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.9, s * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9b48a';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.45, s * 0.42, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s * 0.33, y - s * 0.15, s * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8a300';
  ctx.beginPath(); ctx.arc(x - s * 0.31, y - s * 0.13, s * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(x + s * 0.34, y - s * 0.15, s * 0.22, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - s * 0.9, y - s * 0.35, s * 1.8, s * 0.05);
}

export function genCelebratePoster(w = 512, h = 720) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(111);
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#0e1a4a');
  grd.addColorStop(1, '#1b0f2e');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = ['#e33', '#fc3', '#3c6', '#39f', '#f6c'][i % 5];
    ctx.fillRect(rnd() * w, rnd() * h, 5 + rnd() * 6, 3 + rnd() * 4);
  }
  for (let i = 0; i < 10; i++) drawStar(ctx, rnd() * w, rnd() * h * 0.4, 8 + rnd() * 10, '#fff6c8');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#c4161c';
  ctx.strokeText('¡A CELEBRAR!', w / 2, 110);
  ctx.fillText('¡A CELEBRAR!', w / 2, 110);
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  cartoonBunny(ctx, w * 0.2, h * 0.58, 58);
  cartoonChicken(ctx, w * 0.8, h * 0.6, 56);
  cartoonBear(ctx, w * 0.5, h * 0.5, 72);
  ctx.fillStyle = '#fc3';
  ctx.font = 'bold 34px Impact, "Arial Black", sans-serif';
  ctx.fillText("PIZZERÍA BRUNO'S", w / 2, h * 0.9);
  agePaper(ctx, w, h, 112);
  return canvasTexture(c, { repeat: false });
}

export function genKidsDrawing(seed = 1, who = 'bear', w = 256, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed * 13 + 7);
  ctx.fillStyle = '#f4f0e4';
  ctx.fillRect(0, 0, w, h);
  const colors = { bear: '#6b3a1a', bunny: '#4a3fbf', chicken: '#e0a800', fox: '#b3261a' };
  const col = colors[who] || '#333';
  const jitterLine = (pts, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 3; pass++) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const jx = x + (rnd() - 0.5) * 4;
        const jy = y + (rnd() - 0.5) * 4;
        if (i === 0) ctx.moveTo(jx, jy);
        else ctx.lineTo(jx, jy);
      });
      ctx.stroke();
    }
  };
  const circle = (x, y, r, color, width = 4) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push([x + Math.cos(a) * r * (1 + (rnd() - 0.5) * 0.1), y + Math.sin(a) * r * (1 + (rnd() - 0.5) * 0.1)]);
    }
    jitterLine(pts, color, width);
  };
  const cx = w * (0.4 + rnd() * 0.2);
  circle(cx, 90, 40, col, 5);
  if (who === 'bunny') {
    jitterLine([[cx - 20, 55], [cx - 28, 5], [cx - 10, 52]], col, 5);
    jitterLine([[cx + 12, 55], [cx + 22, 5], [cx + 28, 55]], col, 5);
  } else if (who === 'bear') {
    circle(cx - 32, 58, 12, col, 5);
    circle(cx + 32, 58, 12, col, 5);
    jitterLine([[cx - 20, 50], [cx + 20, 50], [cx + 14, 28], [cx - 14, 28], [cx - 20, 50]], '#111', 5);
  } else if (who === 'fox') {
    jitterLine([[cx - 34, 70], [cx - 30, 30], [cx - 12, 55]], col, 5);
    jitterLine([[cx + 34, 70], [cx + 30, 30], [cx + 12, 55]], col, 5);
  } else {
    jitterLine([[cx - 10, 50], [cx - 5, 30], [cx + 5, 50]], col, 4);
  }
  circle(cx - 14, 82, 6, '#111', 4);
  circle(cx + 14, 82, 6, '#111', 4);
  jitterLine([[cx - 18, 108], [cx, 116], [cx + 18, 108]], '#c4161c', 4);
  jitterLine([[cx, 130], [cx, 200]], col, 6);
  jitterLine([[cx - 40, 150], [cx, 145], [cx + 40, 150]], col, 5);
  jitterLine([[cx, 200], [cx - 30, 240]], col, 5);
  jitterLine([[cx, 200], [cx + 30, 240]], col, 5);
  // Niño pequeño al lado
  const kx = cx + (rnd() < 0.5 ? -80 : 80);
  circle(kx, 170, 14, '#333', 3);
  jitterLine([[kx, 184], [kx, 220], [kx - 10, 246]], '#333', 3);
  jitterLine([[kx, 220], [kx + 10, 246]], '#333', 3);
  ctx.fillStyle = col;
  ctx.font = 'bold 26px "Comic Sans MS", cursive';
  const names = { bear: 'BRUNO', bunny: 'BASTIÁN', chicken: 'CHIQUI', fox: 'RUFO' };
  ctx.fillText(names[who] || '', 12, 30);
  agePaper(ctx, w, h, seed * 5 + 1, 0.6);
  return canvasTexture(c, { repeat: false });
}

export function genNewspaper(w = 384, h = 512) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(211);
  ctx.fillStyle = '#e6e0cf';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('EL DIARIO LOCAL', w / 2, 34);
  ctx.fillRect(16, 44, w - 32, 2);
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText('NIÑOS DESAPARECEN', w / 2, 86);
  ctx.fillText('EN PIZZERÍA LOCAL', w / 2, 120);
  ctx.fillStyle = '#555';
  ctx.fillRect(24, 140, w * 0.45, 130);
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath(); ctx.arc(24 + w * 0.225, 205, 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  for (let col = 0; col < 2; col++) {
    for (let i = 0; i < 26; i++) {
      const x0 = col === 0 ? 24 : w * 0.53;
      const y0 = col === 0 ? 285 + i * 8 : 145 + i * 12;
      if (y0 > h - 20) continue;
      ctx.fillRect(x0, y0, (w * 0.43) * (0.6 + rnd() * 0.4), 3);
    }
  }
  agePaper(ctx, w, h, 212, 1.4);
  return canvasTexture(c, { repeat: false });
}

export function genSign(text, { w = 512, h = 128, bg = '#111', fg = '#eee', font = 'bold 64px Impact, "Arial Black", sans-serif', border = null, sub = null, age = true } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(4, h * 0.05);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
  if (sub) {
    ctx.font = font.replace(/\d+px/, Math.round(h * 0.18) + 'px');
    ctx.fillText(sub, w / 2, h * 0.75);
  }
  if (age) agePaper(ctx, w, h, text.length * 17 + 3, 0.5);
  return canvasTexture(c, { repeat: false });
}

// Letrero del escenario con bombillas: devuelve mapa de color y emisivo.
export function genStageSign(w = 1024, h = 256) {
  const c = makeCanvas(w, h);
  const e = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const ectx = e.getContext('2d');
  ctx.fillStyle = '#3a0a0c';
  ctx.fillRect(0, 0, w, h);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, w, h);
  const font = 'bold 150px Impact, "Arial Black", sans-serif';
  for (const g of [ctx, ectx]) {
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
  }
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffe9a8';
  ctx.strokeText("BRUNO'S", w / 2, h / 2 + 6);
  ctx.fillStyle = '#ffcf4a';
  ctx.fillText("BRUNO'S", w / 2, h / 2 + 6);
  ectx.fillStyle = '#ff9a2a';
  ectx.fillText("BRUNO'S", w / 2, h / 2 + 6);
  const bulbs = 34;
  for (let i = 0; i < bulbs; i++) {
    const t = i / bulbs;
    let x, y;
    const per = 2 * (w + h);
    const d = t * per;
    if (d < w) { x = d; y = 14; }
    else if (d < w + h) { x = w - 14; y = d - w; }
    else if (d < 2 * w + h) { x = w - (d - w - h); y = h - 14; }
    else { x = 14; y = h - (d - 2 * w - h); }
    const dead = hash2(i, 3, 1) < 0.18;
    ctx.fillStyle = dead ? '#554' : '#fff4c8';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    if (!dead) {
      ectx.fillStyle = '#ffe8a0';
      ectx.beginPath(); ectx.arc(x, y, 9, 0, Math.PI * 2); ectx.fill();
    }
  }
  return { map: canvasTexture(c, { repeat: false }), emissive: canvasTexture(e, { repeat: false }) };
}

export function genBib(w = 512, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(311);
  ctx.fillStyle = '#ece8dc';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = ['#e33', '#fc3', '#3a6', '#39f', '#c3c'][i % 5];
    ctx.save();
    ctx.translate(rnd() * w, rnd() * h);
    ctx.rotate(rnd() * 3);
    ctx.fillRect(-6, -3, 12, 6);
    ctx.restore();
  }
  const letters = '¡A COMER!';
  const cols = ['#e0301e', '#f5a300', '#2f8f3a', '#1f6fd1', '#9b2fc4', '#e0301e', '#f5a300', '#2f8f3a', '#1f6fd1'];
  ctx.font = 'bold 92px "Comic Sans MS", "Arial Black", sans-serif';
  ctx.textBaseline = 'middle';
  let total = 0;
  const widths = [...letters].map((ch) => {
    const m = ctx.measureText(ch).width;
    total += m;
    return m;
  });
  let x = (w - total) / 2;
  [...letters].forEach((ch, i) => {
    ctx.save();
    ctx.translate(x + widths[i] / 2, h / 2 + Math.sin(i * 1.3) * 8);
    ctx.rotate((rnd() - 0.5) * 0.3);
    ctx.fillStyle = cols[i];
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 5;
    ctx.textAlign = 'center';
    ctx.strokeText(ch, 0, 0);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    x += widths[i];
  });
  agePaper(ctx, w, h, 312, 0.8);
  return canvasTexture(c, { repeat: false });
}

export function genStripes(colors, w = 256, h = 256, n = 8, angle = 0.6) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(angle);
  const size = Math.hypot(w, h);
  const sw = size / n;
  for (let i = -n; i < n; i++) {
    ctx.fillStyle = colors[((i % colors.length) + colors.length) % colors.length];
    ctx.fillRect(i * sw, -size, sw, size * 2);
  }
  ctx.restore();
  agePaper(ctx, w, h, 99, 0.4);
  return canvasTexture(c);
}

export function genPaper(lines = true, w = 256, h = 340, seed = 5) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#eeeadf';
  ctx.fillRect(0, 0, w, h);
  if (lines) {
    ctx.strokeStyle = 'rgba(80,110,200,0.35)';
    for (let y = 40; y < h; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,30,60,0.7)';
    for (let y = 52; y < h - 20; y += 14) {
      if (rnd() < 0.2) continue;
      ctx.fillRect(18, y - 6, (w - 40) * (0.4 + rnd() * 0.6), 2);
    }
  }
  agePaper(ctx, w, h, seed, 0.8);
  return canvasTexture(c, { repeat: false });
}

export function genRules(w = 384, h = 512) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2eee2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c4161c';
  ctx.fillRect(0, 0, w, 80);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NORMAS', w / 2, 56);
  ctx.fillStyle = '#222';
  ctx.font = '22px Georgia, serif';
  ctx.textAlign = 'left';
  const rules = [
    '1. No correr.',
    '2. No gritar.',
    '3. No tocar a los',
    '    animatrónicos.',
    '4. Lavarse las manos.',
    '5. ¡Divertirse!',
    '',
    '6. No quedarse después',
    '    del cierre.',
  ];
  rules.forEach((r, i) => ctx.fillText(r, 26, 130 + i * 36));
  agePaper(ctx, w, h, 413, 1);
  return canvasTexture(c, { repeat: false });
}

// ---------------------------------------------------------------- Mechones para el pelaje por capas
// Canal R: longitud de cada pelo/mechón (0 = sin pelo). Canal G: variación de tono por mechón.
export function genFurStrands(size = 512, seed = 17) {
  const rnd = mulberry32(seed);
  const n = new TileNoise(seed);
  const L = new Float32Array(size * size);
  const T = new Float32Array(size * size);
  const wrapI = (x) => ((x % size) + size) % size;
  const tufts = Math.round((size * size) / 14);
  for (let k = 0; k < tufts; k++) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    const dens = n.fbm(cx / size, cy / size, 4, 3);
    if (rnd() > 0.35 + dens * 0.9) continue;
    const r = 1.0 + rnd() * 2.2;
    const len = 0.35 + rnd() * 0.65;
    const tone = rnd();
    const r2 = Math.ceil(r);
    for (let oy = -r2; oy <= r2; oy++) {
      for (let ox = -r2; ox <= r2; ox++) {
        const d = Math.hypot(ox + (cx % 1) - 0.5, oy + (cy % 1) - 0.5) / r;
        if (d > 1) continue;
        const i = wrapI(Math.floor(cy) + oy) * size + wrapI(Math.floor(cx) + ox);
        const val = len * Math.sqrt(1 - d * d);
        if (val > L[i]) {
          L[i] = val;
          T[i] = tone;
        }
      }
    }
  }
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < L.length; i++) {
    img.data[i * 4] = L[i] * 255;
    img.data[i * 4 + 1] = T[i] * 255;
    img.data[i * 4 + 2] = 0;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { srgb: false });
}

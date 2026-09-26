// Utilidades de aleatoriedad determinista y ruido tileable para texturas procedurales.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Ruido de valor periódico (tileable) en ambos ejes.
export class TileNoise {
  constructor(seed = 1) {
    const rnd = mulberry32(seed);
    this.v = new Float32Array(256 * 256);
    for (let i = 0; i < this.v.length; i++) this.v[i] = rnd();
  }

  sample(x, y, p) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % p) + p) % p;
    const y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p;
    const y1 = (y0 + 1) % p;
    const v = this.v;
    const a = v[(y0 & 255) * 256 + (x0 & 255)];
    const b = v[(y0 & 255) * 256 + (x1 & 255)];
    const c = v[(y1 & 255) * 256 + (x0 & 255)];
    const d = v[(y1 & 255) * 256 + (x1 & 255)];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // u, v en [0,1): fbm tileable.
  fbm(u, v, base = 4, oct = 5, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let p = base;
    for (let i = 0; i < oct; i++) {
      sum += amp * this.sample(u * p + i * 37, v * p + i * 91, p);
      norm += amp;
      amp *= gain;
      p *= 2;
    }
    return sum / norm;
  }

  // fbm anisótropo: distinta frecuencia en u y v (vetas, manchas de agua...).
  fbm2(u, v, bu, bv, oct = 4, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let pu = bu;
    let pv = bv;
    for (let i = 0; i < oct; i++) {
      sum += amp * this.sampleAniso(u * pu + i * 37, v * pv + i * 91, pu, pv);
      norm += amp;
      amp *= gain;
      pu *= 2;
      pv *= 2;
    }
    return sum / norm;
  }

  sampleAniso(x, y, pu, pv) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % pu) + pu) % pu;
    const y0 = ((yi % pv) + pv) % pv;
    const x1 = (x0 + 1) % pu;
    const y1 = (y0 + 1) % pv;
    const v = this.v;
    const a = v[(y0 & 255) * 256 + (x0 & 255)];
    const b = v[(y0 & 255) * 256 + (x1 & 255)];
    const c = v[(y1 & 255) * 256 + (x0 & 255)];
    const d = v[(y1 & 255) * 256 + (x1 & 255)];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
}

// Ruido 1D suave para parpadeos de luces y movimientos procedurales.
export function noise1(t, seed = 0) {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash2(i, seed, 7);
  const b = hash2(i + 1, seed, 7);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

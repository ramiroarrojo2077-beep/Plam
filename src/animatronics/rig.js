// Sistema de animación procedural de los animatrónicos:
// poses con servos (velocidad angular limitada), ciclo de caminar/correr, seguimiento
// de rutas, mirada (cuello + cabeza + ojos), espasmos mecánicos, párpados y mandíbula.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();

const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head', 'jaw',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR',
  'earL', 'earR', 'ear2L', 'ear2R', 'fingersL', 'fingersR',
];

// Poses: valores de rotación Euler [x, y, z] por articulación.
// Convenciones: piernas/brazos cuelgan hacia -Y; x negativo = hacia delante.
// Columna/cabeza: x positivo = inclinarse hacia delante / mirar abajo. Mandíbula: x positivo = abrir.
export const POSES = {
  stand: {
    shoulderL: [0.05, 0, 0.1], shoulderR: [0.05, 0, -0.1], elbowL: [-0.18, 0, 0], elbowR: [-0.18, 0, 0],
    fingersL: [0.5, 0, 0], fingersR: [0.5, 0, 0], kneeL: [0.05, 0, 0], kneeR: [0.05, 0, 0],
  },
  stare: {
    spine: [0.04, 0, 0], neck: [0.08, 0, 0], head: [0.12, 0, 0],
    shoulderL: [0.02, 0, 0.07], shoulderR: [0.02, 0, -0.07], elbowL: [-0.1, 0, 0], elbowR: [-0.1, 0, 0],
    fingersL: [0.25, 0, 0], fingersR: [0.25, 0, 0], kneeL: [0.04, 0, 0], kneeR: [0.04, 0, 0],
  },
  lean: {
    spine: [0.1, 0.1, 0.08], chest: [0.06, 0.1, 0], neck: [0.05, 0, 0.1], head: [0.18, 0.15, 0.3],
    shoulderL: [0.1, 0, 0.14], shoulderR: [-0.2, 0, -0.22], elbowL: [-0.1, 0, 0], elbowR: [-0.55, 0, 0],
    fingersL: [0.3, 0, 0], fingersR: [0.9, 0, 0], kneeL: [0.12, 0, 0], kneeR: [0.02, 0, 0], thighL: [-0.08, 0, 0],
  },
  doorway: {
    spine: [0.12, 0, 0], chest: [0.08, 0, 0], neck: [0.1, 0, -0.12], head: [0.12, 0, -0.32],
    shoulderL: [-1.35, 0.3, 0.55], elbowL: [-0.75, 0, 0], shoulderR: [0.1, 0, -0.12], elbowR: [-0.2, 0, 0],
    fingersL: [0.2, 0, 0], fingersR: [0.4, 0, 0], kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0],
  },
  slump: {
    spine: [0.22, 0, 0.05], chest: [0.18, 0, 0], neck: [0.3, 0, 0.1], head: [0.35, 0.1, 0.2], jaw: [0.2, 0, 0],
    shoulderL: [0.12, 0, 0.04], shoulderR: [0.12, 0, -0.04], elbowL: [-0.05, 0, 0], elbowR: [-0.05, 0, 0],
    fingersL: [0.15, 0, 0], fingersR: [0.15, 0, 0], kneeL: [0.25, 0, 0], kneeR: [0.2, 0, 0], thighL: [-0.12, 0, 0], thighR: [-0.1, 0, 0],
    ankleL: [-0.1, 0, 0], ankleR: [-0.1, 0, 0],
  },
  scare: {
    spine: [-0.12, 0, 0], chest: [-0.1, 0, 0], neck: [0.15, 0, 0], head: [-0.25, 0, 0.15], jaw: [1, 0, 0],
    shoulderL: [-1.35, 0, 0.55], shoulderR: [-1.35, 0, -0.55], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0],
    wristL: [0.3, 0, 0], wristR: [0.3, 0, 0], fingersL: [-0.2, 0, 0], fingersR: [-0.2, 0, 0],
    kneeL: [0.2, 0, 0], kneeR: [0.2, 0, 0], thighL: [-0.1, 0, 0], thighR: [-0.1, 0, 0],
  },
  stageBear: {
    shoulderR: [-0.75, 0.2, -0.18], elbowR: [-1.75, 0.2, 0], wristR: [0.1, 0, 0], fingersR: [1.3, 0, 0],
    shoulderL: [-0.25, 0, 0.32], elbowL: [-0.75, 0, 0], fingersL: [0.35, 0, 0], head: [0.04, 0, 0],
  },
  guitar: {
    shoulderL: [-0.3, 0.1, 0.32], elbowL: [-1.3, 0.5, 0], wristL: [0.3, 0, 0.3], fingersL: [1.0, 0, 0],
    shoulderR: [-0.55, -0.35, -0.25], elbowR: [-1.25, 0, 0], wristR: [-0.2, 0, 0], fingersR: [1.1, 0, 0],
    head: [0.1, 0.12, 0.08],
  },
  cupcake: {
    shoulderL: [-0.65, 0.25, 0.2], elbowL: [-1.05, 0, 0], wristL: [0.35, 0, 0], fingersL: [0.3, 0, 0],
    shoulderR: [-0.15, 0, -0.35], elbowR: [-0.7, 0, 0], fingersR: [0.3, 0, 0], head: [0.02, -0.08, -0.06],
  },
  coveHunch: {
    spine: [0.28, 0, 0], chest: [0.15, 0, 0], neck: [-0.12, 0, 0], head: [-0.2, 0, 0.1],
    shoulderR: [-0.7, 0, -0.35], elbowR: [-1.25, 0, 0], shoulderL: [0.15, 0, 0.25], elbowL: [-0.35, 0, 0],
    thighL: [-0.25, 0, 0.05], thighR: [-0.1, 0, -0.05], kneeL: [0.45, 0, 0], kneeR: [0.25, 0, 0], ankleL: [-0.2, 0, 0], ankleR: [-0.12, 0, 0],
    fingersL: [0.8, 0, 0],
  },
  peek: {
    spine: [0.18, -0.25, 0.12], chest: [0.1, -0.15, 0], neck: [0, -0.2, 0.15], head: [0.05, -0.3, 0.35],
    shoulderR: [-0.9, 0, -0.5], elbowR: [-1.1, 0, 0], shoulderL: [0.1, 0, 0.15], elbowL: [-0.2, 0, 0],
    kneeL: [0.2, 0, 0], kneeR: [0.15, 0, 0],
  },
  showcase: {
    shoulderL: [-0.1, 0, 0.18], shoulderR: [-0.35, 0, -0.2], elbowL: [-0.3, 0, 0], elbowR: [-0.9, 0, 0],
    fingersL: [0.5, 0, 0], fingersR: [0.7, 0, 0], head: [0.02, 0, 0],
  },
};

export class Animatronic {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.root = new THREE.Group();
    this.root.name = id;
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.j = {};
    this.cur = {};
    this.goal = {};
    this.out = {};
    this.poseName = 'stand';
    this.poseSpeed = 2.2;
    this.heading = 0;
    this.faceHeading = null;
    this.hipBase = 1;
    this.fingers = { L: [], R: [] };
    this.eyes = [];
    this.lids = [];
    this.lidRest = 0.2;
    this.lidExtra = 0;
    this.blinkT = 2 + Math.random() * 4;
    this.blink = 0;
    this.eyeMat = null;
    this.eyeMatHollow = null;
    this.eyeGlow = 0.35;
    this.eyeGlowTarget = 0.35;
    this.hollow = false;
    this.walk = { weight: 0, phase: 0, style: 'walk', path: null, idx: 0, speed: 1.1, cur: 0, stride: 0.6, from: new THREE.Vector3(), onArrive: null, faceAt: null };
    this.look = { target: new THREE.Vector3(), active: false, weight: 0, yaw: 0, pitch: 0, speed: 1.2, eyeYaw: 0, eyePitch: 0 };
    this.jaw = { value: 0, target: 0, chatter: 0 };
    this.twitch = { rate: 0.25, list: [], timer: 1.5 };
    this.shake = 0;
    this.sway = 1;
    this.seed = Math.random() * 100;
    this.onFootstep = null;
    this.props = {};
    this.time = 0;
    this.treadmill = null;
    for (const n of JOINTS) {
      this.cur[n] = new THREE.Vector3();
      this.goal[n] = new THREE.Vector3();
      this.out[n] = new THREE.Vector3();
    }
  }

  addJoint(name, parent, x = 0, y = 0, z = 0) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    this.j[name] = o;
    if (!this.cur[name]) {
      this.cur[name] = new THREE.Vector3();
      this.goal[name] = new THREE.Vector3();
      this.out[name] = new THREE.Vector3();
    }
    return o;
  }

  setPose(name, speed = null) {
    const p = typeof name === 'string' ? POSES[name] : name;
    for (const n in this.goal) this.goal[n].set(0, 0, 0);
    if (p) for (const [n, v] of Object.entries(p)) if (this.goal[n]) this.goal[n].set(v[0], v[1], v[2]);
    if (typeof name === 'string') this.poseName = name;
    if (speed) this.poseSpeed = speed;
  }

  snapPose() {
    for (const n in this.goal) this.cur[n].copy(this.goal[n]);
  }

  setHeading(h) {
    this.heading = h;
    this.faceHeading = null;
    this.root.rotation.y = h;
  }

  faceTowards(x, z) {
    this.faceHeading = Math.atan2(x - this.root.position.x, z - this.root.position.z);
  }

  place(pos, heading = null) {
    this.root.position.copy(pos);
    this.walk.path = null;
    this.walk.weight = 0;
    this.walk.cur = 0;
    if (heading !== null) this.setHeading(heading);
  }

  get moving() {
    return !!this.walk.path;
  }

  walkTo(points, { speed = 1.1, style = 'walk', onArrive = null, faceAt = null } = {}) {
    const W = this.walk;
    if (!points || points.length === 0) {
      if (onArrive) onArrive();
      return;
    }
    W.path = points.map((p) => p.clone());
    W.idx = 0;
    W.speed = speed;
    W.style = style;
    W.stride = style === 'run' ? 1.25 : 0.62;
    W.onArrive = onArrive;
    W.faceAt = faceAt;
    W.from.copy(this.root.position);
  }

  stop() {
    this.walk.path = null;
  }

  lookAt(target, speed = 1.2) {
    if (target) {
      this.look.target.copy(target);
      this.look.active = true;
    } else this.look.active = false;
    this.look.speed = speed;
  }

  setHollow(on) {
    this.hollow = on;
    for (const e of this.eyes) e.mesh.material = on ? this.eyeMatHollow : this.eyeMat;
  }

  // ------------------------------------------------------------ actualización
  update(dt, t) {
    this.time += dt;
    this.updatePath(dt);

    // Servos: aproximación exponencial con velocidad máxima.
    const maxStep = this.poseSpeed * dt;
    const k = Math.min(1, dt * 7);
    for (const n in this.goal) {
      const c = this.cur[n];
      const g = this.goal[n];
      c.x += clamp((g.x - c.x) * k, -maxStep, maxStep);
      c.y += clamp((g.y - c.y) * k, -maxStep, maxStep);
      c.z += clamp((g.z - c.z) * k, -maxStep, maxStep);
      this.out[n].copy(c);
    }
    const o = this.out;

    // Deriva lenta tipo servo en reposo
    const s = this.seed;
    const sw = this.sway;
    o.chest.x += Math.sin(t * 0.7 + s) * 0.012 * sw;
    o.head.z += Math.sin(t * 0.43 + s * 2) * 0.02 * sw;
    o.head.y += Math.sin(t * 0.31 + s * 3) * 0.03 * sw;

    // Caminar / correr
    const W = this.walk;
    let bob = 0;
    if (W.weight > 0.001) bob = this.applyWalk(o, W.weight, W.phase, W.style);
    if (this.j.hips) this.j.hips.position.y = this.hipBase - bob;

    this.updateTwitch(dt, o);
    this.updateLook(dt, o);

    // Temblor (sustos / fallos)
    if (this.shake > 0) {
      const sh = this.shake;
      o.head.x += (Math.sin(t * 61) + Math.sin(t * 37)) * 0.05 * sh;
      o.head.y += Math.sin(t * 53 + 1) * 0.08 * sh;
      o.head.z += Math.sin(t * 47 + 2) * 0.07 * sh;
      o.neck.y += Math.sin(t * 29) * 0.04 * sh;
      o.shoulderL.x += Math.sin(t * 33) * 0.05 * sh;
      o.shoulderR.x += Math.sin(t * 31 + 1) * 0.05 * sh;
    }

    // Mandíbula
    const J = this.jaw;
    J.value += (J.target - J.value) * Math.min(1, dt * 14);
    let jaw = J.value + o.jaw.x;
    if (J.chatter > 0) jaw += (Math.sin(t * 38) * 0.5 + 0.5) * J.chatter * 0.35;
    o.jaw.x = clamp(jaw, 0, this.jawMax || 0.7);

    // Aplicar a las articulaciones
    for (const n in this.j) {
      const v = o[n];
      if (!v) continue;
      const J = this.j[n];
      const r = J.userData.rest || (J.userData.rest = J.rotation.clone());
      J.rotation.set(r.x + v.x, r.y + v.y, r.z + v.z);
    }
    // Dedos: la curvatura se reparte por las falanges
    for (const side of ['L', 'R']) {
      const curl = o['fingers' + side].x;
      const sgn = side === 'L' ? -1 : 1;
      for (const f of this.fingers[side]) {
        for (let i = 0; i < f.length; i++) {
          const w = i === 0 ? 0.55 : i === 1 ? 0.95 : 0.7;
          f[i].rotation.z = sgn * curl * w * (f.thumb ? 0.6 : 1);
        }
      }
    }

    this.updateLids(dt);
    this.updateEyes(dt);
    this.root.rotation.y = this.heading;
  }

  updatePath(dt) {
    const W = this.walk;
    const pos = this.root.position;
    if (W.path) {
      const tgt = W.path[W.idx];
      const dx = tgt.x - pos.x;
      const dz = tgt.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.02) {
        const desired = Math.atan2(dx, dz);
        const diff = wrap(desired - this.heading);
        const turnRate = W.style === 'run' ? 7 : 2.4;
        this.heading = wrap(this.heading + clamp(diff, -turnRate * dt, turnRate * dt));
        const align = Math.cos(diff);
        const want = W.speed * (align > 0.8 ? 1 : Math.max(0.12, align) * 0.6);
        W.cur += (want - W.cur) * Math.min(1, dt * (W.style === 'run' ? 6 : 3));
      }
      const segLen = Math.max(0.001, Math.hypot(tgt.x - W.from.x, tgt.z - W.from.z));
      const step = W.cur * dt;
      if (step >= dist) {
        pos.x = tgt.x;
        pos.z = tgt.z;
        pos.y = tgt.y;
        W.from.copy(tgt);
        W.idx++;
        W.phase += (dist / W.stride) * Math.PI;
        if (W.idx >= W.path.length) {
          W.path = null;
          if (W.faceAt) this.faceHeading = Math.atan2(W.faceAt.x - pos.x, W.faceAt.z - pos.z);
          const cb = W.onArrive;
          W.onArrive = null;
          if (cb) cb();
        }
      } else if (dist > 0) {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        const prog = 1 - (dist - step) / segLen;
        pos.y = W.from.y + (tgt.y - W.from.y) * clamp(prog, 0, 1);
        const prev = W.phase;
        W.phase += (step / W.stride) * Math.PI;
        this.checkFootsteps(prev, W.phase);
      }
      W.weight = Math.min(1, W.weight + dt * 3);
    } else if (this.treadmill) {
      // Caminar en el sitio (galería)
      const run = this.treadmill === 'run';
      W.style = this.treadmill;
      W.stride = run ? 1.25 : 0.62;
      W.weight = Math.min(1, W.weight + dt * 3);
      const prev = W.phase;
      W.phase += ((dt * (run ? 6 : 1.15)) / W.stride) * Math.PI;
      this.checkFootsteps(prev, W.phase);
    } else {
      W.weight = Math.max(0, W.weight - dt * 3);
      W.cur = 0;
      if (this.faceHeading !== null) {
        const diff = wrap(this.faceHeading - this.heading);
        const step = 2.2 * dt;
        if (Math.abs(diff) <= step) {
          this.heading = this.faceHeading;
          this.faceHeading = null;
        } else this.heading = wrap(this.heading + Math.sign(diff) * step);
      }
    }
  }

  checkFootsteps(prev, next) {
    if (!this.onFootstep) return;
    for (const [off, side] of [[Math.PI / 2, 'L'], [(3 * Math.PI) / 2, 'R']]) {
      const a = Math.floor((prev - off) / TAU);
      const b = Math.floor((next - off) / TAU);
      if (a !== b) {
        const foot = this.j['ankle' + side];
        foot.getWorldPosition(tmpV);
        tmpV.y = this.root.position.y;
        this.onFootstep(this, side, tmpV.clone(), this.walk.style);
      }
    }
  }

  applyWalk(o, w, phase, style) {
    const run = style === 'run';
    const A = run
      ? { hip: 0.78, knee: 1.35, arm: 0.95, bob: 0.07, lean: 0.38, elbow: -1.35 }
      : { hip: 0.34, knee: 0.72, arm: 0.26, bob: 0.03, lean: 0.05, elbow: -0.22 };
    for (const side of ['L', 'R']) {
      const ph = phase + (side === 'R' ? Math.PI : 0);
      const sn = Math.sin(ph);
      const cs = Math.cos(ph);
      const hip = -A.hip * sn;
      const knee = A.knee * Math.pow(Math.max(0, cs), 1.5) + 0.05;
      o['thigh' + side].x += hip * w;
      o['knee' + side].x += knee * w;
      o['ankle' + side].x += -(hip + knee) * 0.85 * w;
      o['shoulder' + side].x += A.arm * sn * w;
      o['elbow' + side].x += A.elbow * (run ? 1 : 0.6 + 0.4 * Math.max(0, -sn)) * w;
    }
    o.hips.z += Math.sin(phase) * 0.04 * w;
    o.hips.y += Math.sin(phase) * (run ? 0.12 : 0.06) * w;
    o.chest.y -= Math.sin(phase) * (run ? 0.2 : 0.1) * w;
    o.spine.x += A.lean * w;
    o.neck.x -= A.lean * 0.5 * w;
    o.head.x += Math.sin(phase * 2) * 0.025 * w;
    return A.bob * Math.abs(Math.sin(phase)) * w;
  }

  updateTwitch(dt, o) {
    const T = this.twitch;
    if (T.rate > 0) {
      T.timer -= dt;
      if (T.timer <= 0) {
        T.timer = (0.4 + Math.random() * 2.2) / T.rate;
        const pool = ['head', 'head', 'head', 'neck', 'jaw', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'earL', 'earR', 'fingersL', 'fingersR'];
        const n = pool[Math.floor(Math.random() * pool.length)];
        if (this.j[n] || n.startsWith('fingers')) {
          const axis = n === 'jaw' || n.startsWith('fingers') ? 'x' : ['x', 'y', 'z'][Math.floor(Math.random() * 3)];
          let amp = (Math.random() - 0.5) * (n === 'head' ? 0.5 : 0.35);
          if (n === 'jaw') amp = Math.random() * 0.35;
          T.list.push({ n, axis, amp, t: 0, hold: 0.1 + Math.random() * 0.8 });
        }
      }
    }
    for (let i = T.list.length - 1; i >= 0; i--) {
      const tw = T.list[i];
      tw.t += dt;
      const a = 0.05;
      let env;
      if (tw.t < a) env = tw.t / a;
      else if (tw.t < a + tw.hold) env = 1;
      else env = Math.max(0, 1 - (tw.t - a - tw.hold) / 0.3);
      if (env <= 0 && tw.t > a) {
        T.list.splice(i, 1);
        continue;
      }
      o[tw.n][tw.axis] += tw.amp * env;
    }
  }

  updateLook(dt, o) {
    const L = this.look;
    let dYaw = 0;
    let dPitch = 0;
    if (L.active && this.j.head && this.j.chest) {
      this.j.head.getWorldPosition(tmpV);
      tmpV2.subVectors(L.target, tmpV);
      this.j.chest.getWorldQuaternion(tmpQ);
      tmpV2.applyQuaternion(tmpQ.invert());
      dYaw = clamp(Math.atan2(tmpV2.x, tmpV2.z), -1.25, 1.25);
      dPitch = clamp(Math.atan2(-tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z)), -0.6, 0.7);
    }
    L.weight += ((L.active ? 1 : 0) - L.weight) * Math.min(1, dt * 2);
    const step = L.speed * dt;
    L.yaw += clamp(dYaw - L.yaw, -step, step);
    L.pitch += clamp(dPitch - L.pitch, -step, step);
    const w = L.weight;
    o.head.x *= 1 - w * 0.6;
    o.head.y *= 1 - w * 0.8;
    o.neck.y += L.yaw * 0.35 * w;
    o.head.y += L.yaw * 0.65 * w;
    o.neck.x += L.pitch * 0.3 * w;
    o.head.x += L.pitch * 0.7 * w;
  }

  updateLids(dt) {
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = 2.5 + Math.random() * 6;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const closed = clamp(this.lidRest + this.lidExtra + (this.blink > 0 ? 1 - Math.abs(this.blink * 2 - 1) : 0), 0, 1);
    for (const l of this.lids) l.rotation.x = -0.85 + closed * 2.35;
  }

  updateEyes(dt) {
    this.eyeGlow += (this.eyeGlowTarget - this.eyeGlow) * Math.min(1, dt * 5);
    if (this.eyeMat) this.eyeMat.emissiveIntensity = this.eyeGlow;
    if (this.eyeMatHollow) this.eyeMatHollow.emissiveIntensity = this.eyeGlow * 3 + 0.4;
    const L = this.look;
    for (const e of this.eyes) {
      let yaw = 0;
      let pitch = 0;
      if (L.active) {
        e.pivot.getWorldPosition(tmpV);
        tmpV2.subVectors(L.target, tmpV);
        e.pivot.parent.getWorldQuaternion(tmpQ);
        tmpV2.applyQuaternion(tmpQ.invert());
        yaw = clamp(Math.atan2(tmpV2.x, tmpV2.z), -0.4, 0.4);
        pitch = clamp(Math.atan2(-tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z)), -0.3, 0.3);
      }
      e.yaw += (yaw - e.yaw) * Math.min(1, dt * 10);
      e.pitch += (pitch - e.pitch) * Math.min(1, dt * 10);
      e.mesh.rotation.set(e.pitch, e.yaw, 0);
    }
  }
}

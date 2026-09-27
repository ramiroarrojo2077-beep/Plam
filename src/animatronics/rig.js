// Sistema de animación procedural de los animatrónicos:
// servos con muelle subamortiguado (inercia y pequeño rebote mecánico) con rigidez por
// articulación y acción superpuesta (el tronco arranca antes que brazos, manos y cabeza),
// pies clavados al suelo con cinemática inversa de dos huesos (rodado talón-punta, arco de
// balanceo, pasos al girar y pasos de reajuste al detenerse), pelvis que carga el peso sobre
// el pie de apoyo, arranque y frenado con aceleración real, inclinación en las curvas,
// cabeza que se adelanta al giro, movimiento secundario (cabeza, orejas y mandíbula reaccionan
// a la aceleración y a cada pisada), mirada con muelle y ojos que se adelantan a la cabeza,
// sacadas oculares, espasmos, actuaciones en el escenario, acecho en la puerta, párpados y mandíbula.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpE = new THREE.Euler();
const tmpG = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qFK = new THREE.Quaternion();
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Y = new THREE.Vector3(0, 1, 0);

const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const jointBase = (n) => n.replace(/[LR]$/, '');

// Rigidez relativa de cada servo (las articulaciones pesadas responden más despacio) y
// retardo con el que cada una empieza a moverse al cambiar de pose (acción superpuesta).
const STIFF = { hips: 0.75, spine: 0.8, chest: 0.85, neck: 1, head: 1.1, jaw: 1.4, shoulder: 0.9, elbow: 1, wrist: 1.2, fingers: 1.3, thigh: 0.85, knee: 0.9, ankle: 1, ear: 1.2, ear2: 1.15 };
const DELAY = { hips: 0, spine: 0, chest: 0.04, neck: 0.08, head: 0.12, jaw: 0.1, shoulder: 0.05, elbow: 0.1, wrist: 0.15, fingers: 0.19, thigh: 0, knee: 0.02, ankle: 0.04, ear: 0.16, ear2: 0.2 };

// Longitud de zancada (m) según la velocidad: al ir más rápido se alarga el paso.
const strideFor = (speed, style) => (style === 'run' ? clamp(0.55 + speed * 0.13, 1.0, 1.5) : clamp(0.3 + speed * 0.19, 0.44, 0.72));

// Pie: distancias desde el tobillo (unidades del cuerpo) al pivote de la punta y del talón.
const TOE = 0.22;
const HEEL = 0.08;

// Muelle amortiguado 1D para movimiento secundario.
class Spring {
  constructor(k = 120, c = 9) {
    this.k = k;
    this.c = c;
    this.x = 0;
    this.v = 0;
  }
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    this.x = clamp(this.x, -1.2, 1.2);
    return this.x;
  }
}

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
    this.perform = null;
    this.vel = {};
    this.sec = { headP: new Spring(140, 10), headR: new Spring(140, 10), ear: new Spring(70, 4.5), ear2: new Spring(50, 3), jaw: new Spring(160, 7), body: new Spring(200, 14) };
    this.lastChest = null;
    this.lastVel = new THREE.Vector3();
    this.acc = new THREE.Vector3();
    this.sacc = { t: 1, yaw: 0, pitch: 0 };
    this.sec.gaze = new Spring(18, 8);
    this.sec.gazeP = new Spring(18, 8);
    this.stiff = {};
    this.pend = {};
    // Pies con IK: posición clavada en el suelo, balanceo y reajustes.
    this.ik = true;
    this.ikW = 1;
    this.leg = null;
    this.feetReset = true;
    this.tread = new THREE.Vector3();
    this.lastG = null;
    this.feet = ['L', 'R'].map((side) => ({
      side,
      sx: side === 'L' ? 1 : -1,
      mode: 'idle',
      swing: false,
      s: 0,
      dur: 0.3,
      su: 0,
      plant: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      from: new THREE.Vector3(),
      fromYaw: 0,
      fromPitch: 0,
      target: new THREE.Vector3(),
      ankle: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      corr: new THREE.Vector3(),
      neutral: new THREE.Vector3(),
    }));
    this.stepCool = 0;
    this.pelvis = { x: 0, drop: 0, shiftT: 3 + Math.random() * 4, shiftGoal: 0, shift: 0 };
    this.turnVel = 0;
    this.turnRate = 0;
    this.leanFwd = 0;
    this.lead = 0;
    this.prevCur = 0;
    this.prevHeading = null;
    for (const n of JOINTS) {
      this.cur[n] = new THREE.Vector3();
      this.goal[n] = new THREE.Vector3();
      this.out[n] = new THREE.Vector3();
      this.vel[n] = new THREE.Vector3();
      this.stiff[n] = STIFF[jointBase(n)] || 1;
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
      this.vel[name] = new THREE.Vector3();
      this.stiff[name] = STIFF[jointBase(name)] || 1;
    }
    return o;
  }

  // Cambio de pose: el tronco arranca primero y los extremos (manos, dedos, cabeza, orejas)
  // se suman con un pequeño retardo, como en un movimiento real. Los cambios muy rápidos
  // (sustos) arrancan todos a la vez.
  setPose(name, speed = null) {
    const p = typeof name === 'string' ? POSES[name] : name;
    if (typeof name === 'string') this.poseName = name;
    if (speed) this.poseSpeed = speed;
    const lag = this.poseSpeed < 6 ? 2.2 / this.poseSpeed : 0;
    for (const n in this.goal) {
      const v = p && p[n];
      const x = v ? v[0] : 0;
      const y = v ? v[1] : 0;
      const z = v ? v[2] : 0;
      const d = (DELAY[jointBase(n)] || 0) * lag * (0.75 + Math.random() * 0.5);
      if (d < 0.005) {
        this.goal[n].set(x, y, z);
        delete this.pend[n];
      } else this.pend[n] = { t: d, x, y, z };
    }
  }

  flushPending() {
    for (const n in this.pend) {
      const q = this.pend[n];
      this.goal[n].set(q.x, q.y, q.z);
    }
    this.pend = {};
  }

  snapPose() {
    this.flushPending();
    for (const n in this.goal) {
      this.cur[n].copy(this.goal[n]);
      this.vel[n].set(0, 0, 0);
    }
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
    this.lastChest = null;
    this.walk.path = null;
    this.walk.weight = 0;
    this.walk.cur = 0;
    this.ik = true;
    this.feetReset = true;
    this.turnVel = 0;
    this.prevHeading = null;
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
    W.stride = strideFor(speed, style);
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
    this.updatePending(dt);
    this.updatePath(dt);

    // Servos: muelle subamortiguado con velocidad angular máxima (arranque y frenada con
    // inercia y un pequeño rebote al llegar, como un motor real). Las articulaciones
    // pesadas (cadera, columna) son más lentas que las muñecas o la mandíbula.
    const wN0 = 2.6 * this.poseSpeed;
    const zeta = 0.68;
    const vmax0 = this.poseSpeed * 1.9;
    const steps = Math.max(1, Math.ceil((wN0 * 1.4 * dt) / 0.2));
    const h = dt / steps;
    for (const n in this.goal) {
      const c = this.cur[n];
      const g = this.goal[n];
      const v = this.vel[n];
      const k = this.stiff[n] || 1;
      const wN = wN0 * k;
      const vmax = vmax0 * k;
      for (let i = 0; i < steps; i++) {
        v.x = clamp(v.x + (wN * wN * (g.x - c.x) - 2 * zeta * wN * v.x) * h, -vmax, vmax);
        v.y = clamp(v.y + (wN * wN * (g.y - c.y) - 2 * zeta * wN * v.y) * h, -vmax, vmax);
        v.z = clamp(v.z + (wN * wN * (g.z - c.z) - 2 * zeta * wN * v.z) * h, -vmax, vmax);
        c.x += v.x * h;
        c.y += v.y * h;
        c.z += v.z * h;
      }
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
    this.updateSteering(dt, o);
    this.updateStance(dt, o);

    this.updateTwitch(dt, o);
    this.updateLook(dt, o);
    this.updateSecondary(dt, o);
    this.updateActing(o);

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
    let jaw = J.value + o.jaw.x + (this.jawRest || 0);
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
    if (this.j.hips) {
      this.j.hips.position.set(0, this.hipBase - bob, 0);
      this.updateFeet(dt, o);
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

  updatePending(dt) {
    for (const n in this.pend) {
      const q = this.pend[n];
      q.t -= dt;
      if (q.t <= 0) {
        this.goal[n].set(q.x, q.y, q.z);
        delete this.pend[n];
      }
    }
  }

  updatePath(dt) {
    const W = this.walk;
    const pos = this.root.position;
    W.lookAhead = 0;
    if (W.path) {
      const run = W.style === 'run';
      const tgt = W.path[W.idx];
      const dx = tgt.x - pos.x;
      const dz = tgt.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const last = W.idx === W.path.length - 1;
      if (dist > 0.02) {
        const dir = Math.atan2(dx, dz);
        let desired = dir;
        // Anticipar la esquina: el cuerpo empieza a girar hacia el tramo siguiente antes de
        // llegar y la cabeza mira hacia allí todavía antes.
        const nxt = W.path[W.idx + 1];
        if (nxt) {
          const nd = Math.atan2(nxt.x - tgt.x, nxt.z - tgt.z);
          const r = run ? 1.1 : 0.5;
          if (dist < r) desired = dir + wrap(nd - dir) * (1 - dist / r) * 0.45;
          const r2 = run ? 2.6 : 1.7;
          if (dist < r2) W.lookAhead = clamp(wrap(nd - this.heading), -0.9, 0.9) * (1 - dist / r2);
        }
        const diff = wrap(desired - this.heading);
        const turnRate = run ? 7 : 2.6;
        this.heading = wrap(this.heading + clamp(diff, -turnRate * dt, turnRate * dt));
        const align = Math.cos(wrap(dir - this.heading));
        let want = W.speed * (align > 0.8 ? 1 : Math.max(0.12, align) * 0.6);
        // Frenada progresiva antes del destino final (los pasos se acortan)
        if (last) want = Math.min(want, Math.max(0.2, Math.sqrt(2 * (run ? 14 : 1.7) * dist)));
        const accel = run ? 9 : 2.3;
        W.cur += clamp(want - W.cur, -accel * 1.8 * dt, accel * dt);
      }
      const segLen = Math.max(0.001, Math.hypot(tgt.x - W.from.x, tgt.z - W.from.z));
      const step = W.cur * dt;
      let moved = step;
      let arrived = false;
      if (step >= dist) {
        moved = dist;
        pos.x = tgt.x;
        pos.z = tgt.z;
        pos.y = tgt.y;
        W.from.copy(tgt);
        W.idx++;
        arrived = W.idx >= W.path.length;
      } else if (dist > 0) {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        const prog = 1 - (dist - step) / segLen;
        pos.y = W.from.y + (tgt.y - W.from.y) * clamp(prog, 0, 1);
      }
      // La cadencia nunca baja de un mínimo: a poca velocidad da pasos cortos en vez de
      // quedarse con un pie en el aire.
      const prev = W.phase;
      const vmin = run ? 1.6 : 0.45;
      W.phase += (Math.max(moved, vmin * dt) / W.stride) * Math.PI;
      this.checkFootsteps(prev, W.phase);
      W.weight = Math.min(1, W.weight + dt * 3);
      if (arrived) {
        W.path = null;
        if (W.faceAt) this.faceHeading = Math.atan2(W.faceAt.x - pos.x, W.faceAt.z - pos.z);
        const cb = W.onArrive;
        W.onArrive = null;
        if (cb) cb();
      }
    } else if (this.treadmill) {
      // Caminar en el sitio (galería): el suelo virtual se desplaza bajo los pies
      const run = this.treadmill === 'run';
      W.style = this.treadmill;
      const v = run ? 5.2 : 1.1;
      W.stride = strideFor(v, W.style);
      W.cur += clamp(v - W.cur, -12 * dt, (run ? 9 : 2.3) * dt);
      W.weight = Math.min(1, W.weight + dt * 3);
      this.tread.x += Math.sin(this.heading) * W.cur * dt;
      this.tread.z += Math.cos(this.heading) * W.cur * dt;
      const prev = W.phase;
      W.phase += ((Math.max(W.cur, run ? 1.6 : 0.45) * dt) / W.stride) * Math.PI;
      this.checkFootsteps(prev, W.phase);
    } else {
      W.weight = Math.max(0, W.weight - dt * 3);
      W.cur = 0;
      // Giro en el sitio con aceleración y frenada; los pies dan pasitos (ver updateFeet)
      if (this.faceHeading !== null) {
        const diff = wrap(this.faceHeading - this.heading);
        const want = Math.sign(diff) * Math.min(2.2, Math.sqrt(2 * 5 * Math.abs(diff)));
        this.turnVel += clamp(want - this.turnVel, -8 * dt, 8 * dt);
        const step = this.turnVel * dt;
        if (Math.abs(diff) < 0.004 || (Math.abs(step) >= Math.abs(diff) && Math.sign(step) === Math.sign(diff))) {
          this.heading = this.faceHeading;
          this.faceHeading = null;
          this.turnVel = 0;
        } else this.heading = wrap(this.heading + step);
      } else this.turnVel = 0;
    }
  }

  checkFootsteps(prev, next) {
    for (const [off, side] of [[Math.PI / 2, 'L'], [(3 * Math.PI) / 2, 'R']]) {
      const a = Math.floor((prev - off) / TAU);
      const b = Math.floor((next - off) / TAU);
      if (a !== b) {
        const foot = this.j['ankle' + side];
        foot.getWorldPosition(tmpV);
        tmpV.y = this.root.position.y;
        this.footImpact(this.walk.style);
        if (this.onFootstep) this.onFootstep(this, side, tmpV.clone(), this.walk.style);
      }
    }
  }

  // Parte "de animación" del paso: brazos, tronco y cabeza. Las piernas las resuelve la IK
  // (updateFeet); el ciclo de piernas por ángulos solo se usa cuando la IK está apagada.
  applyWalk(o, w, phase, style) {
    const run = style === 'run';
    const W = this.walk;
    const A = run
      ? { hip: 0.8, knee: 1.4, arm: 1.0, bob: 0.075, lean: 0.4, elbow: -1.4 }
      : { hip: 0.34, knee: 0.74, arm: 0.28, bob: 0.03, lean: 0.06, elbow: -0.24 };
    // La amplitud de brazos y tronco crece con la velocidad real
    const spd = clamp(W.cur / (run ? 5 : 1.1), 0, 1.25);
    const wa = w * (0.3 + 0.7 * spd);
    const wl = w * (1 - this.ikW);
    let impact = 0;
    for (const side of ['L', 'R']) {
      const ph = phase + (side === 'R' ? Math.PI : 0);
      const sn = Math.sin(ph);
      const cs = Math.cos(ph);
      if (wl > 0.001) {
        const hip = -A.hip * sn;
        // Rodilla: flexión en el balanceo y leve amortiguación al apoyar el talón
        const knee = A.knee * Math.pow(Math.max(0, cs), 1.5) + 0.05 + Math.pow(Math.max(0, sn), 10) * 0.12;
        o['thigh' + side].x += hip * wl;
        o['knee' + side].x += knee * wl;
        // Pie: talón al aterrizar, despegue con la punta
        o['ankle' + side].x += (-(hip + knee) * 0.85 - Math.pow(Math.max(0, sn), 6) * 0.18 + Math.pow(Math.max(0, -cs), 4) * 0.12 * (run ? 1.6 : 1)) * wl;
      }
      // Brazos en oposición a las piernas, con retraso (inercia) y codo que se dobla más
      // al ir hacia delante que al ir hacia atrás
      const sa = Math.sin(ph - 0.35);
      o['shoulder' + side].x += A.arm * sa * wa;
      o['shoulder' + side].z += (side === 'L' ? 1 : -1) * (run ? 0.12 : 0.04 + Math.max(0, -sa) * 0.03) * w;
      o['elbow' + side].x += A.elbow * (run ? 1 : 0.55 + 0.45 * Math.max(0, -Math.sin(ph - 0.7))) * wa;
      o['wrist' + side].x += Math.sin(ph - 0.8) * (run ? 0.12 : 0.06) * wa;
      o['fingers' + side].x += (run ? -0.25 : 0.1) * w;
      impact = Math.max(impact, Math.pow(Math.max(0, sn), 12));
    }
    o.hips.z += Math.sin(phase) * 0.045 * wa;
    o.hips.y += Math.sin(phase) * (run ? 0.12 : 0.07) * wa;
    // El pecho gira al revés que la pelvis y la cabeza compensa para mirar al frente
    o.chest.y -= Math.sin(phase) * (run ? 0.2 : 0.11) * wa;
    o.neck.y += Math.sin(phase) * (run ? 0.1 : 0.05) * wa;
    o.chest.z -= Math.sin(phase) * 0.03 * wa;
    o.spine.x += (A.lean * (0.4 + 0.6 * spd) + impact * 0.035) * w;
    o.neck.x -= A.lean * 0.45 * w;
    o.head.x += (Math.sin(phase * 2) * 0.022 - impact * 0.03) * wa;
    if (run) {
      o.neck.x += 0.12 * w;
      o.jaw.x += 0.22 * w;
    }
    return (A.bob * Math.abs(Math.sin(phase)) + impact * (run ? 0.03 : 0.018)) * wl;
  }

  // Inclinación al acelerar/frenar, peralte en las curvas y cabeza que se adelanta al giro.
  updateSteering(dt, o) {
    const W = this.walk;
    if (dt <= 0) return;
    const acc = (W.cur - this.prevCur) / dt;
    this.prevCur = W.cur;
    this.leanFwd += (clamp(acc, -10, 10) - this.leanFwd) * Math.min(1, dt * 5);
    const rate = this.prevHeading === null ? 0 : wrap(this.heading - this.prevHeading) / dt;
    this.prevHeading = this.heading;
    this.turnRate += (clamp(rate, -12, 12) - this.turnRate) * Math.min(1, dt * 6);
    const run = W.style === 'run';
    const ww = W.weight;
    o.spine.x += clamp(this.leanFwd * (run ? 0.018 : 0.035), -0.1, 0.14) * ww;
    const bank = clamp(Math.atan((this.turnRate * W.cur) / 9.8) * 0.6, -0.3, 0.3) * ww;
    o.spine.z -= bank * 0.6;
    o.chest.z -= bank * 0.4;
    let lead = W.lookAhead * ww;
    if (this.faceHeading !== null && !W.path) lead += clamp(wrap(this.faceHeading - this.heading), -0.8, 0.8);
    this.lead += (lead - this.lead) * Math.min(1, dt * 6);
    o.chest.y += this.lead * 0.08;
    o.neck.y += this.lead * 0.3;
    o.head.y += this.lead * 0.42;
  }

  // Reparto del peso en reposo: de vez en cuando carga el peso sobre una pierna (la pelvis
  // se desplaza y cae del lado libre, el pecho compensa).
  updateStance(dt, o) {
    const P = this.pelvis;
    P.shiftT -= dt;
    if (P.shiftT <= 0) {
      P.shiftT = 4 + Math.random() * 7;
      P.shiftGoal = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.018 + Math.random() * 0.014);
    }
    P.shift += (P.shiftGoal - P.shift) * Math.min(1, dt * 1.3);
    const k = P.shift * this.sway * (1 - this.walk.weight) * this.ikW;
    P.idle = k;
    o.hips.z += k * 1.6;
    o.spine.z -= k * 0.9;
    o.chest.z -= k * 0.6;
  }

  // ------------------------------------------------------------ pies e IK de piernas
  legInfo() {
    const j = this.j;
    const l1 = j.kneeL.position.length();
    const l2 = j.ankleL.position.length();
    return { l1, l2, ankleH: this.hipBase + j.thighL.position.y - l1 - l2 };
  }

  // Posición del tobillo según la pose (cinemática directa), en espacio del cuerpo y con la
  // pelvis a su altura de reposo.
  fkAnkle(side, o, out) {
    const th = this.j['thigh' + side];
    const kn = this.j['knee' + side];
    const an = this.j['ankle' + side];
    const rk = kn.userData.rest;
    const rt = th.userData.rest;
    const k = o['knee' + side];
    const t = o['thigh' + side];
    tmpE.set((rk ? rk.x : 0) + k.x, (rk ? rk.y : 0) + k.y, (rk ? rk.z : 0) + k.z);
    out.copy(an.position).applyEuler(tmpE).add(kn.position);
    tmpE.set((rt ? rt.x : 0) + t.x, (rt ? rt.y : 0) + t.y, (rt ? rt.z : 0) + t.z);
    out.applyEuler(tmpE).add(th.position);
    out.y += this.hipBase;
    return out;
  }

  // Tobillo respecto al punto de apoyo cuando el pie pivota sobre la punta (p > 0, talón
  // levantado) o sobre el talón (p < 0, punta levantada). Devuelve un desplazamiento en mundo.
  pivot(p, yaw, out) {
    const s = this.body.scale.x;
    const aH = this.leg.ankleH;
    let dy;
    let dz;
    if (p >= 0) {
      dy = aH * Math.cos(p) + TOE * Math.sin(p);
      dz = aH * Math.sin(p) + TOE * (1 - Math.cos(p));
    } else {
      dy = aH * Math.cos(p) - HEEL * Math.sin(p);
      dz = aH * Math.sin(p) - HEEL * (1 - Math.cos(p));
    }
    return out.set(Math.sin(yaw) * dz * s, dy * s, Math.cos(yaw) * dz * s);
  }

  // Espacio del cuerpo -> mundo (suelo virtual incluido) y viceversa.
  bodyToWorld(x, y, z, G, h, out) {
    const s = this.body.scale.x;
    const c = Math.cos(h);
    const sn = Math.sin(h);
    return out.set(G.x + s * (x * c + z * sn), G.y + s * y, G.z + s * (-x * sn + z * c));
  }

  worldToBody(p, G, h, out) {
    const s = this.body.scale.x;
    const c = Math.cos(h);
    const sn = Math.sin(h);
    const x = p.x - G.x;
    const z = p.z - G.z;
    return out.set((x * c - z * sn) / s, (p.y - G.y) / s, (x * sn + z * c) / s);
  }

  updateFeet(dt, o) {
    const j = this.j;
    if (!j.thighL || !j.ankleL) return;
    this.ikW = this.ik ? Math.min(1, this.ikW + dt * 4) : 0;
    if (this.ikW <= 0) {
      this.feetReset = true;
      return;
    }
    const L = this.leg || (this.leg = this.legInfo());
    const W = this.walk;
    const P = this.pelvis;
    const s = this.body.scale.x;
    const h = this.heading;
    const G = tmpG.copy(this.root.position).add(this.tread);
    if (this.lastG && this.lastG.distanceToSquared(G) > 1) this.feetReset = true;
    (this.lastG || (this.lastG = new THREE.Vector3())).copy(G);

    // Apoyo neutro de cada pie según la pose y cuánto hay que bajar la pelvis para que
    // una pose con rodillas dobladas mantenga los pies en el suelo.
    let crouch = 0;
    for (const F of this.feet) {
      this.fkAnkle(F.side, o, F.neutral);
      crouch = Math.max(crouch, F.neutral.y - L.ankleH);
    }
    const gait = !!(W.path || this.treadmill);
    const run = W.style === 'run';
    const toeOut = 0.05;

    if (this.feetReset) {
      this.feetReset = false;
      for (const F of this.feet) {
        this.bodyToWorld(F.neutral.x, 0, F.neutral.z, G, h, F.plant);
        F.yaw = h + F.sx * toeOut;
        F.pitch = 0;
        F.swing = false;
        F.mode = gait ? 'gait' : 'idle';
        F.corr.set(0, 0, 0);
        this.pivot(0, F.yaw, tmpA);
        F.ankle.copy(F.plant).add(tmpA);
        F.prev.copy(F.ankle);
      }
      P.drop = 0;
      P.x = 0;
    }

    let shift = 0;
    let mid = 0;
    let idleBob = 0;
    if (gait) {
      const duty = run ? 0.3 : 0.6;
      const hs = run ? -0.08 : -0.26;
      const toeOff = run ? 0.75 : 0.5;
      const ratio = this.treadmill ? 1 : W.cur / Math.max(W.cur, run ? 1.6 : 0.45, 1e-3);
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      for (const F of this.feet) {
        this.switchMode(F, 'gait');
        const ph = W.phase + (F.side === 'R' ? Math.PI : 0);
        let u = (ph - Math.PI / 2) / TAU;
        u -= Math.floor(u);
        if (u < duty) {
          // Apoyo: el pie queda clavado; rueda del talón a la planta y despega con la punta
          const su = u / duty;
          if (F.swing) {
            F.swing = false;
            F.plant.copy(F.target);
            F.yaw = h + F.sx * toeOut;
            F.fixCorr = true;
          }
          F.su = su;
          F.pitch = su < 0.14 ? hs * (1 - smooth(su / 0.14)) : su < 0.55 ? 0 : toeOff * Math.pow(smooth((su - 0.55) / 0.45), 1.2);
          this.pivot(F.pitch, F.yaw, tmpA);
          F.ankle.copy(F.plant).add(tmpA);
          const load = Math.sin(Math.PI * su);
          shift += F.sx * load * (run ? 0.012 : 0.028);
          mid = Math.max(mid, load);
        } else {
          // Balanceo: arco hasta el apoyo previsto (donde estará el cuerpo al aterrizar)
          const sw = (u - duty) / (1 - duty);
          if (!F.swing) {
            F.swing = true;
            F.from.copy(F.ankle);
            F.fromYaw = F.yaw;
          }
          F.s = sw;
          const ahead = ratio * W.stride * (2 * (1 - sw) * (1 - duty) + duty);
          const nx = F.neutral.x * (run ? 0.7 : 0.92);
          this.bodyToWorld(nx, 0, F.neutral.z, G, h, F.target);
          F.target.x += fx * ahead;
          F.target.z += fz * ahead;
          F.target.y = this.root.position.y;
          const e = smooth(sw);
          F.pitch = sw < 0.4 ? lerp(toeOff, -0.05, smooth(sw / 0.4)) : lerp(-0.05, hs, smooth((sw - 0.4) / 0.6));
          const yawTo = h + F.sx * toeOut;
          F.yaw = F.fromYaw + wrap(yawTo - F.fromYaw) * e;
          this.pivot(hs, yawTo, tmpA);
          F.ankle.lerpVectors(F.from, tmpA.add(F.target), e);
          F.ankle.y += (run ? 0.22 : 0.1) * s * Math.sin(Math.PI * Math.pow(sw, run ? 0.6 : 0.8));
        }
      }
    } else {
      // Reposo: los pies se quedan donde están; si la pose o el giro los deja lejos de su
      // sitio, da un paso corto para recolocarlos (uno cada vez).
      let hN = h;
      if (this.faceHeading !== null) hN = h + clamp(wrap(this.faceHeading - h), -0.5, 0.5);
      this.stepCool -= dt;
      let worst = null;
      let worstErr = 0;
      let swinging = false;
      for (const F of this.feet) {
        this.switchMode(F, 'idle');
        this.bodyToWorld(F.neutral.x, 0, F.neutral.z, G, hN, F.target);
        F.target.y = this.root.position.y;
        const yawTo = hN + F.sx * toeOut;
        if (F.swing) {
          swinging = true;
          F.s = Math.min(1, F.s + dt / F.dur);
          const e = smooth(F.s);
          F.pitch = lerp(F.fromPitch, 0, e) - Math.sin(Math.PI * F.s) * 0.1;
          F.yaw = F.fromYaw + wrap(yawTo - F.fromYaw) * e;
          this.pivot(0, yawTo, tmpA);
          F.ankle.lerpVectors(F.from, tmpA.add(F.target), e);
          F.ankle.y += 0.07 * s * Math.sin(Math.PI * F.s);
          idleBob = Math.max(idleBob, Math.sin(Math.PI * F.s) * 0.012);
          const other = this.feet[F.side === 'L' ? 1 : 0];
          shift += other.sx * 0.03 * Math.sin(Math.PI * Math.min(1, F.s * 1.4));
          if (F.s >= 1) {
            F.swing = false;
            F.plant.copy(F.target);
            F.yaw = yawTo;
            F.pitch = 0;
            this.stepCool = 0.05;
            this.footImpact('shuffle');
            if (this.onFootstep) this.onFootstep(this, F.side, F.plant.clone(), 'shuffle');
          }
        } else {
          F.pitch += (0 - F.pitch) * Math.min(1, dt * 9);
          this.pivot(F.pitch, F.yaw, tmpA);
          F.ankle.copy(F.plant).add(tmpA);
          const err = Math.hypot(F.plant.x - F.target.x, F.plant.z - F.target.z) / s + Math.abs(wrap(F.yaw - yawTo)) * 0.25;
          if (err > worstErr) {
            worstErr = err;
            worst = F;
          }
        }
      }
      if (!swinging && worst && worstErr > 0.085 && this.stepCool <= 0) {
        const F = worst;
        F.swing = true;
        F.s = 0;
        F.dur = clamp(0.24 + worstErr * 0.35, 0.26, 0.42) * clamp(2.2 / this.poseSpeed, 0.6, 1.2);
        F.from.copy(F.ankle);
        F.fromYaw = F.yaw;
        F.fromPitch = F.pitch;
      }
      shift += P.idle || 0;
    }

    // Suavizado de discontinuidades (cambios de modo) y posición final de cada tobillo
    const decay = Math.exp(-dt * 16);
    for (const F of this.feet) {
      if (F.fixCorr) {
        F.fixCorr = false;
        F.corr.copy(F.prev).sub(F.ankle);
      } else F.corr.multiplyScalar(decay);
      F.ankle.add(F.corr);
      F.prev.copy(F.ankle);
    }

    // Pelvis: carga lateral sobre el pie de apoyo, sube y baja con el paso y baja lo que
    // haga falta para que las piernas alcancen los pies.
    P.x += (shift - P.x) * Math.min(1, dt * 10);
    const ww = gait ? W.weight : 0;
    const bob = gait ? (run ? 0.055 * mid : 0.024 * (1 - mid)) * ww : idleBob;
    const base = this.hipBase - crouch - (run ? 0.06 : 0.012) * ww - bob;
    const thY = base + j.thighL.position.y;
    const R = (L.l1 + L.l2) * 0.992;
    let need = 0;
    for (const F of this.feet) {
      this.worldToBody(F.ankle, G, h, tmpA);
      const wgt = F.swing ? smooth((F.s - 0.55) / 0.45) : 1;
      if (wgt <= 0) continue;
      const tx = j['thigh' + F.side].position.x + P.x;
      const dxz = Math.hypot(tmpA.x - tx, tmpA.z - j['thigh' + F.side].position.z);
      const maxY = tmpA.y + Math.sqrt(Math.max(0, R * R - dxz * dxz));
      need = Math.max(need, (thY - maxY) * wgt);
    }
    P.drop += (need - P.drop) * Math.min(1, dt * (need > P.drop ? 30 : 10));
    const w = this.ikW;
    const hips = j.hips;
    hips.position.x = P.x * w;
    hips.position.y = lerp(hips.position.y, base - P.drop, w);
    hips.updateMatrix();
    tmpM.copy(hips.matrix).invert();

    // IK analítica de dos huesos para cada pierna y orientación del pie en el mundo
    for (const F of this.feet) {
      const th = j['thigh' + F.side];
      const kn = j['knee' + F.side];
      const an = j['ankle' + F.side];
      this.worldToBody(F.ankle, G, h, tmpA).applyMatrix4(tmpM).sub(th.position);
      const D = clamp(tmpA.length(), Math.abs(L.l1 - L.l2) + 0.02, (L.l1 + L.l2) * 0.9995);
      const cosI = clamp((L.l1 * L.l1 + L.l2 * L.l2 - D * D) / (2 * L.l1 * L.l2), -1, 1);
      const k = Math.PI - Math.acos(cosI);
      const ey = -L.l1 - L.l2 * Math.cos(k);
      const ez = -L.l2 * Math.sin(k);
      const c = Math.asin(clamp(tmpA.x / -ey, -1, 1));
      const a = wrap(Math.atan2(tmpA.z, tmpA.y) - Math.atan2(ez, ey * Math.cos(c)));
      th.rotation.set(lerp(th.rotation.x, a, w), th.rotation.y * (1 - w), lerp(th.rotation.z, c, w));
      kn.rotation.set(lerp(kn.rotation.x, k, w), kn.rotation.y * (1 - w), kn.rotation.z * (1 - w));
      // Pie: orientación deseada en el cuerpo = giro (yaw) y cabeceo (pitch) del pie
      qFK.copy(an.quaternion);
      qA.copy(hips.quaternion).multiply(th.quaternion).multiply(kn.quaternion).invert();
      qB.setFromAxisAngle(AX_Y, wrap(F.yaw - h)).multiply(tmpQ.setFromAxisAngle(AX_X, F.pitch));
      qA.multiply(qB);
      if (w < 1) qA.slerp(qFK, 1 - w);
      an.quaternion.copy(qA);
    }
  }

  switchMode(F, mode) {
    if (F.mode === mode) return;
    F.mode = mode;
    if (F.swing) {
      // Continúa el paso desde donde está, sin saltos
      F.from.copy(F.ankle);
      F.fromYaw = F.yaw;
      F.fromPitch = F.pitch;
      F.s = 0;
      F.dur = 0.24;
    }
    F.fixCorr = true;
  }

  // Movimiento secundario: la cabeza, las orejas y la mandíbula siguen con retraso a la
  // aceleración del pecho y rebotan con cada pisada.
  updateSecondary(dt, o) {
    if (dt <= 0 || !this.j.chest) return;
    this.j.chest.getWorldPosition(tmpV);
    if (this.lastChest) {
      tmpV2.copy(tmpV).sub(this.lastChest).divideScalar(dt);
      const ax = (tmpV2.x - this.lastVel.x) / dt;
      const ay = (tmpV2.y - this.lastVel.y) / dt;
      const az = (tmpV2.z - this.lastVel.z) / dt;
      this.lastVel.copy(tmpV2);
      const k = Math.min(1, dt * 12);
      this.acc.x += (clamp(ax, -9, 9) - this.acc.x) * k;
      this.acc.y += (clamp(ay, -9, 9) - this.acc.y) * k;
      this.acc.z += (clamp(az, -9, 9) - this.acc.z) * k;
    } else {
      this.lastChest = new THREE.Vector3();
      this.lastVel.set(0, 0, 0);
      this.acc.set(0, 0, 0);
    }
    this.lastChest.copy(tmpV);
    const c = Math.cos(-this.heading);
    const sn = Math.sin(-this.heading);
    const fwd = -this.acc.x * sn + this.acc.z * c;
    const side = this.acc.x * c + this.acc.z * sn;
    const up = this.acc.y;
    const S = this.sec;
    o.head.x += S.headP.step(-fwd * 0.012 + up * 0.006, dt);
    o.head.z += S.headR.step(side * 0.01, dt);
    const ear = S.ear.step(fwd * 0.03 + up * 0.025, dt);
    const ear2 = S.ear2.step(fwd * 0.05 + up * 0.04, dt);
    if (this.j.earL) {
      o.earL.x += ear;
      o.earR.x += ear * 0.9;
    }
    if (this.j.ear2L) {
      o.ear2L.x += ear2;
      o.ear2R.x += ear2 * 1.1;
    }
    o.jaw.x += Math.max(0, S.jaw.step(up * 0.01, dt));
    const b = S.body.step(0, dt);
    o.spine.x += b;
    o.chest.x += b * 0.5;
  }

  // Impacto de una pisada: pequeña sacudida mecánica.
  footImpact(style) {
    const k = style === 'run' ? 1.6 : style === 'shuffle' ? 0.45 : 1;
    this.sec.jaw.v += 2.2 * k;
    this.sec.headP.v += 0.9 * k;
    this.sec.ear.v -= 2.4 * k;
    this.sec.ear2.v -= 3.2 * k;
    this.sec.body.v += 0.5 * k;
  }

  // Actuaciones en el escenario y comportamiento de acecho en la puerta.
  updateActing(o) {
    const t = this.time;
    const p = this.perform;
    if (p === 'sing') {
      const phrase = 0.5 + 0.5 * Math.sin(t * 0.9);
      o.jaw.x += Math.max(0, Math.sin(t * 7.4)) * 0.3 * phrase;
      o.head.z += Math.sin(t * 1.6) * 0.07;
      o.head.x += Math.sin(t * 3.2) * 0.03;
      o.chest.y += Math.sin(t * 0.8) * 0.06;
      o.shoulderR.x += Math.sin(t * 1.6) * 0.05;
      const g = 0.5 + 0.5 * Math.sin(t * 0.8);
      o.shoulderL.z += g * 0.3;
      o.elbowL.x -= g * 0.35;
      o.fingersL.x -= g * 0.3;
    } else if (p === 'strum') {
      o.elbowR.x += Math.sin(t * 9) * 0.1;
      o.wristR.x += Math.sin(t * 9 + 0.6) * 0.22;
      o.fingersL.x += Math.sin(t * 3) * 0.2;
      o.head.x += Math.abs(Math.sin(t * 2.1)) * 0.09;
      o.chest.z += Math.sin(t * 1.05) * 0.04;
      o.hips.z += Math.sin(t * 1.05) * 0.02;
    } else if (p === 'sway') {
      o.hips.z += Math.sin(t * 1.4) * 0.05;
      o.chest.z -= Math.sin(t * 1.4) * 0.06;
      o.head.z += Math.sin(t * 1.4 + 0.5) * 0.1;
      const wv = 0.5 + 0.5 * Math.sin(t * 5.6);
      o.shoulderR.z -= 0.6 + wv * 0.25;
      o.shoulderR.x -= 0.3;
      o.elbowR.x -= 0.9 + wv * 0.3;
      o.wristR.z += Math.sin(t * 5.6) * 0.3;
    } else if (p === 'pirate') {
      o.head.y += Math.sin(t * 0.7) * 0.3;
      o.shoulderR.x += Math.sin(t * 1.3) * 0.25;
      o.jaw.x += Math.max(0, Math.sin(t * 2.3)) * 0.3;
    }
    if (this.poseName === 'doorway' && !this.moving) {
      o.head.z += Math.sin(t * 0.35) * 0.14;
      o.neck.x += Math.sin(t * 0.22) * 0.06;
      o.spine.x += Math.sin(t * 0.3) * 0.03;
      o.jaw.x += Math.max(0, Math.sin(t * 0.5) - 0.4) * 0.35;
    }
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

  // Mirada: la cabeza gira con aceleración y frenada suaves (muelle crítico con velocidad
  // máxima) y el cuello aporta parte del giro; los ojos apuntan antes que la cabeza porque
  // siempre se orientan al objetivo desde la posición actual de la cabeza. En los giros
  // grandes suele parpadear. Sin objetivo, la cabeza acompaña un poco a las sacadas.
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
    const gap = Math.abs(dYaw - L.yaw) + Math.abs(dPitch - L.pitch);
    if (L.active && gap > 0.7 && !L.shifting) {
      L.shifting = true;
      if (Math.random() < 0.75) this.blink = 1;
    } else if (gap < 0.2) L.shifting = false;
    L.weight += ((L.active ? 1 : 0) - L.weight) * Math.min(1, dt * 2);
    if (dt > 0) {
      const wn = clamp(L.speed * 3.2, 3, 45);
      const vmax = L.speed * 1.5;
      const n = Math.max(1, Math.ceil((wn * dt) / 0.15));
      const hh = dt / n;
      L.vYaw = L.vYaw || 0;
      L.vPitch = L.vPitch || 0;
      for (let i = 0; i < n; i++) {
        L.vYaw = clamp(L.vYaw + (wn * wn * (dYaw - L.yaw) - 2 * wn * L.vYaw) * hh, -vmax, vmax);
        L.vPitch = clamp(L.vPitch + (wn * wn * (dPitch - L.pitch) - 2 * wn * L.vPitch) * hh, -vmax, vmax);
        L.yaw += L.vYaw * hh;
        L.pitch += L.vPitch * hh;
      }
    }
    const w = L.weight;
    o.head.x *= 1 - w * 0.6;
    o.head.y *= 1 - w * 0.8;
    o.neck.y += L.yaw * 0.35 * w;
    o.head.y += L.yaw * 0.65 * w;
    o.neck.x += L.pitch * 0.3 * w;
    o.head.x += L.pitch * 0.7 * w;
    // La cabeza acompaña parcialmente a los ojos cuando miran alrededor
    const free = (1 - w) * this.sway;
    o.head.y += this.sec.gaze.step(this.sacc.yaw * 0.4 * free, dt);
    o.head.x += this.sec.gazeP.step(this.sacc.pitch * 0.3 * free, dt);
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
    const sc = this.sacc;
    sc.t -= dt;
    if (sc.t <= 0) {
      sc.t = 0.8 + Math.random() * 2.8;
      const calm = Math.random() < 0.4;
      sc.yaw = calm ? 0 : (Math.random() - 0.5) * 0.5;
      sc.pitch = calm ? 0 : (Math.random() - 0.5) * 0.22;
    }
    for (const e of this.eyes) {
      // Sin objetivo: los ojos hacen la sacada y descuentan lo que ya giró la cabeza
      let yaw = L.active ? 0 : sc.yaw - this.sec.gaze.x;
      let pitch = L.active ? 0 : sc.pitch - this.sec.gazeP.x;
      if (L.active) {
        e.pivot.getWorldPosition(tmpV);
        tmpV2.subVectors(L.target, tmpV);
        e.pivot.parent.getWorldQuaternion(tmpQ);
        tmpV2.applyQuaternion(tmpQ.invert());
        yaw = clamp(Math.atan2(tmpV2.x, tmpV2.z), -0.4, 0.4);
        pitch = clamp(Math.atan2(-tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z)), -0.3, 0.3);
      }
      e.yaw += (yaw - e.yaw) * Math.min(1, dt * 22);
      e.pitch += (pitch - e.pitch) * Math.min(1, dt * 22);
      e.mesh.rotation.set(e.pitch, e.yaw, 0);
    }
  }
}

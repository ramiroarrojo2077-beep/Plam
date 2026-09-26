// IA de los animatrónicos. Siguen las reglas del juego original (oportunidades de
// movimiento periódicas con tirada 1-20 contra su nivel de IA), pero los desplazamientos
// entre salas son reales: caminan (o corren) por el edificio en tiempo real.
import * as THREE from 'three';
import { spotFor, PLAYER_EYE } from '../world/layout.js';
import { findPath, wp } from './nav.js';

const EYE = new THREE.Vector3(...PLAYER_EYE);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const ROOM_POSE = {
  DINING: 'stare',
  BACKSTAGE: 'stare',
  RESTROOMS: 'lean',
  KITCHEN: 'stand',
  WEST_HALL: 'stare',
  EAST_HALL: 'stare',
  CLOSET: 'slump',
  WEST_CORNER: 'stare',
  EAST_CORNER: 'stare',
  LEFT_DOOR: 'doorway',
  RIGHT_DOOR: 'doorway',
  OFFICE_L: 'scare',
  OFFICE_R: 'scare',
};

export class Agent {
  constructor(night, key, char, interval, speed) {
    this.n = night;
    this.key = key;
    this.c = char;
    this.interval = interval;
    this.speed = speed;
    this.timer = Math.random() * interval;
    this.room = null;
    this.wp = null;
    this.target = null;
    this.ai = 0;
    this.watchT = 0;
    this.lookDelay = 1;
    this.phase = 'idle';
    this.stung = false;
  }

  place(room) {
    const [id, face] = spotFor(room, this.key);
    const p = wp(id);
    this.c.place(p, Math.atan2(face[0] - p.x, face[1] - p.z));
    this.room = room;
    this.wp = id;
    this.target = null;
    this.setRoomPose(room, true);
  }

  roll() {
    return this.ai > 0 && 1 + Math.floor(Math.random() * 20) <= this.ai;
  }

  goTo(room, { style = 'walk', speed = null, onArrive = null } = {}) {
    const spot = spotFor(room, this.key);
    if (!spot) return;
    const [id, face] = spot;
    const pts = findPath(this.wp, id);
    const from = this.room;
    this.n.onRoomChange(this, from, room);
    this.room = null;
    this.target = room;
    this.wp = id;
    this.stung = false;
    this.c.setHollow(false);
    this.c.setPose('stand', 3);
    this.c.lookAt(null);
    this.c.twitch.rate = 0.1;
    this.c.walkTo(pts, {
      speed: speed || this.speed,
      style,
      faceAt: new THREE.Vector3(face[0], 0, face[1]),
      onArrive: () => {
        this.room = room;
        this.target = null;
        this.setRoomPose(room);
        this.onArrive(room);
        this.n.onArrived(this, room);
        if (onArrive) onArrive();
      },
    });
  }

  setRoomPose(room, snap = false) {
    const pose = room === 'STAGE' ? this.stagePose : ROOM_POSE[room] || 'stand';
    this.c.setPose(pose, 2.2);
    if (snap) this.c.snapPose();
    this.c.twitch.rate = room === 'STAGE' ? 0.15 : 0.35;
    this.c.eyeGlowTarget = room === 'STAGE' ? 0.3 : 0.6;
    const dark = ['WEST_HALL', 'EAST_HALL', 'WEST_CORNER', 'EAST_CORNER', 'CLOSET', 'LEFT_DOOR', 'RIGHT_DOOR'];
    if (dark.includes(room)) this.c.eyeGlowTarget = 1.1;
  }

  onArrive() {}

  opportunity() {}

  tick(dt) {
    this.timer += dt;
    while (this.timer >= this.interval) {
      this.timer -= this.interval;
      if (!this.c.moving && this.phase !== 'attack') this.opportunity();
    }
    this.update(dt);
  }

  update(dt) {
    const c = this.c;
    if (!this.room || c.moving) return;
    if (this.room === 'LEFT_DOOR' || this.room === 'RIGHT_DOOR' || this.room.startsWith('OFFICE')) {
      c.lookAt(EYE, 0.9);
      return;
    }
    const cam = this.n.viewedCam();
    if (cam && cam.rooms.includes(this.room) && !cam.audioOnly) {
      this.watchT += dt;
      const late = this.room !== 'STAGE' || this.n.hour >= 2;
      if (late && this.watchT > this.lookDelay) c.lookAt(this.n.camPos, 0.55);
    } else {
      this.watchT = 0;
      this.lookDelay = 0.6 + Math.random() * 3.5;
      if (this.room !== 'STAGE' || Math.random() < dt * 0.1) c.lookAt(null);
    }
  }

  attack(side) {
    const n = this.n;
    n.state.broken[side] = true;
    n.forceLight(side, false);
    this.phase = 'attack';
    const room = side === 'L' ? 'OFFICE_L' : 'OFFICE_R';
    const run = this.key === 'fox';
    this.goTo(room, { speed: run ? 5.5 : 1.5, style: run ? 'run' : 'walk' });
    n.pendingScare = { agent: this, side, t: 0 };
  }

  reset() {
    this.phase = 'idle';
    this.timer = Math.random() * this.interval;
  }
}

export class BunnyAI extends Agent {
  constructor(n, c) {
    super(n, 'bunny', c, 4.97, 1.25);
    this.stagePose = 'guitar';
    this.graph = {
      STAGE: ['DINING', 'BACKSTAGE'],
      DINING: ['BACKSTAGE', 'WEST_HALL'],
      BACKSTAGE: ['DINING', 'WEST_HALL'],
      WEST_HALL: ['CLOSET', 'WEST_CORNER'],
      CLOSET: ['WEST_HALL', 'LEFT_DOOR'],
      WEST_CORNER: ['CLOSET', 'LEFT_DOOR'],
    };
  }
  opportunity() {
    if (!this.roll()) return;
    if (this.room === 'LEFT_DOOR') {
      if (this.n.state.doorL) this.goTo('DINING');
      else this.attack('L');
      return;
    }
    const opts = this.graph[this.room];
    if (opts) this.goTo(pick(opts));
  }
  onArrive(room) {
    if (room === 'LEFT_DOOR') this.c.setHollow(Math.random() < 0.6);
  }
}

export class ChickenAI extends Agent {
  constructor(n, c) {
    super(n, 'chicken', c, 4.98, 1.1);
    this.stagePose = 'cupcake';
    this.clangT = 2;
    this.graph = {
      STAGE: ['DINING'],
      DINING: ['RESTROOMS', 'KITCHEN'],
      RESTROOMS: ['KITCHEN', 'DINING', 'EAST_HALL'],
      KITCHEN: ['RESTROOMS', 'EAST_HALL'],
      EAST_HALL: ['KITCHEN', 'EAST_CORNER', 'DINING'],
      EAST_CORNER: ['RIGHT_DOOR', 'EAST_HALL'],
    };
  }
  opportunity() {
    if (!this.roll()) return;
    if (this.room === 'RIGHT_DOOR') {
      if (this.n.state.doorR) this.goTo('EAST_HALL');
      else this.attack('R');
      return;
    }
    const opts = this.graph[this.room];
    if (opts) this.goTo(pick(opts));
  }
  onArrive(room) {
    if (room === 'RIGHT_DOOR') this.c.setHollow(Math.random() < 0.5);
  }
  update(dt) {
    super.update(dt);
    if (this.room === 'KITCHEN') {
      this.clangT -= dt;
      if (this.clangT <= 0) {
        this.clangT = 1.2 + Math.random() * 3;
        const loud = this.n.monitorUp && this.n.cam === '6';
        this.n.g.audio.clang(this.c.root.position.clone().setY(1.2), loud ? 1.0 : 0.3);
        this.c.twitch.list.push({ n: 'shoulderR', axis: 'x', amp: -0.6, t: 0, hold: 0.2 });
      }
    }
  }
}

export class BearAI extends Agent {
  constructor(n, c) {
    super(n, 'bear', c, 3.02, 1.0);
    this.stagePose = 'stageBear';
    this.order = ['STAGE', 'DINING', 'RESTROOMS', 'KITCHEN', 'EAST_HALL', 'EAST_CORNER'];
  }
  opportunity() {
    const A = this.n.agents;
    if (this.room === 'STAGE' && (A.bunny.room === 'STAGE' || A.chicken.room === 'STAGE')) return;
    if (this.n.camSees(this.room)) return;
    if (!this.roll()) return;
    if (this.room === 'EAST_CORNER') {
      if (this.n.state.doorR) this.goTo('EAST_HALL');
      else if (this.n.monitorUp && this.n.cam !== '4B') this.attack('R');
      return;
    }
    const i = this.order.indexOf(this.room);
    if (i >= 0 && i < this.order.length - 1) {
      this.n.g.audio.laugh(this.c.root.position.clone().setY(2));
      this.goTo(this.order[i + 1], { speed: 1.0 });
    }
  }
  setRoomPose(room, snap) {
    super.setRoomPose(room, snap);
    if (room !== 'STAGE') this.c.eyeGlowTarget = 1.4;
  }
}

// Rufo: etapas dentro de la cueva (0 cerrada, 1 asomado, 2 fuera del telón, 3 se ha ido).
export class FoxAI extends Agent {
  constructor(n, c) {
    super(n, 'fox', c, 5.01, 1.4);
    this.stage = 0;
    this.lock = 0;
    this.waitT = 0;
    this.bangs = 0;
  }
  place(room) {
    super.place(room);
    if (room === 'COVE') this.setStage(this.stage, true);
  }
  setStage(s, snap = false) {
    this.stage = s;
    const cove = this.n.g.world.cove;
    const base = wp('cv');
    const c = this.c;
    if (s === 0) {
      cove.setOpen(0);
      c.place(base.clone(), Math.PI / 2);
      c.setPose('coveHunch');
      c.eyeGlowTarget = 0.5;
    } else if (s === 1) {
      cove.setOpen(0.28);
      cove.poke();
      c.place(base.clone().add(new THREE.Vector3(0.9, 0, 0.35)), Math.PI / 2 - 0.15);
      c.setPose('peek');
      c.eyeGlowTarget = 1.2;
    } else if (s === 2) {
      cove.setOpen(0.62);
      cove.poke();
      c.place(base.clone().add(new THREE.Vector3(1.55, 0, 0.1)), Math.PI / 2);
      c.setPose('coveHunch');
      c.eyeGlowTarget = 1.4;
    }
    if (snap) c.snapPose();
    this.n.camDisrupt('COVE');
  }
  opportunity() {
    if (this.phase !== 'cove') return;
    if (this.n.monitorUp || this.lock > 0) return;
    if (!this.roll()) return;
    if (this.stage < 2) this.setStage(this.stage + 1);
    else this.leave();
  }
  leave() {
    this.stage = 3;
    this.phase = 'leaving';
    this.n.g.world.cove.setOpen(1);
    this.n.g.world.cove.poke();
    this.wp = 'cv';
    this.goTo('WEST_HALL_N', { style: 'run', speed: 5.5 });
  }
  goTo(room, opts = {}) {
    if (room === 'WEST_HALL_N') {
      const pts = findPath(this.wp, 'whN');
      this.room = null;
      this.wp = 'whN';
      this.c.setPose('stand', 4);
      this.c.walkTo(pts, {
        speed: opts.speed || 5.5,
        style: 'run',
        faceAt: new THREE.Vector3(-5, 0, 0),
        onArrive: () => {
          this.room = 'WEST_HALL';
          this.phase = 'waiting';
          this.waitT = 18 + Math.random() * 10;
          this.c.setPose('coveHunch', 3);
          this.c.eyeGlowTarget = 1.6;
        },
      });
      return;
    }
    super.goTo(room, opts);
  }
  sprint() {
    this.phase = 'sprint';
    const pts = findPath(this.wp, 'foxD');
    this.room = null;
    this.wp = 'foxD';
    this.c.setPose('stand', 5);
    this.c.lookAt(null);
    this.n.g.audio.laugh(this.c.root.position.clone().setY(1.8));
    this.c.walkTo(pts, {
      speed: 7,
      style: 'run',
      faceAt: new THREE.Vector3(0, 0, -1),
      onArrive: () => {
        this.room = 'LEFT_DOOR';
        if (this.n.state.doorL) this.blocked();
        else this.attack('L');
      },
    });
  }
  blocked() {
    const n = this.n;
    n.g.audio.bang(new THREE.Vector3(-3.7, 1.2, -1.2));
    n.power = Math.max(0, n.power - (1 + 5 * this.bangs));
    this.bangs++;
    this.c.setPose('doorway', 4);
    this.phase = 'retreat';
    setTimeout(() => {
      if (n.finished || n.powerOut || this.phase !== 'retreat') return;
      this.wp = 'foxD';
      super.goTo('COVE', {
        speed: 1.6,
        onArrive: () => {
          this.phase = 'cove';
          this.setStage(Math.random() < 0.5 ? 0 : 1, true);
        },
      });
    }, 1400);
  }
  update(dt) {
    if (this.lock > 0) this.lock -= dt;
    if (this.phase === 'waiting') {
      this.waitT -= dt;
      if (this.n.camSees('WEST_HALL')) this.waitT = Math.min(this.waitT, 0.35);
      if (this.waitT <= 0) this.sprint();
      this.c.lookAt(this.n.camSees('WEST_HALL') ? this.n.camPos : null, 1.5);
      return;
    }
    if (this.phase === 'cove') {
      const cam = this.n.viewedCam();
      if (cam && cam.id === '1C' && this.stage > 0) this.c.lookAt(this.n.camPos, 0.5);
      else this.c.lookAt(null);
      return;
    }
    super.update(dt);
  }
  reset() {
    super.reset();
    this.phase = 'cove';
    this.stage = 0;
    this.lock = 0;
    this.bangs = 0;
  }
}

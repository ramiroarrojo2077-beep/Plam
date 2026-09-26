// Lógica de una noche: reloj, energía, puertas, luces, monitor, IA, apagón y victoria.
import * as THREE from 'three';
import { CAMS, PLAYER_EYE } from '../world/layout.js';
import { BunnyAI, ChickenAI, BearAI, FoxAI } from './ai.js';
import { hash2 } from '../core/rng.js';

export const AI_TABLE = {
  1: { bear: 0, bunny: 1, chicken: 0, fox: 0 },
  2: { bear: 0, bunny: 3, chicken: 1, fox: 1 },
  3: { bear: 1, bunny: 0, chicken: 5, fox: 2 },
  4: { bear: 2, bunny: 2, chicken: 4, fox: 6 },
  5: { bear: 3, bunny: 5, chicken: 7, fox: 5 },
  6: { bear: 4, bunny: 10, chicken: 12, fox: 16 },
};

const DRAIN_FACTOR = { 1: 1, 2: 1.08, 3: 1.16, 4: 1.25, 5: 1.35, 6: 1.45, 7: 1.45 };
export const CAM_BY_ID = Object.fromEntries(CAMS.map((c) => [c.id, c]));
const DOOR_POS = { L: new THREE.Vector3(-3.65, 1.5, -1.2), R: new THREE.Vector3(3.65, 1.5, -1.2) };

export class Night {
  constructor(game, num, custom = null) {
    this.g = game;
    this.num = num;
    this.custom = !!custom;
    this.hourLen = game.settings.hourLen;
    this.t = 0;
    this.hour = 0;
    this.power = 100;
    this.state = { doorL: false, doorR: false, lightL: false, lightR: false, power: true, broken: { L: false, R: false } };
    this.monitorUp = false;
    this.cam = '1A';
    this.camPos = new THREE.Vector3(...CAM_BY_ID['1A'].pos);
    this.camStatic = 0;
    this.finished = false;
    this.pendingScare = null;
    this.powerOut = null;
    const ch = game.chars;
    this.agents = {
      bunny: new BunnyAI(this, ch.bunny),
      chicken: new ChickenAI(this, ch.chicken),
      bear: new BearAI(this, ch.bear),
      fox: new FoxAI(this, ch.fox),
    };
    const lv = custom || AI_TABLE[Math.min(num, 6)];
    for (const k in this.agents) this.agents[k].ai = lv[k];
    if (num === 4 && !custom) this.agents.bear.ai = 1 + (Math.random() < 0.5 ? 1 : 0);
    this.setup();
  }

  setup() {
    const g = this.g;
    for (const a of Object.values(this.agents)) {
      a.reset();
      a.c.stop();
      a.c.setHollow(false);
      a.c.jaw.target = 0;
      a.c.jaw.chatter = 0;
      a.c.shake = 0;
      a.c.root.visible = true;
    }
    g.resetProps();
    this.agents.bunny.place('STAGE');
    this.agents.chicken.place('STAGE');
    this.agents.bear.place('STAGE');
    this.agents.fox.place('COVE');
    g.world.office.setDoor('L', false);
    g.world.office.setDoor('R', false);
    g.rig.state.power = true;
    g.rig.state.lightL = false;
    g.rig.state.lightR = false;
    g.rig.mult.faceLight = 0;
  }

  viewedCam() {
    return this.monitorUp ? CAM_BY_ID[this.cam] : null;
  }

  camSees(room) {
    const c = this.viewedCam();
    return !!(c && c.rooms.includes(room));
  }

  usage() {
    const s = this.state;
    return 1 + (s.doorL ? 1 : 0) + (s.doorR ? 1 : 0) + (s.lightL ? 1 : 0) + (s.lightR ? 1 : 0) + (this.monitorUp ? 1 : 0);
  }

  camDisrupt(room) {
    if (this.camSees(room)) {
      this.camStatic = 1.4;
      this.g.audio.staticBurst(0.9, 0.18);
    }
  }

  onRoomChange(agent, from, to) {
    if (from) this.camDisrupt(from);
    if (from === 'STAGE') this.g.leaveStage(agent.key);
    agent.stung = false;
  }

  onArrived(agent, room) {
    this.camDisrupt(room);
    const side = room === 'LEFT_DOOR' ? 'L' : room === 'RIGHT_DOOR' ? 'R' : null;
    if (side && this.state['light' + side] && agent.key !== 'fox') {
      agent.stung = true;
      this.g.audio.stinger();
    }
  }

  // ------------------------------------------------------------ acciones del jugador
  toggleDoor(side) {
    const g = this.g;
    if (!this.state.power || this.state.broken[side]) {
      g.audio.deny(DOOR_POS[side]);
      return;
    }
    const k = 'door' + side;
    this.state[k] = !this.state[k];
    g.world.office.setDoor(side, this.state[k]);
    g.audio.click(DOOR_POS[side]);
    if (this.state[k]) g.audio.doorSlam(DOOR_POS[side]);
    else g.audio.doorOpen(DOOR_POS[side]);
  }

  toggleLight(side) {
    const g = this.g;
    if (!this.state.power || this.state.broken[side]) {
      g.audio.deny(DOOR_POS[side]);
      return;
    }
    const k = 'light' + side;
    this.forceLight(side, !this.state[k]);
    g.audio.click(DOOR_POS[side]);
    if (this.state[k]) {
      const room = side === 'L' ? 'LEFT_DOOR' : 'RIGHT_DOOR';
      for (const a of Object.values(this.agents)) {
        if (a.room === room && a.key !== 'fox' && !a.stung) {
          a.stung = true;
          g.audio.stinger();
        }
      }
    }
  }

  forceLight(side, on) {
    const k = 'light' + side;
    this.state[k] = on;
    this.g.rig.state[k] = on;
    this.g.audio.lightBuzz(on, side);
  }

  setMonitor(up) {
    this.monitorUp = up;
    if (!up) this.agents.fox.lock = 0.8 + Math.random() * 15.9;
  }

  setCam(id) {
    this.cam = id;
    const c = CAM_BY_ID[id];
    this.camPos.set(...c.pos);
    for (const a of Object.values(this.agents)) {
      a.watchT = 0;
      a.lookDelay = 0.8 + Math.random() * 3;
    }
  }

  // ------------------------------------------------------------ bucle
  update(dt) {
    if (this.finished) return;
    const g = this.g;
    this.t += dt;
    const h = Math.floor(this.t / this.hourLen);
    if (h !== this.hour) {
      this.hour = h;
      if (!this.custom) {
        if (h === 2) this.agents.bunny.ai++;
        if (h === 3 || h === 4) {
          this.agents.bunny.ai++;
          this.agents.chicken.ai++;
          this.agents.fox.ai++;
        }
      }
      if (h >= 6) {
        this.finished = true;
        if (this.powerOut?.music) this.powerOut.music.stop();
        g.onWin();
        return;
      }
    }

    if (!this.powerOut) {
      const drain = this.usage() * 0.1 * (DRAIN_FACTOR[this.num] || 1) * (60 / this.hourLen);
      this.power -= drain * dt;
      if (this.power <= 0) {
        this.power = 0;
        this.startPowerOut();
      }
      for (const a of Object.values(this.agents)) a.tick(dt);
    } else this.updatePowerOut(dt);

    this.camStatic = Math.max(0, this.camStatic - dt);

    const ps = this.pendingScare;
    if (ps && !this.powerOut) {
      ps.t += dt;
      if (!this.monitorUp) {
        if (ps.t > (ps.agent.key === 'fox' ? 0.12 : 0.5)) {
          this.pendingScare = null;
          g.startJumpscare(ps.agent.c, ps.side);
        }
      } else if (ps.t > 9) {
        g.setMonitor(false, true);
      }
    }
  }

  // ------------------------------------------------------------ apagón
  startPowerOut() {
    const g = this.g;
    this.pendingScare = null;
    this.state.power = false;
    g.rig.state.power = false;
    for (const side of ['L', 'R']) {
      this.forceLight(side, false);
      if (this.state['door' + side]) {
        this.state['door' + side] = false;
        g.world.office.setDoor(side, false);
        g.audio.doorOpen(DOOR_POS[side]);
      }
    }
    if (this.monitorUp) g.setMonitor(false, true);
    g.audio.powerDown();
    g.audio.setFan(false);
    g.phone.stop();
    // Retira de las puertas a quien estuviera allí (nadie lo ve: está todo a oscuras)
    for (const a of Object.values(this.agents)) {
      a.c.stop();
      a.phase = 'idle';
      if (a.key === 'bear') continue;
      if (a.key === 'fox') {
        a.stage = 0;
        a.phase = 'cove';
        a.place('COVE');
        continue;
      }
      if (['LEFT_DOOR', 'RIGHT_DOOR', 'OFFICE_L', 'OFFICE_R', 'WEST_CORNER', 'EAST_CORNER', null].includes(a.room)) {
        a.place(a.key === 'bunny' ? 'WEST_HALL' : 'EAST_HALL');
      }
    }
    const bear = this.agents.bear;
    bear.place('LEFT_DOOR');
    bear.c.setPose('stand');
    bear.c.snapPose();
    bear.c.eyeGlowTarget = 0;
    bear.c.twitch.rate = 0.05;
    bear.c.lookAt(new THREE.Vector3(...PLAYER_EYE), 0.5);
    this.powerOut = { phase: 'dark', t: 0, dur: 4 + Math.random() * 10, music: null };
  }

  updatePowerOut(dt) {
    const po = this.powerOut;
    const g = this.g;
    const bear = this.agents.bear.c;
    po.t += dt;
    if (po.phase === 'dark') {
      if (po.t > po.dur) {
        po.phase = 'music';
        po.t = 0;
        po.dur = 6 + Math.random() * 14;
        const head = bear.j.head.getWorldPosition(new THREE.Vector3());
        po.music = g.audio.musicBox(head);
      }
    } else if (po.phase === 'music') {
      const on = hash2(Math.floor(po.t * 6), 3, 1) > 0.35;
      g.rig.mult.faceLight = on ? 0.8 + Math.random() * 0.2 : 0.05;
      bear.eyeGlowTarget = on ? 2.5 : 0.8;
      bear.jaw.target = Math.sin(po.t * 5) > 0.6 ? 0.25 : 0;
      if (po.t > po.dur) {
        po.music.stop();
        po.music = null;
        po.phase = 'silence';
        po.t = 0;
        po.dur = 2 + Math.random() * 8;
        g.rig.mult.faceLight = 0;
        bear.eyeGlowTarget = 0;
        bear.jaw.target = 0;
      }
    } else if (po.phase === 'silence') {
      if (po.t > po.dur) {
        po.phase = 'attack';
        po.t = 0;
        this.agents.bear.wp = 'ld';
        this.agents.bear.goTo('OFFICE_L', { speed: 1.8 });
      }
    } else if (po.phase === 'attack') {
      if (po.t > 0.7) {
        po.phase = 'done';
        g.startJumpscare(bear, 'L');
      }
    }
  }

  stopAudio() {
    const g = this.g;
    g.audio.lightBuzz(false, 'L');
    g.audio.lightBuzz(false, 'R');
    if (this.powerOut?.music) this.powerOut.music.stop();
  }
}

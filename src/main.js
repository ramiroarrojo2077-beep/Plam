// Cinco Noches en Bruno's — juego de terror en tiempo real hecho con Three.js.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as TX from './core/textures.js';
import { createMaterials } from './core/materials.js';
import { AudioEngine } from './core/audio.js';
import { Post, QUALITY } from './core/post.js';
import { buildBuilding } from './world/building.js';
import { buildProps } from './world/props.js';
import { buildOffice } from './world/office.js';
import { LightRig } from './world/lights.js';
import { CAMS, PLAYER_EYE, VIEW_LIGHTS, spotFor } from './world/layout.js';
import { createAnimatronic, buildSpareParts, CHARACTERS } from './animatronics/models.js';
import { setFurShells } from './animatronics/fur.js';
import { Night, CAM_BY_ID } from './game/night.js';
import { wp } from './game/nav.js';
import { PhoneCall } from './game/phone.js';
import { UI } from './ui/ui.js';

const DEFAULT_SETTINGS = { quality: 'high', volume: 0.8, sens: 1, hourLen: 60, voice: true, edge: true };
const EYE = new THREE.Vector3(...PLAYER_EYE);
const KINDS = ['bear', 'bunny', 'chicken', 'fox'];
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function loadJSON(k, d) {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') };
  } catch (e) {
    return { ...d };
  }
}
function saveJSON(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    /* almacenamiento no disponible */
  }
}

class Game {
  constructor() {
    this.settings = loadJSON('cn-settings', DEFAULT_SETTINGS);
    this.save = loadJSON('cn-save', { night: 1, beat5: false, beat6: false });
    this.ui = new UI();
    this.audio = new AudioEngine();
    this.audio.volume = this.settings.volume;
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.04, 90);
    this.camera.rotation.order = 'YXZ';
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.state = 'loading';
    this.time = 0;
    this.view = null;
    this.yaw = 0;
    this.yawTarget = 0;
    this.input = { keys: {}, mx: 0.5, my: 0.5, inside: false, touchDX: 0, dragging: false, lastX: 0, lastY: 0 };
    this.fx = { static: 0, glitch: 0, flash: 0, fade: 0, shake: 0 };
    this.night = null;
    this.monitorAnim = null;
    this.menu = { idx: 0, t: 0 };
    this.gallery = { idx: 0, yaw: 0.3, pitch: 0.1, dist: 4.3, mode: 'idle', auto: true };
    this.raycaster = new THREE.Raycaster();
    this.lastT = performance.now();
    window.addEventListener('resize', () => this.resize());
  }

  // ================================================================ carga
  async init() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    TX.setAnisotropy(Math.min(q.aniso, this.renderer.capabilities.getMaxAnisotropy()));
    this.resize();
    const T = {};
    const steps = [
      ['floor', 'Baldosas', () => TX.genFloor(1024)],
      ['wainscot', 'Azulejos', () => TX.genWainscot()],
      ['plaster', 'Paredes', () => TX.genPlaster()],
      ['ceiling', 'Techo', () => TX.genCeiling()],
      ['wood', 'Madera', () => TX.genWood()],
      ['concrete', 'Hormigón', () => TX.genConcrete()],
      ['curtainPurple', 'Telones', () => TX.genCurtain(512, [72, 22, 96], true)],
      ['curtainRed', 'Telones', () => TX.genCurtain(512, [118, 14, 20], false, 72)],
      ['curtainNavy', 'Telones', () => TX.genCurtain(512, [14, 16, 44], true, 73)],
      ['cloth', 'Manteles', () => TX.genCloth()],
      ['door', 'Puertas de seguridad', () => TX.genDoorMetal()],
      ['metal', 'Endoesqueletos', () => TX.genMetal()],
      ['fur', 'Pelaje de los animatrónicos', () => TX.genFur(1024)],
      ['furStrands', 'Mechones de pelo', () => TX.genFurStrands(512)],
      ['celebrate', 'Carteles', () => TX.genCelebratePoster()],
      ['drawings', 'Dibujos infantiles', () => ['bear', 'bunny', 'chicken', 'fox', 'bear', 'bunny', 'chicken'].map((w, i) => TX.genKidsDrawing(i + 1, w))],
      ['newspaper', 'Periódico', () => TX.genNewspaper()],
      ['rules', 'Normas', () => TX.genRules()],
      ['stageSign', 'Letrero', () => TX.genStageSign()],
      ['bib', 'Babero', () => TX.genBib()],
      ['partyHat', 'Gorros de fiesta', () => TX.genStripes(['#c4161c', '#f2eee4'])],
      ['partyHat2', 'Gorros de fiesta', () => TX.genStripes(['#1f5fbf', '#f5c518'], 256, 256, 8, -0.6)],
      ['paperLines', 'Papeles', () => TX.genPaper(true, 256, 340, 5)],
      ['paperLines2', 'Papeles', () => TX.genPaper(true, 256, 340, 9)],
      ['paperBlank', 'Papeles', () => TX.genPaper(false, 256, 340, 13)],
      ['exitSign', 'Señales', () => TX.genSign('SALIDA', { w: 256, h: 96, bg: '#0b5a2a', fg: '#d8ffe0', font: 'bold 60px Impact, "Arial Black", sans-serif', age: false })],
      ['signs', 'Señales', () => ({
        cove: TX.genSign('CUEVA PIRATA', { w: 1024, h: 256, bg: '#2a0e3a', fg: '#f5d77a', border: '#f5d77a', font: 'bold 130px Impact, "Arial Black", sans-serif' }),
        restrooms: TX.genSign('BAÑOS', { w: 512, h: 128, bg: '#1d2a3a', fg: '#e8eef5', font: 'bold 80px Impact, "Arial Black", sans-serif' }),
        kitchen: TX.genSign('COCINA', { w: 512, h: 128, bg: '#3a1d1d', fg: '#f5ece8', font: 'bold 80px Impact, "Arial Black", sans-serif' }),
        backstage: TX.genSign('SOLO PERSONAL', { w: 512, h: 110, bg: '#b8a018', fg: '#111', font: 'bold 66px Impact, "Arial Black", sans-serif' }),
        staff: TX.genSign('LIMPIEZA', { w: 512, h: 128, bg: '#dcdcdc', fg: '#222', font: 'bold 80px Impact, "Arial Black", sans-serif' }),
        outOfOrder: TX.genSign('LO SENTIMOS', { sub: 'FUERA DE SERVICIO', w: 512, h: 384, bg: '#efe8d4', fg: '#9a1010', border: '#9a1010', font: 'bold 76px Impact, "Arial Black", sans-serif' }),
        boys: TX.genSign('NIÑOS', { w: 384, h: 128, bg: '#1f4f9f', fg: '#fff', font: 'bold 80px Impact, "Arial Black", sans-serif' }),
        girls: TX.genSign('NIÑAS', { w: 384, h: 128, bg: '#b0306a', fg: '#fff', font: 'bold 80px Impact, "Arial Black", sans-serif' }),
      })],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [key, label, fn] = steps[i];
      this.ui.setLoading(i / (steps.length + 6), `Generando: ${label}...`);
      await nextFrame();
      T[key] = fn();
    }
    this.T = T;
    const M = (this.M = createMaterials(T));

    this.ui.setLoading(steps.length / (steps.length + 6), 'Iluminación...');
    await nextFrame();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.1;
    this.rig = new LightRig(this.scene, q.shadow);

    this.ui.setLoading((steps.length + 1) / (steps.length + 6), 'Construyendo la pizzería...');
    await nextFrame();
    const building = buildBuilding(this.scene, M, T, this.rig);
    const props = buildProps(this.scene, M, T, this.rig);
    const office = buildOffice(this.scene, M, T, this.rig);
    const spare = buildSpareParts(this.scene, M, T);
    this.world = { building, props, office, spare, cove: props.cove, camModels: building.camModels };

    this.chars = {};
    for (let i = 0; i < KINDS.length; i++) {
      const k = KINDS[i];
      this.ui.setLoading((steps.length + 2 + i) / (steps.length + 6), `Montando a ${CHARACTERS[k].name}...`);
      await nextFrame();
      const c = createAnimatronic(k, M, T);
      c.onFootstep = (a, side, pos, style) => this.onFootstep(a, pos, style);
      this.scene.add(c.root);
      this.chars[k] = c;
    }
    this.propHome = {};
    for (const [k, c] of Object.entries(this.chars)) {
      for (const [name, p] of Object.entries(c.props)) {
        this.propHome[name] = { obj: p, parent: p.parent, pos: p.position.clone(), rot: p.rotation.clone() };
      }
    }

    this.phone = new PhoneCall(this.ui, this.audio, this.settings);
    this.bindUI();
    this.bindInput();
    this.applyQuality(false);

    this.ui.setLoading(1, 'Compilando shaders...');
    await nextFrame();
    this.placeOnStage();
    this.setView('menu');
    this.updateMenu(0);
    this.renderer.compile(this.scene, this.camera);
    this.post.render(0.016);

    this.ui.loadingDone(() => {
      this.audio.init();
      this.audio.setVolume(this.settings.volume);
      this.audio.resume();
      this.enterMenu();
    });
    this.state = 'preload';
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ================================================================ ajustes
  applyQuality(resize = true) {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.post.setQuality(q);
    this.rig.setShadowSize(q.shadow);
    if (this.chars) for (const c of Object.values(this.chars)) setFurShells(c.root, [c.fur, c.furDouble].filter(Boolean), this.T.furStrands, q.shells);
    if (resize) this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    const pr = this.settings.quality === 'ultra' ? Math.min(window.devicePixelRatio || 1, 2) : q.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const ms = Math.min(1, (h * 0.55) / 350, (w * 0.42) / 300);
    document.documentElement.style.setProperty('--map-scale', ms.toFixed(3));
  }

  setFovH(hdeg) {
    const a = this.camera.aspect;
    const v = (2 * Math.atan(Math.tan((hdeg * Math.PI) / 360) / a) * 180) / Math.PI;
    this.camera.fov = clamp(v, 40, 88);
    this.camera.updateProjectionMatrix();
  }

  // ================================================================ vistas
  setView(view, camId = null) {
    this.view = view;
    const W = this.world;
    const cams = W.camModels;
    for (const id in cams) cams[id].group.visible = true;
    W.props.group.visible = view !== 'office' && view !== 'jumpscare';
    W.spare.visible = view === 'camera';
    if (view === 'office') this.rig.setView(VIEW_LIGHTS.office, 0.03);
    else if (view === 'jumpscare') this.rig.setView([...VIEW_LIGHTS.office.filter((l) => l !== 'moon'), 'scare'], 0.03);
    else if (view === 'menu') this.rig.setView(VIEW_LIGHTS.menu, 0.03);
    else if (view === 'gallery') this.rig.setView(VIEW_LIGHTS.gallery, 0.05);
    else if (view === 'camera') {
      const cam = CAM_BY_ID[camId];
      this.rig.setView(cam.lights, 0.07);
      if (cams[camId]) cams[camId].group.visible = false;
    }
    this.post.u.camMode.value = view === 'camera' ? 1 : 0;
  }

  // ================================================================ estados
  placeOnStage() {
    const c = this.chars;
    this.resetProps();
    const put = (k, room, pose) => {
      const [id, face] = spotFor(room, k);
      const p = wp(id);
      c[k].place(p, Math.atan2(face[0] - p.x, face[1] - p.z));
      c[k].setPose(pose);
      c[k].snapPose();
      c[k].root.visible = true;
      c[k].setHollow(false);
      c[k].lookAt(null);
      c[k].treadmill = null;
      c[k].jaw.target = 0;
      c[k].jaw.chatter = 0;
      c[k].shake = 0;
      c[k].eyeGlowTarget = 0.4;
      c[k].twitch.rate = 0.25;
    };
    put('bear', 'STAGE', 'stageBear');
    put('bunny', 'STAGE', 'guitar');
    put('chicken', 'STAGE', 'cupcake');
    put('fox', 'COVE', 'coveHunch');
    this.world.cove.setOpen(0);
  }

  resetProps() {
    for (const h of Object.values(this.propHome || {})) {
      h.parent.add(h.obj);
      h.obj.position.copy(h.pos);
      h.obj.rotation.copy(h.rot);
    }
  }

  leaveStage(key) {
    const put = (name, pos, rot) => {
      const h = this.propHome[name];
      if (!h) return;
      this.scene.add(h.obj);
      h.obj.position.set(...pos);
      h.obj.rotation.set(...rot);
    };
    if (key === 'bunny') put('guitar', [-4.3, 1.34, -35.86], [-0.15, 0, 0]);
    if (key === 'chicken') put('cupcake', [4.3, 1.648, -35.9], [0, 0.4, 0]);
  }

  enterMenu() {
    this.stopNight();
    this.state = 'menu';
    this.audio.stopAll();
    this.audio.startStatic(0.025);
    this.ui.only('menu');
    this.ui.menuState(this.save);
    this.ui.fade(false);
    this.placeOnStage();
    this.setView('menu');
    this.menu.t = 0;
    this.fx.static = 1;
  }

  stopNight() {
    if (this.night) this.night.stopAudio();
    this.phone?.stop();
    this.night = null;
    this.monitorAnim = null;
    this.ui.tabletReset();
  }

  startNight(num, custom = null) {
    this.stopNight();
    this.audio.stopAll();
    this.state = 'intro';
    this.introT = 0;
    this.nightNum = num;
    this.nightCustom = custom;
    this.ui.only('intro');
    this.ui.intro(num, custom);
    this.night = new Night(this, num, custom);
    this.yaw = this.yawTarget = 0;
    this.setView('office');
    this.fx.static = 0;
    this.fx.glitch = 0;
    this.fx.flash = 0;
    this.fx.fade = 1;
    this.audio.staticBurst(0.6, 0.12);
  }

  beginNight() {
    this.state = 'night';
    this.ui.only('hud');
    this.audio.startAmbient();
    this.audio.setFan(true);
    if (!this.nightCustom && this.nightNum <= 5) setTimeout(() => this.state === 'night' && this.phone.start(this.nightNum), 1500);
  }

  onWin() {
    const n = this.night;
    this.state = 'win';
    n.stopAudio();
    this.phone.stop();
    this.audio.stopAll();
    this.audio.chime();
    this.ui.only('win');
    let msg = '';
    if (!n.custom) {
      if (n.num < 5) {
        this.save.night = Math.max(this.save.night, n.num + 1);
        msg = `Sobreviviste a la noche ${n.num}.`;
      } else if (n.num === 5) {
        this.save.beat5 = true;
        this.save.night = 5;
        msg = '¡Enhorabuena! Completaste la semana. Desbloqueadas: Noche 6 y noche personalizada.';
      } else {
        this.save.beat6 = true;
        msg = 'Sobreviviste a la noche 6. Pocos llegan hasta aquí.';
      }
      saveJSON('cn-save', this.save);
    } else msg = 'Sobreviviste a la noche personalizada.';
    this.ui.win(msg);
    setTimeout(() => {
      if (this.state !== 'win') return;
      this.ui.winContinue(() => {
        if (!n.custom && n.num < 5) this.startNight(n.num + 1);
        else this.enterMenu();
      });
    }, 5200);
  }

  startJumpscare(char, side) {
    if (this.state !== 'night') return;
    const n = this.night;
    n.finished = true;
    n.stopAudio();
    this.phone.stop();
    if (n.monitorUp) this.setMonitor(false, true);
    this.state = 'jumpscare';
    this.ui.only();
    this.setView('jumpscare');
    for (const c of Object.values(this.chars)) if (c !== char && c.root.position.distanceTo(EYE) < 3) c.root.visible = false;
    char.stop();
    char.root.visible = true;
    char.setHollow(false);
    char.setPose('scare', 16);
    char.jaw.target = 1;
    char.jaw.chatter = 1;
    char.shake = 1;
    char.eyeGlowTarget = 1.3;
    char.twitch.rate = 0;
    char.lookAt(EYE, 30);
    const yawTo = side === 'L' ? 0.85 : side === 'R' ? -0.85 : 0;
    this.js = { t: 0, char, yawFrom: this.yaw, yawTo, headOff: null };
    this.audio.stopAmbient();
    this.audio.scream();
  }

  gameOver() {
    this.state = 'gameover';
    this.ui.only('gameover');
    const msgs = ['Te han metido en un traje.', 'Nadie vendrá a buscarte.', 'La pizzería abrirá mañana, como siempre.', 'Deberías haber vigilado las puertas.'];
    this.ui.gameover(msgs[Math.floor(Math.random() * msgs.length)]);
    this.audio.startStatic(0.16);
    this.fx.static = 0.85;
    const c = this.js?.char;
    if (c) {
      c.shake = 0.3;
      c.jaw.chatter = 0;
      c.jaw.target = 0.4;
    }
  }

  // ================================================================ monitor
  toggleMonitor() {
    const n = this.night;
    if (!n || this.state !== 'night' || this.monitorAnim) return;
    this.setMonitor(!n.monitorUp);
  }

  setMonitor(up, force = false) {
    const n = this.night;
    if (!n) return;
    if (up && !n.state.power) return;
    if (force) {
      this.monitorAnim = null;
      n.setMonitor(false);
      this.ui.show('monitor', false);
      this.ui.tabletReset();
      if (this.state === 'night' || this.state === 'jumpscare') this.setView(this.state === 'jumpscare' ? 'jumpscare' : 'office');
      this.audio.monitorFlip(false);
      return;
    }
    if (n.monitorUp === up) return;
    this.audio.monitorFlip(up);
    this.ui.tablet(up);
    if (up) {
      this.monitorAnim = { up: true, t: 0.27 };
    } else {
      n.setMonitor(false);
      this.ui.show('monitor', false);
      this.setView('office');
      this.monitorAnim = { up: false, t: 0.22 };
    }
  }

  selectCam(id) {
    const n = this.night;
    if (!n || !n.monitorUp || n.cam === id) return;
    n.setCam(id);
    this.setView('camera', id);
    this.ui.setCam(CAM_BY_ID[id]);
    this.audio.camBlip();
    this.fx.static = 0.9;
  }

  // ================================================================ galería
  enterGallery() {
    this.state = 'gallery';
    this.ui.only('gallery');
    this.audio.stopAll();
    this.placeOnStage();
    this.setView('gallery');
    this.showGalleryChar(this.gallery.idx);
    this.fx.static = 0.6;
  }

  showGalleryChar(i) {
    const G = this.gallery;
    G.idx = (i + KINDS.length) % KINDS.length;
    const kind = KINDS[G.idx];
    this.placeOnStage();
    for (const k of KINDS) this.chars[k].root.visible = k === kind;
    const c = this.chars[kind];
    c.place(new THREE.Vector3(0, 0.9, -33.6), 0);
    this.world.cove.setOpen(0);
    this.ui.gallery(`${CHARACTERS[kind].name}`, CHARACTERS[kind].desc);
    this.setGalleryMode('idle');
    this.fx.static = 0.5;
  }

  setGalleryMode(mode) {
    const G = this.gallery;
    const c = this.chars[KINDS[G.idx]];
    if (mode === 'hollow') {
      c.setHollow(!c.hollow);
      c.eyeGlowTarget = c.hollow ? 1.5 : 0.5;
      return;
    }
    G.mode = mode;
    this.ui.galleryAnim(mode);
    c.treadmill = null;
    c.jaw.target = 0;
    c.jaw.chatter = 0;
    c.shake = 0;
    c.lidExtra = 0;
    c.twitch.rate = 0.3;
    c.eyeGlowTarget = 0.5;
    if (mode === 'idle') {
      c.setPose({ bear: 'stageBear', bunny: 'guitar', chicken: 'cupcake', fox: 'coveHunch' }[c.id], 2);
      c.lookAt(null);
    } else if (mode === 'walk' || mode === 'run') {
      c.setPose('stand', 3);
      c.treadmill = mode;
      c.lookAt(null);
    } else if (mode === 'stare') {
      c.setPose('stare', 2);
      c.lookAt(this.camera.position, 1.2);
      c.eyeGlowTarget = 1.6;
      c.lidExtra = 0.15;
      c.twitch.rate = 0.6;
    } else if (mode === 'scare') {
      c.setPose('scare', 10);
      c.jaw.target = 1;
      c.jaw.chatter = 1;
      c.shake = 0.7;
      c.eyeGlowTarget = 2.5;
      c.twitch.rate = 0;
      this.audio.scream();
      this.fx.glitch = 1;
    }
  }

  // ================================================================ entrada
  bindUI() {
    const ui = this.ui;
    const s = this.settings;
    let optionsReturn = 'menu';
    document.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => {
        this.audio.init();
        this.audio.resume();
        this.audio.click();
        const a = b.dataset.action;
        switch (a) {
          case 'new':
            this.save.night = 1;
            saveJSON('cn-save', this.save);
            this.startNight(1);
            break;
          case 'continue':
            this.startNight(Math.min(this.save.night, 5));
            break;
          case 'night6':
            this.startNight(6);
            break;
          case 'custom':
            ui.only('custom');
            break;
          case 'start-custom': {
            const lv = {};
            document.querySelectorAll('[data-ai]').forEach((r) => (lv[r.dataset.ai] = +r.value));
            this.startNight(7, lv);
            break;
          }
          case 'gallery':
            this.enterGallery();
            break;
          case 'options':
            optionsReturn = this.state === 'paused' ? 'pause' : 'menu';
            ui.only(optionsReturn === 'pause' ? 'options' : 'options');
            if (optionsReturn === 'pause') ui.show('hud', false);
            break;
          case 'back':
            if (this.state === 'gallery') this.enterMenu();
            else if (optionsReturn === 'pause' && this.state === 'paused') ui.only('pause');
            else ui.only('menu');
            break;
          case 'resume':
            this.togglePause(false);
            break;
          case 'quit':
            this.paused = false;
            this.audio.ctx?.resume();
            this.enterMenu();
            break;
          case 'retry':
            this.startNight(this.nightNum, this.nightCustom);
            break;
          case 'menu':
            this.enterMenu();
            break;
          default:
            break;
        }
      });
    });
    // Opciones
    const q = document.getElementById('opt-quality');
    const vol = document.getElementById('opt-volume');
    const sens = document.getElementById('opt-sens');
    const hour = document.getElementById('opt-hour');
    const voice = document.getElementById('opt-voice');
    const edge = document.getElementById('opt-edge');
    q.value = s.quality;
    vol.value = s.volume;
    sens.value = s.sens;
    hour.value = String(s.hourLen);
    voice.checked = s.voice;
    edge.checked = s.edge;
    const persist = () => saveJSON('cn-settings', s);
    q.onchange = () => {
      s.quality = q.value;
      this.applyQuality();
      persist();
    };
    vol.oninput = () => {
      s.volume = +vol.value;
      this.audio.setVolume(s.volume);
      persist();
    };
    sens.oninput = () => {
      s.sens = +sens.value;
      persist();
    };
    hour.onchange = () => {
      s.hourLen = +hour.value;
      persist();
    };
    voice.onchange = () => {
      s.voice = voice.checked;
      persist();
    };
    edge.onchange = () => {
      s.edge = edge.checked;
      persist();
    };
    document.querySelectorAll('[data-ai]').forEach((r) => {
      r.oninput = () => (r.nextElementSibling.textContent = r.value);
    });
    // Galería
    document.querySelectorAll('[data-gal]').forEach((b) =>
      b.addEventListener('click', () => this.showGalleryChar(this.gallery.idx + (b.dataset.gal === 'next' ? 1 : -1))),
    );
    document.querySelectorAll('[data-anim]').forEach((b) => b.addEventListener('click', () => this.setGalleryMode(b.dataset.anim)));
    // Monitor y controles táctiles
    const bar = document.getElementById('monitor-bar');
    bar.addEventListener('mouseenter', () => this.toggleMonitor());
    bar.addEventListener('click', (e) => {
      if (e.pointerType === 'mouse' || e.detail === 0) return;
      this.toggleMonitor();
    });
    bar.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.toggleMonitor();
    });
    ui.onCamSelect((id) => this.selectCam(id));
    document.getElementById('mute-call').addEventListener('click', () => this.phone.stop());
    document.querySelectorAll('[data-touch]').forEach((b) =>
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.action(b.dataset.touch);
      }),
    );
  }

  action(a) {
    const n = this.night;
    if (!n || this.state !== 'night') return;
    if (a === 'doorL') n.toggleDoor('L');
    if (a === 'doorR') n.toggleDoor('R');
    if (a === 'lightL') n.toggleLight('L');
    if (a === 'lightR') n.toggleLight('R');
  }

  togglePause(on) {
    if (on === undefined) on = this.state !== 'paused';
    if (on) {
      if (this.state !== 'night') return;
      this.state = 'paused';
      this.ui.show('pause', true);
      this.audio.ctx?.suspend();
      if ('speechSynthesis' in window) speechSynthesis.pause();
    } else if (this.state === 'paused') {
      this.state = 'night';
      this.ui.show('pause', false);
      this.ui.show('options', false);
      this.ui.show('hud', true);
      if (this.night?.monitorUp) this.ui.show('monitor', true);
      this.audio.ctx?.resume();
      if ('speechSynthesis' in window) speechSynthesis.resume();
    }
  }

  bindInput() {
    const inp = this.input;
    const keyCams = ['1A', '1B', '1C', '2A', '2B', '3', '4A', '4B', '5', '6', '7'];
    window.addEventListener('keydown', (e) => {
      inp.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'Escape') {
        if (this.state === 'night' || this.state === 'paused') this.togglePause();
        else if (this.state === 'gallery') this.enterMenu();
        return;
      }
      if (this.state !== 'night') return;
      const n = this.night;
      switch (e.code) {
        case 'KeyQ': this.action('doorL'); break;
        case 'KeyE': this.action('doorR'); break;
        case 'KeyZ': this.action('lightL'); break;
        case 'KeyC': this.action('lightR'); break;
        case 'KeyS':
        case 'Space':
          e.preventDefault();
          this.toggleMonitor();
          break;
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!n.monitorUp) break;
          const i = keyCams.indexOf(n.cam);
          this.selectCam(keyCams[(i + (e.code === 'ArrowUp' ? 1 : keyCams.length - 1)) % keyCams.length]);
          break;
        }
        default: {
          const m = e.code.match(/^Digit(\d)$/) || e.code.match(/^Numpad(\d)$/);
          if (m && n.monitorUp) {
            const d = +m[1];
            const id = keyCams[d === 0 ? 9 : d - 1];
            if (id) this.selectCam(id);
          } else if (e.code === 'Minus' && n.monitorUp) this.selectCam('7');
        }
      }
    });
    window.addEventListener('keyup', (e) => (inp.keys[e.code] = false));
    const cv = this.canvas;
    window.addEventListener('pointermove', (e) => {
      inp.mx = e.clientX / window.innerWidth;
      inp.my = e.clientY / window.innerHeight;
      inp.inside = true;
      inp.pointerType = e.pointerType;
      if (inp.dragging) {
        const dx = e.clientX - inp.lastX;
        const dy = e.clientY - inp.lastY;
        inp.lastX = e.clientX;
        inp.lastY = e.clientY;
        if (this.state === 'gallery') {
          this.gallery.yaw -= dx * 0.008;
          this.gallery.pitch = clamp(this.gallery.pitch + dy * 0.005, -0.3, 0.6);
          this.gallery.auto = false;
        } else if (this.state === 'night' && e.pointerType !== 'mouse') {
          this.yawTarget = clamp(this.yawTarget + dx * 0.006 * this.settings.sens, -1, 1);
        }
      }
    });
    document.addEventListener('pointerleave', () => (inp.inside = false));
    window.addEventListener('blur', () => {
      inp.inside = false;
      inp.keys = {};
    });
    cv.addEventListener('pointerdown', (e) => {
      this.audio.resume();
      inp.dragging = true;
      inp.lastX = e.clientX;
      inp.lastY = e.clientY;
      inp.downX = e.clientX;
      inp.downY = e.clientY;
    });
    window.addEventListener('pointerup', (e) => {
      const wasDrag = inp.dragging && Math.hypot(e.clientX - inp.downX, e.clientY - inp.downY) > 8;
      inp.dragging = false;
      if (e.target === cv && !wasDrag) this.onClick(e);
    });
    cv.addEventListener('wheel', (e) => {
      if (this.state === 'gallery') this.gallery.dist = clamp(this.gallery.dist + e.deltaY * 0.002, 1.4, 6);
    }, { passive: true });
  }

  onClick(e) {
    if (this.state !== 'night' || this.view !== 'office') return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.world.office.buttons, false)[0];
    if (hit) this.action(hit.object.userData.action);
  }

  onFootstep(a, pos, style) {
    if (this.state !== 'night' && this.state !== 'gallery') return;
    const n = this.night;
    let muffled = false;
    if (n && pos.z > -8) {
      if (pos.x < -3.7 && n.state.doorL) muffled = true;
      if (pos.x > 3.7 && n.state.doorR) muffled = true;
    }
    this.audio.footstep(new THREE.Vector3(pos.x, 0.1, pos.z), style, muffled);
  }

  // ================================================================ bucle principal
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    const st = this.state;
    if (st !== 'paused') {
      this.time += dt;
      const t = this.time;
      switch (st) {
        case 'menu':
        case 'preload':
          this.updateMenu(dt);
          break;
        case 'gallery':
          this.updateGallery(dt);
          break;
        case 'intro':
          this.introT += dt;
          this.updateOfficeCam(dt);
          this.fx.fade = Math.max(0, 1 - Math.max(0, this.introT - 2.6) / 0.8);
          if (this.introT > 3.3) this.beginNight();
          break;
        case 'night':
          this.updateNight(dt);
          break;
        case 'jumpscare':
          this.updateJumpscare(dt);
          break;
        case 'gameover':
          this.fx.static = 0.75 + Math.sin(t * 3) * 0.08;
          this.fx.glitch = 0.4;
          break;
        case 'win':
          this.fx.fade = 1;
          break;
        default:
          break;
      }
      const officeState = this.night ? { ...this.night.state } : { doorL: false, doorR: false, lightL: false, lightR: false, power: true };
      this.world.office.update(dt, t, officeState);
      this.world.cove.update(dt, t);
      for (const c of Object.values(this.chars)) if (c.root.visible) c.update(dt, t);
      this.rig.update(t);
      const blink = Math.floor(t * 1.2) % 2 === 0;
      for (const id in this.world.camModels) this.world.camModels[id].led.emissiveIntensity = blink && this.rig.state.power ? 4 : 0.2;
      if (this.audio.ctx) {
        if (st === 'gallery' || st === 'menu') this.audio.setListener(this.camera.position, this.gallery.yaw);
        else this.audio.setListener(EYE, this.yaw);
      }
    }
    // Efectos de post-procesado
    const fx = this.fx;
    const u = this.post.u;
    let stat = fx.static;
    if (this.night && this.night.monitorUp) {
      stat = Math.max(stat, 0.12 + this.night.camStatic * 0.6);
      if (CAM_BY_ID[this.night.cam].audioOnly) stat = 0.35;
    }
    u.staticAmt.value = clamp(stat, 0, 1);
    u.glitch.value = fx.glitch;
    u.flash.value = fx.flash;
    u.fade.value = fx.fade;
    u.aberration.value = 0.0035 + fx.glitch * 0.004;
    fx.static = Math.max(0, fx.static - dt * 2.2);
    fx.glitch = Math.max(0, fx.glitch - dt * 1.5);
    fx.flash = Math.max(0, fx.flash - dt * 4);
    this.post.render(dt);
  }

  updateOfficeCam(dt) {
    const inp = this.input;
    const s = this.settings;
    let turn = 0;
    if (inp.keys.KeyA || inp.keys.ArrowLeft) turn += 1;
    if (inp.keys.KeyD || inp.keys.ArrowRight) turn -= 1;
    if (s.edge && inp.inside && inp.pointerType === 'mouse' && !(this.night && this.night.monitorUp)) {
      if (inp.mx < 0.3) turn += Math.pow((0.3 - inp.mx) / 0.3, 1.3);
      if (inp.mx > 0.7) turn -= Math.pow((inp.mx - 0.7) / 0.3, 1.3);
    }
    this.yawTarget = clamp(this.yawTarget + turn * 1.9 * s.sens * dt, -1.0, 1.0);
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 9);
    const t = this.time;
    this.camera.position.set(EYE.x + Math.sin(t * 0.7) * 0.006, EYE.y + Math.sin(t * 1.3) * 0.005, EYE.z);
    this.camera.rotation.set(-0.06 + Math.sin(t * 0.9) * 0.003, this.yaw, 0);
    this.setFovH(92);
  }

  updateSecCam() {
    const c = CAM_BY_ID[this.night.cam];
    const pos = new THREE.Vector3(...c.pos);
    const look = new THREE.Vector3(...c.look);
    const dir = look.clone().sub(pos).normalize();
    const t = this.time;
    const wave = clamp(Math.sin(t * 0.22 + c.pos[0]) * 1.5, -1, 1);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), wave * (c.pan || 0));
    pos.addScaledVector(dir, 0.18);
    this.camera.position.copy(pos);
    this.camera.lookAt(pos.clone().add(dir));
    const a = this.camera.aspect;
    const v = c.fov * clamp(1.6 / a, 1, 1.6);
    this.camera.fov = clamp(v, 30, 90);
    this.camera.updateProjectionMatrix();
  }

  updateNight(dt) {
    const n = this.night;
    n.update(dt);
    if (this.state !== 'night') {
      if (this.state === 'jumpscare') this.updateJumpscare(0);
      return;
    }
    this.phone.update(dt);
    if (this.monitorAnim) {
      this.monitorAnim.t -= dt;
      if (this.monitorAnim.t <= 0) {
        const up = this.monitorAnim.up;
        this.monitorAnim = null;
        if (up && this.state === 'night' && n.state.power) {
          n.setMonitor(true);
          this.setView('camera', n.cam);
          this.ui.show('monitor', true);
          this.ui.setCam(CAM_BY_ID[n.cam]);
          this.ui.tabletReset();
          this.fx.static = 0.8;
          this.audio.camBlip();
        }
      }
    }
    if (n.monitorUp) {
      this.updateSecCam();
      this.ui.setTimestamp(n);
    } else this.updateOfficeCam(dt);
    this.ui.setHUD(n);
    this.ui.setTouchState({ doorL: n.state.doorL, doorR: n.state.doorR, lightL: n.state.lightL, lightR: n.state.lightR });
    // Cursor sobre botones
    if (this.view === 'office' && this.input.pointerType === 'mouse') {
      const ndc = new THREE.Vector2(this.input.mx * 2 - 1, -this.input.my * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const over = this.raycaster.intersectObjects(this.world.office.buttons, false).length > 0;
      this.canvas.style.cursor = over ? 'pointer' : 'default';
    }
    if (n.powerOut && n.powerOut.phase === 'music') {
      const bear = this.chars.bear;
      const head = bear.j.head.getWorldPosition(new THREE.Vector3());
      this.rig.movePoint('faceLight', new THREE.Vector3(-3.3, 0.8, -0.9), head);
    }
  }

  updateJumpscare(dt) {
    const J = this.js;
    J.t += dt;
    const c = J.char;
    const k = Math.min(1, J.t / 0.14);
    this.yaw = J.yawFrom + (J.yawTo - J.yawFrom) * (1 - Math.pow(1 - k, 3));
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const lunge = Math.min(1, J.t / 0.2);
    const dist = 1.7 - (1.7 - 0.6) * (1 - Math.pow(1 - lunge, 2));
    const s = c.body.scale.x;
    if (J.headOff === null) {
      c.root.position.set(0, 0, 0);
      c.root.rotation.set(0, 0, 0);
      c.root.updateMatrixWorld(true);
      J.headOff = c.j.head.getWorldPosition(new THREE.Vector3()).y + 0.2 * s;
    }
    c.root.position.set(EYE.x + f.x * dist, EYE.y - J.headOff + 0.02, EYE.z + f.z * dist);
    c.heading = this.yaw;
    c.root.rotation.y = this.yaw;
    const shake = Math.max(0, 1 - J.t / 1.3);
    this.camera.position.copy(EYE);
    this.camera.rotation.set(-0.02 + (Math.random() - 0.5) * 0.05 * shake, this.yaw + (Math.random() - 0.5) * 0.06 * shake, (Math.random() - 0.5) * 0.04 * shake);
    this.setFovH(96);
    this.rig.movePoint('scare', new THREE.Vector3(EYE.x - f.z * 0.6, EYE.y + 0.9, EYE.z + f.x * 0.6));
    this.fx.glitch = 0.25 + J.t * 0.5;
    if (J.t > 1.05) this.fx.static = Math.min(1, (J.t - 1.05) * 3);
    if (J.t > 1.4) this.gameOver();
  }

  updateMenu(dt) {
    const M = this.menu;
    M.t += dt;
    const order = ['bear', 'bunny', 'chicken'];
    if (M.t > 6.5) {
      M.t = 0;
      M.idx = (M.idx + 1) % order.length;
      this.fx.static = 1;
      this.fx.glitch = 0.6;
      if (this.audio.ctx) this.audio.staticBurst(0.35, 0.08);
    }
    const c = this.chars[order[M.idx]];
    const head = c.j.head.getWorldPosition(new THREE.Vector3());
    head.y += 0.17 * c.body.scale.x;
    const t = this.time;
    const drift = M.t / 6.5;
    const off = new THREE.Vector3(0.35 * Math.sin(t * 0.13) + (M.idx - 1) * -0.2, -0.28 + drift * 0.08, 1.35 - drift * 0.25);
    this.camera.position.copy(head).add(off);
    this.camera.lookAt(head.x, head.y - 0.03, head.z);
    this.camera.fov = 38;
    this.camera.updateProjectionMatrix();
    this.rig.movePoint('menuKey', new THREE.Vector3(head.x + 0.9, head.y - 1.1, head.z + 1.8), head);
    for (const k of order) {
      const ch = this.chars[k];
      ch.twitch.rate = 0.5;
      if (k === order[M.idx] && M.t > 2.5) ch.lookAt(this.camera.position, 0.6);
      else ch.lookAt(null);
    }
    if (Math.random() < dt * 0.25) this.fx.glitch = 0.5;
  }

  updateGallery(dt) {
    const G = this.gallery;
    if (G.auto) G.yaw += dt * 0.25;
    const c = this.chars[KINDS[G.idx]];
    const head = c.j.head.getWorldPosition(new THREE.Vector3());
    const zoom = clamp((4 - G.dist) / 2.4, 0, 1);
    const center = new THREE.Vector3(0, 2.12 + (head.y + 0.1 - 2.12) * zoom, -33.6 + (head.z - -33.6) * zoom);
    const d = G.dist;
    this.camera.position.set(center.x + Math.sin(G.yaw) * Math.cos(G.pitch) * d, center.y + Math.sin(G.pitch) * d, center.z + Math.cos(G.yaw) * Math.cos(G.pitch) * d);
    this.camera.lookAt(center);
    this.setFovH(70);
    if (G.mode === 'stare' || G.mode === 'idle') c.lookAt(this.camera.position, G.mode === 'stare' ? 1.2 : 0.5);
  }
}

const game = new Game();
window.__game = game;
const start = () =>
  game.init().catch((err) => {
    console.error(err);
    const t = document.getElementById('load-text');
    if (t) t.textContent = 'Error al iniciar: ' + err.message;
  });
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start();

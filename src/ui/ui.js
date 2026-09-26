// Capa de interfaz HTML: pantallas, HUD, monitor de cámaras con mapa SVG y subtítulos.
import { CAMS, ROOMS, STAGE } from '../world/layout.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'menu', 'paper', 'options', 'custom', 'gallery', 'intro', 'hud', 'monitor', 'win', 'gameover', 'pause'];

export class UI {
  constructor() {
    this.cache = {};
    this.buildMap();
  }

  only(...names) {
    for (const s of SCREENS) $(s).classList.toggle('active', names.includes(s));
  }

  show(name, on = true) {
    $(name).classList.toggle('active', on);
  }

  isShown(name) {
    return $(name).classList.contains('active');
  }

  setText(id, text) {
    if (this.cache[id] === text) return;
    this.cache[id] = text;
    $(id).innerHTML = text;
  }

  // ------------------------------------------------ carga
  setLoading(p, text) {
    $('load-fill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('load-text').textContent = text;
  }

  loadingDone(onStart) {
    $('load-text').textContent = 'Listo.';
    const b = $('load-start');
    b.classList.remove('hidden');
    const go = () => {
      b.removeEventListener('click', go);
      onStart();
    };
    b.addEventListener('click', go);
  }

  // ------------------------------------------------ HUD
  setHUD(night) {
    const hour = night.hour === 0 ? 12 : night.hour;
    this.setText('hud-time', `${hour} <small>AM</small>`);
    this.setText('hud-night', night.custom ? 'Personalizada' : `Noche ${night.num}`);
    const p = Math.max(0, Math.ceil(night.power));
    this.setText('hud-power', String(p));
    const low = p <= 15;
    if (this.cache.low !== low) {
      this.cache.low = low;
      document.querySelector('.hud-bl').classList.toggle('power-low', low);
    }
    const u = night.usage();
    if (this.cache.usage !== u) {
      this.cache.usage = u;
      let html = '';
      for (let i = 0; i < u; i++) html += `<i class="${i >= 3 ? 'r' : i >= 2 ? 'y' : ''}"></i>`;
      $('hud-usage').innerHTML = html;
    }
  }

  setTouchState(state) {
    document.querySelectorAll('#touch-controls button').forEach((b) => {
      const k = b.dataset.touch;
      b.classList.toggle('on', !!state[k]);
    });
  }

  showMute(on) {
    $('mute-call').classList.toggle('hidden', !on);
  }

  subtitle(html) {
    $('subtitles').innerHTML = html || '';
  }

  // ------------------------------------------------ monitor
  buildMap() {
    const x0 = -17.5;
    const z0 = -38;
    const s = 8.2;
    const W = 35 * s;
    const H = 41.5 * s;
    const P = (x, z) => [(x - x0) * s, (z - z0) * s];
    let svg = `<svg width="${W}" height="${H}" viewBox="-4 -4 ${W + 8} ${H + 8}">`;
    for (const [key, r] of Object.entries(ROOMS)) {
      const [ax, ay] = P(r.x0, r.z0);
      const [bx, by] = P(r.x1, r.z1);
      svg += `<rect class="room" x="${ax}" y="${ay}" width="${bx - ax}" height="${by - ay}"/>`;
      if (key === 'office') svg += `<text class="you" x="${(ax + bx) / 2 - 8}" y="${(ay + by) / 2 + 5}">TÚ</text>`;
    }
    const [sx, sy] = P(STAGE.x0, STAGE.z0);
    const [sx2, sy2] = P(STAGE.x1, STAGE.z1);
    svg += `<rect class="room" x="${sx}" y="${sy}" width="${sx2 - sx}" height="${sy2 - sy}" style="stroke-dasharray:4 3"/>`;
    for (const c of CAMS) {
      const [cx, cy] = P(c.map[0], c.map[1]);
      svg += `<g class="cam-btn" data-cam="${c.id}" transform="translate(${cx - 22},${cy - 12})"><rect width="44" height="24" rx="2"/><text x="22" y="17" text-anchor="middle">${c.id}</text></g>`;
    }
    svg += '</svg>';
    $('cam-map').innerHTML = svg;
  }

  onCamSelect(fn) {
    $('cam-map').addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.cam-btn');
      if (g) {
        e.stopPropagation();
        fn(g.dataset.cam);
      }
    });
  }

  setCam(cam) {
    document.querySelectorAll('#cam-map .cam-btn').forEach((g) => g.classList.toggle('active', g.dataset.cam === cam.id));
    this.setText('cam-id', `CAM ${cam.id}`);
    this.setText('cam-name', cam.name);
  }

  setTimestamp(night) {
    const totalMin = Math.floor((night.t / night.hourLen) * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    const h12 = hh === 0 ? 12 : hh;
    this.setText('cam-timestamp', `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} AM &nbsp; NOCHE ${night.custom ? '7' : night.num}`);
  }

  tablet(up) {
    const t = $('tablet');
    t.classList.remove('up', 'down');
    void t.offsetWidth;
    t.classList.add(up ? 'up' : 'down');
  }

  tabletReset() {
    const t = $('tablet');
    t.classList.remove('up');
    t.classList.add('down');
  }

  // ------------------------------------------------ pantallas especiales
  intro(night, custom) {
    $('intro-time').textContent = '12:00 AM';
    $('intro-night').textContent = custom ? 'Noche personalizada' : `Noche ${night}`;
    const el = document.querySelector('.intro-text');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  win(msg) {
    const clock = document.querySelector('.win-clock');
    clock.classList.remove('go');
    $('win-msg').textContent = '';
    $('win-continue').classList.add('hidden');
    setTimeout(() => clock.classList.add('go'), 900);
    setTimeout(() => ($('win-msg').textContent = msg), 3400);
  }

  winContinue(fn) {
    const b = $('win-continue');
    b.classList.remove('hidden');
    b.onclick = fn;
  }

  gameover(msg) {
    $('go-msg').textContent = msg;
  }

  fade(on) {
    $('fade').classList.toggle('on', on);
  }

  menuState(save) {
    $('btn-continue').disabled = save.night <= 1;
    $('continue-night').textContent = save.night > 1 ? `Noche ${Math.min(save.night, 5)}` : '';
    $('btn-night6').disabled = !save.beat5;
    $('btn-custom').disabled = !save.beat5;
    const stars = (save.beat5 ? 1 : 0) + (save.beat6 ? 1 : 0) + (save.beatMax ? 1 : 0);
    $('menu-stars').textContent = '★'.repeat(stars);
    $('menu-stars').title = stars ? `${stars} de 3 estrellas` : '';
  }

  menuCam(id, label, time) {
    this.setText('menu-cam-id', id);
    this.setText('menu-cam-label', label);
    this.setText('menu-cam-time', time);
  }

  gallery(name, desc) {
    $('gallery-name').textContent = name;
    $('gallery-desc').textContent = desc;
  }

  galleryAnim(mode) {
    document.querySelectorAll('.gallery-bottom button').forEach((b) => b.classList.toggle('on', b.dataset.anim === mode));
  }
}

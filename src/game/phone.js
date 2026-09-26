// Llamadas telefónicas de cada noche: subtítulos + voz sintetizada opcional (Web Speech API).

const CALLS = {
  1: [
    '¿Hola? ¿Hola, hola? Bueno... si estás oyendo esto, conseguiste el trabajo. Bienvenido a la Pizzería Bruno\'s.',
    'Te dejo este mensaje para ayudarte en tu primera noche. Yo trabajé en esa misma oficina antes que tú. Ahora hago el turno de día... casi siempre.',
    'Lo primero: los animatrónicos. Bruno, Bastián, Chiqui y Rufo. De noche los dejan en modo libre porque si se quedan quietos demasiado tiempo, sus servos se traban.',
    'Así que sí: caminan. Deambulan por el local. Es normal. Más o menos.',
    'En el monitor tienes las cámaras. Úsalas. Si alguno se acerca a tu oficina, tienes dos puertas de seguridad y una luz en cada pasillo para mirar quién hay.',
    'Pero ojo: la energía es limitada. Cada puerta cerrada, cada luz encendida, cada segundo mirando cámaras... gasta. Si se acaba antes de las seis... bueno. Que no se acabe.',
    'Y una cosa más: a estas horas no te van a reconocer como persona. Te verán como un endoesqueleto sin traje... y van a querer ponerte uno. No es agradable.',
    'En fin. Mira las cámaras, cierra las puertas si hace falta y ahorra energía. Buenas noches.',
  ],
  2: [
    '¡Hola, hola! Si estás oyendo esto, llegaste a la segunda noche. ¡Enhorabuena!',
    'Esta noche estarán más activos. Bastián y Chiqui empiezan a moverse antes, así que revisa los pasillos y las luces de las puertas.',
    'Y ahora te hablo de Rufo, el zorro de la Cueva Pirata. Está fuera de servicio, pero es... especial. Se pone nervioso si nadie lo mira.',
    'Échale un ojo en la cámara de la cueva de vez en cuando. Si ves que el telón se abre... o que no está... cierra la puerta izquierda. Rápido.',
    'Si lo ves corriendo por el pasillo oeste, no esperes a ver qué pasa. Bueno, te dejo. ¡Suerte!',
  ],
  3: [
    'Hola. Tercera noche. Lo estás haciendo mejor que la mayoría, en serio.',
    'Quería avisarte de Bruno. El oso casi nunca baja del escenario... hasta que los otros se han ido.',
    'Cuando se mueve, lo hace a oscuras y evita las cámaras. Si lo estás mirando, no avanza. Pero siempre acaba llegando por el ala este.',
    'Si oyes una risa grave... no es tu imaginación. Revisa la esquina este y la puerta derecha. Ah, y no gastes toda la energía mirando cámaras.',
  ],
  4: [
    'Hola... ¿hola? Oye... ojalá no estés pasando por lo que yo estoy pasando ahora mismo.',
    'Escucha, quizá mañana... podrías revisar dentro de esos trajes del escenario. Yo... siempre quise hacerlo. Y ahora creo que ya es tarde.',
    '¿Oyes eso? Llevan un buen rato golpeando la puerta. Creo que... creo que no voy a...',
    { sfx: 'bang', text: '[golpes metálicos]' },
    { sfx: 'music', text: '[suena una caja de música]' },
    { sfx: 'scream', text: '[un chirrido metálico... y silencio]' },
  ],
  5: [
    { voice: 'deep', text: 'EL... ESTÁ... DENTRO.' },
    { voice: 'deep', text: 'NO... ESTÁS... SOLO... EN LA OFICINA.' },
    { voice: 'deep', text: 'SIGUEN... AQUÍ. TODOS... SIGUEN... AQUÍ.' },
  ],
};

export class PhoneCall {
  constructor(ui, audio, settings) {
    this.ui = ui;
    this.audio = audio;
    this.settings = settings;
    this.lines = null;
    this.active = false;
  }

  start(night) {
    this.stop();
    const lines = CALLS[night];
    if (!lines) return;
    this.lines = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
    this.i = -1;
    this.t = 0;
    this.wait = 2.2;
    this.active = true;
    this.audio.phoneRing(1);
    this.ui.showMute(true);
  }

  next() {
    this.i++;
    if (!this.lines || this.i >= this.lines.length) {
      this.stop();
      return;
    }
    const line = this.lines[this.i];
    const words = line.text.split(/\s+/).length;
    this.wait = Math.max(2, words / 2.7 + 0.8);
    this.ui.subtitle(line.sfx ? `<i>${line.text}</i>` : `<span class="who">Teléfono:</span> ${line.text}`);
    if (line.sfx === 'bang') this.audio.bang({ x: 0, y: 1, z: -6 });
    if (line.sfx === 'music') {
      const mb = this.audio.musicBox({ x: 0, y: 1, z: -6 });
      setTimeout(() => mb.stop(), 3500);
      this.wait = 4;
    }
    if (line.sfx === 'scream') {
      this.audio.osc({ type: 'sawtooth', freq: 300, freqEnd: 900, dur: 0.6, gain: 0.08 });
      this.audio.staticBurst(1.2, 0.15);
      this.wait = 2.5;
    }
    if (!line.sfx && this.settings.voice && 'speechSynthesis' in window) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(line.text);
        u.lang = 'es-ES';
        const voices = speechSynthesis.getVoices();
        const v = voices.find((x) => x.lang && x.lang.startsWith('es'));
        if (v) u.voice = v;
        u.rate = line.voice === 'deep' ? 0.6 : 1.02;
        u.pitch = line.voice === 'deep' ? 0.1 : 0.85;
        u.volume = Math.min(1, this.settings.volume * 1.1);
        this.speaking = true;
        u.onend = () => {
          this.speaking = false;
          this.wait = Math.min(this.wait, 0.35);
          this.t = 0;
        };
        speechSynthesis.speak(u);
        this.wait = this.wait * 2.2;
      } catch (e) {
        this.speaking = false;
      }
    }
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.t >= this.wait) {
      this.t = 0;
      this.next();
    }
  }

  stop() {
    this.active = false;
    this.lines = null;
    this.speaking = false;
    if ('speechSynthesis' in window) {
      try {
        speechSynthesis.cancel();
      } catch (e) {
        /* sin voz */
      }
    }
    this.ui.subtitle('');
    this.ui.showMute(false);
  }
}

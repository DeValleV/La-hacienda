// Sonidos de interfaz (Kenney "Interface Sounds", CC0). Se decodifican con Web Audio
// para tener baja latencia en tablets y funcionar offline sin depender de peticiones Range.
const SOUND_FILES = {
  tap: 'click_002',
  nav: 'tick_001',
  add: 'select_002',
  remove: 'back_001',
  toggle: 'toggle_001',
  open: 'open_001',
  close: 'close_001',
  success: 'confirmation_001',
  major: 'confirmation_003',
  error: 'error_004',
  warn: 'question_001',
};

// Reglas de clic en orden de prioridad. 'none' = el sonido lo dará el resultado de la acción.
const CLICK_RULES = [
  ['[data-sound]', (el) => el.dataset.sound],
  ['[data-add]', () => 'add'],
  ['[data-change]', (el) => (Number(el.dataset.delta) < 0 ? 'remove' : 'add')],
  ['.cart-item-remove, #clear-cart', () => 'remove'],
  ['[role="switch"]', () => 'toggle'],
  // Entrar a Ventas suena; salir hacia otras pantallas, no.
  ['[data-view]', (el) => (el.dataset.view === 'ventas' ? 'nav' : 'none')],
  ['[data-settings-tab]', () => 'none'],
  ['[data-category], #toggle-sidebar, #mobile-menu-backdrop', () => 'nav'],
  ['[data-dialog-close], [type="submit"], [data-checkout-type], #close-shift, #confirm-close-shift, #refund-submit, [data-refund-sale]', () => 'none'],
];

class SoundPlayer {
  constructor(basePath = 'sounds/') {
    this.basePath = basePath;
    this.buffers = {};
    this.context = null;
    this.loading = null;
    this.lastPlayed = {};
    this.enabled = this.read('sound-enabled', '1') !== '0';
    const volume = Number(this.read('sound-volume', '0.4'));
    this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.4;
  }

  read(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }

  write(key, value) {
    try { localStorage.setItem(key, value); } catch { /* sin almacenamiento: se usa el valor de la sesión */ }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.write('sound-enabled', this.enabled ? '1' : '0');
  }

  // Debe llamarse dentro de un gesto del usuario (requisito de iOS/Safari).
  unlock() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.context) this.context = new AudioContextClass();
      if (this.context.state === 'suspended') this.context.resume();
      if (!this.loading) this.loading = this.preload();
    } catch { /* el sonido es opcional */ }
  }

  preload() {
    return Promise.all(Object.entries(SOUND_FILES).map(async ([name, file]) => {
      try {
        const response = await fetch(`${this.basePath}${file}.wav`);
        if (!response.ok) return;
        const data = await response.arrayBuffer();
        this.buffers[name] = await new Promise((resolve, reject) => this.context.decodeAudioData(data, resolve, reject));
      } catch { /* si un archivo falla, ese sonido queda en silencio */ }
    }));
  }

  // El sonido solo aplica en la pantalla de Ventas (con la sesión iniciada).
  isSalesScreenActive() {
    return document.getElementById('app-shell')?.hidden === false
      && document.getElementById('ventas')?.classList.contains('active') === true;
  }

  play(name) {
    if (!this.enabled || !name || name === 'none' || !this.context || !this.isSalesScreenActive()) return;
    const buffer = this.buffers[name];
    if (!buffer) return;
    const now = performance.now();
    if (now - (this.lastPlayed[name] || 0) < 60) return;
    this.lastPlayed[name] = now;
    try {
      if (this.context.state === 'suspended') this.context.resume();
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      gain.gain.value = this.volume;
      source.buffer = buffer;
      source.connect(gain).connect(this.context.destination);
      source.start();
    } catch { /* ignorar */ }
  }

  soundForClick(target) {
    const el = target.closest?.('button, [data-add], [data-sound]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return 'none';
    for (const [selector, resolve] of CLICK_RULES) {
      if (el.matches(selector)) return resolve(el);
    }
    return 'tap';
  }

  bind() {
    // Captura: suena aunque otro manejador detenga la propagación.
    document.addEventListener('pointerdown', () => this.unlock(), { capture: true });
    document.addEventListener('keydown', () => this.unlock(), { capture: true });
    document.addEventListener('click', (event) => {
      this.unlock();
      const name = this.soundForClick(event.target);
      // Tras el manejador del clic, para evaluar la pantalla ya actualizada.
      setTimeout(() => this.play(name), 0);
    }, true);

    // Diálogos: abrir/cerrar en un solo punto, sin tocar cada vista.
    const showModal = HTMLDialogElement.prototype.showModal;
    const player = this;
    HTMLDialogElement.prototype.showModal = function patchedShowModal(...args) {
      player.play(this.dataset.openSound || 'open');
      return showModal.apply(this, args);
    };
    // 'cancel' = Escape; 'close' con returnValue 'cancel' = botones Cancelar/×/backdrop.
    // Los cierres tras guardar o confirmar los cubre el sonido de éxito.
    document.addEventListener('cancel', (event) => {
      if (event.target instanceof HTMLDialogElement) this.play('close');
    }, true);
    document.addEventListener('close', (event) => {
      if (event.target instanceof HTMLDialogElement && event.target.returnValue === 'cancel') this.play('close');
    }, true);
  }
}

window.soundPlayer = new SoundPlayer();
window.soundPlayer.bind();

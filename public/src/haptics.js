// Vibración en móviles (Vibration API; no existe en iOS). Siempre falla en silencio.
const haptics = {
  vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* opcional */ }
  },
  success() { this.vibrate(40); },
  error() { this.vibrate(400); },
  tick() { this.vibrate(15); },
};

// Los navegadores móviles no exponen el evento de "deslizar para recargar", así que se
// detecta el gesto: arrastre hacia abajo desde el tope de la página y se vibra al cruzar el umbral.
(function bindPullToRefreshHaptic() {
  const THRESHOLD = 90;
  let startY = null;
  let fired = false;

  const isScrolledInside = (node) => {
    for (let el = node; el && el !== document.body; el = el.parentElement) {
      if (el.scrollTop > 0) return true;
    }
    return false;
  };

  document.addEventListener('touchstart', (event) => {
    const atTop = (document.scrollingElement?.scrollTop || 0) <= 0;
    const blocked = event.touches.length !== 1 || document.querySelector('dialog[open]') || isScrolledInside(event.target);
    startY = atTop && !blocked ? event.touches[0].clientY : null;
    fired = false;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (startY === null || fired) return;
    if (event.touches[0].clientY - startY >= THRESHOLD) {
      fired = true;
      haptics.tick();
    }
  }, { passive: true });

  const reset = () => { startY = null; };
  document.addEventListener('touchend', reset, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
})();

window.haptics = haptics;

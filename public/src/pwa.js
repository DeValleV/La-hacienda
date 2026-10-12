(function registerPwa() {
  if (!('serviceWorker' in navigator)) return;

  let registration;
  let refreshing = false;
  const updateNotice = document.getElementById('update-available');
  const applyUpdate = document.getElementById('apply-update');

  function showUpdate() {
    updateNotice.hidden = false;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('/sw.js').then((nextRegistration) => {
    registration = nextRegistration;
    if (registration.waiting) showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
      });
    });
  }).catch(() => {
    // The point of sale continues as a regular web app when a browser blocks Service Workers.
  });

  applyUpdate.addEventListener('click', () => {
    if (registration?.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}());

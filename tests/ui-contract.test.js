import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('public/index.html', root), 'utf8');
const scripts = [
  'public/src/app.js',
  'public/src/sound.js',
  'public/src/offline.js',
  'public/src/pwa.js',
  'public/src/views/InventoryView.js',
  'public/src/views/SalesView.js',
  'public/src/views/ShiftSummaryView.js',
  'public/src/views/HistoryView.js',
  'public/src/views/SettingsView.js',
].map((path) => readFileSync(new URL(path, root), 'utf8')).join('\n');

test('todos los IDs usados por las vistas existen y no están duplicados', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicateIds, []);
  const knownIds = new Set(ids);
  const referencedIds = [...scripts.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]);
  const missingIds = [...new Set(referencedIds.filter((id) => !knownIds.has(id)))];
  assert.deepEqual(missingIds, []);
});

test('el historial se presenta sin controles de edición', () => {
  const history = html.match(/<section id="historial"[\s\S]*?<section id="configuracion"/)?.[0] || '';
  assert.notEqual(history, '');
  assert.match(history, /id="history-date-picker"/);
  assert.doesNotMatch(history, /<(?:input|select|textarea)\b/i);
  assert.doesNotMatch(scripts, /changeSaleType|changeQuantity\(saleId|deleteSale\(/);
});

test('el calendario del historial sólo ofrece días registrados y agrupa por turno', () => {
  assert.match(html, /id="history-calendar-dialog"/);
  assert.match(scripts, /button\.disabled = !availableDates\.has\(date\)/);
  assert.match(scripts, /<details class="panel history-shift\$\{active \? ' active-shift' : ''\}" open>/);
});

test('los diálogos pueden cerrarse sin enviar formularios y la reposición rápida existe', () => {
  assert.match(html, /id="bulk-restock-dialog"/);
  assert.match(html, /id="bulk-restock"/);
  assert.doesNotMatch(html, /<button(?:\s[^>]*)?\svalue="cancel"/);
  assert.match(scripts, /data-dialog-close/);
});

test('la aplicación declara los recursos requeridos para la instalación PWA', () => {
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /id="offline-screen"/);
  assert.match(html, /id="slow-connection"/);
  assert.match(html, /id="activate-offline-mode"/);
  assert.match(scripts, /activate-offline-mode-sidebar/);
  assert.match(scripts, /class OfflineStore/);
  assert.match(scripts, /async remove\(id\)/);
  assert.match(scripts, /pendingSync: true/);
  assert.match(scripts, /restorePendingOfflineSales/);
  assert.match(scripts, /restorePendingOfflineShift/);
  assert.match(scripts, /const canManageInventory = \['administrador', 'encargado'\]/);
  assert.match(scripts, /const canCloseShift = true/);
  assert.match(scripts, /operations\.slice\(index, index \+ 100\)/);
  assert.match(html, /id="update-available"/);
  assert.match(html, /Instalar aplicación en esta tablet/);
  assert.match(scripts, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.doesNotMatch(scripts, /navigator\.onLine/);
  assert.match(html, /id="connection-indicator"/);
  assert.match(html, /id="offline-mode-label"/);
  assert.match(html, /data-app-version/);
  assert.match(scripts, /APP_RELEASE_VERSION/);
  assert.match(readFileSync(new URL('public/sw.js', root), 'utf8'), /src\/release\.js/);
  assert.match(readFileSync(new URL('public/src/styles.css', root), 'utf8'), /\.connection-indicator\.is-offline/);
});

test('los sonidos de la interfaz existen y están en el precache del service worker', () => {
  const soundSource = readFileSync(new URL('public/src/sound.js', root), 'utf8');
  const serviceWorker = readFileSync(new URL('public/sw.js', root), 'utf8');
  const files = [...soundSource.matchAll(/:\s*'([a-z]+_\d{3})'/g)].map((match) => match[1]);
  assert.ok(files.length >= 10);
  for (const file of files) {
    assert.ok(existsSync(new URL(`public/sounds/${file}.wav`, root)), `${file}.wav no existe`);
    assert.match(serviceWorker, new RegExp(`/sounds/${file}\\.wav`));
  }
  assert.match(serviceWorker, /\/src\/sound\.js/);
  assert.match(serviceWorker, /\/src\/haptics\.js/);
  assert.match(html, /src="src\/haptics\.js"/);
  assert.match(html, /src="src\/sound\.js"/);
});

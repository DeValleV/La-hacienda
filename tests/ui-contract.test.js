import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('public/index.html', root), 'utf8');
const scripts = [
  'public/src/app.js',
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
  assert.doesNotMatch(history, /<(?:button|input|select|textarea)\b/i);
  assert.doesNotMatch(scripts, /changeSaleType|changeQuantity\(saleId|deleteSale\(/);
});

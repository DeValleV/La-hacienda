import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/src/excel.js', import.meta.url), 'utf8');

test('la exportación genera un libro XLSX descargable', () => {
  let downloadedFile = null;
  let generatedBlob = null;
  class CapturedBlob {
    constructor(parts, options) {
      this.bytes = Buffer.concat(parts.map((part) => Buffer.from(part)));
      this.type = options.type;
    }
  }
  const context = {
    Blob: CapturedBlob,
    TextEncoder,
    Uint8Array,
    Math,
    String,
    Array,
    Number,
    setTimeout: (callback) => callback(),
    URL: {
      createObjectURL(blob) { generatedBlob = blob; return 'blob:inventario'; },
      revokeObjectURL() {},
    },
    document: {
      createElement() {
        return {
          click() { downloadedFile = this.download; },
        };
      },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  context.downloadXlsx('inventario', [{
    name: 'Inventario',
    columns: [{ width: 30 }, { width: 14, type: 'currency' }],
    rows: [['Producto', 'Precio'], ['Agua', 12.5]],
    rowStyles: [null, 'success'],
  }]);

  assert.equal(downloadedFile, 'inventario.xlsx');
  assert.equal(generatedBlob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual([...generatedBlob.bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.match(generatedBlob.bytes.toString('utf8'), /xl\/workbook\.xml/);
  assert.match(generatedBlob.bytes.toString('utf8'), /xl\/styles\.xml/);
  assert.match(generatedBlob.bytes.toString('utf8'), /width="30"/);
  assert.match(generatedBlob.bytes.toString('utf8'), /<t xml:space="preserve">Agua<\/t>/);
  assert.match(generatedBlob.bytes.toString('utf8'), /FFE8F5ED/);
  assert.match(generatedBlob.bytes.toString('utf8'), /r="B2" s="8"/);
});

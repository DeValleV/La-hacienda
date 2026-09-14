/* Generador pequeño de archivos .xlsx sin dependencias externas. */
(() => {
  const encoder = new TextEncoder();
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
    return (value ^ 0xffffffff) >>> 0;
  }

  function writeUint16(target, offset, value) {
    target[offset] = value & 0xff;
    target[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeUint32(target, offset, value) {
    target[offset] = value & 0xff;
    target[offset + 1] = (value >>> 8) & 0xff;
    target[offset + 2] = (value >>> 16) & 0xff;
    target[offset + 3] = (value >>> 24) & 0xff;
  }

  function zip(files) {
    const entries = files.map(({ name, text }) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(text);
      return { nameBytes, data, crc: crc32(data) };
    });
    const localSize = entries.reduce((size, entry) => size + 30 + entry.nameBytes.length + entry.data.length, 0);
    const centralSize = entries.reduce((size, entry) => size + 46 + entry.nameBytes.length, 0);
    const output = new Uint8Array(localSize + centralSize + 22);
    let offset = 0;
    const offsets = [];

    entries.forEach((entry) => {
      offsets.push(offset);
      writeUint32(output, offset, 0x04034b50); offset += 4;
      writeUint16(output, offset, 20); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint32(output, offset, entry.crc); offset += 4;
      writeUint32(output, offset, entry.data.length); offset += 4;
      writeUint32(output, offset, entry.data.length); offset += 4;
      writeUint16(output, offset, entry.nameBytes.length); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      output.set(entry.nameBytes, offset); offset += entry.nameBytes.length;
      output.set(entry.data, offset); offset += entry.data.length;
    });

    const centralOffset = offset;
    entries.forEach((entry, index) => {
      writeUint32(output, offset, 0x02014b50); offset += 4;
      writeUint16(output, offset, 20); offset += 2;
      writeUint16(output, offset, 20); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint32(output, offset, entry.crc); offset += 4;
      writeUint32(output, offset, entry.data.length); offset += 4;
      writeUint32(output, offset, entry.data.length); offset += 4;
      writeUint16(output, offset, entry.nameBytes.length); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint16(output, offset, 0); offset += 2;
      writeUint32(output, offset, 0); offset += 4;
      writeUint32(output, offset, offsets[index]); offset += 4;
      output.set(entry.nameBytes, offset); offset += entry.nameBytes.length;
    });

    writeUint32(output, offset, 0x06054b50); offset += 4;
    writeUint16(output, offset, 0); offset += 2;
    writeUint16(output, offset, 0); offset += 2;
    writeUint16(output, offset, entries.length); offset += 2;
    writeUint16(output, offset, entries.length); offset += 2;
    writeUint32(output, offset, centralSize); offset += 4;
    writeUint32(output, offset, centralOffset); offset += 4;
    writeUint16(output, offset, 0);
    return output;
  }

  function xmlEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;',
    })[character]);
  }

  function columnName(index) {
    let name = '';
    let current = index;
    do {
      name = String.fromCharCode(65 + (current % 26)) + name;
      current = Math.floor(current / 26) - 1;
    } while (current >= 0);
    return name;
  }

  function sheetXml(rows, columns = []) {
    const data = rows.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
        const style = rowIndex === 0 ? ' s="1"' : columns[columnIndex]?.type === 'currency' && typeof value === 'number' ? ' s="2"' : '';
        if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"${style} t="n"><v>${value}</v></c>`;
        return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');
    const widths = columns.length ? `<cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width || 14}" customWidth="1"/>`).join('')}</cols>` : '';
    const range = rows.length && rows[0]?.length ? `A1:${columnName(rows[0].length - 1)}${rows.length}` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${widths}<sheetData>${data}</sheetData>${range ? `<autoFilter ref="${range}"/>` : ''}</worksheet>`;
  }

  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD95321"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';

  function workbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name || `Hoja ${index + 1}`)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
  }

  function downloadXlsx(filename, sheets) {
    const safeSheets = Array.isArray(sheets) && sheets.length ? sheets : [{ name: 'Datos', rows: [] }];
    const files = [
      { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safeSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: workbookXml(safeSheets) },
      { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', text: stylesXml },
      ...safeSheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: sheetXml(sheet.rows || [], sheet.columns || []) })),
    ];
    const blob = new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  window.downloadXlsx = downloadXlsx;
})();

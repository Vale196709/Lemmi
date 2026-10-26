/* Lemmi - scrittura di file Word (.docx) direttamente nel browser, senza librerie esterne.
 * Un .docx è un archivio ZIP di file XML: qui si scrive uno ZIP "senza compressione", valido per Word e LibreOffice.
 * Uso: LemmiDocx.crea({ intestazione:[...], titolo, paragrafi:[...], mv:{titolo,nome}, firme:[{titolo,nome},{...}] }) -> Blob */
(function (root) {
  'use strict';

  /* ---------- ZIP (sola archiviazione) ---------- */
  const TAV = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TAV[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  function zip(files) {
    const enc = new TextEncoder();
    const locali = [], centrali = [];
    const ora = new Date();
    const dosT = ((ora.getHours() << 11) | (ora.getMinutes() << 5) | (ora.getSeconds() >> 1)) & 0xFFFF;
    const dosD = (((ora.getFullYear() - 1980) << 9) | ((ora.getMonth() + 1) << 5) | ora.getDate()) & 0xFFFF;
    let offset = 0, dimCentrale = 0;
    files.forEach((f) => {
      const nome = enc.encode(f.nome), dati = typeof f.dati === 'string' ? enc.encode(f.dati) : f.dati, crc = crc32(dati);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
      loc.setUint16(10, dosT, true); loc.setUint16(12, dosD, true); loc.setUint32(14, crc, true);
      loc.setUint32(18, dati.length, true); loc.setUint32(22, dati.length, true); loc.setUint16(26, nome.length, true); loc.setUint16(28, 0, true);
      locali.push(new Uint8Array(loc.buffer), nome, dati);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, dosT, true); cen.setUint16(14, dosD, true); cen.setUint32(16, crc, true);
      cen.setUint32(20, dati.length, true); cen.setUint32(24, dati.length, true); cen.setUint16(28, nome.length, true);
      cen.setUint32(42, offset, true);
      centrali.push(new Uint8Array(cen.buffer), nome);
      offset += 30 + nome.length + dati.length;
      dimCentrale += 46 + nome.length;
    });
    const fine = new DataView(new ArrayBuffer(22));
    fine.setUint32(0, 0x06054b50, true); fine.setUint16(8, files.length, true); fine.setUint16(10, files.length, true);
    fine.setUint32(12, dimCentrale, true); fine.setUint32(16, offset, true);
    return new Blob([...locali, ...centrali, new Uint8Array(fine.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------- XML del documento ---------- */
  const xml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
  const run = (t, grassetto) => `<w:r><w:rPr>${FONT}${grassetto ? '<w:b/><w:bCs/>' : ''}</w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
  const par = (testo, o) => {
    o = o || {};
    const ppr = `<w:pPr><w:spacing w:before="0" w:after="${o.dopo === undefined ? 0 : o.dopo}" w:line="360" w:lineRule="auto"/>${o.rientro ? '<w:ind w:firstLine="708"/>' : ''}<w:jc w:val="${o.jc || 'both'}"/></w:pPr>`;
    return `<w:p>${ppr}${testo === '' ? '' : run(testo, o.b)}</w:p>`;
  };
  const cella = (righe) => `<w:tc><w:tcPr><w:tcW w:w="4513" w:type="dxa"/></w:tcPr>${righe.join('')}</w:tc>`;

  function documento(d) {
    const p = [];
    (d.intestazione || []).forEach((r) => p.push(par(r, { jc: 'center', b: true })));
    if (d.titolo) { p.push(par('', { jc: 'center' })); p.push(par(d.titolo, { jc: 'center', b: true })); p.push(par('', { jc: 'center' })); }
    (d.paragrafi || []).forEach((t) => p.push(par(t, { rientro: true, dopo: 120 })));
    p.push(par('', { jc: 'center' }));
    if (d.mv) { p.push(par(d.mv.titolo, { jc: 'center' })); p.push(par(d.mv.nome || '', { jc: 'center' })); p.push(par('', { jc: 'center' })); }
    if (d.firme && d.firme.length) {
      p.push(`<w:tbl><w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4513"/><w:gridCol w:w="4513"/></w:tblGrid><w:tr>${d.firme.map((f) => cella([par(f.titolo, { jc: 'center' }), par(f.nome || '', { jc: 'center' })])).join('')}</w:tr></w:tbl>`);
      p.push(par('', { jc: 'center' }));
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1440" w:bottom="1134" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  const TIPI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
  const REL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const REL_DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const STILI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="it-IT" w:eastAsia="it-IT" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normale"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';

  function crea(d) {
    return zip([
      { nome: '[Content_Types].xml', dati: TIPI },
      { nome: '_rels/.rels', dati: REL },
      { nome: 'word/_rels/document.xml.rels', dati: REL_DOC },
      { nome: 'word/styles.xml', dati: STILI },
      { nome: 'word/document.xml', dati: documento(d) },
    ]);
  }

  root.LemmiDocx = { crea, zip, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);

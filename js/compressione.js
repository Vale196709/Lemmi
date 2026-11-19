/* Lemmi - compressione ZIP di tutti i file caricati (tavole, modelli, documenti dei bussanti, Biblioteca).
 * In caricamento: il file si comprime nel browser e, se il risparmio è almeno del 5%, si salva lo ZIP (il percorso
 * nell'archivio finisce con ".zip"). In scaricamento: se il percorso finisce con ".zip" ma il nome originale no,
 * il file si decomprime da solo e chi lo apre riceve l'originale. I file caricati prima di questa funzione
 * restano com'erano e si scaricano come sempre. Nessuna modifica al database. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  // formati già compressi: lo ZIP non porterebbe risparmio
  const GIA_COMPRESSI = ['zip', '7z', 'rar', 'gz', 'bz2', 'xz', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'mp3', 'm4a', 'aac', 'ogg', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub'];
  const estensione = (nome) => { const m = /\.([A-Za-z0-9]+)$/.exec(nome || ''); return m ? m[1].toLowerCase() : ''; };
  const conLimite = (promessa, ms) => new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('compressione troppo lenta')), ms);
    promessa.then((x) => { clearTimeout(t); ok(x); }, (e) => { clearTimeout(t); ko(e); });
  });

  /* Restituisce { blob, zippato, tipo, dimOriginale }: "path" va completato con suffisso(path, zippato). */
  async function prepara(file) {
    const naturale = { blob: file, zippato: false, tipo: file.type || 'application/octet-stream', dimOriginale: file.size };
    if (GIA_COMPRESSI.includes(estensione(file.name)) || file.size < 2048) return naturale;
    try {
      const zip = await L.libreria('zip');
      zip.configure({ useWebWorkers: false });
      const w = new zip.ZipWriter(new zip.BlobWriter('application/zip'));
      const z = await conLimite((async () => { await w.add(file.name, new zip.BlobReader(file), { level: 9 }); return w.close(); })(), 30000 + (file.size / 1048576) * 4000);
      if (z.size <= file.size * 0.95) return { blob: z, zippato: true, tipo: 'application/zip', dimOriginale: file.size };
    } catch (e) { /* se la compressione non riesce si carica il file com'è */ }
    return naturale;
  }

  const suffisso = (path, zippato) => (zippato ? path + '.zip' : path);
  const eZippato = (path, nomeOriginale) => /\.zip$/i.test(path || '') && !/\.zip$/i.test(nomeOriginale || '');

  /* Scarica (o apre) un file dall'archivio; se è uno ZIP creato da Lemmi lo decomprime. Ritorna l'URL o fa il download. */
  async function ottieniBlob(bucket, path, nome, mime) {
    const u = await L.state.sb.storage.from(bucket).createSignedUrl(path, 120);
    if (u.error) throw u.error;
    const risp = await fetch(u.data.signedUrl);
    if (!risp.ok) throw new Error('Download non riuscito (' + risp.status + ').');
    let blob = await risp.blob();
    if (eZippato(path, nome)) {
      const zip = await L.libreria('zip');
      zip.configure({ useWebWorkers: false });
      const r = new zip.ZipReader(new zip.BlobReader(blob));
      try {
        const voci = await r.getEntries();
        if (!voci.length) throw new Error('L’archivio ZIP è vuoto.');
        blob = await voci[0].getData(new zip.BlobWriter(mime || 'application/octet-stream'));
      } finally { await r.close(); }
    } else if (mime && blob.type !== mime) blob = new Blob([blob], { type: mime });
    return blob;
  }

  async function scarica(bucket, path, nome, mime) {
    const blob = await ottieniBlob(bucket, path, nome, mime);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome || 'file'; a.rel = 'noopener noreferrer'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function apri(bucket, path, nome, mime, finestra) {
    const blob = await ottieniBlob(bucket, path, nome, mime);
    const url = URL.createObjectURL(blob);
    if (finestra) finestra.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60000);
  }

  L.zipFile = { prepara, suffisso, eZippato, scarica, apri };
})();

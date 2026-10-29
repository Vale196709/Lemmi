/* Lemmi - Calendario sul telefono: scarica un file .ics con le tornate dell'anno (e le scadenze delle pratiche, per chi
 * le vede). Aprendolo sul telefono, o in Google Calendar / Outlook / Apple Calendar, gli eventi si aggiungono con un
 * promemoria. Il file è una fotografia di oggi: se il calendario cambia, si scarica di nuovo. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L || !L.viste.calendario) return;
  const { state, $, esc, chk, toast, messaggioErrore } = L;

  const TIPI = { ordinaria: 'Tornata ordinaria', informale: 'Conferenza (web)', straordinaria: 'Tornata straordinaria', agape: 'Agape' };
  const GRADI = { apprendista: 'Apprendista', compagno: 'Compagno d’Arte', maestro: 'Maestro' };

  const txt = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function piega(riga) {                                     // righe di max 75 byte, come da standard
    const enc = new TextEncoder(); if (enc.encode(riga).length <= 75) return riga;
    const out = []; let cur = '';
    for (const ch of riga) {
      const lim = out.length ? 74 : 75;
      if (enc.encode(cur + ch).length > lim) { out.push(cur); cur = ch; } else cur += ch;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  const d8 = (iso) => iso.replace(/-/g, '');
  const hm = (t) => String(t).slice(0, 5).replace(':', '') + '00';
  const aggiungiGiorni = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const adesso = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  function crea(tornate, scadenze, anno) {
    const loggia = (state.loggia && state.loggia.nome) || 'Loggia';
    const r = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lemmi//Gestione di Loggia//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + txt(loggia + ' ' + anno), 'X-WR-TIMEZONE:Europe/Rome'];
    const stamp = adesso();
    tornate.filter((t) => t.stato !== 'annullata').forEach((t) => {
      const titolo = (TIPI[t.tipo] || t.tipo) + (t.grado ? ' di ' + (GRADI[t.grado] || t.grado) : '') + (t.solennita ? ' · ' + t.solennita : '');
      const desc = [t.ordine_del_giorno && 'Ordine del giorno:\n' + t.ordine_del_giorno, t.relatore && 'Relatore: ' + t.relatore, t.link_online && 'Collegamento: ' + t.link_online, t.note]
        .filter(Boolean).join('\n\n');
      r.push('BEGIN:VEVENT', 'UID:tornata-' + t.id + '@lemmi', 'DTSTAMP:' + stamp, 'SUMMARY:' + txt(titolo));
      if (t.ora) {
        const fine = String(Number(String(t.ora).slice(0, 2)) + 2).padStart(2, '0') + String(t.ora).slice(2, 5);
        r.push('DTSTART:' + d8(t.data) + 'T' + hm(t.ora));
        r.push(Number(fine.slice(0, 2)) < 24 ? 'DTEND:' + d8(t.data) + 'T' + hm(fine) : 'DURATION:PT2H');
      } else { r.push('DTSTART;VALUE=DATE:' + d8(t.data), 'DTEND;VALUE=DATE:' + d8(aggiungiGiorni(t.data, 1))); }
      if (t.luogo) r.push('LOCATION:' + txt(t.luogo));
      if (desc) r.push('DESCRIPTION:' + txt(desc));
      if (t.stato === 'programmata') r.push('STATUS:TENTATIVE');
      r.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + txt(titolo), 'TRIGGER:-PT24H', 'END:VALARM', 'END:VEVENT');
    });
    scadenze.forEach((s, i) => {
      r.push('BEGIN:VEVENT', 'UID:scadenza-' + s.pr.id + '-' + i + '-' + s.data + '@lemmi', 'DTSTAMP:' + stamp,
        'SUMMARY:' + txt('Scadenza: ' + s.l), 'DESCRIPTION:' + txt(s.pr.titolo),
        'DTSTART;VALUE=DATE:' + d8(s.data), 'DTEND;VALUE=DATE:' + d8(aggiungiGiorni(s.data, 1)),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + txt('Scadenza: ' + s.l), 'TRIGGER:-P2D', 'END:VALARM', 'END:VEVENT');
    });
    r.push('END:VCALENDAR');
    return r.map(piega).join('\r\n') + '\r\n';
  }

  const orig = L.viste.calendario;
  L.viste.calendario = async function (v, parti) {
    await orig.call(this, v, parti);
    const barra = $('.right.actions', v) || $('.page-head', v);
    if (!barra) return;
    const b = document.createElement('button');
    b.className = 'btn ghost'; b.type = 'button'; b.id = 'c-ics'; b.textContent = 'Calendario sul telefono (.ics)';
    b.title = 'Scarica le tornate dell’anno da aggiungere al calendario del telefono';
    barra.insertBefore(b, barra.firstChild);
    b.addEventListener('click', async () => {
      const anno = Number(($('#c-anno', v) || {}).value) || new Date().getFullYear();
      b.disabled = true;
      try {
        const tornate = chk(await state.sb.from('tornate').select('*').gte('data', anno + '-01-01').lte('data', anno + '-12-31').order('data').order('ora'));
        let scad = [];
        try { if (L.pratiche && L.pratiche.scadenze) scad = (await L.pratiche.scadenze()).filter((s) => s.data.slice(0, 4) === String(anno)); } catch (e) { scad = []; }
        const ics = crea(tornate, scad, anno);
        const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = 'Lemmi_calendario_' + anno + '.ics';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
        toast(tornate.filter((t) => t.stato !== 'annullata').length + ' tornate' + (scad.length ? ' e ' + scad.length + ' scadenze' : '') + ' nel file .ics', 'ok');
      } catch (e) { toast(messaggioErrore(e), 'bad'); }
      b.disabled = false;
    });
  };
  L.icsCalendario = { crea };
})();

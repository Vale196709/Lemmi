/* Lemmi - gestione di Loggia. Front-end statico + Supabase. */
(function () {
  'use strict';

  const cfg = window.LEMMI_CONFIG || {};
  const BUCKET = 'documenti-loggia';
  const MAX_FILE = 10 * 1024 * 1024;
  const RUOLI_ACCESSO = ['amministratore', 'venerabile', 'segretario', 'tesoriere'];
  const TUTTI = ['amministratore', 'venerabile', 'segretario', 'tesoriere'];
  const SOCI = ['amministratore', 'venerabile', 'segretario'];
  const ACCESSO_SEZ = { home: TUTTI, bussanti: SOCI, fratelli: SOCI, storia: SOCI, calendario: TUTTI, lavori: SOCI, elezioni: SOCI, piedilista: SOCI, pagamenti: TUTTI, template: SOCI, procedure: SOCI, loggia: TUTTI, utenti: ['amministratore'] };
  const ETICHETTA_RUOLO = { amministratore: 'Amministratore', venerabile: 'Maestro Venerabile', segretario: 'Segretario', tesoriere: 'Tesoriere' };

  const TIPI_DOMANDA = {
    iniziazione: 'Iniziazione',
    riammissione: 'Riammissione',
    cancellazione_pena: 'Riammissione (cancellazione pena)',
    regolarizzazione: 'Regolarizzazione',
    affiliazione_estero: 'Affiliazione dall’estero',
  };

  const DOCUMENTI = [
    { tipo: 'certificato_penale', nome: 'Certificato penale generale (casellario giudiziale)', obbl: true },
    { tipo: 'carichi_pendenti', nome: 'Certificato carichi pendenti – Procura di residenza', obbl: true },
    { tipo: 'carichi_pendenti_oriente', nome: 'Carichi pendenti – Procura dell’Oriente (se diverso dalla residenza)', obbl: false },
    { tipo: 'curriculum', nome: 'Curriculum vitae', obbl: true },
    { tipo: 'foto', nome: 'Fotografie formato tessera', obbl: true },
    { tipo: 'modulo_a1', nome: 'Modello A/1 firmato (scansione)', obbl: false },
    { tipo: 'modulo_c1', nome: 'Modello C/1 firmato (scansione)', obbl: false },
    { tipo: 'altro', nome: 'Altri documenti', obbl: false },
  ];

  const state = { sb: null, user: null, profilo: null, loggia: null, fratelli: null, templates: {} };

  /* ---------- utilità ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtData = (iso) => {
    if (!iso) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : esc(iso);
  };
  const isoToIt = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  };
  // gg/mm/aaaa -> aaaa-mm-gg ; vuoto -> null ; non valida -> 'ERR'
  const itToIso = (txt) => {
    const t = String(txt || '').trim();
    if (!t) return null;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
    if (!m) return 'ERR';
    const g = +m[1], me = +m[2], a = +m[3];
    const d = new Date(Date.UTC(a, me - 1, g));
    if (d.getUTCFullYear() !== a || d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g || a < 1900 || a > 2200) return 'ERR';
    return m[3] + '-' + m[2] + '-' + m[1];
  };
  const oggi = () => new Date().toISOString().slice(0, 10);
  const canEdit = () => ['amministratore', 'segretario'].includes(state.profilo && state.profilo.ruolo);
  const isAdmin = () => state.profilo && state.profilo.ruolo === 'amministratore';
  const chk = (res) => { if (res.error) throw res.error; return res.data; };
  const nomeFile = (n) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);

  const IC = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14.7c2.3.6 4 2.2 4 5.3"/></svg>',
    lavori: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    elezioni: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="12" width="16" height="8" rx="1.5"/><path d="M8 12V6l8-3v9M10 8h4"/></svg>',
    lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h0a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-5h6v5M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
    storia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5M9 7h6M9 11h6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
    euro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 6.5a6.5 6.5 0 100 11"/><path d="M4 10.5h9M4 13.5h9"/></svg>',
    procedure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="4.5" rx="1"/><rect x="3" y="16.5" width="6" height="4.5" rx="1"/><rect x="15" y="16.5" width="6" height="4.5" rx="1"/><path d="M12 7.5V12M6 16.5V12h12v4.5"/></svg>',
    template: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9h17M9 9v11.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z"/></svg>',
  };

  function toast(msg, tipo) {
    const el = document.createElement('div');
    el.className = 'toast ' + (tipo || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), tipo === 'bad' ? 7000 : 3800);
  }

  function messaggioErrore(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/row-level security|permission denied/i.test(m)) return 'Non hai i permessi per questa operazione.';
    if (/Invalid login/i.test(m)) return 'E-mail o password non corrette.';
    if (/violates foreign key/i.test(m)) return 'Operazione non consentita: ci sono dati collegati (per esempio versamenti).';
    if (/duplicate key/i.test(m)) return 'Esiste già un elemento uguale (stessa voce, Fratello, anno e rata).';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Connessione non riuscita. Controlla la rete e l’indirizzo di Supabase in js/config.js.';
    return m;
  }

  /* ---------- avvio ---------- */
  async function init() {
    window.addEventListener('hashchange', () => { if (state.user && state.profilo) route(); });
    const url = cfg.SUPABASE_URL || '';
    if (!url || url.includes('XXXX') || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.startsWith('INCOLLA')) return renderSetup();
    const recupero = /type=recovery/.test(location.hash);
    const erroreLink = /error_description=/.test(location.hash);
    state.sb = window.supabase.createClient(url, cfg.SUPABASE_ANON_KEY);
    state.sb.auth.onAuthStateChange((ev) => {
      if (ev === 'PASSWORD_RECOVERY') { state.recupero = true; renderNuovaPassword(); }
      if (ev === 'SIGNED_OUT') { state.user = null; state.profilo = null; state.fratelli = null; renderLogin(); }
    });
    const { data } = await state.sb.auth.getSession();
    if (recupero) {
      state.recupero = true;
      if (data && data.session) renderNuovaPassword(); else renderLogin('Il link di recupero non è valido o è scaduto: richiedine uno nuovo.');
      return;
    }
    if (erroreLink) {
      history.replaceState(null, '', location.pathname + location.search);
      renderLogin('Il link non è valido o è scaduto: richiedi un nuovo link di recupero.');
      return;
    }
    if (data && data.session) await avvia(data.session.user); else renderLogin();
  }

  async function avvia(user) {
    $('#app').innerHTML = '<div class="loading"><span class="spin"></span></div>';
    try {
      state.user = user;
      const { data: p, error } = await state.sb.from('profili').select('ruolo,nome_visualizzato').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      state.profilo = p;
      if (!p || !RUOLI_ACCESSO.includes(p.ruolo)) return renderNegato(p);
      const l = await state.sb.from('loggia').select('*').limit(1).maybeSingle();
      state.loggia = l.data || {};
      renderShell();
      route();
    } catch (e) {
      renderLogin(messaggioErrore(e));
    }
  }

  /* ---------- schermate di servizio ---------- */
  function logoSvg() {
    return '<svg viewBox="0 0 64 64" width="26" height="26"><path d="M22 14v32h22" fill="none" stroke="#c9a24b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function renderSetup() {
    $('#app').innerHTML = `<div class="login"><div class="login-card">
      <div class="logo-mark">${logoSvg()}</div><h1>Configurazione mancante</h1>
      <p>Apri il file <b>js/config.js</b> e inserisci l’indirizzo del progetto Supabase e la chiave <i>anon public</i>.</p>
      <div class="notice">Supabase → <b>Project Settings → API</b>: copia <code>Project URL</code> e <code>anon public</code>.</div>
    </div></div>`;
  }

  function renderLogin(errore) {
    $('#app').innerHTML = `<div class="login"><div class="login-card">
      <div class="logo-mark">${logoSvg()}</div>
      <h1>Lemmi</h1><p>Gestione di Loggia · accesso riservato</p>
      <form id="f-login" autocomplete="on">
        <div class="f"><label for="em">E-mail</label><input id="em" name="email" type="email" required autocomplete="username" autofocus></div>
        <div class="f"><label for="pw">Password</label><input id="pw" name="password" type="password" required autocomplete="current-password"></div>
        <div class="err" id="login-err">${esc(errore || '')}</div>
        <button class="btn gold" type="submit">Accedi</button>
        <a href="javascript:void(0)" id="l-forgot" style="text-align:center;font-size:.88rem">Password dimenticata?</a>
      </form></div></div>`;
    $('#l-forgot').addEventListener('click', () => renderRecupero());
    $('#f-login').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('button', ev.target); btn.disabled = true;
      const f = ev.target.elements;
      const { data, error } = await state.sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      btn.disabled = false;
      if (error) { $('#login-err').textContent = messaggioErrore(error); return; }
      await avvia(data.user);
    });
  }

  function renderRecupero(messaggio, ok) {
    $('#app').innerHTML = `<div class="login"><div class="login-card">
      <div class="logo-mark">${logoSvg()}</div><h1>Recupero password</h1><p>Ti invieremo un’e-mail con il link per sceglierne una nuova</p>
      <form id="f-rec"><div class="f"><label for="rc-em">E-mail</label><input id="rc-em" name="email" type="email" required autocomplete="username" autofocus></div>
        <div class="${ok ? 'notice' : 'err'}" id="rc-msg">${esc(messaggio || '')}</div>
        <button class="btn gold" type="submit">Invia il link</button>
        <a href="javascript:void(0)" id="rc-back" style="text-align:center;font-size:.88rem">Torna all’accesso</a></form></div></div>`;
    $('#rc-back').addEventListener('click', () => renderLogin());
    $('#f-rec').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('button', ev.target); btn.disabled = true;
      const email = ev.target.elements.email.value.trim();
      const { error } = await state.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      btn.disabled = false;
      if (error) { const m = $('#rc-msg'); m.className = 'err'; m.textContent = messaggioErrore(error); return; }
      renderRecupero('Se l’indirizzo è registrato, riceverai a breve un’e-mail con il link. Controlla anche la cartella dello spam.', true);
    });
  }

  function renderNuovaPassword(errore) {
    $('#app').innerHTML = `<div class="login"><div class="login-card">
      <div class="logo-mark">${logoSvg()}</div><h1>Nuova password</h1><p>Scegli la nuova password di accesso</p>
      <form id="f-np"><div class="f"><label for="np1">Nuova password (almeno 8 caratteri)</label><input id="np1" name="p1" type="password" required autocomplete="new-password" autofocus></div>
        <div class="f"><label for="np2">Ripeti la password</label><input id="np2" name="p2" type="password" required autocomplete="new-password"></div>
        <div class="err" id="np-err">${esc(errore || '')}</div>
        <button class="btn gold" type="submit">Salva la password</button></form></div></div>`;
    $('#f-np').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target.elements; const err = $('#np-err');
      if (f.p1.value.length < 8) { err.textContent = 'La password deve avere almeno 8 caratteri.'; return; }
      if (f.p1.value !== f.p2.value) { err.textContent = 'Le due password non coincidono.'; return; }
      const btn = $('button', ev.target); btn.disabled = true;
      const { data, error } = await state.sb.auth.updateUser({ password: f.p1.value });
      btn.disabled = false;
      if (error) { err.textContent = messaggioErrore(error); return; }
      state.recupero = false;
      history.replaceState(null, '', location.pathname + location.search);
      toast('Password aggiornata', 'ok');
      await avvia(data.user);
    });
  }

  function renderNegato(p) {
    $('#app').innerHTML = `<div class="login"><div class="login-card">
      <div class="logo-mark">${logoSvg()}</div><h1>Accesso non abilitato</h1>
      <p>${p ? 'Il ruolo “' + esc(ETICHETTA_RUOLO[p.ruolo] || p.ruolo) + '” non ha accesso a questa sezione.' : 'Il tuo utente non ha ancora un ruolo assegnato. Chiedi all’amministratore di abilitarti.'}</p>
      <button class="btn ghost" id="b-out">Esci</button></div></div>`;
    $('#b-out').onclick = () => state.sb.auth.signOut();
  }

  // Struttura del menu laterale. Le voci con "sub" sono gruppi: se hanno "sez" la voce principale
  // è una pagina (Fratelli), altrimenti è solo un contenitore che si apre e si chiude (Configurazione).
  const MENU = [
    { sez: 'home', href: '#/', t: 'Cruscotto', ic: IC.home },
    { sez: 'calendario', href: '#/calendario', t: 'Calendario', ic: IC.calendar },
    { sez: 'pagamenti', href: '#/pagamenti', t: 'Pagamenti', ic: IC.euro },
    { sez: 'fratelli', href: '#/fratelli', t: 'Fratelli', ic: IC.users, sub: [{ sez: 'storia', href: '#/storia', t: 'Storia', ic: IC.storia }, { sez: 'lavori', href: '#/lavori', t: 'Lavori e tavole', ic: IC.lavori }, { sez: 'elezioni', href: '#/elezioni', t: 'Elezioni cariche', ic: IC.elezioni }, { sez: 'piedilista', href: '#/piedilista', t: 'Piè di lista', ic: IC.lista }] },
    { sez: 'bussanti', href: '#/bussanti', t: 'Bussanti', ic: IC.user },
    { sez: 'procedure', href: '#/procedure', t: 'Procedure', ic: IC.procedure },
    { sez: 'template', href: '#/template', t: 'Template', ic: IC.template },
    { gruppo: 'config', t: 'Info di sistema', ic: IC.gear, sub: [{ sez: 'loggia', href: '#/loggia', t: 'Loggia', ic: IC.building }, { sez: 'utenti', href: '#/utenti', t: 'Utenti del sistema', ic: IC.shield }] },
  ];

  function menuHtml(p) {
    const puo = (sez) => ACCESSO_SEZ[sez].includes(p.ruolo);
    const link = (x, cls) => `<a href="${x.href}" data-nav="${x.sez}"${cls ? ` class="${cls}"` : ''}>${x.ic}<span>${esc(x.t)}</span></a>`;
    return MENU.map((x) => {
      if (!x.sub) return puo(x.sez) ? link(x) : '';
      const subs = x.sub.filter((s) => puo(s.sez));
      const conPagina = !!x.sez;
      const testa = conPagina
        ? (puo(x.sez) ? `<div class="nav-top">${link(x)}<button type="button" class="nav-tog" aria-expanded="false" aria-label="Apri o chiudi le sottovoci di ${esc(x.t)}"></button></div>` : '')
        : (subs.length ? `<button type="button" class="nav-head" aria-expanded="false">${x.ic}<span>${esc(x.t)}</span></button>` : '');
      if (!testa && !subs.length) return '';
      return `<div class="nav-group chiudibile" data-grp="${esc(x.sez || x.gruppo)}">${testa}<div class="nav-sub">${subs.map((s) => link(s, 'sub')).join('')}</div></div>`;
    }).join('');
  }

  function renderShell() {
    const p = state.profilo;
    $('#app').innerHTML = `<div class="shell">
      <aside class="side">
        <div class="brand"><div class="logo-mark">${logoSvg()}</div><div><b>Lemmi</b><small>${esc(state.loggia.nome || 'Gestione di Loggia')}</small></div></div>
        <nav class="nav">${menuHtml(p)}</nav>
        <div class="who"><b>${esc(p.nome_visualizzato || state.user.email)}</b><span>${esc(ETICHETTA_RUOLO[p.ruolo] || p.ruolo)}</span>
          <button class="btn ghost small" id="b-logout">Esci</button></div>
      </aside>
      <main id="view"></main></div>`;
    $('#b-logout').onclick = () => state.sb.auth.signOut();
    $$('.nav-head, .nav-tog').forEach((b) => b.addEventListener('click', () => {
      const g = b.closest('.nav-group');
      const aperto = g.classList.toggle('open');
      b.setAttribute('aria-expanded', aperto ? 'true' : 'false');
    }));
  }

  /* ---------- router ---------- */
  // Una sola pagina alla volta: se si cambia scheda mentre un'altra sta caricando,
  // vale solo l'ultima richiesta (evita errori e sovrapposizioni).
  let ultimaRichiesta = 0;
  let codaRoute = Promise.resolve();
  function route() {
    const mia = ++ultimaRichiesta;
    codaRoute = codaRoute.then(() => eseguiRoute(mia));
    return codaRoute;
  }

  async function eseguiRoute(mia) {
    if (mia !== ultimaRichiesta) return;
    const parti = (location.hash.replace(/^#\/?/, '') || '').split('/');
    const sez = parti[0] || 'home';
    $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === sez));
    $$('.nav-group.chiudibile').forEach((g) => {
      if (g.querySelector('a.active')) { g.classList.add('open'); const h = $('.nav-head, .nav-tog', g); if (h) h.setAttribute('aria-expanded', 'true'); }
    });
    if (sez === 'home' && !ACCESSO_SEZ.home.includes(state.profilo.ruolo)) { location.hash = '#/pagamenti'; return; }
    const v = $('#view');
    if (ACCESSO_SEZ[sez] && !ACCESSO_SEZ[sez].includes(state.profilo.ruolo)) {
      v.innerHTML = '<div class="notice bad">Il tuo ruolo non ha accesso a questa sezione.</div>'; return;
    }
    v.innerHTML = '<div class="loading"><span class="spin"></span></div>';
    window.scrollTo(0, 0);
    try {
      if (API.viste[sez]) await API.viste[sez](v, parti);
      else if (sez === 'home') await vistaCruscotto(v);
      else if (sez === 'bussanti' && parti[1] === 'nuovo') await vistaForm(v, null);
      else if (sez === 'bussanti' && parti[1] && parti[2] === 'modifica') await vistaForm(v, parti[1]);
      else if (sez === 'bussanti' && parti[1]) await vistaDettaglio(v, parti[1]);
      else if (sez === 'bussanti') await vistaBussanti(v);
      else if (sez === 'fratelli') await vistaFratelli(v);
      else if (sez === 'loggia') await vistaLoggia(v);
      else v.innerHTML = '<div class="card empty">Pagina non trovata.</div>';
    } catch (e) {
      v.innerHTML = `<div class="notice bad"><b>Si è verificato un errore.</b><br>${esc(messaggioErrore(e))}</div>`;
    }
  }

  async function caricaFratelli() {
    if (!state.fratelli) state.fratelli = chk(await state.sb.from('fratelli').select('id,cognome,nome').order('cognome'));
    return state.fratelli;
  }

  /* ---------- cruscotto ---------- */
  async function vistaCruscotto(v) {
    if (!SOCI.includes(state.profilo.ruolo)) {   // il Tesoriere vede solo la parte economica
      v.innerHTML = `<div class="page-head"><div><h1>Cruscotto</h1><p>${esc(state.loggia.nome || 'La tua Loggia')}${state.loggia.oriente ? ' · Oriente di ' + esc(state.loggia.oriente) : ''}</p></div></div>`;
      await estraCruscotto(v);
      return;
    }
    const [bus, fr] = await Promise.all([
      state.sb.from('bussanti').select('id,cognome,nome,tipo_domanda,data_prima_votazione,data_seconda_votazione').order('cognome'),
      state.sb.from('fratelli').select('stato'),
    ]);
    const bussanti = chk(bus), fratelli = chk(fr);
    const perStato = {};
    fratelli.forEach((f) => { const s = f.stato || 'n/d'; perStato[s] = (perStato[s] || 0) + 1; });
    const eventi = [];
    bussanti.forEach((b) => {
      if (b.data_prima_votazione && b.data_prima_votazione >= oggi()) eventi.push({ d: b.data_prima_votazione, t: 'Prima votazione', b });
      if (b.tipo_domanda === 'iniziazione' && b.data_seconda_votazione && b.data_seconda_votazione >= oggi()) eventi.push({ d: b.data_seconda_votazione, t: 'Seconda votazione', b });
    });
    eventi.sort((a, b) => a.d.localeCompare(b.d));
    v.innerHTML = `
      <div class="page-head"><div><h1>Cruscotto</h1><p>${esc(state.loggia.nome || 'La tua Loggia')}${state.loggia.oriente ? ' · Oriente di ' + esc(state.loggia.oriente) : ''}</p></div></div>
      <div class="grid stats">
        <div class="stat drillable" data-drill="fratelli" role="button" tabindex="0" title="Clicca per l’elenco"><div class="n">${fratelli.length}</div><div class="l">Fratelli in anagrafica</div></div>
        <div class="stat drillable" data-drill="bussanti" role="button" tabindex="0" title="Clicca per l’elenco"><div class="n">${bussanti.length}</div><div class="l">Pratiche di bussanti</div></div>
        <div class="stat drillable" data-drill="votazioni" role="button" tabindex="0" title="Clicca per l’elenco"><div class="n">${eventi.length}</div><div class="l">Votazioni in programma</div></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><h2>Prossime votazioni</h2>
          ${eventi.length ? `<div class="table-wrap"><table><tbody>${eventi.slice(0, 8).map((e) => `
            <tr class="click" data-go="#/bussanti/${esc(e.b.id)}"><td><b>${fmtData(e.d)}</b></td><td>${esc(e.t)}</td><td>${esc(e.b.cognome)} ${esc(e.b.nome)}</td></tr>`).join('')}</tbody></table></div>`
            : '<div class="empty">Nessuna votazione in programma.</div>'}
        </div>
        <div class="card"><h2>Fratelli per stato</h2>
          ${Object.keys(perStato).length ? Object.entries(perStato).map(([s, n]) => `<div class="actions drillable riga-d" data-drill="fratelli" data-k="${esc(s)}" role="button" tabindex="0" title="Clicca per l’elenco" style="justify-content:space-between;padding:7px 8px;border-bottom:1px solid var(--line)"><span>${esc(s)}</span><span class="badge info">${n}</span></div>`).join('') : '<div class="empty">Nessun dato.</div>'}
        </div>
      </div>
      ${canEdit() ? `<div class="actions"><a class="btn gold" href="#/bussanti/nuovo">${IC.plus} Nuovo bussante</a></div>` : ''}`;
    collegaRighe(v);
    await estraCruscotto(v);
  }

  // riquadri aggiuntivi del Cruscotto (es. vista economica): un errore qui non deve rompere la pagina
  async function estraCruscotto(v) {
    for (const fn of (API.cruscottoExtra || [])) { try { await fn(v); } catch (e) { /* facoltativo */ } }
    collegaRighe(v);
  }

  function collegaRighe(root) {
    $$('[data-go]', root).forEach((r) => r.addEventListener('click', () => { location.hash = r.dataset.go; }));
  }

  /* ---------- elenco bussanti ---------- */
  async function vistaBussanti(v) {
    const lista = chk(await state.sb.from('bussanti').select('id,cognome,nome,tipo_domanda,data_domanda,data_prima_votazione,data_seconda_votazione').order('cognome').order('nome'));
    v.innerHTML = `
      <div class="page-head"><div><h1>Bussanti</h1><p>Domande di iniziazione, riammissione e regolarizzazione</p></div>
        <div class="right actions">${canEdit() ? `<a class="btn gold" href="#/bussanti/nuovo">${IC.plus} Nuovo bussante</a>` : ''}</div></div>
      <div class="actions" style="margin-bottom:14px"><div class="searchbar">${IC.search}<input id="q" type="search" placeholder="Cerca per cognome o nome…"></div>
        <span class="muted" id="conta"></span></div>
      <div class="table-wrap"><table><thead><tr><th>Nominativo</th><th>Domanda</th><th>Presentata il</th><th>1ª votazione</th><th>2ª votazione</th></tr></thead>
      <tbody id="righe"></tbody></table></div>`;
    const disegna = () => {
      const q = $('#q').value.trim().toLowerCase();
      const f = lista.filter((b) => (b.cognome + ' ' + b.nome).toLowerCase().includes(q));
      $('#conta').textContent = f.length + (f.length === 1 ? ' pratica' : ' pratiche');
      $('#righe').innerHTML = f.length ? f.map((b) => `
        <tr class="click" data-go="#/bussanti/${esc(b.id)}"><td><b>${esc(b.cognome)} ${esc(b.nome)}</b></td>
        <td><span class="badge gold">${esc(TIPI_DOMANDA[b.tipo_domanda] || b.tipo_domanda)}</span></td>
        <td>${fmtData(b.data_domanda)}</td><td>${fmtData(b.data_prima_votazione)}</td>
        <td>${b.tipo_domanda === 'iniziazione' ? fmtData(b.data_seconda_votazione) : '—'}</td></tr>`).join('')
        : `<tr><td colspan="5"><div class="empty">${IC.inbox}<div>${lista.length ? 'Nessun risultato.' : 'Ancora nessun bussante inserito.'}</div></div></td></tr>`;
      collegaRighe($('#righe'));
    };
    $('#q').addEventListener('input', disegna);
    disegna();
  }

  /* ---------- modulo bussante ---------- */
  const campo = (nome, label, val, o) => {
    o = o || {};
    const data = o.type === 'date';
    return `<div class="f ${o.cls || 's4'}"><label for="x-${nome}">${label}${o.req ? ' <span class="req">*</span>' : ''}</label>
      <input id="x-${nome}" name="${nome}" type="${data ? 'text' : (o.type || 'text')}" value="${esc(data ? isoToIt(val) : val)}"
        ${o.req ? 'data-req="1"' : ''} ${data ? 'data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"' : ''}
        ${o.max ? 'maxlength="' + o.max + '"' : ''} ${o.ph ? 'placeholder="' + esc(o.ph) + '"' : ''} ${o.up ? 'style="text-transform:uppercase"' : ''}></div>`;
  };

  function dividiVia(ind) { return window.LemmiPDF.dividiVia(ind); }

  async function vistaForm(v, id) {
    if (!canEdit()) { v.innerHTML = '<div class="notice bad">Non hai i permessi per modificare i bussanti.</div>'; return; }
    const fratelli = await caricaFratelli();
    let b = { tipo_domanda: 'iniziazione', data_domanda: oggi(), provenienza: {}, referenti: [] };
    if (id) b = chk(await state.sb.from('bussanti').select('*').eq('id', id).single());
    const [via, civ] = dividiVia(b.indirizzo);
    const [dvia, dciv] = dividiVia(b.domicilio_indirizzo);
    const domVuoto = !b.domicilio_citta && !b.domicilio_indirizzo && !b.domicilio_cap;
    const pv = b.provenienza || {};
    const rif = [0, 1, 2].map((i) => (b.referenti && b.referenti[i]) || {});
    v.innerHTML = `
      <div class="crumb"><a href="#/bussanti">Bussanti</a> › ${id ? 'Modifica' : 'Nuovo'}</div>
      <div class="page-head"><h1>${id ? 'Modifica pratica' : 'Nuovo bussante'}</h1></div>
      <form id="f-b" novalidate><div class="card"><div class="form-grid">
        <div class="f hint" style="margin-bottom:-6px">I campi contrassegnati con <span class="req">*</span> sono obbligatori. Le date si scrivono nel formato gg/mm/aaaa.</div>
        <div class="section-title">Domanda</div>
        <div class="f s4"><label for="x-tipo_domanda">Tipo di domanda</label><select id="x-tipo_domanda" name="tipo_domanda">
          ${Object.entries(TIPI_DOMANDA).map(([k, t]) => `<option value="${k}" ${b.tipo_domanda === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        ${campo('data_domanda', 'Data della domanda', b.data_domanda, { type: 'date', cls: 's3', req: 1 })}
        <div class="f s5"><label for="x-presentatore_id">Fratello presentatore</label><select id="x-presentatore_id" name="presentatore_id">
          <option value="">— non indicato —</option>
          ${fratelli.map((f) => `<option value="${esc(f.id)}" ${b.presentatore_id === f.id ? 'selected' : ''}>${esc(f.cognome)} ${esc(f.nome)}</option>`).join('')}</select></div>

        <div class="section-title">Anagrafica</div>
        ${campo('cognome', 'Cognome', b.cognome, { req: 1, cls: 's4' })}
        ${campo('nome', 'Nome', b.nome, { req: 1, cls: 's4' })}
        ${campo('codice_fiscale', 'Codice fiscale', b.codice_fiscale, { max: 16, up: 1, cls: 's4', req: 1 })}
        ${campo('luogo_nascita', 'Luogo di nascita', b.luogo_nascita, { cls: 's5', req: 1 })}
        ${campo('provincia_nascita', 'Prov.', b.provincia_nascita, { max: 2, up: 1, cls: 's2', req: 1 })}
        ${campo('data_nascita', 'Data di nascita', b.data_nascita, { type: 'date', cls: 's5', req: 1 })}
        ${campo('cellulare', 'Telefono', b.cellulare, { type: 'tel', cls: 's4', req: 1 })}
        ${campo('email', 'E-mail', b.email, { type: 'email', cls: 's8', req: 1 })}
        ${campo('titolo_studio', 'Titolo di studio', b.titolo_studio, { cls: 's6', req: 1 })}
        ${campo('professione', 'Professione', b.professione, { cls: 's6', req: 1 })}

        <div class="section-title">Residenza</div>
        ${campo('via', 'Via / piazza', via, { cls: 's6', req: 1 })}
        ${campo('civ', 'N°', civ, { cls: 's2', req: 1 })}
        ${campo('cap', 'CAP', b.cap, { max: 5, cls: 's4', req: 1 })}
        ${campo('citta', 'Città', b.citta, { cls: 's8', req: 1 })}
        ${campo('provincia', 'Prov.', b.provincia, { max: 2, up: 1, cls: 's4', req: 1 })}

        <div class="section-title">Domicilio</div>
        <div class="f"><label class="check"><input type="checkbox" id="x-dom_same" name="dom_same" ${domVuoto ? 'checked' : ''}> Coincide con la residenza</label></div>
        <div id="blocco-dom" class="form-grid ${domVuoto ? 'hidden' : ''}" style="grid-column:span 12">
          ${campo('dvia', 'Domicilio: via / piazza', dvia, { cls: 's6', req: 1 })}
          ${campo('dciv', 'N°', dciv, { cls: 's2', req: 1 })}
          ${campo('dcap', 'CAP', b.domicilio_cap, { max: 5, cls: 's4', req: 1 })}
          ${campo('dcitta', 'Città', b.domicilio_citta, { cls: 's8', req: 1 })}
          ${campo('dprov', 'Prov.', b.domicilio_provincia, { max: 2, up: 1, cls: 's4', req: 1 })}
        </div>

        <div class="section-title">Competenza territoriale (C/1, pag. 2)</div>
        <div class="f s4"><label for="x-competenza_territoriale">Il bussante dichiara</label><select id="x-competenza_territoriale" name="competenza_territoriale">
          <option value="">— non indicato —</option>
          <option value="residenza" ${b.competenza_territoriale === 'residenza' ? 'selected' : ''}>Di avere la residenza in…</option>
          <option value="sede_lavoro" ${b.competenza_territoriale === 'sede_lavoro' ? 'selected' : ''}>Di avere la sede di lavoro in…</option></select></div>
        ${campo('competenza_luogo', 'Luogo (come scritto sul modulo)', b.competenza_luogo, { cls: 's8' })}

        <div id="blocco-prov" class="form-grid" style="grid-column:span 12">
          <div class="section-title" style="grid-column:span 12">Provenienza (solo per il C/1)</div>
          <div data-p="regolarizzazione" class="form-grid" style="grid-column:span 12">
            ${campo('p_obbedienza', 'Proveniente dall’Obbedienza', pv.obbedienza, { cls: 's6' })}
            ${campo('p_grado', 'Con il grado di', pv.grado, { cls: 's6' })}
          </div>
          <div data-p="cancellazione_pena" class="form-grid" style="grid-column:span 12">
            ${campo('p_espulso_sentenza_del', 'Espulso con sentenza del', pv.espulso_sentenza_del, { type: 'date', cls: 's4', req: 1 })}
            ${campo('p_espulso_definitiva_il', 'Definitiva il', pv.espulso_definitiva_il, { type: 'date', cls: 's4', req: 1 })}
            ${campo('p_grado_ricoperto', 'Ricopriva il grado di', pv.grado_ricoperto, { cls: 's4' })}
          </div>
          <div data-p="affiliazione_estero" class="form-grid" style="grid-column:span 12">
            ${campo('p_rl_nome', 'Proveniente dalla R∴L∴', pv.rl_nome, { cls: 's4' })}
            ${campo('p_rl_oriente', 'N. e Oriente', pv.rl_oriente, { cls: 's4' })}
            ${campo('p_gran_loggia', 'All’obbedienza della Gran Loggia', pv.gran_loggia, { cls: 's4' })}
            ${campo('p_grado_estero', 'Con il grado di', pv.grado_estero, { cls: 's4' })}
          </div>
        </div>

        <div class="section-title">Modello A/1 – persone che possono riferire</div>
        ${rif.map((r, i) => `${campo('ref_nome_' + (i + 1), (i + 1) + '° nominativo', r.nome, { cls: 's4' })}${campo('ref_ind_' + (i + 1), 'Indirizzo', r.indirizzo, { cls: 's8' })}`).join('')}
        <div class="f"><label for="x-note_dichiarazioni">Note sulle dichiarazioni (campo NOTE del modello)</label>
          <input id="x-note_dichiarazioni" name="note_dichiarazioni" value="${esc(b.note_dichiarazioni)}"></div>

        <div class="section-title">Date dell’iter</div>
        ${campo('data_presa_in_considerazione', 'Presa in considerazione', b.data_presa_in_considerazione, { type: 'date', cls: 's3' })}
        ${campo('data_comunicazione_collegio', 'Comunicata al Collegio', b.data_comunicazione_collegio, { type: 'date', cls: 's3' })}
        ${campo('data_prima_votazione', 'Prima votazione', b.data_prima_votazione, { type: 'date', cls: 's3', req: 1 })}
        <div id="wrap-seconda" class="f s3"><label for="x-data_seconda_votazione">Seconda votazione <span class="req">*</span></label>
          <input id="x-data_seconda_votazione" name="data_seconda_votazione" type="text" data-req="1" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(isoToIt(b.data_seconda_votazione))}"></div>
        <div class="f hint">Il C/1 va presentato indicando le date delle votazioni con almeno 60 giorni di margine (30 per le riammissioni).</div>
      </div></div>
      <div class="sticky-bar"><button class="btn gold" type="submit">Salva pratica</button>
        <a class="btn ghost" href="${id ? '#/bussanti/' + esc(id) : '#/bussanti'}">Annulla</a><span class="err" id="f-err"></span></div></form>`;

    const f = $('#f-b');
    const aggiorna = () => {
      const t = f.elements.tipo_domanda.value;
      $$('[data-p]', f).forEach((el) => el.classList.toggle('hidden', el.dataset.p !== t));
      $('#blocco-prov').classList.toggle('hidden', !['regolarizzazione', 'cancellazione_pena', 'affiliazione_estero'].includes(t));
      $('#wrap-seconda').classList.toggle('hidden', t !== 'iniziazione');
      $('#blocco-dom').classList.toggle('hidden', f.elements.dom_same.checked);
    };
    f.elements.tipo_domanda.addEventListener('change', aggiorna);
    f.elements.dom_same.addEventListener('change', aggiorna);
    aggiorna();

    // maschera gg/mm/aaaa: inserisce le barre mentre si scrive
    $$('[data-date]', f).forEach((inp) => inp.addEventListener('input', () => {
      let d = inp.value.replace(/\D/g, '').slice(0, 8);
      if (d.length > 4) d = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
      else if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2);
      inp.value = d;
      inp.classList.remove('invalid');
    }));
    $$('input', f).forEach((inp) => inp.addEventListener('input', () => inp.classList.remove('invalid')));

    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('#f-err'); err.textContent = '';
      $$('.invalid', f).forEach((el) => el.classList.remove('invalid'));
      const visibile = (el) => !el.closest('.hidden');
      const nomeCampo = (el) => { const l = $('label[for="' + el.id + '"]', f); return l ? l.textContent.replace('*', '').trim() : el.name; };
      const segnala = (el, msg) => { el.classList.add('invalid'); err.textContent = msg; el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

      const vuoti = $$('[data-req]', f).filter((el) => visibile(el) && !el.value.trim());
      if (vuoti.length) {
        vuoti.forEach((el) => el.classList.add('invalid'));
        return segnala(vuoti[0], vuoti.length === 1 ? 'Campo obbligatorio mancante: ' + nomeCampo(vuoti[0]) + '.' : 'Mancano ' + vuoti.length + ' campi obbligatori, a partire da: ' + nomeCampo(vuoti[0]) + '.');
      }
      const dateErrate = $$('[data-date]', f).filter((el) => visibile(el) && el.value.trim() && itToIso(el.value) === 'ERR');
      if (dateErrate.length) return segnala(dateErrate[0], 'Data non valida in “' + nomeCampo(dateErrate[0]) + '”: usa il formato gg/mm/aaaa (es. 14/03/1978).');

      const dati = leggiForm(f);
      const ctrl = [
        ['codice_fiscale', dati.codice_fiscale && !/^[A-Z0-9]{16}$/.test(dati.codice_fiscale), 'Il codice fiscale deve avere 16 caratteri (lettere e cifre).'],
        ['provincia_nascita', dati.provincia_nascita && !/^[A-Z]{2}$/.test(dati.provincia_nascita), 'La provincia di nascita va indicata con la sigla di 2 lettere (es. RM).'],
        ['provincia', dati.provincia && !/^[A-Z]{2}$/.test(dati.provincia), 'La provincia di residenza va indicata con la sigla di 2 lettere (es. RM).'],
        ['cap', dati.cap && !/^\d{5}$/.test(dati.cap), 'Il CAP deve essere di 5 cifre.'],
        ['email', dati.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dati.email), 'L’indirizzo e-mail non è valido.'],
        ['data_nascita', dati.data_nascita && dati.data_nascita >= oggi(), 'La data di nascita deve essere nel passato.'],
        ['data_seconda_votazione', dati.data_seconda_votazione && dati.data_prima_votazione && dati.data_seconda_votazione < dati.data_prima_votazione, 'La seconda votazione non può precedere la prima.'],
      ];
      if (!f.elements.dom_same.checked) {
        ctrl.push(['dprov', dati.domicilio_provincia && !/^[A-Z]{2}$/.test(dati.domicilio_provincia), 'La provincia del domicilio va indicata con la sigla di 2 lettere.']);
        ctrl.push(['dcap', dati.domicilio_cap && !/^\d{5}$/.test(dati.domicilio_cap), 'Il CAP del domicilio deve essere di 5 cifre.']);
      }
      const ko = ctrl.find((c) => c[1]);
      if (ko) return segnala(f.elements[ko[0]], ko[2]);
      const btn = $('button[type=submit]', f); btn.disabled = true;
      try {
        let rid = id;
        if (id) chk(await state.sb.from('bussanti').update(dati).eq('id', id));
        else rid = chk(await state.sb.from('bussanti').insert(dati).select('id').single()).id;
        toast('Pratica salvata', 'ok');
        location.hash = '#/bussanti/' + rid;
      } catch (e) { err.textContent = messaggioErrore(e); btn.disabled = false; }
    });
  }

  function leggiForm(f) {
    const val = (n) => (f.elements[n] ? String(f.elements[n].value).trim() : '');
    const nul = (n) => val(n) || null;
    const dt = (n) => { const r = itToIso(val(n)); return r === 'ERR' ? null : r; };
    const maius = (n) => (val(n) ? val(n).toUpperCase() : null);
    const indirizzo = (a, b) => { const x = val(a), y = val(b); return x ? (y ? x + ', ' + y : x) : null; };
    const tipo = val('tipo_domanda');
    const stessa = f.elements.dom_same.checked;
    let prov = {};
    if (tipo === 'regolarizzazione') prov = { obbedienza: val('p_obbedienza'), grado: val('p_grado') };
    if (tipo === 'cancellazione_pena') prov = { espulso_sentenza_del: dt('p_espulso_sentenza_del'), espulso_definitiva_il: dt('p_espulso_definitiva_il'), grado_ricoperto: val('p_grado_ricoperto') };
    if (tipo === 'affiliazione_estero') prov = { rl_nome: val('p_rl_nome'), rl_oriente: val('p_rl_oriente'), gran_loggia: val('p_gran_loggia'), grado_estero: val('p_grado_estero') };
    Object.keys(prov).forEach((k) => { if (!prov[k]) delete prov[k]; });
    return {
      tipo_domanda: tipo,
      data_domanda: dt('data_domanda'),
      presentatore_id: nul('presentatore_id'),
      cognome: val('cognome'), nome: val('nome'),
      codice_fiscale: maius('codice_fiscale'),
      luogo_nascita: nul('luogo_nascita'), provincia_nascita: maius('provincia_nascita'), data_nascita: dt('data_nascita'),
      cellulare: nul('cellulare'), email: nul('email'), titolo_studio: nul('titolo_studio'), professione: nul('professione'),
      indirizzo: indirizzo('via', 'civ'), cap: nul('cap'), citta: nul('citta'), provincia: maius('provincia'),
      domicilio_indirizzo: stessa ? null : indirizzo('dvia', 'dciv'), domicilio_cap: stessa ? null : nul('dcap'),
      domicilio_citta: stessa ? null : nul('dcitta'), domicilio_provincia: stessa ? null : maius('dprov'),
      competenza_territoriale: nul('competenza_territoriale'), competenza_luogo: nul('competenza_luogo'),
      note_dichiarazioni: nul('note_dichiarazioni'),
      referenti: [1, 2, 3].map((i) => ({ nome: val('ref_nome_' + i), indirizzo: val('ref_ind_' + i) })).filter((r) => r.nome || r.indirizzo),
      provenienza: prov,
      data_presa_in_considerazione: dt('data_presa_in_considerazione'),
      data_comunicazione_collegio: dt('data_comunicazione_collegio'),
      data_prima_votazione: dt('data_prima_votazione'),
      data_seconda_votazione: tipo === 'iniziazione' ? dt('data_seconda_votazione') : null,
    };
  }

  /* ---------- scheda bussante ---------- */
  async function vistaDettaglio(v, id) {
    const [bRes, dRes] = await Promise.all([
      state.sb.from('bussanti').select('*').eq('id', id).maybeSingle(),
      state.sb.from('documenti').select('*').eq('bussante_id', id).order('creato_il'),
    ]);
    const b = chk(bRes), docs = chk(dRes);
    if (!b) { v.innerHTML = '<div class="notice bad">Pratica non trovata.</div>'; return; }
    const fratelli = await caricaFratelli();
    const pres = fratelli.find((f) => f.id === b.presentatore_id);
    const completa = (cit, prov) => [cit, prov ? '(' + prov + ')' : ''].filter(Boolean).join(' ');
    const kv = (l, x) => `<div><span>${l}</span><b>${x ? esc(x) : '—'}</b></div>`;
    const mancanti = DOCUMENTI.filter((d) => d.obbl && !docs.some((x) => x.tipo === d.tipo)).length;

    v.innerHTML = `
      <div class="crumb"><a href="#/bussanti">Bussanti</a> › ${esc(b.cognome)} ${esc(b.nome)}</div>
      <div class="page-head"><div><h1>${esc(b.cognome)} ${esc(b.nome)}</h1>
        <p><span class="badge gold">${esc(TIPI_DOMANDA[b.tipo_domanda] || b.tipo_domanda)}</span>
        ${mancanti ? `<span class="badge warn">${mancanti} documenti obbligatori mancanti</span>` : '<span class="badge ok">Documenti completi</span>'}</p></div>
        <div class="right actions">${canEdit() ? `<a class="btn ghost" href="#/bussanti/${esc(id)}/modifica">Modifica</a>` : ''}
        ${isAdmin() ? '<button class="btn danger" id="b-del">Elimina</button>' : ''}</div></div>

      <div class="card gen"><h2>${IC.pdf} Moduli GOI precompilati</h2>
        <p>Genera i modelli ufficiali (ed. 2024) con i dati di questa scheda. Stampali e fai firmare a mano: la firma e la data restano in bianco.</p>
        ${!state.loggia.nome ? '<div class="notice">I dati della Loggia sono incompleti: compilali nella sezione <b>Loggia</b> per intestare correttamente i moduli.</div>' : ''}
        ${b.tipo_domanda === 'iniziazione' ? `<div class="actions">
          <button class="btn gold" data-gen="A1">${IC.pdf} Modello A/1</button>
          <button class="btn gold" data-gen="C1">${IC.pdf} Modello C/1</button>
          <button class="btn ghost" data-gen="ENTRAMBI">A/1 + C/1 in un unico PDF</button>
          <label class="check" style="margin-left:6px"><input type="checkbox" id="x-collegio"> Copia per il Collegio (A/1 senza pag. 5)</label>
        </div>` : `<div class="actions">
          <a class="btn gold" href="#/template/modulo/${b.tipo_domanda === 'regolarizzazione' ? 'AR' : 'A2'}/${esc(id)}">${IC.pdf} Modello ${b.tipo_domanda === 'regolarizzazione' ? 'A/R' : 'A/2'}</a>
          <button class="btn gold" data-gen="C1">${IC.pdf} Modello C/1</button>
          <label class="check" style="margin-left:6px"><input type="checkbox" id="x-collegio"> Copia per il Collegio</label>
        </div><p class="hint" style="margin-top:8px">Per questo tipo di domanda il modello è ${b.tipo_domanda === 'regolarizzazione' ? 'A/R (regolarizzazione)' : 'A/2 (riammissione / cancellazione della pena / affiliazione dall’estero)'}: si compila nella sezione Template, dove si aggiungono i dati che la scheda non contiene.</p>`}</div>

      <div class="card"><h2>Dati della pratica</h2><div class="kv">
        ${kv('Nato a', [b.luogo_nascita, b.provincia_nascita ? '(' + b.provincia_nascita + ')' : ''].filter(Boolean).join(' '))}
        ${kv('Data di nascita', b.data_nascita ? fmtData(b.data_nascita) : '')}
        ${kv('Codice fiscale', b.codice_fiscale)}
        ${kv('Residenza', [b.indirizzo, b.cap, completa(b.citta, b.provincia)].filter(Boolean).join(', '))}
        ${kv('Domicilio', b.domicilio_citta || b.domicilio_indirizzo ? [b.domicilio_indirizzo, b.domicilio_cap, completa(b.domicilio_citta, b.domicilio_provincia)].filter(Boolean).join(', ') : 'Come la residenza')}
        ${kv('Telefono', b.cellulare)}${kv('E-mail', b.email)}
        ${kv('Titolo di studio', b.titolo_studio)}${kv('Professione', b.professione)}
        ${kv('Presentatore', pres ? pres.cognome + ' ' + pres.nome : '')}
        ${kv('Domanda presentata il', b.data_domanda ? fmtData(b.data_domanda) : '')}
        ${kv('Prima votazione', b.data_prima_votazione ? fmtData(b.data_prima_votazione) : '')}
        ${b.tipo_domanda === 'iniziazione' ? kv('Seconda votazione', b.data_seconda_votazione ? fmtData(b.data_seconda_votazione) : '') : ''}
      </div></div>

      <div class="card"><h2>Documenti allegati <small>PDF, JPG o PNG · max 10 MB · archivio privato</small></h2>
        <div class="docs">${DOCUMENTI.map((d) => {
          const files = docs.filter((x) => x.tipo === d.tipo);
          const stato = files.length ? `<span class="badge ok">${files.length} caricat${files.length === 1 ? 'o' : 'i'}</span>` : d.obbl ? '<span class="badge warn">Mancante</span>' : '<span class="badge gray">Facoltativo</span>';
          return `<div class="doc"><div class="name">${esc(d.nome)}</div>${stato}
            ${canEdit() ? `<label class="btn ghost small" for="up-${d.tipo}">${IC.up} Carica</label><input type="file" id="up-${d.tipo}" data-up="${d.tipo}" accept="application/pdf,image/jpeg,image/png" multiple>` : ''}
            ${files.length ? `<div class="files">${files.map((x) => `<div class="file"><span class="fn" title="${esc(x.nome_file)}">${esc(x.nome_file)}</span>
              <span class="muted">${fmtData(x.creato_il)}</span>
              <button class="btn ghost small" data-open="${esc(x.percorso)}">Apri</button>
              ${isAdmin() ? `<button class="btn danger small" data-deldoc="${esc(x.id)}" data-path="${esc(x.percorso)}">Elimina</button>` : ''}</div>`).join('')}</div>` : ''}</div>`;
        }).join('')}</div></div>`;

    $$('[data-gen]', v).forEach((btn) => btn.addEventListener('click', () => generaPdf(b, pres, btn.dataset.gen, $('#x-collegio').checked, btn)));
    $$('[data-up]', v).forEach((inp) => inp.addEventListener('change', () => caricaFile(id, inp)));
    $$('[data-open]', v).forEach((btn) => btn.addEventListener('click', () => apriFile(btn.dataset.open)));
    $$('[data-deldoc]', v).forEach((btn) => btn.addEventListener('click', () => eliminaDoc(btn.dataset.deldoc, btn.dataset.path, id)));
    const del = $('#b-del');
    if (del) del.addEventListener('click', () => eliminaBussante(b, docs));
    for (const fn of (API.bussanteExtra || [])) { try { await fn(v, id, b); } catch (e) { /* facoltativo */ } }
  }

  /* ---------- documenti ---------- */
  async function caricaFile(bid, inp) {
    const tipo = inp.dataset.up;
    const files = Array.from(inp.files || []);
    if (!files.length) return;
    let ok = 0;
    for (const file of files) {
      if (file.size > MAX_FILE) { toast(file.name + ': supera i 10 MB.', 'bad'); continue; }
      if (!/^(application\/pdf|image\/jpeg|image\/png)$/.test(file.type)) { toast(file.name + ': formato non consentito.', 'bad'); continue; }
      const percorso = `bussanti/${bid}/${tipo}/${Date.now()}-${nomeFile(file.name)}`;
      try {
        const up = await state.sb.storage.from(BUCKET).upload(percorso, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;
        const ins = await state.sb.from('documenti').insert({ bussante_id: bid, tipo, nome_file: file.name, percorso, mime: file.type, dimensione: file.size });
        if (ins.error) { await state.sb.storage.from(BUCKET).remove([percorso]); throw ins.error; }
        ok++;
      } catch (e) { toast(file.name + ': ' + messaggioErrore(e), 'bad'); }
    }
    if (ok) toast(ok === 1 ? 'Documento caricato' : ok + ' documenti caricati', 'ok');
    route();
  }

  async function apriFile(percorso) {
    const w = window.open('', '_blank');
    try {
      const { data, error } = await state.sb.storage.from(BUCKET).createSignedUrl(percorso, 120);
      if (error) throw error;
      if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
    } catch (e) { if (w) w.close(); toast(messaggioErrore(e), 'bad'); }
  }

  async function eliminaDoc(docId, percorso, bid) {
    if (!confirm('Eliminare definitivamente questo documento?')) return;
    try {
      const r1 = await state.sb.storage.from(BUCKET).remove([percorso]);
      if (r1.error) throw r1.error;
      chk(await state.sb.from('documenti').delete().eq('id', docId));
      toast('Documento eliminato', 'ok');
      route();
    } catch (e) { toast(messaggioErrore(e), 'bad'); }
  }

  async function eliminaBussante(b, docs) {
    if (!confirm('Eliminare la pratica di ' + b.cognome + ' ' + b.nome + ' e tutti i suoi documenti? L’operazione non si può annullare.')) return;
    try {
      if (docs.length) { const r = await state.sb.storage.from(BUCKET).remove(docs.map((d) => d.percorso)); if (r.error) throw r.error; }
      chk(await state.sb.from('bussanti').delete().eq('id', b.id));
      toast('Pratica eliminata', 'ok');
      location.hash = '#/bussanti';
    } catch (e) { toast(messaggioErrore(e), 'bad'); }
  }

  /* ---------- generazione PDF ---------- */
  async function modello(nome) {
    if (!state.templates[nome]) {
      const r = await fetch('templates/' + nome + '.pdf');
      if (!r.ok) throw new Error('Modello ' + nome + ' non trovato nella cartella templates.');
      state.templates[nome] = new Uint8Array(await r.arrayBuffer());
    }
    return state.templates[nome].slice();
  }

  async function generaPdf(b, pres, quale, copiaCollegio, btn) {
    const etichetta = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Genero…';
    try {
      const comuni = { bussante: b, loggia: state.loggia, presentatore: pres ? pres.cognome + ' ' + pres.nome : '', copiaCollegio };
      const out = [];
      if (quale === 'A1' || quale === 'ENTRAMBI') out.push(await window.LemmiPDF.genera({ ...comuni, modello: 'A1', templateBytes: await modello('A1') }));
      if (quale === 'C1' || quale === 'ENTRAMBI') out.push(await window.LemmiPDF.genera({ ...comuni, modello: 'C1', templateBytes: await modello('C1') }));
      const bytes = out.length === 1 ? out[0] : await window.LemmiPDF.unisci(out);
      const nome = (quale === 'ENTRAMBI' ? 'A1_C1' : quale) + '_' + nomeFile(b.cognome + '_' + b.nome) + '.pdf';
      scarica(bytes, nome);
      toast('PDF generato: ' + nome, 'ok');
    } catch (e) { toast('Errore nella generazione: ' + messaggioErrore(e), 'bad'); }
    btn.disabled = false; btn.innerHTML = etichetta;
  }

  function scarica(bytes, nome) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  /* ---------- fratelli (sola lettura) ---------- */
  async function vistaFratelli(v) {
    const lista = chk(await state.sb.from('v_fratelli_completi')
      .select('id,cognome,nome,matricola,stato,grado_attuale,carica_attuale,citta,email,cellulare').order('cognome').order('nome'));
    v.innerHTML = `
      <div class="page-head"><div><h1>Fratelli</h1><p>Anagrafica della Loggia · sola consultazione</p></div></div>
      <div class="actions" style="margin-bottom:14px"><div class="searchbar">${IC.search}<input id="q" type="search" placeholder="Cerca per cognome, nome o matricola…"></div><span class="muted" id="conta"></span></div>
      <div class="table-wrap"><table><thead><tr><th>Matricola</th><th>Nominativo</th><th>Stato</th><th>Grado</th><th>Carica</th><th>Città</th><th>Contatti</th></tr></thead><tbody id="righe"></tbody></table></div>`;
    const disegna = () => {
      const q = $('#q').value.trim().toLowerCase();
      const f = lista.filter((x) => [x.cognome, x.nome, x.matricola].join(' ').toLowerCase().includes(q));
      $('#conta').textContent = f.length + ' di ' + lista.length;
      $('#righe').innerHTML = f.length ? f.map((x) => `<tr><td>${esc(x.matricola) || '—'}</td><td><b>${esc(x.cognome)} ${esc(x.nome)}</b></td>
        <td><span class="badge ${x.stato === 'attivo' ? 'ok' : 'gray'}">${esc(x.stato) || '—'}</span></td>
        <td>${esc(x.grado_attuale) || '—'}</td><td>${esc(x.carica_attuale) || '—'}</td><td>${esc(x.citta) || '—'}</td>
        <td>${esc(x.cellulare || x.email) || '—'}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty">Nessun risultato.</div></td></tr>';
    };
    $('#q').addEventListener('input', disegna);
    disegna();
  }

  /* ---------- dati della Loggia ---------- */
  async function vistaLoggia(v) {
    const l = state.loggia || {};
    const modifica = isAdmin();
    v.innerHTML = `
      <div class="page-head"><div><h1>Loggia</h1><p>Questi dati intestano i moduli GOI generati dall’app</p></div></div>
      <form id="f-l"><div class="card"><div class="form-grid">
        <div class="f s6"><label for="l-nome">Nome della R∴L∴</label><input id="l-nome" name="nome" value="${esc(l.nome)}" ${modifica ? '' : 'disabled'}></div>
        <div class="f s2"><label for="l-num">N°</label><input id="l-num" name="numero" value="${esc(l.numero)}" ${modifica ? '' : 'disabled'}></div>
        <div class="f s4"><label for="l-or">Oriente di</label><input id="l-or" name="oriente" value="${esc(l.oriente)}" ${modifica ? '' : 'disabled'}></div>
      </div></div>
      ${modifica ? '<div class="actions"><button class="btn gold" type="submit">Salva</button></div>' : '<p class="muted">Solo l’amministratore può modificare questi dati.</p>'}</form>`;
    API.estensioniLoggia.forEach((fn) => fn(v));
    if (!modifica) return;
    $('#f-l').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target.elements;
      const nuovi = { nome: f.nome.value.trim() || null, numero: f.numero.value.trim() || null, oriente: f.oriente.value.trim() || null };
      try {
        chk(await state.sb.from('loggia').update(nuovi).eq('id', true));
        Object.assign(state.loggia, nuovi);
        const sm = $('.brand small'); if (sm) sm.textContent = nuovi.nome || 'Gestione di Loggia';
        toast('Dati della Loggia salvati', 'ok');
      } catch (e) { toast(messaggioErrore(e), 'bad'); }
    });
  }

  function mascheraDate(root) {
    $$('[data-date]', root).forEach((inp) => inp.addEventListener('input', () => {
      let d = inp.value.replace(/\D/g, '').slice(0, 8);
      if (d.length > 4) d = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
      else if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2);
      inp.value = d;
      inp.classList.remove('invalid');
    }));
  }

  // Interfaccia messa a disposizione dei moduli aggiuntivi (es. js/pagamenti.js)
  // importi in euro nel formato 1.234,56 €
  const eur = (x) => { const n = Math.round(Number(x || 0) * 100) / 100; const [i, d] = Math.abs(n).toFixed(2).split('.'); return (n < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d + ' €'; };
  const API = window.Lemmi = { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, isoToIt, itToIso, oggi, eur, canEdit, isAdmin, IC, campo, mascheraDate, route, caricaFratelli, viste: {}, estensioniLoggia: [] };
  API.estensioniLoggia.push(schedaPassword);

  function schedaPassword(v) {
    v.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:18px"><h2>Il tuo accesso</h2>
      <form id="f-pw" class="form-grid">
        <div class="f s4"><label for="pw1">Nuova password (almeno 8 caratteri)</label><input id="pw1" name="p1" type="password" autocomplete="new-password"></div>
        <div class="f s4"><label for="pw2">Ripeti la password</label><input id="pw2" name="p2" type="password" autocomplete="new-password"></div>
        <div class="f s4"><label>&nbsp;</label><button class="btn ghost" type="submit">Cambia password</button></div>
        <div class="f err" id="pw-err"></div></form></div>`);
    $('#f-pw').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target.elements; const err = $('#pw-err'); err.textContent = '';
      if (f.p1.value.length < 8) { err.textContent = 'La password deve avere almeno 8 caratteri.'; return; }
      if (f.p1.value !== f.p2.value) { err.textContent = 'Le due password non coincidono.'; return; }
      const { error } = await state.sb.auth.updateUser({ password: f.p1.value });
      if (error) { err.textContent = messaggioErrore(error); return; }
      f.p1.value = ''; f.p2.value = '';
      toast('Password aggiornata', 'ok');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

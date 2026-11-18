// Script Google per l'app Convocazioni e presidi.
// Legge le convocazioni che TGI Sport manda alla tua Gmail e i tuoi turni
// sul calendario condiviso "Presidio Sky/EIT", e li passa all'app,
// che te li propone da aggiungere.
// Pubblicalo come "App web", con "Esegui come: Me" e "Chi ha accesso: Chiunque".
// L'indirizzo dell'app web va incollato una volta sola nell'app (pulsante "Collega Gmail").
// Lo script risponde solo a chi conosce la parola segreta: la crea la funzione creaChiave
// (eseguila una volta dall'editor) e l'app la chiede la prima volta che serve.

// Indirizzi da cui arrivano le convocazioni (dal 11/10/2026 anche la piattaforma TGI).
const MITTENTI = ['spedatella@tgisport.com', 'supponor.isg@gmail.com'];

// ------------------------------------------------------------------
// Parola segreta: sta nelle proprietà dello script, mai nel codice.
// ------------------------------------------------------------------
function chiaveOk(k) {
  const giusta = PropertiesService.getScriptProperties().getProperty('CHIAVE');
  return !!giusta && typeof k === 'string' && k === giusta;
}

// Esegui questa funzione una volta dall'editor: crea la parola segreta
// (o mostra quella già creata) e la scrive nel registro di esecuzione.
function creaChiave() {
  const prop = PropertiesService.getScriptProperties();
  let k = prop.getProperty('CHIAVE');
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    prop.setProperty('CHIAVE', k);
  }
  Logger.log('Parola segreta da incollare nell\'app: ' + k);
}

function doGet(e) {
  if (!chiaveOk(e && e.parameter && e.parameter.k)) return risposta({ errore: 'chiave' });
  if (e.parameter.cosa === 'presidi') return risposta(presidiDalCalendario(e.parameter.dal));
  const messaggi = [];
  GmailApp.search('from:(' + MITTENTI.join(' OR ') + ') newer_than:120d', 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      const da = m.getFrom().toLowerCase();
      if (!MITTENTI.some(function (a) { return da.indexOf(a) >= 0; })) return;
      // Formato vecchio (tabella): solo le righe con il tuo nome o senza operatore.
      // Formato nuovo (una convocazione per mail): il testo della mail.
      const righe = tabella(m.getBody());
      messaggi.push({ sender: m.getFrom(), date: m.getDate().toISOString(), body: righe !== null ? righe : m.getPlainBody() });
    });
  });
  return ContentService.createTextOutput(JSON.stringify({ messages: messaggi }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Trasforma ogni riga della tabella HTML in una riga "| cella | cella | ... |",
// tenendo solo le tue. Se la mail non ha la tabella delle convocazioni restituisce null.
function tabella(html) {
  const righe = [];
  let tabellaTrovata = false;
  const tr = /<tr[\s\S]*?<\/tr>/gi;
  let r;
  while ((r = tr.exec(html || ''))) {
    const celle = (r[0].match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(function (c) {
      return c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
    });
    if (celle.length < 7) continue;
    tabellaTrovata = true;
    if (!celle[7] || /colognese|emanuele/i.test(celle[7])) righe.push('| ' + celle.join(' | ') + ' |');
  }
  return tabellaTrovata ? righe.join('\n') : null;
}

// ------------------------------------------------------------------
// Presidi: legge il calendario condiviso "Presidio Sky/EIT" e passa all'app
// solo i turni con il tuo cognome tra parentesi dopo EIT,
// es. "Presidio Serie A EIT(Colognese)//SKY(Tomelli)".
// L'app te li propone da aggiungere, come le convocazioni della mail.
// ------------------------------------------------------------------
const CAL_PRESIDI = 'Presidio Sky/EIT';
const COGNOME = /EIT\s*\([^)]*colognese[^)]*\)/i;
const GIORNI_AVANTI = 180;

function calendarioPresidi() {
  const c = CalendarApp.getCalendarsByName(CAL_PRESIDI)[0] || CalendarApp.getAllCalendars().filter(function (x) {
    return x.getName().trim().toLowerCase() === CAL_PRESIDI.toLowerCase();
  })[0];
  if (c) return c;
  // se nella tua lista ha un nome leggermente diverso, prende il primo che contiene "presidio"
  const altri = CalendarApp.getAllCalendars().filter(function (x) { return /presidio/i.test(x.getName()); });
  if (altri.length) return altri[0];
  throw new Error('Non trovo il calendario "' + CAL_PRESIDI + '"');
}

function presidiDalCalendario(dal) {
  const tz = Session.getScriptTimeZone();
  const da = giorno(dal, '00:00') || new Date();
  const fino = new Date(Date.now() + GIORNI_AVANTI * 86400000);
  if (fino <= da) return { presidi: [] };
  const fmt = function (d, f) { return Utilities.formatDate(d, tz, f); };
  const presidi = [];
  calendarioPresidi().getEvents(da, fino).forEach(function (ev) {
    const titolo = ev.getTitle() || '';
    if (!COGNOME.test(titolo)) return;
    const ini = ev.getStartTime(), fine = ev.getEndTime();
    const intero = ev.isAllDayEvent();
    presidi.push({
      id: ev.getId() + '|' + fmt(ini, 'yyyy-MM-dd'),
      titolo: titolo,
      data: fmt(ini, 'yyyy-MM-dd'),
      inizio: intero ? '' : fmt(ini, 'HH:mm'),
      fine: intero ? '' : fmt(fine, 'HH:mm')
    });
  });
  return { presidi: presidi };
}

// ------------------------------------------------------------------
// Calendari: l'app manda tutte le partite e i presidi da oggi in poi,
// lo script crea, aggiorna o cancella gli eventi perché coincidano.
// Tocca solo gli eventi creati da lui (hanno l'etichetta "cp").
// ------------------------------------------------------------------
const CAL_CONDIVISO = 'Calendario Ema';      // quello condiviso con la tua compagna
const CAL_IPHONE = 'Lavoro (app)';           // stile del calendario "Lavoro" dell'iPhone; lo script lo crea se manca
const LUOGO_CONDIVISO = 'Lissone, 20851 Lissone MB, Italia';
const LUOGO_TGI = 'Via Giacomo Zanella 20, 20851 Lissone MB, Italia';
const ANTICIPO_MIN = 75;                     // sull'iPhone l'evento parte 1h15 prima, per partire da casa
const DURATA_PARTITA_ORE = 6;                // dalla convocazione alla fine della partita

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const dati = JSON.parse(e.postData.contents);
    if (!dati || !chiaveOk(dati.k)) return risposta({ ok: false, errore: 'chiave' });
    if (dati.azione !== 'calendari') throw new Error('richiesta sconosciuta');
    const esito = sincronizza(dati);
    return risposta(Object.assign({ ok: true }, esito));
  } catch (err) {
    return risposta({ ok: false, errore: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function risposta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sincronizza(dati) {
  const da = giorno(dati.da, '00:00');
  const fino = new Date(da.getTime() + 500 * 86400000);
  const voluti = { condiviso: {}, iphone: {} };

  (dati.partite || []).forEach(function (p) {
    const conv = giorno(p.data, p.orario);
    if (!conv || !p.partita) return;
    const fine = new Date(conv.getTime() + DURATA_PARTITA_ORE * 3600000);
    voluti.condiviso['p' + p.id] = { titolo: 'GFX VIRTUALI - ' + p.partita, inizio: conv, fine: fine, luogo: LUOGO_CONDIVISO };
    voluti.iphone['p' + p.id] = { titolo: 'Convocazione ' + p.partita + ' ore ' + p.orario,
      inizio: new Date(conv.getTime() - ANTICIPO_MIN * 60000), fine: fine, luogo: LUOGO_TGI, avviso: true };
  });
  (dati.presidi || []).forEach(function (a) {
    const ini = giorno(a.data, a.inizio);
    let fine = giorno(a.data, a.fine);
    if (!ini || !fine) return;
    if (fine <= ini) fine = new Date(fine.getTime() + 86400000);
    const ev = a.evento || 'Serie A';
    voluti.condiviso['a' + a.id] = { titolo: 'PRESIDIO AUDIO - ' + ev, inizio: ini, fine: fine, luogo: LUOGO_CONDIVISO };
    voluti.iphone['a' + a.id] = { titolo: 'Presidio ' + ev + ' ' + a.inizio + ' - ' + a.fine,
      inizio: new Date(ini.getTime() - ANTICIPO_MIN * 60000), fine: fine, luogo: '', avviso: true };
  });

  const esito = { condiviso: allinea(calendario(CAL_CONDIVISO, false), voluti.condiviso, da, fino) };
  if (dati.iphone) esito.iphone = allinea(calendario(CAL_IPHONE, true), voluti.iphone, da, fino);
  return esito;
}

function calendario(nome, crea) {
  const c = CalendarApp.getCalendarsByName(nome)[0];
  if (c) return c;
  if (!crea) throw new Error('Non trovo il calendario "' + nome + '"');
  return CalendarApp.createCalendar(nome, { color: CalendarApp.Color.PURPLE, timeZone: Session.getScriptTimeZone() });
}

function allinea(cal, voluti, da, fino) {
  const n = { creati: 0, aggiornati: 0, cancellati: 0 };
  const visti = {};
  cal.getEvents(da, fino).forEach(function (ev) {
    const id = ev.getTag('cp');
    if (!id) return;                              // eventi scritti a mano: non si toccano
    const v = voluti[id];
    if (!v || visti[id]) { ev.deleteEvent(); n.cancellati++; return; }
    visti[id] = true;
    let cambiato = false;
    if (ev.getTitle() !== v.titolo) { ev.setTitle(v.titolo); cambiato = true; }
    if (ev.getStartTime().getTime() !== v.inizio.getTime() || ev.getEndTime().getTime() !== v.fine.getTime()) { ev.setTime(v.inizio, v.fine); cambiato = true; }
    if ((ev.getLocation() || '') !== v.luogo) { ev.setLocation(v.luogo); cambiato = true; }
    if (cambiato) n.aggiornati++;
  });
  Object.keys(voluti).forEach(function (id) {
    if (visti[id]) return;
    const v = voluti[id];
    if (v.inizio < da) return;
    const ev = cal.createEvent(v.titolo, v.inizio, v.fine, { location: v.luogo });
    ev.setTag('cp', id);
    if (v.avviso) { ev.removeAllReminders(); ev.addPopupReminder(0); }
    n.creati++;
  });
  return n;
}

// "2026-10-28" + "14:30" -> data nel fuso dello script (Europa/Roma)
function giorno(d, h) {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''), b = /^(\d{1,2}):(\d{2})$/.exec(h || '');
  if (!a || !b) return null;
  return new Date(+a[1], +a[2] - 1, +a[3], +b[1], +b[2]);
}

// Prova: dall'editor esegui questa funzione per dare i permessi e vedere cosa legge.
function prova() {
  creaChiave();
  const k = PropertiesService.getScriptProperties().getProperty('CHIAVE');
  Logger.log(doGet({ parameter: { k: k } }).getContent().slice(0, 2000));
  Logger.log('Calendario condiviso trovato: ' + calendario(CAL_CONDIVISO, false).getName());
  Logger.log('Calendario presidi trovato: ' + calendarioPresidi().getName());
}

// Prova dei presidi: dall'editor esegui questa funzione e guarda nel registro
// quali turni con il tuo cognome trova da dicembre in poi.
function provaPresidi() {
  const cal = calendarioPresidi();
  const tutti = cal.getEvents(new Date(2026, 11, 1), new Date(Date.now() + GIORNI_AVANTI * 86400000));
  Logger.log('Calendario letto: "' + cal.getName() + '" con ' + tutti.length + ' eventi da dicembre');
  tutti.slice(0, 15).forEach(function (ev) {
    Logger.log('  ' + Utilities.formatDate(ev.getStartTime(), Session.getScriptTimeZone(), 'dd/MM HH:mm') + '  ' + ev.getTitle());
  });
  const r = presidiDalCalendario('2026-12-01');
  Logger.log('Turni trovati: ' + r.presidi.length);
  r.presidi.forEach(function (p) { Logger.log(p.data + '  ' + (p.inizio || 'tutto il giorno') + (p.fine ? '-' + p.fine : '') + '  ' + p.titolo); });
}

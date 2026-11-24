// Controllo visivo delle schede (partite e presidi) su telefono, senza login e senza rete.
// Usa un archivio Firebase finto con una scheda per sport (calcio, tennis, basket, volley) e prova
// 6 combinazioni di tema. Fallisce se: errori di pagina, scorrimento orizzontale, righe lunghe
// metà scheda o più dentro le schede (sembrano linee del campo), nomi troppo piccoli, colori diversi tra
// "tema scelto a mano" e "tema del telefono" (il caso dell'orario grigio di cp-v77).
// Salva gli screenshot in esito-visivo/ (in CI vengono allegati alla PR come artefatto).
//
// Uso: node scripts/controllo-visivo.js   (serve il pacchetto "playwright")
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const OUT = path.resolve(process.argv[3] || 'esito-visivo');
fs.mkdirSync(OUT, { recursive: true });

const DATI = {
  partite: {
    p1: { data: '2026-11-29', mese: '2026-11', orario: '20:45', importo: 140, partita: 'Inter - Milan', competizione: 'Serie A', giornata: '13a', stato: 'confermata' },
    p2: { data: '2026-11-27', mese: '2026-11', orario: '14:00', importo: 210, partita: 'Sinner - Alcaraz', sport: 'tennis', competizione: 'ATP Finals', stato: 'confermata' },
    p3: { data: '2026-11-26', mese: '2026-11', orario: '20:30', importo: 140, partita: 'Olimpia Milano - Virtus Bologna', sport: 'basket', competizione: 'LBA', stato: 'da confermare' },
    p4: { data: '2026-11-25', mese: '2026-11', orario: '20:30', importo: 140, partita: 'Trento - Perugia', sport: 'volley', competizione: 'SuperLega', stato: 'fatta' },
  },
  presidi: {
    a1: { data: '2026-11-29', evento: 'Serie A', inizio: '10:30', fine: '22:45', ore: 12.25, stato: 'confermata' },
    a2: { data: '2026-11-28', evento: 'ATP Finals tennis', inizio: '12:00', fine: '20:00', ore: 8 },
    a3: { data: '2026-11-27', evento: 'Eurolega basket', inizio: '18:00', fine: '23:00', ore: 5 },
    a4: { data: '2026-11-26', evento: 'SuperLega volley', inizio: '18:00', fine: '23:00', ore: 5 },
  },
};

const MOCK = `(function(){
var DATA=${JSON.stringify(DATI)};
function snap(m){var docs=Object.keys(m).map(function(k){return{id:k,data:function(){return m[k]}}});
 return{docs:docs,docChanges:function(){return docs},metadata:{fromCache:false,hasPendingWrites:false}}}
function docSnap(){return{exists:false,data:function(){return null},metadata:{fromCache:false}}}
var noop=function(){return Promise.resolve()};
var FS={enablePersistence:noop,batch:function(){return{set:function(){},commit:noop}},
 collection:function(n){return{onSnapshot:function(a,b){var cb=typeof a==="function"?a:b;setTimeout(function(){cb(snap(DATA[n]||{}))},10);return function(){}},
  doc:function(){return{set:noop,delete:noop}}}},
 doc:function(){return{set:noop,onSnapshot:function(cb){setTimeout(function(){cb(docSnap())},10);return function(){}},}}};
window.firebase={initializeApp:function(){},auth:function(){return{onAuthStateChanged:function(cb){setTimeout(function(){cb({uid:"x",email:"t@t"})},0)},signOut:noop}},firestore:function(){return FS}};
})();`;

// [colore del telefono, tema scelto a mano (null = segue il telefono)]
const COMBO = [
  ['light', null], ['dark', null],
  ['light', 'dark'], ['dark', 'light'],
  ['light', 'light'], ['dark', 'dark'],
];
const effettivo = (os, t) => t || os;

// Letto nella pagina: misura tutto ciò che serve ai controlli.
function misura() {
  const out = { overflow: document.documentElement.scrollWidth - window.innerWidth, schede: 0, righe: [], piccoli: [], colori: [] };
  [...document.querySelectorAll('.card')].filter(c => c.offsetParent !== null).forEach((card, i) => {
    out.schede++;
    const cr = card.getBoundingClientRect();
    card.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (!/^(INPUT|SELECT|BUTTON|TEXTAREA)$/.test(el.tagName) && r.width >= cr.width * 0.5 && r.height > 0 &&
          (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' ||
           parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none')) {
        out.righe.push(`scheda ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> largo ${Math.round(r.width)}px`);
      }
    });
    const t = card.querySelector('.ctitle input');
    if (t && parseFloat(getComputedStyle(t).fontSize) < 14) out.piccoli.push(`scheda ${i + 1}: nome a ${getComputedStyle(t).fontSize}`);
    out.colori.push(['.ctitle input', '.cline input[type=time]', '.cline .fine b', '.pill input', '.pill', '.hint', '.cline .gl', '.del']
      .map(s => { const e = card.querySelector(s); return e ? getComputedStyle(e).color : '-'; }).join('|'));
  });
  return out;
}

// Due colori valgono uguali se ogni canale differisce di poco (es. #eef0f3 e #f2f7f1 sono entrambi quasi bianchi).
function simili(a, b) {
  const na = a.match(/\d+/g) || [], nb = b.match(/\d+/g) || [];
  return a.replace(/[\d.]+/g, '#') === b.replace(/[\d.]+/g, '#') && na.every((v, i) => Math.abs(v - nb[i]) <= 12);
}

(async () => {
  const errori = [];
  const colori = {}; // vista -> tema effettivo -> combo -> colori
  const browser = await chromium.launch();
  for (const [os, tema] of COMBO) {
    for (const vista of ['tgi', 'aud']) {
      const etichetta = `${vista} · telefono ${os}${tema ? ' · tema ' + tema : ''}`;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: os, locale: 'it-IT' });
      await ctx.clock.setFixedTime(new Date('2026-11-24T12:00:00Z'));
      await ctx.addInitScript(t => { try { if (t) localStorage.setItem('tema', t); } catch (e) {} }, tema);
      const page = await ctx.newPage();
      page.on('pageerror', e => errori.push(`${etichetta}: errore di pagina: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errori.push(`${etichetta}: console: ${m.text()}`); });
      await page.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.hostname !== 'app.test') return route.abort();
        const f = u.pathname.slice(1) || 'index.html';
        if (f === 'vendor/firebase-app-compat.js') return route.fulfill({ body: MOCK, contentType: 'text/javascript' });
        if (f.startsWith('vendor/firebase-')) return route.fulfill({ body: '', contentType: 'text/javascript' });
        if (f === 'sw.js') return route.fulfill({ status: 404, body: '' });
        const p = path.join(ROOT, f);
        if (!p.startsWith(ROOT) || !fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
        route.fulfill({ path: p });
      });
      await page.goto('http://app.test/index.html');
      await page.waitForTimeout(800);
      await page.evaluate(v => { const t = document.querySelector('.tab[data-vista="' + v + '"]'); if (t) t.click(); }, vista);
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        document.querySelectorAll('select').forEach(s => {
          if ([...s.options].some(o => o.value === '2026-11')) { s.value = '2026-11'; s.dispatchEvent(new Event('change')); }
        });
      });
      await page.waitForTimeout(400);
      const m = await page.evaluate(misura);
      if (m.schede !== 4) errori.push(`${etichetta}: attese 4 schede, trovate ${m.schede}`);
      if (m.overflow > 0) errori.push(`${etichetta}: scorrimento orizzontale di ${m.overflow}px`);
      m.righe.forEach(r => errori.push(`${etichetta}: riga lunga dentro la scheda (almeno metà scheda) (${r})`));
      m.piccoli.forEach(r => errori.push(`${etichetta}: ${r}`));
      const k = vista + '/' + effettivo(os, tema);
      (colori[k] = colori[k] || []).push({ etichetta, valori: m.colori.join(' ; ') });
      await page.screenshot({ path: path.join(OUT, `${vista}-${os}${tema ? '-tema-' + tema : ''}.png`), fullPage: true });
      await ctx.close();
    }
  }
  await browser.close();
  // Stesso tema effettivo = stessi colori, anche se scelto a mano su un telefono con l'altro tema.
  Object.entries(colori).forEach(([k, lista]) => {
    lista.forEach(x => { if (!simili(x.valori, lista[0].valori)) errori.push(`colori diversi (${k}): "${x.etichetta}" non coincide con "${lista[0].etichetta}"`); });
  });
  if (errori.length) {
    console.error('Controllo visivo NON superato:\n- ' + errori.join('\n- '));
    process.exit(1);
  }
  console.log(`Controllo visivo superato: ${COMBO.length * 2} schermate, screenshot in ${OUT}`);
})();

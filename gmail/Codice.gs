// Script Google per l'app Convocazioni e presidi.
// Legge le convocazioni che spedatella@tgisport.com manda alla tua Gmail
// e le passa all'app, che te le propone da aggiungere.
// Pubblicalo come "App web", con "Esegui come: Me" e "Chi ha accesso: Chiunque".
// L'indirizzo dell'app web va incollato una volta sola nell'app (pulsante "Collega Gmail").

const MITTENTE = 'spedatella@tgisport.com';

function doGet() {
  const messaggi = [];
  GmailApp.search('from:' + MITTENTE + ' newer_than:120d', 0, 30).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (m.getFrom().toLowerCase().indexOf(MITTENTE) < 0) return;
      messaggi.push({ sender: m.getFrom(), body: tabella(m.getBody()) + '\n' + m.getPlainBody() });
    });
  });
  return ContentService.createTextOutput(JSON.stringify({ messages: messaggi }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Trasforma ogni riga della tabella HTML in una riga "| cella | cella | ... |".
function tabella(html) {
  const righe = [];
  const tr = /<tr[\s\S]*?<\/tr>/gi;
  let r;
  while ((r = tr.exec(html || ''))) {
    const celle = (r[0].match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(function (c) {
      return c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
    });
    if (celle.length >= 7) righe.push('| ' + celle.join(' | ') + ' |');
  }
  return righe.join('\n');
}

// Prova: dall'editor esegui questa funzione per dare i permessi e vedere cosa legge.
function prova() {
  Logger.log(doGet().getContent().slice(0, 2000));
}

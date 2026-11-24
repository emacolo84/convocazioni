# Convocazioni e presidi

Partite TGI Sport e presidi audio Leading Technologies, con i compensi del mese e della stagione.

Si installa sull'iPhone da Safari: Condividi → Aggiungi alla schermata Home. Funziona anche senza rete; i dati stanno su Firebase (Firestore + login email/password).

- `config.js`: configurazione pubblica del progetto Firebase.
- `firestore.rules`: regole da incollare in Firestore → Regole (con la propria email).
- A ogni pubblicazione cambiare `VERSION` in `sw.js`, così il telefono scarica la versione nuova.
- Il pulsante "Importa backup" carica un file JSON esportato con "Backup".
- `gmail/Codice.gs`: script Google che legge le convocazioni di TGI Sport dalla Gmail. Si pubblica come app web e il suo indirizzo si incolla nell'app con "Collega Gmail".
- `scripts/controlli.js` e `scripts/controllo-visivo.js`: i controlli che girano su ogni PR (versione, sintassi, aspetto delle schede su telefono in 6 combinazioni di tema; gli screenshot restano allegati alla PR). Il secondo si prova in locale con `npm i --no-save playwright && node scripts/controllo-visivo.js`.

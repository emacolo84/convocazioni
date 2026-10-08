# Convocazioni e presidi

Partite TGI Sport e presidi audio Leading Technologies, con i compensi del mese e della stagione.

Si installa sull'iPhone da Safari: Condividi → Aggiungi alla schermata Home. Funziona anche senza rete; i dati stanno su Firebase (Firestore + login email/password).

- `config.js`: configurazione pubblica del progetto Firebase.
- `firestore.rules`: regole da incollare in Firestore → Regole (con la propria email).
- A ogni pubblicazione cambiare `VERSION` in `sw.js`, così il telefono scarica la versione nuova.
- Il pulsante "Importa backup" carica un file JSON esportato con "Backup".

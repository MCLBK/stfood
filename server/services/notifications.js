/**
 * Service de notifications — ARCHITECTURE PRÊTE, PAS ENCORE CONNECTÉE.
 *
 * Le brief demande de prévoir la structure pour des notifications
 * (site, email, SMS, WhatsApp) sans forcément intégrer des API payantes
 * dès la V1. C'est exactement ce que fait ce fichier : chaque événement
 * de commande passe par `notify()`, qui aujourd'hui se contente
 * d'enregistrer l'événement dans `order_events` (visible dans le suivi
 * de commande et dans l'admin).
 *
 * Pour brancher un vrai envoi plus tard (ex: WhatsApp Business API,
 * un fournisseur SMS local au Bénin, ou un simple email), il suffit
 * d'ajouter l'appel réseau correspondant dans `notify()` ci-dessous —
 * aucun autre fichier n'a besoin de changer.
 */
const db = require('../db/init');

const insertEvent = db.prepare(`
  INSERT INTO order_events (order_id, event, detail) VALUES (?, ?, ?)
`);

/**
 * @param {string} orderId
 * @param {string} event  ex: 'status:en_preparation', 'late_flagged', 'arrived'
 * @param {string} detail texte libre (ex: heure, note)
 */
function notify(orderId, event, detail = '') {
  insertEvent.run(orderId, event, detail);

  // --- Point d'intégration futur ---
  // if (process.env.WHATSAPP_API_KEY) { /* envoyer via l'API WhatsApp Business */ }
  // if (process.env.SMS_PROVIDER_KEY) { /* envoyer un SMS */ }
  // Pour l'instant : trace console utile en développement.
  console.log(`[notify] commande ${orderId} → ${event} ${detail ? '(' + detail + ')' : ''}`);
}

module.exports = { notify };

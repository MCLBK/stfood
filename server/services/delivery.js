/**
 * Calcul des frais de livraison.
 *
 * Approche retenue (la plus réaliste sans système de géolocalisation
 * précis côté restaurant) : le client choisit son quartier parmi une
 * liste de zones définies par le restaurant, chacune avec un tarif de
 * base. Le prix s'affiche immédiatement.
 *
 * Si le quartier n'est pas dans la liste (zone "fee: 0" avec le libellé
 * "le livreur confirme"), la commande est créée avec un statut
 * `delivery_fee_confirmed = 0` : le prix définitif est ajouté ensuite
 * par le livreur/l'équipe depuis l'admin, et le client le voit
 * apparaître dans son suivi de commande dès qu'il est confirmé.
 *
 * C'est la version "idéale" demandée : calcul automatique quand c'est
 * possible, confirmation humaine quand ça ne l'est pas — jamais un prix
 * inventé affiché comme définitif.
 */
const db = require('../db/init');

function getZone(zoneId) {
  return db.prepare('SELECT * FROM delivery_zones WHERE id = ? AND active = 1').get(zoneId);
}

function listZones() {
  return db.prepare('SELECT * FROM delivery_zones WHERE active = 1 ORDER BY sort_order ASC').all();
}

/**
 * @returns {{ fee: number|null, confirmed: boolean }}
 */
function estimateFee(zoneId) {
  const zone = getZone(zoneId);
  if (!zone) return { fee: null, confirmed: false };
  if (zone.fee > 0) return { fee: zone.fee, confirmed: true };
  return { fee: null, confirmed: false }; // "le livreur confirme"
}

module.exports = { getZone, listZones, estimateFee };

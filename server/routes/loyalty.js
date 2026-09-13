const express = require('express');
const db = require('../db/init');

const router = express.Router();

// Seuil de récompense — configurable ici (repris de l'idée du brief : "8 commandes = récompense")
const REWARD_THRESHOLD = 8;

// GET /api/loyalty/:phone — utilisé après une commande pour afficher
// "C'est ta Nème commande" + progression vers la récompense.
// Pas de compte requis : uniquement basé sur le numéro de téléphone donné à la commande.
router.get('/loyalty/:phone', (req, res) => {
  const row = db.prepare('SELECT * FROM loyalty WHERE phone = ?').get(req.params.phone);
  const count = row ? row.orders_count : 0;
  const remaining = Math.max(0, REWARD_THRESHOLD - (count % REWARD_THRESHOLD || REWARD_THRESHOLD));
  const eligible = count > 0 && count % REWARD_THRESHOLD === 0;
  res.json({
    phone: req.params.phone,
    ordersCount: count,
    threshold: REWARD_THRESHOLD,
    remainingForReward: eligible ? 0 : (REWARD_THRESHOLD - (count % REWARD_THRESHOLD)),
    rewardEligible: eligible,
  });
});

module.exports = router;

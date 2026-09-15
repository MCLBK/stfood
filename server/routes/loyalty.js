const express = require('express');
const db = require('../db/init');

const router = express.Router();

// Seuil de récompense — configurable ici (repris de l'idée du brief : "8 commandes = récompense")
const REWARD_THRESHOLD = 8;

// ============================================================
// PALIERS DE FIDÉLITÉ
// Chaque palier donne des avantages progressifs.
// Les avantages sont provisoires — à valider avec le restaurant.
// ============================================================
const TIERS = [
  {
    id: 'bronze',
    label: 'Bronze',
    emoji: '🥉',
    minOrders: 1,
    maxOrders: 4,
    color: '#A9793D',
    perks: [
      'Suivi de tes commandes',
      'Offres spéciales occasionnelles',
    ],
  },
  {
    id: 'argent',
    label: 'Argent',
    emoji: '🥈',
    minOrders: 5,
    maxOrders: 7,
    color: '#8A8A8A',
    perks: [
      'Tous les avantages Bronze',
      '-5% sur ta prochaine commande',
      'Accès aux nouveautés en avant-première',
    ],
  },
  {
    id: 'or',
    label: 'Or',
    emoji: '🥇',
    minOrders: 8,
    maxOrders: null,
    color: '#D4AF37',
    perks: [
      'Tous les avantages Argent',
      'Plat ou boisson offert tous les 8 commandes',
      'Accès prioritaire aux éditions limitées',
    ],
  },
];

function getTier(ordersCount) {
  if (ordersCount <= 0) return null;
  // On trouve le palier correspondant
  for (const tier of TIERS) {
    if (ordersCount >= tier.minOrders && (tier.maxOrders === null || ordersCount <= tier.maxOrders)) {
      return tier;
    }
  }
  // Au-delà du dernier palier, on reste au dernier
  return TIERS[TIERS.length - 1];
}

function getNextTier(currentTierId) {
  const idx = TIERS.findIndex(t => t.id === currentTierId);
  if (idx === -1 || idx === TIERS.length - 1) return null;
  return TIERS[idx + 1];
}

// ============================================================
// GET /api/loyalty/:phone
// Utilisé après une commande pour afficher :
// - "C'est ta Nème commande"
// - Le palier actuel (Bronze / Argent / Or)
// - La progression vers le prochain palier
// - La progression vers la récompense des 8 commandes
// ============================================================
router.get('/loyalty/:phone', (req, res) => {
  const phone = req.params.phone;
  const row = db.prepare('SELECT * FROM loyalty WHERE phone = ?').get(phone);
  const count = row ? row.orders_count : 0;

  // Palier actuel
  const currentTier = getTier(count);
  const nextTier = currentTier ? getNextTier(currentTier.id) : TIERS[0];

  // Progression vers le prochain palier
  let ordersToNextTier = 0;
  let progressPercent = 0;

  if (currentTier && nextTier) {
    ordersToNextTier = nextTier.minOrders - count;
    const rangeSize = nextTier.minOrders - currentTier.minOrders;
    const progress = count - currentTier.minOrders;
    progressPercent = rangeSize > 0 ? Math.round((progress / rangeSize) * 100) : 0;
  } else if (!currentTier) {
    // Pas encore commandé
    ordersToNextTier = TIERS[0].minOrders;
    progressPercent = 0;
  } else if (currentTier && !nextTier) {
    // Déjà au palier max
    ordersToNextTier = 0;
    progressPercent = 100;
  }

  // Progression vers la récompense (8 commandes)
  const remainingForReward = count === 0
    ? REWARD_THRESHOLD
    : (count % REWARD_THRESHOLD === 0 ? 0 : REWARD_THRESHOLD - (count % REWARD_THRESHOLD));
  const rewardEligible = count > 0 && count % REWARD_THRESHOLD === 0;
  const rewardProgress = count === 0 ? 0 : Math.round(((REWARD_THRESHOLD - remainingForReward) / REWARD_THRESHOLD) * 100);

  res.json({
    phone,
    ordersCount: count,
    threshold: REWARD_THRESHOLD,

    // Palier
    tier: currentTier ? {
      id: currentTier.id,
      label: currentTier.label,
      emoji: currentTier.emoji,
      color: currentTier.color,
      perks: currentTier.perks,
    } : null,
    nextTier: nextTier ? {
      id: nextTier.id,
      label: nextTier.label,
      emoji: nextTier.emoji,
      color: nextTier.color,
      perks: nextTier.perks,
    } : null,
    ordersToNextTier,
    tierProgressPercent: progressPercent,

    // Récompense des 8 commandes
    remainingForReward,
    rewardEligible,
    rewardProgressPercent: rewardProgress,
  });
});

// ============================================================
// GET /api/loyalty/tiers/all
// Renvoie la liste complète des paliers (pour affichage informatif)
// ============================================================
router.get('/loyalty/tiers/all', (req, res) => {
  res.json({ tiers: TIERS });
});

module.exports = router;

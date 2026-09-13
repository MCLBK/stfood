const express = require('express');
const QRCode = require('qrcode');

const router = express.Router();

/**
 * GET /api/qr?url=...&table=...
 *
 * Génère un QR code (PNG) pointant vers le site, avec un paramètre de
 * table optionnel (ex: ?url=https://streetfood-cotonou.bj&table=5) pour
 * qu'une future version puisse pré-remplir "commande sur place, table 5".
 * C'est la brique de base pour l'idée "QR code sur les tables" du brief —
 * l'impression physique et la génération table par table depuis l'admin
 * s'appuient dessus (voir /admin → onglet "QR codes").
 */
router.get('/qr', async (req, res) => {
  const base = req.query.url || `${req.protocol}://${req.get('host')}`;
  const table = req.query.table;
  const target = table ? `${base}/?table=${encodeURIComponent(table)}` : base;

  try {
    const png = await QRCode.toBuffer(target, {
      width: 480,
      margin: 2,
      color: { dark: '#15110F', light: '#FAF5EC' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr${table ? '-table-' + table : ''}.png"`);
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: 'Génération du QR code impossible.' });
  }
});

module.exports = router;

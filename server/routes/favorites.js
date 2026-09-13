const express = require('express');
const db = require('../db/init');

const router = express.Router();

// Les favoris sont liés à un `guestId` généré et stocké côté navigateur
// (localStorage), pas à un compte — cohérent avec le principe du brief :
// la création de compte reste facultative.

// GET /api/favorites/:guestId
router.get('/favorites/:guestId', (req, res) => {
  const rows = db.prepare('SELECT dish_id FROM favorites WHERE guest_id = ?').all(req.params.guestId);
  res.json({ dishIds: rows.map(r => r.dish_id) });
});

// POST /api/favorites/:guestId  { dishId }
router.post('/favorites/:guestId', (req, res) => {
  const { dishId } = req.body || {};
  if (!dishId) return res.status(400).json({ error: 'dishId manquant.' });
  db.prepare('INSERT OR IGNORE INTO favorites (guest_id, dish_id) VALUES (?, ?)').run(req.params.guestId, dishId);
  res.status(201).json({ ok: true });
});

// DELETE /api/favorites/:guestId/:dishId
router.delete('/favorites/:guestId/:dishId', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE guest_id = ? AND dish_id = ?').run(req.params.guestId, req.params.dishId);
  res.json({ ok: true });
});

module.exports = router;

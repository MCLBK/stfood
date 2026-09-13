
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// ============================================================
// ROUTES PUBLIQUES (utilisées par le site client)
// ============================================================

// GET /api/reviews — Liste des avis approuvés (visibles sur le site)
router.get('/reviews', (req, res) => {
  try {
    const reviews = db.prepare(`
      SELECT id, name, rating, comment, source, created_at
      FROM reviews
      WHERE approved = 1
      ORDER BY created_at DESC
    `).all();

    // Calcul de la note moyenne
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        ROUND(AVG(rating), 1) as average
      FROM reviews
      WHERE approved = 1
    `).get();

    res.json({
      reviews,
      total: stats.total || 0,
      average: stats.average || 0,
    });
  } catch (err) {
    console.error('Erreur GET /reviews:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/reviews — Un client envoie un avis (en attente de modération)
router.post('/reviews', (req, res) => {
  try {
    const { name, rating, comment, phone } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Nom requis (min. 2 caractères)' });
    }
    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Note invalide (1 à 5)' });
    }
    if (comment && comment.length > 1000) {
      return res.status(400).json({ error: 'Commentaire trop long (max 1000 caractères)' });
    }

    const stmt = db.prepare(`
      INSERT INTO reviews (name, rating, comment, phone, source, approved)
      VALUES (?, ?, ?, ?, 'site', 0)
    `);

    const result = stmt.run(
      name.trim(),
      Math.round(rating),
      comment ? comment.trim() : null,
      phone ? phone.trim() : null
    );

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: 'Merci ! Votre avis sera publié après validation.',
    });
  } catch (err) {
    console.error('Erreur POST /reviews:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// ROUTES ADMIN (modération — protégées)
// ============================================================

// Middleware d'authentification admin (réutilise la logique existante)
const requireAdmin = require('../middleware/admin-auth');

// GET /api/admin/reviews — Liste TOUS les avis (approuvés + en attente)
router.get('/admin/reviews', requireAdmin, (req, res) => {
  try {
    const reviews = db.prepare(`
      SELECT id, name, rating, comment, phone, source, created_at, approved
      FROM reviews
      ORDER BY approved ASC, created_at DESC
    `).all();

    res.json({ reviews });
  } catch (err) {
    console.error('Erreur GET /admin/reviews:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/admin/reviews/:id — Approuver ou rejeter un avis
router.patch('/admin/reviews/:id', requireAdmin, (req, res) => {
  try {
    const { approved } = req.body;
    const id = parseInt(req.params.id, 10);

    if (typeof approved !== 'boolean' && approved !== 0 && approved !== 1) {
      return res.status(400).json({ error: 'Champ approved requis (booléen)' });
    }

    const stmt = db.prepare(`UPDATE reviews SET approved = ? WHERE id = ?`);
    const result = stmt.run(approved ? 1 : 0, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Avis introuvable' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur PATCH /admin/reviews:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/reviews/:id — Supprimer un avis
router.delete('/admin/reviews/:id', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = db.prepare(`DELETE FROM reviews WHERE id = ?`).run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Avis introuvable' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur DELETE /admin/reviews:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

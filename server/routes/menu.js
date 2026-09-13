const express = require('express');
const db = require('../db/init');
const delivery = require('../services/delivery');

const router = express.Router();

// GET /api/menu — catégories + plats (disponibles ou "bientôt")
router.get('/menu', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
  const dishes = db.prepare('SELECT * FROM dishes WHERE available = 1 ORDER BY sort_order ASC').all();

  const shaped = dishes.map(d => ({
    id: d.id,
    cat: d.category_id,
    name: d.name,
    desc: d.description,
    photo: d.photo,
    xl: d.price_xl,
    xxl: d.price_xxl,
    price: d.price_simple,
    simple: !!d.is_simple,
    variants: d.variants_json ? JSON.parse(d.variants_json) : null,
    spicyToggle: !!d.spicy_toggle,
    viandeOption: !!d.viande_option,
    colorOption: !!d.color_option,
    soon: !!d.soon,
  }));

  res.json({ categories, dishes: shaped });
});

// GET /api/delivery/zones — zones actives, pour le sélecteur au checkout
router.get('/delivery/zones', (req, res) => {
  res.json({ zones: delivery.listZones() });
});

module.exports = router;

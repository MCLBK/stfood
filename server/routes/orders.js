const express = require('express');
const db = require('../db/init');
const delivery = require('../services/delivery');
const { notify } = require('../services/notifications');

const router = express.Router();

function nextOrderId() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM orders').get();
  return 'SF-' + (1024 + row.n);
}

function shapeOrder(order) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const events = db.prepare('SELECT event, detail, created_at FROM order_events WHERE order_id = ? ORDER BY created_at ASC').all(order.id);
  return { ...order, items, events };
}

/**
 * POST /api/orders
 * body: {
 *   mode, customerName, customerPhone,
 *   deliveryAddress, deliveryZoneId, deliveryNotes,
 *   peopleCount, requestedTime,
 *   items: [{ dishId, dishName, variantLabel, unitPrice, qty }]
 * }
 */
router.post('/orders', (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return res.status(400).json({ error: 'La commande est vide.' });
  }
  if (!['livraison', 'emporter', 'surplace'].includes(b.mode)) {
    return res.status(400).json({ error: 'Mode de commande invalide.' });
  }

  const subtotal = b.items.reduce((s, i) => s + (i.unitPrice * i.qty), 0);

  let deliveryFeeEstimate = null;
  let deliveryFeeConfirmed = 0;
  if (b.mode === 'livraison' && b.deliveryZoneId) {
    const est = delivery.estimateFee(b.deliveryZoneId);
    deliveryFeeEstimate = est.fee;
    deliveryFeeConfirmed = est.confirmed ? 1 : 0;
  }

  const total = subtotal + (deliveryFeeEstimate || 0);
  const id = nextOrderId();

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, mode, status, customer_name, customer_phone,
      delivery_address, delivery_zone_id, delivery_fee_estimate, delivery_fee_final, delivery_fee_confirmed, delivery_notes,
      people_count, is_group_order, requested_time, is_scheduled,
      items_subtotal, total
    ) VALUES (
      @id, @mode, 'recue', @customer_name, @customer_phone,
      @delivery_address, @delivery_zone_id, @delivery_fee_estimate, @delivery_fee_final, @delivery_fee_confirmed, @delivery_notes,
      @people_count, @is_group_order, @requested_time, @is_scheduled,
      @items_subtotal, @total
    )
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, dish_id, dish_name, variant_label, unit_price, qty)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertOrder.run({
      id,
      mode: b.mode,
      customer_name: b.customerName || null,
      customer_phone: b.customerPhone || null,
      delivery_address: b.deliveryAddress || null,
      delivery_zone_id: b.deliveryZoneId || null,
      delivery_fee_estimate: deliveryFeeEstimate,
      delivery_fee_final: deliveryFeeConfirmed ? deliveryFeeEstimate : null,
      delivery_fee_confirmed: deliveryFeeConfirmed,
      delivery_notes: b.deliveryNotes || null,
      people_count: b.peopleCount || null,
      is_group_order: b.isGroupOrder ? 1 : 0,
      requested_time: b.requestedTime || null,
      is_scheduled: b.requestedTime ? 1 : 0,
      items_subtotal: subtotal,
      total,
    });
    for (const it of b.items) {
      insertItem.run(id, it.dishId || null, it.dishName, it.variantLabel || '', it.unitPrice, it.qty);
    }

    // Fidélité : incrémenter le compteur associé au numéro de téléphone (si fourni)
    if (b.customerPhone) {
      db.prepare(`
        INSERT INTO loyalty (phone, orders_count) VALUES (?, 1)
        ON CONFLICT(phone) DO UPDATE SET orders_count = orders_count + 1, updated_at = datetime('now')
      `).run(b.customerPhone);
    }
  });
  tx();

  notify(id, 'order_created', b.mode);
  notify(id, 'status:recue');

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.status(201).json(shapeOrder(order));
});

// GET /api/orders/:id — suivi de commande (public, id difficile à deviner suffit ici)
router.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  res.json(shapeOrder(order));
});

// PATCH /api/orders/:id/late — le client signale un imprévu / retard
router.patch('/orders/:id/late', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });

  const note = (req.body && req.body.note) || '';
  db.prepare('UPDATE orders SET late_flagged = 1, late_note = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(note, order.id);
  notify(order.id, 'late_flagged', note);

  res.json(shapeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)));
});

// PATCH /api/orders/:id/arrived — mode "sur place" : le client signale son arrivée
router.patch('/orders/:id/arrived', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });

  db.prepare('UPDATE orders SET arrived = 1, updated_at = datetime(\'now\') WHERE id = ?').run(order.id);
  notify(order.id, 'arrived');

  res.json(shapeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)));
});

module.exports = router;

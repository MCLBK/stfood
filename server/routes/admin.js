const express = require('express');
const db = require('../db/init');
const { verifyPassword, createSession, requireAdmin, sessions } = require('../middleware/adminAuth');
const { notify } = require('../services/notifications');

const router = express.Router();

/* ============================================================
   AUTH
   ============================================================ */
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }
  const token = createSession(username);
  res.json({ token, username });
});

router.post('/admin/logout', requireAdmin, (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

/* Tout ce qui suit exige une session admin valide */
router.use('/admin', requireAdmin);

/* ============================================================
   CATÉGORIES
   ============================================================ */
router.get('/admin/categories', (req, res) => {
  res.json({ categories: db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all() });
});
router.post('/admin/categories', (req, res) => {
  const { id, label, emoji, sortOrder } = req.body || {};
  if (!id || !label) return res.status(400).json({ error: 'id et label requis.' });
  db.prepare('INSERT OR REPLACE INTO categories (id,label,emoji,sort_order) VALUES (?,?,?,?)')
    .run(id, label, emoji || '', sortOrder || 0);
  res.status(201).json({ ok: true });
});

/* ============================================================
   PLATS — CRUD complet (le coeur de "le personnel gère sans développeur")
   ============================================================ */
router.get('/admin/dishes', (req, res) => {
  res.json({ dishes: db.prepare('SELECT * FROM dishes ORDER BY category_id, sort_order').all() });
});

router.post('/admin/dishes', (req, res) => {
  const d = req.body || {};
  if (!d.id || !d.categoryId || !d.name) {
    return res.status(400).json({ error: 'id, categoryId et name sont requis.' });
  }
  db.prepare(`
    INSERT INTO dishes (id, category_id, name, description, photo, price_xl, price_xxl, price_simple,
      is_simple, spicy_toggle, viande_option, color_option, available, soon, sort_order)
    VALUES (@id, @category_id, @name, @description, @photo, @price_xl, @price_xxl, @price_simple,
      @is_simple, @spicy_toggle, @viande_option, @color_option, @available, @soon, @sort_order)
  `).run({
    id: d.id, category_id: d.categoryId, name: d.name, description: d.description || '',
    photo: d.photo || '', price_xl: d.priceXl ?? null, price_xxl: d.priceXxl ?? null,
    price_simple: d.priceSimple ?? null, is_simple: d.isSimple ? 1 : 0,
    spicy_toggle: d.spicyToggle ? 1 : 0, viande_option: d.viandeOption ? 1 : 0,
    color_option: d.colorOption ? 1 : 0, available: d.available === false ? 0 : 1,
    soon: d.soon ? 1 : 0, sort_order: d.sortOrder || 0,
  });
  res.status(201).json({ ok: true });
});

router.put('/admin/dishes/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM dishes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Plat introuvable.' });
  const d = req.body || {};
  db.prepare(`
    UPDATE dishes SET
      category_id=@category_id, name=@name, description=@description, photo=@photo,
      price_xl=@price_xl, price_xxl=@price_xxl, price_simple=@price_simple,
      is_simple=@is_simple, spicy_toggle=@spicy_toggle, viande_option=@viande_option,
      color_option=@color_option, available=@available, soon=@soon, sort_order=@sort_order,
      updated_at=datetime('now')
    WHERE id=@id
  `).run({
    id: req.params.id,
    category_id: d.categoryId ?? existing.category_id,
    name: d.name ?? existing.name,
    description: d.description ?? existing.description,
    photo: d.photo ?? existing.photo,
    price_xl: d.priceXl !== undefined ? d.priceXl : existing.price_xl,
    price_xxl: d.priceXxl !== undefined ? d.priceXxl : existing.price_xxl,
    price_simple: d.priceSimple !== undefined ? d.priceSimple : existing.price_simple,
    is_simple: d.isSimple !== undefined ? (d.isSimple ? 1 : 0) : existing.is_simple,
    spicy_toggle: d.spicyToggle !== undefined ? (d.spicyToggle ? 1 : 0) : existing.spicy_toggle,
    viande_option: d.viandeOption !== undefined ? (d.viandeOption ? 1 : 0) : existing.viande_option,
    color_option: d.colorOption !== undefined ? (d.colorOption ? 1 : 0) : existing.color_option,
    available: d.available !== undefined ? (d.available ? 1 : 0) : existing.available,
    soon: d.soon !== undefined ? (d.soon ? 1 : 0) : existing.soon,
    sort_order: d.sortOrder !== undefined ? d.sortOrder : existing.sort_order,
  });
  res.json({ ok: true });
});

// Bascule rapide dispo / rupture — "Produit indisponible" en un clic (brief §25)
router.patch('/admin/dishes/:id/availability', (req, res) => {
  const { available } = req.body || {};
  const result = db.prepare("UPDATE dishes SET available = ?, updated_at = datetime('now') WHERE id = ?")
    .run(available ? 1 : 0, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Plat introuvable.' });
  res.json({ ok: true });
});

router.delete('/admin/dishes/:id', (req, res) => {
  db.prepare('DELETE FROM dishes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ============================================================
   ZONES DE LIVRAISON
   ============================================================ */
router.get('/admin/delivery-zones', (req, res) => {
  res.json({ zones: db.prepare('SELECT * FROM delivery_zones ORDER BY sort_order').all() });
});
router.post('/admin/delivery-zones', (req, res) => {
  const { id, label, fee, sortOrder } = req.body || {};
  if (!id || !label) return res.status(400).json({ error: 'id et label requis.' });
  db.prepare('INSERT OR REPLACE INTO delivery_zones (id,label,fee,active,sort_order) VALUES (?,?,?,1,?)')
    .run(id, label, fee || 0, sortOrder || 0);
  res.status(201).json({ ok: true });
});
router.put('/admin/delivery-zones/:id', (req, res) => {
  const { label, fee, active, sortOrder } = req.body || {};
  const existing = db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Zone introuvable.' });
  db.prepare('UPDATE delivery_zones SET label=?, fee=?, active=?, sort_order=? WHERE id=?')
    .run(label ?? existing.label, fee ?? existing.fee, active !== undefined ? (active ? 1 : 0) : existing.active,
      sortOrder ?? existing.sort_order, req.params.id);
  res.json({ ok: true });
});
router.delete('/admin/delivery-zones/:id', (req, res) => {
  db.prepare('DELETE FROM delivery_zones WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/admin/orders', (req, res) => {
  const { status, since, until, search, limit } = req.query;

  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (since) {
    conditions.push("date(created_at) >= date(?)");
    params.push(since);
  }
  if (until) {
    conditions.push("date(created_at) <= date(?)");
    params.push(until);
  }
  if (search && search.trim()) {
    conditions.push('(customer_name LIKE ? OR customer_phone LIKE ?)');
    const q = '%' + search.trim() + '%';
    params.push(q, q);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const maxRows = parseInt(limit, 10) || 500;

  const rows = db.prepare(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, maxRows);

  const withItems = rows.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
  }));

  const validOrders = rows.filter(o => o.status !== 'annulee');
  const stats = {
    count: rows.length,
    revenue: validOrders.reduce((s, o) => s + (o.total || 0), 0),
    avgBasket: validOrders.length ? Math.round(validOrders.reduce((s, o) => s + (o.total || 0), 0) / validOrders.length) : 0,
    byMode: { livraison: 0, emporter: 0, surplace: 0 },
  };
  validOrders.forEach(o => {
    if (stats.byMode[o.mode] !== undefined) stats.byMode[o.mode]++;
  });

  res.json({ orders: withItems, stats });
});

// Créer une commande manuellement (par le personnel : téléphone, accueil, serveur)
router.post('/admin/orders', (req, res) => {
  const {
    mode, customer_name, customer_phone, delivery_address, delivery_zone_id, delivery_notes,
    people_count, is_group_order, requested_time, is_scheduled, items, status,
  } = req.body || {};

  if (!mode || !['livraison', 'emporter', 'surplace'].includes(mode)) {
    return res.status(400).json({ error: 'Mode invalide.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Ajoutez au moins un plat.' });
  }

  // Calcul du sous-total et du total
  let subtotal = 0;
  const validItems = [];
  for (const it of items) {
    if (!it.dish_id || !it.dish_name || !it.unit_price || !it.qty) continue;
    const qty = parseInt(it.qty, 10);
    const price = parseInt(it.unit_price, 10);
    if (qty <= 0 || price < 0) continue;
    subtotal += price * qty;
    validItems.push({
      dish_id: it.dish_id,
      dish_name: it.dish_name,
      variant_label: it.variant_label || '',
      unit_price: price,
      qty,
    });
  }
  if (validItems.length === 0) {
    return res.status(400).json({ error: 'Aucun plat valide.' });
  }

  // Frais de livraison (si livraison et zone renseignée)
  let deliveryFee = 0;
  let deliveryFeeConfirmed = 0;
  if (mode === 'livraison' && delivery_zone_id) {
    const zone = db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(delivery_zone_id);
    if (zone) {
      deliveryFee = zone.fee;
      // Si la zone a un frais > 0, on considère que c'est confirmé
      deliveryFeeConfirmed = zone.fee > 0 ? 1 : 0;
    }
  }

  const total = subtotal + deliveryFee;
  const orderId = 'SF-' + Date.now().toString().slice(-6);
  const finalStatus = status || 'recue';

  try {
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, mode, status, customer_name, customer_phone,
        delivery_address, delivery_zone_id, delivery_fee_estimate, delivery_fee_final, delivery_fee_confirmed, delivery_notes,
        people_count, is_group_order, requested_time, is_scheduled,
        items_subtotal, total
      ) VALUES (
        @id, @mode, @status, @customer_name, @customer_phone,
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
        id: orderId,
        mode,
        status: finalStatus,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        delivery_address: delivery_address || null,
        delivery_zone_id: delivery_zone_id || null,
        delivery_fee_estimate: deliveryFee || null,
        delivery_fee_final: deliveryFeeConfirmed ? deliveryFee : null,
        delivery_fee_confirmed: deliveryFeeConfirmed,
        delivery_notes: delivery_notes || null,
        people_count: people_count || null,
        is_group_order: is_group_order ? 1 : 0,
        requested_time: requested_time || null,
        is_scheduled: is_scheduled ? 1 : 0,
        items_subtotal: subtotal,
        total,
      });

      for (const it of validItems) {
        insertItem.run(orderId, it.dish_id, it.dish_name, it.variant_label, it.unit_price, it.qty);
      }
    });

    tx();

    // Notification (comme pour les commandes en ligne)
    try { notify(orderId, 'created_admin'); } catch (e) { /* silencieux */ }

    res.status(201).json({ ok: true, orderId });
  } catch (err) {
    console.error('Erreur création commande admin:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la création.' });
  }
});

const VALID_STATUSES = ['recue', 'en_preparation', 'prete', 'en_livraison', 'livree', 'servie', 'annulee'];

router.patch('/admin/orders/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  const result = db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Commande introuvable.' });
  notify(req.params.id, 'status:' + status);
  res.json({ ok: true });
});

// Le livreur / l'équipe confirme (ou ajuste) le tarif final de livraison —
// couvre le cas "zone non listée" où le prix n'était pas garanti au client.
router.patch('/admin/orders/:id/delivery-fee', (req, res) => {
  const { fee } = req.body || {};
  if (typeof fee !== 'number' || fee < 0) return res.status(400).json({ error: 'Tarif invalide.' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  const newTotal = order.items_subtotal + fee;
  db.prepare(`
    UPDATE orders SET delivery_fee_final = ?, delivery_fee_confirmed = 1, total = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(fee, newTotal, req.params.id);
  notify(req.params.id, 'delivery_fee_confirmed', String(fee));
  res.json({ ok: true });
});

/* ============================================================
   FIDÉLITÉ — vue d'ensemble
   ============================================================ */
router.get('/admin/loyalty', (req, res) => {
  const { tier, search, limit } = req.query;
  const maxRows = parseInt(limit, 10) || 500;

  // Récupérer tous les clients fidèles
  let rows = db.prepare('SELECT * FROM loyalty ORDER BY orders_count DESC LIMIT ?').all(maxRows);

  // Enrichir avec le nom du client (dernière commande connue) et la date de dernière commande
  rows = rows.map(r => {
    const lastOrder = db.prepare(`
      SELECT customer_name, MAX(created_at) AS last_order_at
      FROM orders
      WHERE customer_phone = ?
      GROUP BY customer_phone
    `).get(r.phone);
    return {
      ...r,
      customer_name: lastOrder ? lastOrder.customer_name : null,
      last_order_at: lastOrder ? lastOrder.last_order_at : null,
    };
  });

  // Calculer le palier pour chaque client
  const TIERS = [
    { id: 'bronze', label: 'Bronze', emoji: '🥉', minOrders: 1, maxOrders: 4, color: '#A9793D' },
    { id: 'argent', label: 'Argent', emoji: '🥈', minOrders: 5, maxOrders: 7, color: '#8A8A8A' },
    { id: 'or', label: 'Or', emoji: '🥇', minOrders: 8, maxOrders: null, color: '#D4AF37' },
  ];
  function getTier(count) {
    if (count <= 0) return null;
    for (const t of TIERS) {
      if (count >= t.minOrders && (t.maxOrders === null || count <= t.maxOrders)) return t;
    }
    return TIERS[TIERS.length - 1];
  }

  rows = rows.map(r => {
    const t = getTier(r.orders_count);
    return {
      ...r,
      tier_id: t ? t.id : null,
      tier_label: t ? t.label : null,
      tier_emoji: t ? t.emoji : null,
      tier_color: t ? t.color : null,
    };
  });

  // Filtre par palier
  if (tier && tier !== 'all') {
    rows = rows.filter(r => r.tier_id === tier);
  }

  // Filtre par recherche (nom ou téléphone)
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter(r =>
      (r.phone && r.phone.toLowerCase().includes(q)) ||
      (r.customer_name && r.customer_name.toLowerCase().includes(q))
    );
  }

  // Compteurs par palier (sur la totalité, pas sur le filtre)
  const allRows = db.prepare('SELECT * FROM loyalty').all();
  const counts = { bronze: 0, argent: 0, or: 0 };
  allRows.forEach(r => {
    const t = getTier(r.orders_count);
    if (t && counts[t.id] !== undefined) counts[t.id]++;
  });

  res.json({
    customers: rows,
    counts,
    total: allRows.length,
  });
});

/* ============================================================
   STATISTIQUES simples pour le tableau de bord (brief §25)
   ============================================================ */
router.get('/admin/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todays = db.prepare("SELECT * FROM orders WHERE date(created_at) = ? AND status != 'annulee'").all(today);
  const revenue = todays.reduce((s, o) => s + o.total, 0);
  const byMode = { livraison: 0, emporter: 0, surplace: 0 };
  todays.forEach(o => { if (byMode[o.mode] !== undefined) byMode[o.mode]++; });

  const pending = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('recue','en_preparation')").get().n;
  const ready = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'prete'").get().n;

  res.json({
    ordersToday: todays.length,
    revenueToday: revenue,
    avgBasket: todays.length ? Math.round(revenue / todays.length) : 0,
    byMode,
    pending,
    ready,
  });
});

/* ============================================================
   ANALYTICS — statistiques détaillées sur une période
   ============================================================ */
router.get('/admin/analytics', (req, res) => {
  const { since, until, search } = req.query;

  const conditions = ["status != 'annulee'"];
  const params = [];

  if (since) {
    conditions.push("date(created_at) >= date(?)");
    params.push(since);
  }
  if (until) {
    conditions.push("date(created_at) <= date(?)");
    params.push(until);
  }
  if (search && search.trim()) {
    conditions.push('(customer_name LIKE ? OR customer_phone LIKE ?)');
    const q = '%' + search.trim() + '%';
    params.push(q, q);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  // Commandes de la période
  const orders = db.prepare(`SELECT * FROM orders ${where}`).all(...params);

  // Toutes les commandes (y compris annulées) pour le taux d'annulation
  const allConditions = [];
  const allParams = [];
  if (since) { allConditions.push("date(created_at) >= date(?)"); allParams.push(since); }
  if (until) { allConditions.push("date(created_at) <= date(?)"); allParams.push(until); }
  if (search && search.trim()) {
    allConditions.push('(customer_name LIKE ? OR customer_phone LIKE ?)');
    const q = '%' + search.trim() + '%';
    allParams.push(q, q);
  }
  const allWhere = allConditions.length ? 'WHERE ' + allConditions.join(' AND ') : '';
  const allOrders = db.prepare(`SELECT status FROM orders ${allWhere}`).all(...allParams);

  // Top plats
  let topDishes = [];
  if (orders.length > 0) {
    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    topDishes = db.prepare(`
      SELECT dish_name, SUM(qty) AS total_qty, SUM(qty * unit_price) AS total_revenue
      FROM order_items
      WHERE order_id IN (${placeholders})
      GROUP BY dish_name
      ORDER BY total_qty DESC
      LIMIT 5
    `).all(...orderIds);
  }

  // Répartition par mode
  const byMode = { livraison: 0, emporter: 0, surplace: 0 };
  const revenueByMode = { livraison: 0, emporter: 0, surplace: 0 };
  orders.forEach(o => {
    if (byMode[o.mode] !== undefined) {
      byMode[o.mode]++;
      revenueByMode[o.mode] += o.total || 0;
    }
  });

  // Heures de pointe (0-23)
  const byHour = Array(24).fill(0);
  orders.forEach(o => {
    const h = new Date(o.created_at.replace(' ', 'T') + 'Z').getHours();
    byHour[h]++;
  });

  // Jours de la semaine (0=dimanche → 6=samedi)
  const byDay = Array(7).fill(0);
  orders.forEach(o => {
    const d = new Date(o.created_at.replace(' ', 'T') + 'Z').getDay();
    byDay[d]++;
  });

  // Panier moyen global et par mode
  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const avgBasket = orders.length ? Math.round(totalRevenue / orders.length) : 0;
  const avgByMode = {
    livraison: byMode.livraison ? Math.round(revenueByMode.livraison / byMode.livraison) : 0,
    emporter: byMode.emporter ? Math.round(revenueByMode.emporter / byMode.emporter) : 0,
    surplace: byMode.surplace ? Math.round(revenueByMode.surplace / byMode.surplace) : 0,
  };

  // Taux d'annulation
  const cancelled = allOrders.filter(o => o.status === 'annulee').length;
  const cancelRate = allOrders.length ? Math.round((cancelled / allOrders.length) * 100) : 0;

  // Clients uniques (par téléphone)
  const phones = new Set(orders.filter(o => o.customer_phone).map(o => o.customer_phone));
  const uniqueCustomers = phones.size;

  // Clients récurrents (téléphone présent dans >1 commande sur la période)
  const phoneCounts = {};
  orders.forEach(o => {
    if (o.customer_phone) {
      phoneCounts[o.customer_phone] = (phoneCounts[o.customer_phone] || 0) + 1;
    }
  });
  const returningCustomers = Object.values(phoneCounts).filter(c => c > 1).length;

  res.json({
    totalOrders: orders.length,
    totalRevenue,
    avgBasket,
    uniqueCustomers,
    returningCustomers,
    cancelRate,
    topDishes,
    byMode,
    revenueByMode,
    avgByMode,
    byHour,
    byDay,
  });
});

/* ============================================================
   MODE CUISINE — accès simplifié par mot de passe
   Permet au cuisinier de voir les commandes en cours
   et de les marquer comme prêtes.
   ============================================================ */

const CUISINE_PASSWORD = process.env.CUISINE_PASSWORD || 'streetfood-cuisine';

function requireCuisine(req, res, next) {
  const password = req.headers['x-cuisine-password'];
  if (password !== CUISINE_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe cuisine invalide.' });
  }
  next();
}

// Vérifier le mot de passe
router.post('/cuisine/login', (req, res) => {
  const { password } = req.body || {};
  if (password === CUISINE_PASSWORD) {
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Mot de passe invalide.' });
});

// Liste des commandes actives (Reçue + En préparation)
router.get('/cuisine/orders', requireCuisine, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM orders
    WHERE status IN ('recue', 'en_preparation')
    ORDER BY created_at ASC
  `).all();

  const withItems = rows.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
    seconds_ago: Math.floor((Date.now() - new Date(o.created_at.replace(' ', 'T') + 'Z').getTime()) / 1000),
  }));

  res.json({ orders: withItems });
});

// Marquer une commande comme prête
router.patch('/cuisine/orders/:id/ready', requireCuisine, (req, res) => {
  const result = db.prepare("UPDATE orders SET status = 'prete', updated_at = datetime('now') WHERE id = ?")
    .run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Commande introuvable.' });
  try { notify(req.params.id, 'status:prete'); } catch (e) { /* silencieux */ }
  res.json({ ok: true });
});

// Marquer une commande comme en préparation (depuis 'recue')
router.patch('/cuisine/orders/:id/preparing', requireCuisine, (req, res) => {
  const result = db.prepare("UPDATE orders SET status = 'en_preparation', updated_at = datetime('now') WHERE id = ? AND status = 'recue'")
    .run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Commande introuvable ou déjà en préparation.' });
  try { notify(req.params.id, 'status:en_preparation'); } catch (e) { /* silencieux */ }
  res.json({ ok: true });
});

/* ============================================================
   HISTORIQUE CLIENT — toutes les commandes d'un client
   ============================================================ */
router.get('/admin/loyalty/:phone/orders', (req, res) => {
  const { phone } = req.params;

  // Vérifier que le client existe dans la table loyalty
  const loyalty = db.prepare('SELECT * FROM loyalty WHERE phone = ?').get(phone);
  if (!loyalty) {
    return res.status(404).json({ error: 'Client introuvable.' });
  }

  // Récupérer toutes les commandes de ce client
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE customer_phone = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(phone);

  // Enrichir avec les items de chaque commande
  const ordersWithItems = orders.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
  }));

  // Calculer les stats
  const validOrders = orders.filter(o => o.status !== 'annulee');
  const totalSpent = validOrders.reduce((s, o) => s + (o.total || 0), 0);
  const avgBasket = validOrders.length ? Math.round(totalSpent / validOrders.length) : 0;
  const firstOrder = orders.length ? orders[orders.length - 1].created_at : null;
  const lastOrder = orders.length ? orders[0].created_at : null;

  // Récupérer le nom (dernière commande connue)
  const lastOrderWithName = orders.find(o => o.customer_name);
  const customerName = lastOrderWithName ? lastOrderWithName.customer_name : null;

  res.json({
    phone,
    customer_name: customerName,
    orders_count: loyalty.orders_count,
    orders: ordersWithItems,
    stats: {
      totalOrders: orders.length,
      totalSpent,
      avgBasket,
      firstOrder,
      lastOrder,
      cancelled: orders.filter(o => o.status === 'annulee').length,
      byMode: {
        livraison: validOrders.filter(o => o.mode === 'livraison').length,
        emporter: validOrders.filter(o => o.mode === 'emporter').length,
        surplace: validOrders.filter(o => o.mode === 'surplace').length,
      },
    },
  });
});

module.exports = router;

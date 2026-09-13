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

/* ============================================================
   COMMANDES — dashboard + gestion des statuts
   ============================================================ */
router.get('/admin/orders', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200').all();
  const withItems = rows.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
  }));
  res.json({ orders: withItems });
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
  const rows = db.prepare('SELECT * FROM loyalty ORDER BY orders_count DESC LIMIT 100').all();
  res.json({ customers: rows });
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

module.exports = router;

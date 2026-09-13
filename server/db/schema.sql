-- ============================================================
-- STREET FOOD — Schéma de base de données (SQLite)
-- ============================================================

-- Catégories de plats (Spaghettis, Coquillettes, Shawarma, ...)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  emoji TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

-- Plats. Un plat peut avoir 1 ou 2 prix (xl/xxl) ou un prix unique (price).
-- available = false -> masqué du menu client sans être supprimé (ex: rupture).
-- soon = true -> catégorie existante mais tarif pas encore fixé, affiché "Bientôt".
CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  price_xl INTEGER,
  price_xxl INTEGER,
  price_simple INTEGER,
  is_simple INTEGER DEFAULT 0,     -- 1 = prix unique (ex: boisson), pas de taille
  variants_json TEXT,               -- ex: '["Desperados","Beaufort"]' — choix simple sans taper de texte
  spicy_toggle INTEGER DEFAULT 0,
  viande_option INTEGER DEFAULT 0,
  color_option INTEGER DEFAULT 0,  -- sauce rouge / blanc
  available INTEGER DEFAULT 1,
  soon INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Zones de livraison définies par le restaurant, avec un tarif de base.
-- Sert à donner une estimation immédiate au client.
CREATE TABLE IF NOT EXISTS delivery_zones (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,           -- ex: "Haie Vive (centre)"
  fee INTEGER NOT NULL,          -- FCFA
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

-- Commandes
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,              -- ex: SF-1042
  mode TEXT NOT NULL,               -- livraison | emporter | surplace
  status TEXT NOT NULL DEFAULT 'recue',
  -- statuts possibles : recue, en_preparation, prete, en_livraison, livree, servie, annulee

  customer_name TEXT,
  customer_phone TEXT,

  -- livraison
  delivery_address TEXT,
  delivery_zone_id TEXT REFERENCES delivery_zones(id),
  delivery_fee_estimate INTEGER,        -- calculé automatiquement depuis la zone
  delivery_fee_final INTEGER,           -- confirmé/ajusté par le livreur
  delivery_fee_confirmed INTEGER DEFAULT 0,
  delivery_notes TEXT,

  -- emporter / surplace / commande de groupe
  people_count INTEGER,
  is_group_order INTEGER DEFAULT 0,

  -- programmation & gestion des imprévus
  requested_time TEXT,              -- heure choisie par le client (HH:MM) ou NULL = dès que possible
  is_scheduled INTEGER DEFAULT 0,
  late_flagged INTEGER DEFAULT 0,   -- client a signalé un retard
  late_note TEXT,
  arrived INTEGER DEFAULT 0,        -- pour "sur place" : client a cliqué "je suis arrivé"

  payment_method TEXT DEFAULT 'a_la_livraison_ou_retrait',

  items_subtotal INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Lignes de commande
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  dish_id TEXT,
  dish_name TEXT NOT NULL,
  variant_label TEXT DEFAULT '',   -- ex: "XL · Rouge · Spicy · avec viande"
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1
);

-- Historique des statuts (utile pour le suivi + un futur dashboard "temps moyen")
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  event TEXT NOT NULL,             -- ex: "status:en_preparation", "late_flagged", "arrived"
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Favoris (basé sur un identifiant client léger stocké côté navigateur,
-- pas de compte obligatoire — cf. brief : la création de compte doit rester facultative)
CREATE TABLE IF NOT EXISTS favorites (
  guest_id TEXT NOT NULL,
  dish_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (guest_id, dish_id)
);

-- Fidélité simple : compteur de commandes par numéro de téléphone.
-- Base minimale, pensée pour être enrichie (paliers, récompenses) en V2.
CREATE TABLE IF NOT EXISTS loyalty (
  phone TEXT PRIMARY KEY,
  orders_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Comptes admin/staff (mot de passe hashé) pour protéger le panneau d'administration.
CREATE TABLE IF NOT EXISTS admin_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL
);

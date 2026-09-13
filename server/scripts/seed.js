/**
 * Seed initial data :
 * - catégories & plats (les vrais tarifs fournis par le restaurant)
 * - zones de livraison (valeurs de démonstration — À AJUSTER par le
 *   restaurant dans le panneau admin avant mise en production, ce
 *   sont des placeholders, pas des tarifs officiels)
 * - un compte admin par défaut (identifiants dans .env, voir README)
 *
 * Relancer avec : npm run seed
 * (n'écrase pas les commandes existantes, seulement le menu/zones/admin)
 */
require('dotenv').config();
const crypto = require('crypto');
const db = require('../db/init');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const categories = [
  { id: 'spaghettis',   label: 'Spaghettis',   emoji: '🍝', sort_order: 1 },
  { id: 'coquillettes', label: 'Coquillettes', emoji: '🥣', sort_order: 2 },
  { id: 'shawarma',     label: 'Shawarma',     emoji: '🌯', sort_order: 3 },
  { id: 'sautes',       label: 'Sautés',       emoji: '🍖', sort_order: 4 },
  { id: 'boissons',     label: 'Boissons',     emoji: '🥤', sort_order: 5 },
];

const dishes = [
  // Spaghettis — prix réels du menu fourni
  { id: 'sp-lifestyle', category_id: 'spaghettis', name: 'Spaghetti Lifestyle',
    description: 'Sauce crème, légumes, saucisses, oeufs, sardines.',
    photo: 'assets/images/dish-spaghetti-1.jpg', price_xl: 2500, price_xxl: 3000,
    spicy_toggle: 1, viande_option: 1, sort_order: 1 },
  { id: 'sp-crazy', category_id: 'spaghettis', name: 'Spaghetti Crazy Vibes',
    description: 'Rouge ou blanc, légumes, saucisses, oeufs, sardines.',
    photo: 'assets/images/dish-spaghetti-1.jpg', price_xl: 2000, price_xxl: 2500,
    spicy_toggle: 1, viande_option: 1, color_option: 1, sort_order: 2 },
  { id: 'sp-good', category_id: 'spaghettis', name: 'Spaghetti Good Vibes',
    description: 'Rouge ou blanc, saucisses, oeufs.',
    photo: 'assets/images/dish-spaghetti-1.jpg', price_xl: 1500, price_xxl: 2000,
    spicy_toggle: 1, viande_option: 1, color_option: 1, sort_order: 3 },

  // Coquillettes
  { id: 'co-lifestyle', category_id: 'coquillettes', name: 'Coquillettes Lifestyle',
    description: 'Sauce crème, légumes, saucisses, oeufs, sardines.',
    photo: 'assets/images/dish-bowls.jpg', price_xl: 2500, price_xxl: 3000,
    spicy_toggle: 1, viande_option: 1, sort_order: 1 },
  { id: 'co-crazy', category_id: 'coquillettes', name: 'Coquillettes Crazy Vibes',
    description: 'Rouge ou blanc, légumes, saucisses, oeufs, sardines.',
    photo: 'assets/images/dish-bowls.jpg', price_xl: 2000, price_xxl: 2500,
    spicy_toggle: 1, viande_option: 1, color_option: 1, sort_order: 2 },
  { id: 'co-good', category_id: 'coquillettes', name: 'Coquillettes Good Vibes',
    description: 'Rouge ou blanc, saucisses, oeufs.',
    photo: 'assets/images/dish-bowls.jpg', price_xl: 1500, price_xxl: 2000,
    spicy_toggle: 1, viande_option: 1, color_option: 1, sort_order: 3 },

  // Riz blanc + sauce mouton — édition spéciale du samedi (vraie affiche du restaurant)
  { id: 'special-riz-mouton', category_id: 'spaghettis', name: 'Riz blanc + sauce mouton (Samedi dès 23h59)',
    description: "Les Matins Bonheurs à Street Food — uniquement le samedi soir.",
    photo: 'assets/images/promo-riz-mouton.jpg', price_xl: 2500, price_xxl: 3000,
    sort_order: 99 },

  // Shawarma / Sautés — catégories réelles, tarif pas encore communiqué
  { id: 'sh-poulet', category_id: 'shawarma', name: 'Shawarma poulet',
    description: 'Bientôt sur le menu digital.', photo: 'assets/images/interior-wall.jpg',
    soon: 1, sort_order: 1 },
  { id: 'sa-viande', category_id: 'sautes', name: 'Sauté de viande',
    description: 'Bientôt sur le menu digital.', photo: 'assets/images/interior-wall.jpg',
    soon: 1, sort_order: 1 },

    // Boissons — prix réels du menu fourni. Formats partagés en tête de liste
  // (utile pour la commande de groupe), puis boissons individuelles.
  { id: 'bo-girafe', category_id: 'boissons', name: 'Girafe bière pression',
    description: 'Grand format à partager (tour ~3L) — idéal pour un groupe.',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 6000, sort_order: 1 },
  { id: 'bo-pression', category_id: 'boissons', name: 'Verre de pression',
    description: 'Bière pression au verre.',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 2000, sort_order: 2 },
  { id: 'bo-biere', category_id: 'boissons', name: 'Bière',
    description: 'Au choix selon disponibilité.',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 1000, sort_order: 3,
    variants_json: JSON.stringify(['Desperados','Sombreros','Béninoise','Beaufort','Kankpe','Chill','Legend']) },
  { id: 'bo-soda', category_id: 'boissons', name: 'Soda',
    description: 'Au choix selon disponibilité.',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 1000, sort_order: 4,
    variants_json: JSON.stringify(['Fanta','Coca','Sprite','Youzou','Pompom','Star Citron','Youki','Pamplemousse','Malta Guiness','Moka']) },
  { id: 'bo-energy', category_id: 'boissons', name: 'Energy drink',
    description: 'Au choix selon disponibilité.',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 1500, sort_order: 5,
    variants_json: JSON.stringify(['XXL','Rox','Monster','Red Bull','Vody']) },
  { id: 'bo-street', category_id: 'boissons', name: 'Street drink',
    description: 'Fait maison.',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 1000, sort_order: 6,
    variants_json: JSON.stringify(['Bissap','Lait caillé']) },
  { id: 'bo-eau-fifa', category_id: 'boissons', name: 'Eau Fifa 1,5L',
    description: '',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 1000, sort_order: 7 },
  { id: 'bo-eau-comtesse-citron', category_id: 'boissons', name: 'Eau Comtesse Citron 1,25L',
    description: '',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 1000, sort_order: 8 },
  { id: 'bo-eau-comtesse-planete', category_id: 'boissons', name: 'Eau Comtesse Planète 1L',
    description: '',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 1000, sort_order: 9 },
  { id: 'bo-eau-possotome', category_id: 'boissons', name: 'Eau Possotome Gazéifié 1L',
    description: 'Gazéifiée.',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 1000, sort_order: 10 },
  { id: 'bo-eau-aquabelle', category_id: 'boissons', name: 'Eau Aquabelle 0,5L',
    description: 'Petit format.',
    photo: 'assets/images/dish-spaghetti-2.jpg',
    is_simple: 1, price_simple: 500, sort_order: 11 },
];

// Zones de livraison — DÉMONSTRATION UNIQUEMENT. Le restaurant n'a pas
// communiqué de grille tarifaire officielle : ces valeurs sont des
// placeholders clairement modifiables/supprimables depuis /admin avant
// toute mise en ligne réelle.
const deliveryZones = [
  { id: 'zone-haie-vive',  label: 'Haie Vive (autour du resto)', fee: 500,  sort_order: 1 },
  { id: 'zone-fidjrosse',  label: 'Fidjrossé',                    fee: 1000, sort_order: 2 },
  { id: 'zone-akpakpa',    label: 'Akpakpa',                      fee: 1500, sort_order: 3 },
  { id: 'zone-cadjehoun',  label: 'Cadjehoun / Aéroport',         fee: 1000, sort_order: 4 },
  { id: 'zone-autre',      label: "Autre quartier — le livreur confirme le prix", fee: 0, sort_order: 99 },
];

const insertCat = db.prepare(`INSERT OR REPLACE INTO categories (id,label,emoji,sort_order) VALUES (@id,@label,@emoji,@sort_order)`);
const insertDish = db.prepare(`
  INSERT OR REPLACE INTO dishes
  (id, category_id, name, description, photo, price_xl, price_xxl, price_simple, is_simple, variants_json, spicy_toggle, viande_option, color_option, available, soon, sort_order)
  VALUES (@id, @category_id, @name, @description, @photo, @price_xl, @price_xxl, @price_simple, @is_simple, @variants_json, @spicy_toggle, @viande_option, @color_option, 1, @soon, @sort_order)
`);
const insertZone = db.prepare(`INSERT OR REPLACE INTO delivery_zones (id,label,fee,active,sort_order) VALUES (@id,@label,@fee,1,@sort_order)`);
const insertAdmin = db.prepare(`INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)`);

function runSeed() {
  const tx = db.transaction(() => {
    for (const c of categories) insertCat.run(c);
    for (const d of dishes) {
      insertDish.run({
        price_xl: null, price_xxl: null, price_simple: null, variants_json: null,
        is_simple: 0, spicy_toggle: 0, viande_option: 0, color_option: 0, soon: 0,
        photo: '', description: '',
        ...d,
      });
    }
    for (const z of deliveryZones) insertZone.run(z);

    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'streetfood2026';
    insertAdmin.run(adminUser, hashPassword(adminPass));
  });

  tx();

  console.log('✔ Menu, zones de livraison et compte admin initialisés.');
  console.log(`  Identifiant admin : ${process.env.ADMIN_USERNAME || 'admin'} (mot de passe dans .env)`);
}

// Exécution directe UNIQUEMENT si le fichier est lancé en CLI (npm run seed)
if (require.main === module) {
  runSeed();
}

module.exports = { runSeed };

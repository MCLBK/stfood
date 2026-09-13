# STREET FOOD — Plateforme de commande (Cotonou)

Site de commande en ligne + backend + panneau d'administration pour
**STREET FOOD**, Haie Vive, Cotonou. *Goût de luxe, prix de rue.*
Ouvert du **mardi au dimanche, 17h – 6h** (fermé le lundi).

Ce dépôt contient trois parties servies par un seul serveur :

```
streetfood/
├── client/     → le site que voient les clients (commande en ligne)
├── admin/      → le panneau de gestion du restaurant (/admin)
├── server/     → l'API + la base de données qui font tourner les deux
└── README.md   → ce fichier
```

---

## 1. Démarrage rapide

Prérequis : [Node.js](https://nodejs.org) 18 ou plus récent.

```bash
cd server
npm install       # installe les dépendances (Express, SQLite, etc.)
npm run seed       # crée la base de données + charge le menu réel + un compte admin
npm start           # démarre le serveur
```

Puis ouvrir :
- **Site client** : http://localhost:3000
- **Panneau admin** : http://localhost:3000/admin
  (identifiants par défaut : `admin` / `streetfood2026` — définis dans `server/.env`, **à changer avant toute mise en ligne réelle**, voir `server/.env.example`)

Le client et l'admin sont de simples fichiers statiques servis par le
même serveur Express que l'API : pas besoin de les lancer séparément,
et pas de configuration CORS à gérer en usage normal.

---

## 2. Architecture

```
Navigateur (client/)  ──┐
                         ├──►  server.js (Express)  ──►  SQLite (server/db/streetfood.db)
Navigateur (admin/)   ──┘            │
                                      └─► services/notifications.js (log des événements,
                                          prêt pour un futur envoi WhatsApp/SMS réel)
```

- **client/** : HTML/CSS/JS vanilla, aucun framework, aucune dépendance de build.
  Interroge l'API en `fetch()` (menu, zones de livraison, favoris, commandes,
  suivi, fidélité). Si l'API est injoignable, se replie sur des données
  locales (`client/js/menu-data.js`) pour rester consultable.
- **admin/** : HTML/CSS/JS vanilla également, protégé par connexion
  (`/api/admin/login`), consomme les mêmes données via l'API admin.
- **server/** : Express + SQLite (`better-sqlite3`). Toute la logique
  métier (menu, commandes, livraison, fidélité, favoris, QR codes) vit
  dans `server/routes/*.js`. Schéma de base dans `server/db/schema.sql`.

### Pourquoi ce choix
Un seul serveur Node à déployer, une base de données fichier (aucun
service externe à payer pour démarrer), un frontend sans étape de build
— le plus simple à héberger et à faire évoluer pour une V1 réelle.

---

## 3. Fonctionnalités implémentées

**Commande**
- 3 modes : livraison, à emporter, sur place — choisis en premier, le
  reste du parcours s'adapte.
- Commande personnelle ou **commande de groupe** (bascule dédiée,
  suggestions de formats à partager comme la Girafe bière pression,
  champ nombre de personnes).
- Menu digital réel, catégories tactiles, sélection sans clavier
  (y compris pour les boissons à variantes : bière, soda, energy drink…).
- Panier persistant pendant la session, favoris (❤️, sans compte requis,
  basés sur un identifiant anonyme stocké dans le navigateur).
- Checkout court, sans compte obligatoire.

**Livraison — calcul des frais (la partie "idéale" demandée)**
- Le client choisit son quartier parmi des zones définies par le
  restaurant (`server/scripts/seed.js`, modifiables dans `/admin` →
  Livraison) : le prix s'affiche **immédiatement**.
- Si le quartier n'est pas listé, la commande part avec un statut
  "frais à confirmer" — le livreur/l'équipe saisit le prix réel dans
  `/admin` → Commandes, et le total du client se met à jour automatiquement
  (le suivi de commande du client se rafraîchit tout seul).
- Jamais de prix inventé affiché comme définitif.

**Commande programmée — tolérance au retard**
- Le client choisit "dès que possible" ou programme une heure.
- Le suivi de commande propose un bouton "Je vais être en retard" :
  rien n'est annulé, l'équipe est juste prévenue pour ajuster la
  préparation (visible aussi côté admin).

**Fidélité**
- Compteur de commandes par numéro de téléphone, récompense tous les
  8 commandes (seuil modifiable dans `server/routes/loyalty.js`).
  Affiché au client après chaque commande, consultable dans `/admin`.

**QR code**
- Génération à la volée (`/api/qr`, optionnellement `?table=5`) —
  imprimable depuis `/admin` → QR codes, pour un service à table sans
  contact.

**Administration** (`/admin`, protégé par mot de passe)
- Tableau de bord (commandes du jour, chiffre d'affaires, panier moyen).
- Commandes : changement de statut, confirmation des frais de
  livraison non fixés.
- Menu : ajout / modification / suppression de plats, bascule rapide
  disponible ↔ indisponible, sans toucher au code.
- Zones de livraison : ajout / suppression, tarif par zone.
- Fidélité : liste des clients et de leur nombre de commandes.

**Suivi de commande**
- Statuts adaptés à chaque mode (ex. "Je suis arrivé" pour le mode
  sur place), mis à jour en direct (le client n'a rien à recharger).

**Avis clients**
- Aucun avis inventé. La section reste vide et clairement présentée
  comme prête à recevoir les vrais avis Google Maps, l'accès automatisé
  à la fiche du restaurant ayant été bloqué au moment de la construction.

---

## 4. Mettre à jour le menu

Deux façons, au choix :

1. **Recommandé — panneau admin** : `/admin` → onglet **Menu**. Ajouter,
   modifier, supprimer un plat, ou juste basculer sa disponibilité,
   sans toucher au code.
2. **En bloc** : éditer `server/scripts/seed.js` puis relancer
   `npm run seed` (utile pour une refonte complète du menu — attention,
   ça réinitialise le menu, les zones de livraison et le compte admin,
   mais jamais les commandes déjà enregistrées).

Le fichier `client/js/menu-data.js` n'est qu'un **repli hors-ligne** —
il n'a pas besoin d'être tenu à jour à chaque changement de menu, sauf
si on veut que la démonstration reste fidèle même sans serveur.

---

## 5. Ce qui n'est PAS inclus (à savoir avant mise en production)

- **Paiement en ligne réel** : seules les options "paiement à la
  livraison / au retrait" existent, comme demandé dans le brief
  d'origine (aucune fausse solution de paiement n'a été simulée).
- **Carte cadeau** : nécessite un vrai système de paiement/soldes,
  volontairement laissée de côté plutôt que bricolée sans base solide.
- **Envoi réel de SMS/WhatsApp** : l'architecture est prête
  (`server/services/notifications.js` trace déjà chaque événement de
  commande), mais aucun envoi réel n'est branché — il faudrait les
  identifiants d'un fournisseur (API WhatsApp Business, SMS local au
  Bénin) que le restaurant devra choisir et payer.
- **Comptes clients complets** (historique, "recommander en un clic") :
  seuls la fidélité (par téléphone) et les favoris (par navigateur)
  existent ; un vrai compte optionnel reste une piste V2.
- **Sessions admin en mémoire** : reconnexion nécessaire si le serveur
  redémarre. Suffisant pour une seule instance, à revoir avant une
  mise à l'échelle.
- **Pas de nom de domaine ni HTTPS configurés** : à mettre en place
  lors de l'hébergement réel (Render, Railway, VPS…), avec un vrai mot
  de passe admin à la place de celui par défaut.
- **Pas de tests automatisés.**

---

## 6. Notes sur les données

- Prix des spaghettis, coquillettes et boissons : repris tels quels
  des visuels de menu fournis, y compris le détail par format d'eau
  minérale (0,5L à 500 F, les autres formats à 1000 F).
- Shawarma et sautés de viande : catégories réelles, tarif pas encore
  communiqué → affichées "Bientôt" plutôt que d'inventer un prix.
- Zones de livraison et leurs tarifs (Haie Vive, Fidjrossé, Akpakpa,
  Cadjehoun) : **valeurs de démonstration**, à ajuster par le
  restaurant dans `/admin` avant toute mise en ligne réelle — aucune
  grille tarifaire officielle n'avait été communiquée.
- Horaires : mardi à dimanche, 17h–6h, fermé le lundi (confirmé).
- Adresse : Haie Vive, Cotonou — lien Google Maps fourni utilisé tel
  quel pour le bouton "Itinéraire".

---

## 7. Direction visuelle

Palette et typographie dérivées des visuels de marque fournis (logo,
affiches, murs du restaurant), avec une exécution volontairement plus
sobre et éditoriale que les supports marketing existants :

- **Fraunces** (serif) pour les titres — registre plus "chic" que les
  polices bulle utilisées sur les affiches, tout en gardant la même
  famille de rouges/noir/crème.
- **Anton** conservé uniquement pour le logo/nom "Street Food" dans le
  header et le footer, en clin d'œil à l'enseigne réelle du restaurant.
- **Manrope** pour toute l'interface (boutons, formulaires, prix).
- Accent laiton discret (`--brass`) pour les filets et puces éditoriales
  — jamais utilisé comme couleur de marque.
- Photos réelles du restaurant et des plats fournis par le client,
  aucune image générée ou de stock.

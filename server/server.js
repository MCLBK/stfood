require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Route de seed protégée — à usage unique
app.get('/api/seed', async (req, res) => {
  if (!process.env.SEED_SECRET || req.query.secret !== process.env.SEED_SECRET) {
    return res.status(403).send('❌ Accès refusé');
  }
  try {
    const { runSeed } = require('./scripts/seed');
    runSeed();
    res.send('✅ Seed terminé avec succès');
  } catch (err) {
    console.error('Erreur seed:', err);
    res.status(500).send('❌ Erreur : ' + err.message);
  }
});

// ---------- API ----------
app.use('/api', require('./routes/menu'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/loyalty'));
app.use('/api', require('./routes/favorites'));
app.use('/api', require('./routes/qr'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/reviews'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'streetfood-server' }));

// ---------- Fichiers statiques ----------
// Site client (commande) sur /
app.use(express.static(path.join(__dirname, '..', 'client')));
// Panneau d'administration sur /admin
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// Fallback SPA pour le client (routes front sans extension -> index.html)
app.get(/^\/(?!api|admin).*/, (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Introuvable.' }));

app.listen(PORT, () => {
  console.log(`\n  Street Food — serveur démarré`);
  console.log(`  Site      : http://localhost:${PORT}`);
  console.log(`  Admin     : http://localhost:${PORT}/admin`);
  console.log(`  API       : http://localhost:${PORT}/api\n`);
});

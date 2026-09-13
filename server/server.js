require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---------- API ----------
app.use('/api', require('./routes/menu'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/loyalty'));
app.use('/api', require('./routes/favorites'));
app.use('/api', require('./routes/qr'));
app.use('/api', require('./routes/admin'));

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

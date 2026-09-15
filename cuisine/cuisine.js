
// ============================================================
// MODE CUISINE — Écran dédié pour le cuisinier
// ============================================================

let cuisinePassword = localStorage.getItem('sf_cuisine_password') || null;
let soundEnabled = localStorage.getItem('sf_cuisine_sound') !== 'off';
let pollTimer = null;
let lastOrderIds = new Set();
let lastFetchHash = null;

// ---------- Login ----------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('cuisinePassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  try {
    const res = await fetch('/api/cuisine/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      errEl.textContent = 'Mot de passe incorrect.';
      return;
    }

    cuisinePassword = password;
    localStorage.setItem('sf_cuisine_password', password);
    showCuisine();
  } catch (err) {
    errEl.textContent = 'Erreur réseau. Réessayez.';
  }
});

function logout() {
  localStorage.removeItem('sf_cuisine_password');
  cuisinePassword = null;
  if (pollTimer) clearInterval(pollTimer);
  document.getElementById('cuisineScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

// ---------- Affichage ----------
function showCuisine() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('cuisineScreen').style.display = 'block';
  updateSoundBtn();
  loadOrders();
  startPolling();
}

// ---------- Chargement des commandes ----------
async function loadOrders() {
  try {
    const res = await fetch('/api/cuisine/orders', {
      headers: { 'X-Cuisine-Password': cuisinePassword },
    });

    if (res.status === 401) {
      logout();
      return;
    }

    const data = await res.json();
    const orders = data.orders || [];

    // Détecter les nouvelles commandes pour le son
    const currentIds = new Set(orders.map(o => String(o.id)));
    const hasNew = orders.some(o => !lastOrderIds.has(String(o.id)) && lastOrderIds.size > 0);

    if (hasNew && soundEnabled) {
      playNewOrderSound();
    }
    lastOrderIds = currentIds;

    // Hash pour éviter le re-render inutile
    const newHash = orders.map(o => `${o.id}:${o.status}`).join('|');
    if (newHash === lastFetchHash) {
      updateLastUpdateLabel();
      return;
    }
    lastFetchHash = newHash;

    renderOrders(orders);
    updateStats(orders);
    updateLastUpdateLabel();
  } catch (err) {
    console.error('Erreur chargement:', err);
  }
}

function renderOrders(orders) {
  const grid = document.getElementById('ordersGrid');
  const emptyState = document.getElementById('emptyState');

  if (orders.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  grid.innerHTML = orders.map(o => renderOrderCard(o)).join('');
}

function renderOrderCard(o) {
  const itemsHtml = o.items.map(i =>
    `<li><strong>${i.qty}×</strong> ${escapeHtml(i.dish_name)}${i.variant_label ? ` <span class="variant">(${escapeHtml(i.variant_label)})</span>` : ''}</li>`
  ).join('');

  const time = new Date(o.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const secondsAgo = o.seconds_ago || 0;
  const minutesAgo = Math.floor(secondsAgo / 60);
  let elapsedText;
  if (minutesAgo < 1) elapsedText = "à l'instant";
  else if (minutesAgo < 60) elapsedText = `il y a ${minutesAgo} min`;
  else elapsedText = `il y a ${Math.floor(minutesAgo / 60)}h${(minutesAgo % 60).toString().padStart(2, '0')}`;

  const urgency = minutesAgo >= 20 ? 'urgent' : minutesAgo >= 10 ? 'warning' : '';

  const modeLabel = { livraison: '🛵 Livraison', emporter: '🥡 À emporter', surplace: '🍽️ Sur place' }[o.mode] || o.mode;

  const statusLabel = o.status === 'recue' ? 'NOUVELLE' : 'EN PRÉPARATION';
  const statusClass = o.status === 'recue' ? 'new' : 'prep';

  const actionBtn = o.status === 'recue'
    ? `<button class="action-btn prep-btn" onclick="markPreparing('${o.id}')">Commencer</button>`
    : `<button class="action-btn ready-btn" onclick="markReady('${o.id}')">✓ Prête</button>`;

  return `
    <div class="order-card ${urgency}" data-order-id="${o.id}">
      <div class="order-head">
        <div class="order-id">#${o.id}</div>
        <div class="order-status ${statusClass}">${statusLabel}</div>
      </div>
      <div class="order-meta">
        <span>${modeLabel}</span>
        <span class="elapsed ${urgency}">${elapsedText}</span>
      </div>
      ${o.customer_name ? `<div class="customer">👤 ${escapeHtml(o.customer_name)}</div>` : ''}
      <ul class="order-items">${itemsHtml}</ul>
      ${o.delivery_notes ? `<div class="notes">📝 ${escapeHtml(o.delivery_notes)}</div>` : ''}
      <div class="order-foot">
        <span class="order-time">${time}</span>
        ${actionBtn}
      </div>
    </div>
  `;
}

function updateStats(orders) {
  const recue = orders.filter(o => o.status === 'recue').length;
  const prep = orders.filter(o => o.status === 'en_preparation').length;
  document.getElementById('countRecue').textContent = recue;
  document.getElementById('countPrep').textContent = prep;
  document.getElementById('countTotal').textContent = orders.length;
}

function updateLastUpdateLabel() {
  const el = document.getElementById('lastUpdate');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------- Actions ----------
async function markPreparing(id) {
  try {
    await fetch(`/api/cuisine/orders/${id}/preparing`, {
      method: 'PATCH',
      headers: { 'X-Cuisine-Password': cuisinePassword },
    });
    lastFetchHash = null; // force le re-render
    await loadOrders();
  } catch (err) {
    console.error('Erreur:', err);
  }
}

async function markReady(id) {
  try {
    await fetch(`/api/cuisine/orders/${id}/ready`, {
      method: 'PATCH',
      headers: { 'X-Cuisine-Password': cuisinePassword },
    });
    lastFetchHash = null;
    await loadOrders();
  } catch (err) {
    console.error('Erreur:', err);
  }
}

// ---------- Auto-refresh ----------
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadOrders, 15000);
}

// ---------- Son ----------
function playNewOrderSound() {
  // Petit bip synthétisé (pas besoin de fichier audio)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    // Deux bips
    [0, 0.2].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i === 0 ? 880 : 1100;
      gain.gain.setValueAtTime(0.15, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);
      osc.start(now + delay);
      osc.stop(now + delay + 0.15);
    });
  } catch (err) {
    console.warn('Son non disponible:', err);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('sf_cuisine_sound', soundEnabled ? 'on' : 'off');
  updateSoundBtn();
}

function updateSoundBtn() {
  const btn = document.getElementById('soundBtn');
  if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇';
}

// ---------- Utilitaires ----------
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Init ----------
if (cuisinePassword) {
  // Vérifier que le mot de passe en localStorage est toujours valide
  fetch('/api/cuisine/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: cuisinePassword }),
  }).then(res => {
    if (res.ok) showCuisine();
    else logout();
  }).catch(() => {
    document.getElementById('loginScreen').style.display = 'flex';
  });
} else {
  document.getElementById('loginScreen').style.display = 'flex';
}

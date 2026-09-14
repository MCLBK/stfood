const API_BASE = '';
let token = localStorage.getItem('sf_admin_token') || null;
let state = {
  orders: [], dishes: [], categories: [], zones: [], reviews: [],
  reviewFilter: 'pending',
  orderFilters: { range: 'today', since: null, until: null, search: '' },
  orderStats: null,
  autoRefresh: {
    enabled: true,
    intervalId: null,
    lastUpdate: null,
    secondsAgo: 0,
    tickIntervalId: null,
  },
};
function authHeaders(){
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}
function fmt(n){ if(n===null||n===undefined) return '—'; return n.toLocaleString('fr-FR') + ' F'; }

/* ---------- Auth ---------- */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try{
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password })
    });
    if(!res.ok){ const d = await res.json(); throw new Error(d.error || 'Erreur de connexion'); }
    const data = await res.json();
    token = data.token;
    localStorage.setItem('sf_admin_token', token);
    showDashboard();
  }catch(err){
    errEl.textContent = err.message;
  }
});

function logout(){
  fetch(`${API_BASE}/api/admin/logout`, { method:'POST', headers: authHeaders() }).catch(()=>{});
  localStorage.removeItem('sf_admin_token');
  token = null;
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

async function checkAuthAndShow(){
  if(!token){ document.getElementById('loginScreen').style.display = 'flex'; return; }
  try{
    const res = await fetch(`${API_BASE}/api/admin/stats`, { headers: authHeaders() });
    if(res.status === 401){ logout(); return; }
    showDashboard();
  }catch(err){ document.getElementById('loginScreen').style.display = 'flex'; }
}
function showDashboard(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  setDateRange('today');
  loadStats();
  loadCategories().then(loadDishes);
  loadZones();
  loadLoyalty();
  loadReviews();
  startAutoRefresh();
}

function switchTab(name){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));

  // Auto-refresh : actif uniquement sur l'onglet Commandes
  if(name === 'orders'){
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

/* ---------- Stats ---------- */
async function loadStats(){
  try{
    const res = await fetch(`${API_BASE}/api/admin/stats`, { headers: authHeaders() });
    const s = await res.json();
    document.getElementById('statsRow').innerHTML = `
      <div class="stat-card"><strong>${s.ordersToday}</strong><span>Commandes aujourd'hui</span></div>
      <div class="stat-card"><strong>${fmt(s.revenueToday)}</strong><span>Chiffre d'affaires</span></div>
      <div class="stat-card"><strong>${fmt(s.avgBasket)}</strong><span>Panier moyen</span></div>
      <div class="stat-card"><strong>${s.pending}</strong><span>En attente</span></div>
      <div class="stat-card"><strong>${s.ready}</strong><span>Prêtes</span></div>
    `;
  }catch(err){ /* silencieux */ }
}

/* ---------- Orders ---------- */
const STATUS_LABELS = {
  recue:'Reçue', en_preparation:'En préparation', prete:'Prête',
  en_livraison:'En livraison', livree:'Livrée', servie:'Servie', annulee:'Annulée'
};
async function loadOrders(){
  const params = new URLSearchParams();
  if(state.orderFilters.since) params.set('since', state.orderFilters.since);
  if(state.orderFilters.until) params.set('until', state.orderFilters.until);
  if(state.orderFilters.search) params.set('search', state.orderFilters.search);
  params.set('limit', '1000');

  const url = `${API_BASE}/api/admin/orders` + (params.toString() ? '?' + params.toString() : '');
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json();
  state.orders = data.orders || [];
  state.orderStats = data.stats || null;

  renderOrders();
  renderPeriodStats();
  updateOrdersTitle();
  loadStats();
}

function updateOrdersTitle(){
  const el = document.getElementById('ordersTitle');
  if(!el) return;
  el.textContent = `Commandes (${state.orders.length})`;
}

function renderPeriodStats(){
  const el = document.getElementById('periodStats');
  if(!el || !state.orderStats) return;
  const s = state.orderStats;
  el.innerHTML = `
    <div class="period-stat"><strong>${s.count}</strong><span>commandes</span></div>
    <div class="period-stat"><strong>${fmt(s.revenue)}</strong><span>chiffre d'affaires</span></div>
    <div class="period-stat"><strong>${fmt(s.avgBasket)}</strong><span>panier moyen</span></div>
    <div class="period-stat"><strong>${s.byMode.livraison}</strong><span>livraisons</span></div>
    <div class="period-stat"><strong>${s.byMode.emporter}</strong><span>à emporter</span></div>
    <div class="period-stat"><strong>${s.byMode.surplace}</strong><span>sur place</span></div>
  `;
}

function setDateRange(range){
  state.orderFilters.range = range;

  document.querySelectorAll('[data-range]').forEach(b => {
    b.classList.toggle('active', b.dataset.range === range);
  });

  const custom = document.getElementById('customDates');
  if(custom) custom.style.display = range === 'custom' ? 'flex' : 'none';

  const today = new Date();
  const fmtDate = d => d.toISOString().slice(0, 10);

  if(range === 'today'){
    state.orderFilters.since = fmtDate(today);
    state.orderFilters.until = fmtDate(today);
  } else if(range === '7d'){
    const past = new Date(today); past.setDate(past.getDate() - 6);
    state.orderFilters.since = fmtDate(past);
    state.orderFilters.until = fmtDate(today);
  } else if(range === '30d'){
    const past = new Date(today); past.setDate(past.getDate() - 29);
    state.orderFilters.since = fmtDate(past);
    state.orderFilters.until = fmtDate(today);
  } else if(range === 'month'){
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    state.orderFilters.since = fmtDate(first);
    state.orderFilters.until = fmtDate(today);
  } else if(range === 'all'){
    state.orderFilters.since = null;
    state.orderFilters.until = null;
  } else if(range === 'custom'){
    return;
  }

  loadOrders();
}

function applyCustomDates(){
  const since = document.getElementById('filterSince').value;
  const until = document.getElementById('filterUntil').value;
  if(!since || !until){
    alert('Indique une date de début et de fin.');
    return;
  }
  state.orderFilters.since = since;
  state.orderFilters.until = until;
  loadOrders();
}

let searchTimer = null;
function onSearchInput(){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.orderFilters.search = document.getElementById('searchOrders').value.trim();
    loadOrders();
  }, 400);
}

function clearFilters(){
  state.orderFilters = { range: 'today', since: null, until: null, search: '' };
  document.getElementById('searchOrders').value = '';
  setDateRange('today');
}

function exportOrdersCSV(){
  if(state.orders.length === 0){
    alert('Aucune commande à exporter sur cette période.');
    return;
  }

  const headers = ['N°', 'Date', 'Heure', 'Client', 'Téléphone', 'Mode', 'Statut', 'Sous-total', 'Frais livraison', 'Total', 'Articles'];
  const rows = state.orders.map(o => {
    const d = new Date(o.created_at);
    const date = d.toLocaleDateString('fr-FR');
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const items = o.items.map(i => `${i.qty}x ${i.dish_name}`).join(' | ');
    return [
      o.id,
      date,
      time,
      o.customer_name || '',
      o.customer_phone || '',
      o.mode || '',
      o.status || '',
      o.items_subtotal || 0,
      o.delivery_fee_final || 0,
      o.total || 0,
      items,
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const period = state.orderFilters.range || 'export';
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `streetfood-commandes-${period}-${dateStr}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
function renderOrders(){
  const el = document.getElementById('ordersList');
  if(state.orders.length === 0){ el.innerHTML = '<p class="hint">Aucune commande pour l\u2019instant.</p>'; return; }
  el.innerHTML = state.orders.map(o => {
    const itemsTxt = o.items.map(i => `${i.qty}× ${i.dish_name}${i.variant_label ? ' (' + i.variant_label + ')' : ''}`).join(', ');
    const statusOptions = Object.keys(STATUS_LABELS).map(k => `<option value="${k}" ${o.status===k?'selected':''}>${STATUS_LABELS[k]}</option>`).join('');
    let feeZone = '';
    if(o.mode === 'livraison'){
      feeZone = o.delivery_fee_confirmed
        ? `<span class="fee-confirmed-tag">Frais confirmés : ${fmt(o.delivery_fee_final)}</span>`
        : `<div class="fee-form">
            <input type="number" placeholder="Frais FCFA" id="fee-${o.id}">
            <button class="btn-ghost-sm" onclick="confirmFee('${o.id}')">Confirmer le prix</button>
          </div>`;
    }
    return `
      <div class="order-card">
        <div class="top">
          <div>
            <span class="oid">#${o.id}</span> · ${o.mode}${o.is_group_order ? ' · groupe' : ''}
            <div class="meta">${o.customer_name || ''} · ${o.customer_phone || ''} · ${new Date(o.created_at).toLocaleString('fr-FR')}</div>
          </div>
          <span class="badge ${o.status}">${STATUS_LABELS[o.status]}</span>
        </div>
        <div class="items">${itemsTxt}</div>
        <div class="row">
          <select class="status-select" onchange="updateStatus('${o.id}', this.value)">${statusOptions}</select>
          <strong>${fmt(o.total)}</strong>
          ${o.late_flagged ? '<span class="badge" style="background:#FDE7D0;color:#8C4A16;">Retard signalé</span>' : ''}
          ${o.arrived ? '<span class="badge" style="background:#E3F1E3;color:#3E7A45;">Arrivé</span>' : ''}
        </div>
        ${feeZone}
      </div>
    `;
  }).join('');
}
async function updateStatus(id, status){
  await fetch(`${API_BASE}/api/admin/orders/${id}/status`, {
    method:'PATCH', headers: authHeaders(), body: JSON.stringify({ status })
  });
  loadOrders();
}
async function confirmFee(id){
  const input = document.getElementById(`fee-${id}`);
  const fee = parseInt(input.value, 10);
  if(isNaN(fee) || fee < 0){ alert('Indique un montant valide.'); return; }
  await fetch(`${API_BASE}/api/admin/orders/${id}/delivery-fee`, {
    method:'PATCH', headers: authHeaders(), body: JSON.stringify({ fee })
  });
  loadOrders();
}

/* ---------- Menu management ---------- */
async function loadCategories(){
  const res = await fetch(`${API_BASE}/api/admin/categories`, { headers: authHeaders() });
  const data = await res.json();
  state.categories = data.categories;
}
async function loadDishes(){
  const res = await fetch(`${API_BASE}/api/admin/dishes`, { headers: authHeaders() });
  const data = await res.json();
  state.dishes = data.dishes;
  renderDishes();
}
function renderDishes(){
  const el = document.getElementById('dishesByCategory');
  el.innerHTML = state.categories.map(cat => {
    const dishes = state.dishes.filter(d => d.category_id === cat.id);
    if(dishes.length === 0) return '';
    return `
      <div class="cat-block">
        <h3>${cat.emoji || ''} ${cat.label}</h3>
        ${dishes.map(d => `
          <div class="dish-row">
            ${d.photo ? `<img src="../${d.photo}" alt="">` : `<div style="width:44px;height:44px;border-radius:8px;background:var(--line);"></div>`}
            <div class="di">
              <strong>${d.name}</strong>
              <span>${d.soon ? 'Bientôt (pas de prix)' : d.is_simple ? fmt(d.price_simple) : `XL ${fmt(d.price_xl)} · XXL ${fmt(d.price_xxl)}`}</span>
            </div>
            <div class="actions">
              <label class="switch" title="Disponible">
                <input type="checkbox" ${d.available ? 'checked' : ''} onchange="toggleAvailability('${d.id}', this.checked)">
                <span class="slider"></span>
              </label>
              <button class="btn-ghost-sm" onclick="editDish('${d.id}')">Modifier</button>
              <button class="btn-danger" onclick="deleteDish('${d.id}')">Suppr.</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}
async function toggleAvailability(id, available){
  await fetch(`${API_BASE}/api/admin/dishes/${id}/availability`, {
    method:'PATCH', headers: authHeaders(), body: JSON.stringify({ available })
  });
  loadDishes();
}
async function deleteDish(id){
  if(!confirm('Supprimer ce plat définitivement ?')) return;
  await fetch(`${API_BASE}/api/admin/dishes/${id}`, { method:'DELETE', headers: authHeaders() });
  loadDishes();
}

function catOptionsHtml(selected){
  return state.categories.map(c => `<option value="${c.id}" ${c.id===selected?'selected':''}>${c.label}</option>`).join('');
}
function openDishForm(existing){
  const d = existing || {};
  const formEl = document.getElementById('dishForm');
  formEl.style.display = 'block';
  formEl.innerHTML = `
    <h3>${existing ? 'Modifier le plat' : 'Nouveau plat'}</h3>
    <form id="dishFormInner" class="form-grid">
      <div><label>Identifiant unique</label><input type="text" id="f-id" value="${d.id||''}" ${existing?'readonly':''} placeholder="ex: sp-nouveau" required></div>
      <div><label>Catégorie</label><select id="f-cat">${catOptionsHtml(d.category_id)}</select></div>
      <div class="full"><label>Nom</label><input type="text" id="f-name" value="${d.name||''}" required></div>
      <div class="full"><label>Description</label><textarea id="f-desc">${d.description||''}</textarea></div>
      <div class="full"><label>Chemin de la photo (ex: assets/images/mon-plat.jpg)</label><input type="text" id="f-photo" value="${d.photo||''}"></div>
      <div><label>Prix simple (boisson, si pas de taille)</label><input type="number" id="f-price-simple" value="${d.price_simple ?? ''}"></div>
      <div><label>Prix XL</label><input type="number" id="f-price-xl" value="${d.price_xl ?? ''}"></div>
      <div><label>Prix XXL</label><input type="number" id="f-price-xxl" value="${d.price_xxl ?? ''}"></div>
      <div class="checkbox-row">
        <label><input type="checkbox" id="f-simple" ${d.is_simple?'checked':''}> Prix simple (boisson)</label>
        <label><input type="checkbox" id="f-spicy" ${d.spicy_toggle?'checked':''}> Option Normal/Spicy</label>
        <label><input type="checkbox" id="f-viande" ${d.viande_option?'checked':''}> Option avec viande</label>
        <label><input type="checkbox" id="f-color" ${d.color_option?'checked':''}> Option Rouge/Blanc</label>
        <label><input type="checkbox" id="f-soon" ${d.soon?'checked':''}> Bientôt (pas encore de prix)</label>
      </div>
      <div class="full form-actions">
        <button type="submit" class="btn-primary sm">Enregistrer</button>
        <button type="button" class="btn-outline sm" onclick="closeDishForm()">Annuler</button>
      </div>
    </form>
  `;
  document.getElementById('dishFormInner').addEventListener('submit', (e) => saveDish(e, existing));
  formEl.scrollIntoView({behavior:'smooth'});
}
function closeDishForm(){
  document.getElementById('dishForm').style.display = 'none';
}
function editDish(id){
  const d = state.dishes.find(x => x.id === id);
  openDishForm(d);
}
async function saveDish(e, existing){
  e.preventDefault();
  const body = {
    id: document.getElementById('f-id').value.trim(),
    categoryId: document.getElementById('f-cat').value,
    name: document.getElementById('f-name').value.trim(),
    description: document.getElementById('f-desc').value.trim(),
    photo: document.getElementById('f-photo').value.trim(),
    priceSimple: document.getElementById('f-price-simple').value ? parseInt(document.getElementById('f-price-simple').value,10) : null,
    priceXl: document.getElementById('f-price-xl').value ? parseInt(document.getElementById('f-price-xl').value,10) : null,
    priceXxl: document.getElementById('f-price-xxl').value ? parseInt(document.getElementById('f-price-xxl').value,10) : null,
    isSimple: document.getElementById('f-simple').checked,
    spicyToggle: document.getElementById('f-spicy').checked,
    viandeOption: document.getElementById('f-viande').checked,
    colorOption: document.getElementById('f-color').checked,
    soon: document.getElementById('f-soon').checked,
  };
  if(existing){
    await fetch(`${API_BASE}/api/admin/dishes/${existing.id}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify(body) });
  } else {
    await fetch(`${API_BASE}/api/admin/dishes`, { method:'POST', headers: authHeaders(), body: JSON.stringify(body) });
  }
  closeDishForm();
  loadDishes();
}

/* ---------- Delivery zones ---------- */
async function loadZones(){
  const res = await fetch(`${API_BASE}/api/admin/delivery-zones`, { headers: authHeaders() });
  const data = await res.json();
  state.zones = data.zones;
  renderZones();
}
function renderZones(){
  const el = document.getElementById('zonesList');
  el.innerHTML = state.zones.map(z => `
    <div class="row">
      <span>${z.label} — ${z.fee > 0 ? fmt(z.fee) : 'le livreur confirme'}</span>
      <button class="btn-danger" onclick="deleteZone('${z.id}')">Supprimer</button>
    </div>
  `).join('') || '<div class="row">Aucune zone.</div>';
}
document.getElementById('zoneForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('zoneId').value.trim();
  const label = document.getElementById('zoneLabel').value.trim();
  const fee = parseInt(document.getElementById('zoneFee').value, 10) || 0;
  await fetch(`${API_BASE}/api/admin/delivery-zones`, {
    method:'POST', headers: authHeaders(), body: JSON.stringify({ id, label, fee })
  });
  e.target.reset();
  loadZones();
});
async function deleteZone(id){
  if(!confirm('Supprimer cette zone ?')) return;
  await fetch(`${API_BASE}/api/admin/delivery-zones/${id}`, { method:'DELETE', headers: authHeaders() });
  loadZones();
}

/* ---------- Loyalty ---------- */
async function loadLoyalty(){
  const res = await fetch(`${API_BASE}/api/admin/loyalty`, { headers: authHeaders() });
  const data = await res.json();
  const el = document.getElementById('loyaltyList');
  el.innerHTML = data.customers.map(c => `
    <div class="row"><span>${c.phone}</span><strong>${c.orders_count} commande${c.orders_count>1?'s':''}</strong></div>
  `).join('') || '<div class="row">Aucun client fidèle pour l\u2019instant.</div>';
}

/* ---------- QR ---------- */
function generateQr(){
  const table = document.getElementById('qrTable').value.trim();
  const src = `${API_BASE}/api/qr` + (table ? `?table=${encodeURIComponent(table)}` : '');
  document.getElementById('qrPreview').innerHTML = `
    <img src="${src}" alt="QR code">
    <p class="hint" style="margin-top:10px;">Clic droit → Enregistrer l'image pour l'imprimer.</p>
  `;
}

/* ---------- Reviews ---------- */
async function loadReviews(){
  try{
    const res = await fetch(`${API_BASE}/api/admin/reviews`, { headers: authHeaders() });
    const data = await res.json();
    state.reviews = data.reviews || [];
    updateReviewsBadge();
    renderReviews();
  }catch(err){ console.error('Erreur chargement avis:', err); }
}

function updateReviewsBadge(){
  const pending = state.reviews.filter(r => !r.approved).length;
  const badge = document.getElementById('pendingReviewsBadge');
  if(badge){
    if(pending > 0){ badge.textContent = pending; badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; }
  }
  const cPending = document.getElementById('countPending');
  const cApproved = document.getElementById('countApproved');
  if(cPending) cPending.textContent = pending;
  if(cApproved) cApproved.textContent = state.reviews.filter(r => r.approved).length;
}

function setReviewFilter(filter){
  state.reviewFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  renderReviews();
}

function renderReviews(){
  const el = document.getElementById('reviewsList');
  if(!el) return;
  let list = state.reviews;
  if(state.reviewFilter === 'pending') list = list.filter(r => !r.approved);
  if(state.reviewFilter === 'approved') list = state.reviews.filter(r => r.approved);

  if(list.length === 0){
    el.innerHTML = '<p class="hint">Aucun avis dans cette catégorie.</p>';
    return;
  }

  el.innerHTML = list.map(r => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const source = r.source === 'google'
      ? '<span class="badge" style="background:#EFE6D4;">via Google</span>'
      : '<span class="badge" style="background:#DCEBFB; color:#1B5A96;">via site</span>';
    const status = r.approved
      ? '<span class="badge" style="background:#E3F1E3; color:var(--leaf);">Approuvé</span>'
      : '<span class="badge" style="background:#FDE7D0; color:#8C4A16;">En attente</span>';
    const comment = r.comment ? `<div class="items">${escapeHtmlAdmin(r.comment)}</div>` : '';
    const phone = r.phone ? `<div class="meta">📞 ${escapeHtmlAdmin(r.phone)}</div>` : '';
    const date = new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

    return `
      <div class="order-card">
        <div class="top">
          <div>
            <span class="oid">${escapeHtmlAdmin(r.name)}</span> ${source} ${status}
            <div class="meta">${date} ${phone}</div>
          </div>
          <div style="color:var(--brass); font-size:1.1rem; letter-spacing:2px;">${stars}</div>
        </div>
        ${comment}
        <div class="row" style="margin-top:10px;">
          ${!r.approved
            ? `<button class="btn-primary sm" onclick="approveReview(${r.id})">✓ Approuver</button>`
            : `<button class="btn-ghost-sm" onclick="rejectReview(${r.id})">↺ Retirer</button>`
          }
          <button class="btn-danger" onclick="deleteReview(${r.id})">Supprimer</button>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtmlAdmin(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function approveReview(id){
  await fetch(`${API_BASE}/api/admin/reviews/${id}`, {
    method:'PATCH', headers: authHeaders(), body: JSON.stringify({ approved: true })
  });
  loadReviews();
}

async function rejectReview(id){
  await fetch(`${API_BASE}/api/admin/reviews/${id}`, {
    method:'PATCH', headers: authHeaders(), body: JSON.stringify({ approved: false })
  });
  loadReviews();
}

async function deleteReview(id){
  if(!confirm('Supprimer cet avis définitivement ?')) return;
  await fetch(`${API_BASE}/api/admin/reviews/${id}`, { method:'DELETE', headers: authHeaders() });
  loadReviews();
}

/* ---------- Auto-refresh des commandes ---------- */
function startAutoRefresh(){
  stopAutoRefresh();

  if(!state.autoRefresh.enabled) return;

  updateLastUpdateLabel();
  state.autoRefresh.lastUpdate = Date.now();

  state.autoRefresh.intervalId = setInterval(() => {
    // Ne recharge que si l'onglet est actif
    const ordersTab = document.getElementById('tab-orders');
    if(!ordersTab || !ordersTab.classList.contains('active')) return;

    // Ne recharge que si la page est visible
    if(document.hidden) return;

    loadOrders().then(() => {
      state.autoRefresh.lastUpdate = Date.now();
      state.autoRefresh.secondsAgo = 0;
    });
  }, 30000);

  state.autoRefresh.tickIntervalId = setInterval(() => {
    if(state.autoRefresh.lastUpdate){
      state.autoRefresh.secondsAgo = Math.floor((Date.now() - state.autoRefresh.lastUpdate) / 1000);
      updateLastUpdateLabel();
    }
  }, 1000);
}

function stopAutoRefresh(){
  if(state.autoRefresh.intervalId){
    clearInterval(state.autoRefresh.intervalId);
    state.autoRefresh.intervalId = null;
  }
  if(state.autoRefresh.tickIntervalId){
    clearInterval(state.autoRefresh.tickIntervalId);
    state.autoRefresh.tickIntervalId = null;
  }
}

function toggleAutoRefresh(){
  state.autoRefresh.enabled = !state.autoRefresh.enabled;
  const btn = document.getElementById('autoRefreshBtn');
  if(btn){
    btn.textContent = state.autoRefresh.enabled ? '⏸ Pause' : '▶ Reprendre';
  }
  if(state.autoRefresh.enabled){
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function updateLastUpdateLabel(){
  const el = document.getElementById('lastUpdateLabel');
  if(!el) return;

  if(!state.autoRefresh.enabled){
    el.textContent = '⏸ Auto-refresh en pause';
    return;
  }

  const s = state.autoRefresh.secondsAgo;
  let txt;
  if(s < 5) txt = 'à l\'instant';
  else if(s < 60) txt = `il y a ${s}s`;
  else txt = `il y a ${Math.floor(s / 60)} min`;

  el.textContent = `🔄 Dernière mise à jour : ${txt}`;
}

// Quand la page redevient visible, on rafraîchit immédiatement
document.addEventListener('visibilitychange', () => {
  if(!document.hidden){
    const ordersTab = document.getElementById('tab-orders');
    if(ordersTab && ordersTab.classList.contains('active') && state.autoRefresh.enabled){
      loadOrders().then(() => {
        state.autoRefresh.lastUpdate = Date.now();
        state.autoRefresh.secondsAgo = 0;
      });
    }
  }
});

checkAuthAndShow();

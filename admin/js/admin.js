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
    lastHash: null,
    pausedReason: null,   // 'input' | 'selection' | 'modal' | 'scroll' | 'status-edit'
    scrollTimeout: null,
  },
  editingOrderId: null,
  hasOpenModal: false,
  newOrder: {
    mode: 'surplace',
    items: [],
    zoneId: null,
    zoneFee: 0,
  },
  addDishContext: null,
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
  setupScrollDetection();
  setupModalDetection();
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
async function loadOrders(opts = {}){
  const { force = false } = opts;

  const params = new URLSearchParams();
  if(state.orderFilters.since) params.set('since', state.orderFilters.since);
  if(state.orderFilters.until) params.set('until', state.orderFilters.until);
  if(state.orderFilters.search) params.set('search', state.orderFilters.search);
  params.set('limit', '1000');

  const url = `${API_BASE}/api/admin/orders` + (params.toString() ? '?' + params.toString() : '');
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json();
  const newOrders = data.orders || [];
  state.orderStats = data.stats || null;

  // Calcul d'un hash pour détecter les changements
  const newHash = computeOrdersHash(newOrders);

  // Si rien n'a changé ET qu'on n'est pas en mode forcé → on ne re-render pas
  if(!force && newHash === state.autoRefresh.lastHash){
    updatePeriodStatsOnly();
    return;
  }

  // Détecter les nouvelles commandes pour les mettre en évidence
  const prevIds = new Set(state.orders.map(o => String(o.id)));
  const newIds = new Set(newOrders.filter(o => !prevIds.has(String(o.id))).map(o => String(o.id)));

  state.orders = newOrders;
  state.autoRefresh.lastHash = newHash;

  // Si on est en train d'éditer une commande (changement de statut en cours),
  // on ne re-render pas pour ne pas écraser l'action
  if(state.editingOrderId){
    updatePeriodStatsOnly();
    return;
  }

  renderOrders(newIds);
  updatePeriodStatsOnly();
  updateOrdersTitle();
  loadStats();
}

function computeOrdersHash(orders){
  // Hash léger : concatène id + status + updated_at
  return orders.map(o => `${o.id}:${o.status}:${o.updated_at || ''}`).join('|');
}

function updatePeriodStatsOnly(){
  renderPeriodStats();
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
function renderOrders(newIds = new Set()){
  const el = document.getElementById('ordersList');
  if(state.orders.length === 0){ el.innerHTML = '<p class="hint">Aucune commande pour l\u2019instant.</p>'; return; }
  el.innerHTML = state.orders.map(o => {
    const isNew = newIds.has(String(o.id));
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
       <div class="order-card ${isNew ? 'order-new' : ''}" data-order-id="${o.id}">
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
  state.editingOrderId = id;
  const select = document.querySelector(`[data-order-id="${id}"] .status-select`);
  if(select) select.disabled = true;

  try {
    await fetch(`${API_BASE}/api/admin/orders/${id}/status`, {
      method:'PATCH', headers: authHeaders(), body: JSON.stringify({ status })
    });
    await loadOrders({ force: true });
  } finally {
    state.editingOrderId = null;
    const selectAfter = document.querySelector(`[data-order-id="${id}"] .status-select`);
    if(selectAfter) selectAfter.disabled = false;
  }
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

    // Vérifier toutes les protections
    const check = shouldSkipRefresh();
    if(check.skip){
      state.autoRefresh.pausedReason = check.reason;
      updatePauseIndicator(check.reason);
      return;
    }

    state.autoRefresh.pausedReason = null;

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
    el.textContent = '⏸ Auto-refresh désactivé';
    el.style.color = 'var(--ink-soft)';
    return;
  }

  if(state.autoRefresh.pausedReason){
    updatePauseIndicator(state.autoRefresh.pausedReason);
    return;
  }

  el.style.color = 'var(--ink-soft)';
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

/* ---------- Détection des situations où il ne faut PAS refresh ---------- */
function shouldSkipRefresh(){
  // 1. Input/textarea/select en cours de saisie
  const active = document.activeElement;
  if(active){
    const tag = active.tagName.toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select'){
      // Exclure les boutons de filtre (qui sont des <button>)
      return { skip: true, reason: 'input' };
    }
  }

  // 2. Texte sélectionné quelque part sur la page
  const selection = window.getSelection();
  if(selection && selection.toString().trim().length > 0){
    return { skip: true, reason: 'selection' };
  }

  // 3. Modale ouverte
  if(state.hasOpenModal){
    return { skip: true, reason: 'modal' };
  }

  // 4. Scroll en cours (dernier scroll < 2 secondes)
  if(state.autoRefresh.scrollTimeout){
    return { skip: true, reason: 'scroll' };
  }

  // 5. Édition de statut en cours (protection déjà existante)
  if(state.editingOrderId){
    return { skip: true, reason: 'status-edit' };
  }

  return { skip: false, reason: null };
}

function updatePauseIndicator(reason){
  const el = document.getElementById('lastUpdateLabel');
  if(!el) return;

  const messages = {
    'input': '⏸ En pause — saisie en cours',
    'selection': '⏸ En pause — texte sélectionné',
    'modal': '⏸ En pause — fenêtre ouverte',
    'scroll': '⏸ En pause — défilement en cours',
    'status-edit': '⏸ En pause — modification en cours',
  };

  if(reason && messages[reason]){
    el.textContent = messages[reason];
    el.style.color = 'var(--ink-soft)';
  }
}

// Détection du scroll : on désactive le refresh pendant 2 secondes après le dernier scroll
function setupScrollDetection(){
  const main = document.querySelector('.admin-main');
  if(!main) return;

  main.addEventListener('scroll', () => {
    if(state.autoRefresh.scrollTimeout){
      clearTimeout(state.autoRefresh.scrollTimeout);
    }
    state.autoRefresh.scrollTimeout = setTimeout(() => {
      state.autoRefresh.scrollTimeout = null;
    }, 2000);
  }, { passive: true });
}

// Détection des modales : on regarde si un élément avec class "modal" ou "overlay" est visible
function setupModalDetection(){
  const observer = new MutationObserver(() => {
    const modals = document.querySelectorAll('.modal, .overlay, [role="dialog"]');
    let hasOpen = false;
    modals.forEach(m => {
      const style = window.getComputedStyle(m);
      if(style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'){
        hasOpen = true;
      }
    });
    state.hasOpenModal = hasOpen;
  });

  observer.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style', 'class'],
  });
}

/* ---------- Création manuelle de commande ---------- */
function openNewOrderModal(){
  state.newOrder = { mode: 'surplace', items: [], zoneId: null, zoneFee: 0 };
  state.hasOpenModal = true;
  document.getElementById('no-name').value = '';
  document.getElementById('no-phone').value = '';
  setNewOrderMode('surplace');
  renderNewOrderItems();
  document.getElementById('newOrderModal').style.display = 'flex';
}

function closeNewOrderModal(){
  state.hasOpenModal = false;
  document.getElementById('newOrderModal').style.display = 'none';
}

function setNewOrderMode(mode){
  state.newOrder.mode = mode;
  document.getElementById('no-mode').value = mode;

  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  const fields = document.getElementById('no-mode-fields');
  if(mode === 'livraison'){
    fields.innerHTML = `
      <h3>Livraison</h3>
      <div class="form-grid">
        <div class="full">
          <label>Adresse</label>
          <input type="text" id="no-address" placeholder="Quartier, repère...">
        </div>
        <div>
          <label>Zone</label>
          <select id="no-zone" onchange="onZoneChange()">
            <option value="">— Choisir une zone —</option>
            ${state.zones.map(z => `<option value="${z.id}" data-fee="${z.fee}">${z.label} ${z.fee > 0 ? '— ' + fmt(z.fee) : '— livreur confirme'}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Indications (optionnel)</label>
          <input type="text" id="no-notes" placeholder="Portail bleu, 2e étage...">
        </div>
      </div>
    `;
    document.getElementById('no-fee-row').style.display = 'flex';
  } else if(mode === 'surplace'){
    fields.innerHTML = `
      <h3>Sur place</h3>
      <div class="form-grid">
        <div>
          <label>Numéro de table (optionnel)</label>
          <input type="text" id="no-table" placeholder="ex: 5">
        </div>
        <div>
          <label>Nombre de personnes</label>
          <select id="no-people">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5+</option>
          </select>
        </div>
      </div>
    `;
    document.getElementById('no-fee-row').style.display = 'none';
  } else {
    fields.innerHTML = '';
    document.getElementById('no-fee-row').style.display = 'none';
  }
  updateNewOrderTotals();
}

function onZoneChange(){
  const sel = document.getElementById('no-zone');
  const opt = sel.options[sel.selectedIndex];
  state.newOrder.zoneId = sel.value || null;
  state.newOrder.zoneFee = opt ? parseInt(opt.dataset.fee, 10) || 0 : 0;
  updateNewOrderTotals();
}

function openAddDishToOrder(){
  state.addDishContext = { categoryId: state.categories[0]?.id, currentDish: null, options: {} };
  renderAddDishModal();
  document.getElementById('addDishModal').style.display = 'flex';
}

function closeAddDishModal(){
  document.getElementById('addDishModal').style.display = 'none';
  state.addDishContext = null;
}

function renderAddDishModal(){
  const ctx = state.addDishContext;
  if(!ctx) return;
  const body = document.getElementById('addDishBody');

  if(!ctx.currentDish){
    // Étape 1 : choisir catégorie + plat
    const dishes = state.dishes.filter(d => d.category_id === ctx.categoryId && d.available && !d.soon);
    body.innerHTML = `
      <div class="form-grid">
        <div class="full">
          <label>Catégorie</label>
          <select onchange="state.addDishContext.categoryId = this.value; renderAddDishModal();">
            ${state.categories.map(c => `<option value="${c.id}" ${c.id === ctx.categoryId ? 'selected' : ''}>${c.emoji || ''} ${c.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="dish-pick-list">
        ${dishes.map(d => `
          <button type="button" class="dish-pick-row" onclick="pickDishForOrder('${d.id}')">
            <span class="dp-name">${d.name}</span>
            <span class="dp-price">${d.is_simple ? fmt(d.price_simple) : 'XL ' + fmt(d.price_xl)}</span>
          </button>
        `).join('') || '<p class="hint">Aucun plat disponible dans cette catégorie.</p>'}
      </div>
    `;
  } else {
    // Étape 2 : options du plat
    const d = ctx.currentDish;
    const o = ctx.options;
    const price = d.is_simple ? d.price_simple : (o.size === 'xxl' ? d.price_xxl : d.price_xl);
    const total = price * (o.qty || 1);

    body.innerHTML = `
      <h3 style="margin-bottom:12px;">${d.name}</h3>

      ${!d.is_simple ? `
      <div class="opt-group">
        <span class="opt-label">Taille</span>
        <div class="opt-row">
          <button type="button" class="opt-pill ${o.size === 'xl' ? 'selected' : ''}" onclick="setAddDishOpt('size', 'xl')">XL · ${fmt(d.price_xl)}</button>
          <button type="button" class="opt-pill ${o.size === 'xxl' ? 'selected' : ''}" onclick="setAddDishOpt('size', 'xxl')">XXL · ${fmt(d.price_xxl)}</button>
        </div>
      </div>` : ''}

      ${d.color_option ? `
      <div class="opt-group">
        <span class="opt-label">Sauce</span>
        <div class="opt-row">
          <button type="button" class="opt-pill ${o.color === 'rouge' ? 'selected' : ''}" onclick="setAddDishOpt('color', 'rouge')">Rouge</button>
          <button type="button" class="opt-pill ${o.color === 'blanc' ? 'selected' : ''}" onclick="setAddDishOpt('color', 'blanc')">Blanc</button>
        </div>
      </div>` : ''}

      ${d.spicy_toggle ? `
      <div class="opt-group">
        <span class="opt-label">Niveau</span>
        <div class="opt-row">
          <button type="button" class="opt-pill ${!o.spicy ? 'selected' : ''}" onclick="setAddDishOpt('spicy', false)">Normal</button>
          <button type="button" class="opt-pill spicy ${o.spicy ? 'selected' : ''}" onclick="setAddDishOpt('spicy', true)">Spicy</button>
        </div>
      </div>` : ''}

      ${d.viande_option ? `
      <div class="opt-group">
        <span class="opt-label">Viande</span>
        <div class="opt-row">
          <button type="button" class="opt-pill ${!o.viande ? 'selected' : ''}" onclick="setAddDishOpt('viande', false)">Sans</button>
          <button type="button" class="opt-pill ${o.viande ? 'selected' : ''}" onclick="setAddDishOpt('viande', true)">Avec viande</button>
        </div>
      </div>` : ''}

      <div class="opt-group">
        <span class="opt-label">Quantité</span>
        <div class="qty-row">
          <button type="button" class="qty-btn" onclick="setAddDishOpt('qty', Math.max(1, (state.addDishContext.options.qty || 1) - 1))">−</button>
          <span class="qty-val">${o.qty || 1}</span>
          <button type="button" class="qty-btn" onclick="setAddDishOpt('qty', (state.addDishContext.options.qty || 1) + 1)">+</button>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="state.addDishContext.currentDish = null; renderAddDishModal();">Retour</button>
        <button type="button" class="btn-primary" onclick="confirmAddDishToOrder()">Ajouter · ${fmt(total)}</button>
      </div>
    `;
  }
}

function pickDishForOrder(dishId){
  const d = state.dishes.find(x => x.id === dishId);
  state.addDishContext.currentDish = d;
  state.addDishContext.options = {
    size: d.is_simple ? null : 'xl',
    spicy: false,
    viande: false,
    color: 'rouge',
    qty: 1,
  };
  renderAddDishModal();
}

function setAddDishOpt(key, val){
  state.addDishContext.options[key] = val;
  renderAddDishModal();
}

function confirmAddDishToOrder(){
  const ctx = state.addDishContext;
  const d = ctx.currentDish;
  const o = ctx.options;
  const price = d.is_simple ? d.price_simple : (o.size === 'xxl' ? d.price_xxl : d.price_xl);

  let label = d.name;
  const parts = [];
  if(o.size) parts.push(o.size.toUpperCase());
  if(d.color_option && o.color) parts.push(o.color === 'rouge' ? 'Rouge' : 'Blanc');
  if(d.spicy_toggle) parts.push(o.spicy ? 'Spicy' : 'Normal');
  if(d.viande_option && o.viande) parts.push('avec viande');
  const variant_label = parts.join(' · ');

  state.newOrder.items.push({
    dish_id: d.id,
    dish_name: d.name,
    variant_label,
    unit_price: price,
    qty: o.qty || 1,
  });

  closeAddDishModal();
  renderNewOrderItems();
}

function removeItemFromNewOrder(index){
  state.newOrder.items.splice(index, 1);
  renderNewOrderItems();
}

function renderNewOrderItems(){
  const el = document.getElementById('no-items-list');
  if(!el) return;

  if(state.newOrder.items.length === 0){
    el.innerHTML = '<p class="hint">Aucun plat ajouté pour l\'instant.</p>';
  } else {
    el.innerHTML = state.newOrder.items.map((it, i) => `
      <div class="order-item-row">
        <div>
          <strong>${it.qty}× ${it.dish_name}</strong>
          ${it.variant_label ? `<span class="oi-variant">${it.variant_label}</span>` : ''}
        </div>
        <div class="oi-right">
          <span>${fmt(it.unit_price * it.qty)}</span>
          <button type="button" class="btn-danger" onclick="removeItemFromNewOrder(${i})">×</button>
        </div>
      </div>
    `).join('');
  }
  updateNewOrderTotals();
}

function updateNewOrderTotals(){
  const subtotal = state.newOrder.items.reduce((s, it) => s + it.unit_price * it.qty, 0);
  const fee = state.newOrder.mode === 'livraison' ? state.newOrder.zoneFee : 0;
  const total = subtotal + fee;

  const elSub = document.getElementById('no-subtotal');
  const elFee = document.getElementById('no-fee');
  const elTotal = document.getElementById('no-total');
  if(elSub) elSub.textContent = fmt(subtotal);
  if(elFee) elFee.textContent = fmt(fee);
  if(elTotal) elTotal.textContent = fmt(total);
}

async function submitNewOrder(e){
  e.preventDefault();
  if(state.newOrder.items.length === 0){
    alert('Ajoutez au moins un plat.');
    return;
  }

  const mode = state.newOrder.mode;
  const body = {
    mode,
    customer_name: document.getElementById('no-name').value.trim() || null,
    customer_phone: document.getElementById('no-phone').value.trim() || null,
    items: state.newOrder.items,
  };

  if(mode === 'livraison'){
    body.delivery_address = document.getElementById('no-address')?.value.trim() || null;
    body.delivery_zone_id = state.newOrder.zoneId;
    body.delivery_notes = document.getElementById('no-notes')?.value.trim() || null;
  } else if(mode === 'surplace'){
    const table = document.getElementById('no-table')?.value.trim();
    if(table) body.delivery_notes = 'Table ' + table;
    body.people_count = parseInt(document.getElementById('no-people')?.value, 10) || null;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if(!res.ok){
      alert('Erreur : ' + (data.error || 'inconnue'));
      return;
    }
    closeNewOrderModal();
    await loadOrders({ force: true });
    alert('Commande ' + data.orderId + ' enregistrée.');
  } catch (err) {
    alert('Erreur réseau : ' + err.message);
  }
}

checkAuthAndShow();

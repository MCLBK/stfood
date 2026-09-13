/* ============================================================
   CONFIGURATION
   ============================================================ */
// Le site est servi par le même serveur Express que l'API (voir server.js),
// donc une base relative suffit. On garde un point d'extension au cas où
// le front serait un jour déployé séparément du backend.
const API_BASE = window.STREETFOOD_API_BASE || '';
const REWARD_THRESHOLD = 8; // doit rester cohérent avec server/routes/loyalty.js

/* ============================================================
   ÉTAT DE L'APPLICATION
   ============================================================ */
let state = {
  mode: null,                 // 'livraison' | 'emporter' | 'surplace'
  isGroupOrder: false,
  activeCat: 'spaghettis',
  categories: [],
  dishes: [],
  deliveryZones: [],
  favoriteIds: new Set(),
  guestId: null,
  cart: [],                   // {key, dishId, name, size, price, qty, photo}
  currentDish: null,
  currentOptions: {},
  activeOrder: null,
  pollTimer: null,
};

function fmt(n){ if(n===null || n===undefined) return '—'; return n.toLocaleString('fr-FR') + ' F'; }
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2400);
}
function guestId(){
  if(state.guestId) return state.guestId;
  let id = localStorage.getItem('sf_guest_id');
  if(!id){
    id = 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('sf_guest_id', id);
  }
  state.guestId = id;
  return id;
}

/* ============================================================
   CHARGEMENT DES DONNÉES (menu, zones, favoris) DEPUIS L'API
   Avec repli sur menu-data.js si le serveur est injoignable, pour que
   la démonstration reste consultable même hors-ligne.
   ============================================================ */
async function loadMenu(){
  try{
    const res = await fetch(`${API_BASE}/api/menu`);
    if(!res.ok) throw new Error('menu api error');
    const data = await res.json();
    state.categories = data.categories;
    state.dishes = data.dishes;
  }catch(err){
    console.warn('API menu indisponible, repli sur les données locales.', err);
    state.categories = MENU_DATA.categories;
    state.dishes = MENU_DATA.dishes.concat([{
      id: SPECIAL_DISH.id, cat:'spaghettis', name: SPECIAL_DISH.name, desc:'', photo: SPECIAL_DISH.photo,
      xl: SPECIAL_DISH.xl, xxl: SPECIAL_DISH.xxl, simple:false, soon:false,
    }]);
  }
}
async function loadDeliveryZones(){
  try{
    const res = await fetch(`${API_BASE}/api/delivery/zones`);
    const data = await res.json();
    state.deliveryZones = data.zones;
  }catch(err){
    state.deliveryZones = [];
  }
}
async function loadFavorites(){
  try{
    const res = await fetch(`${API_BASE}/api/favorites/${guestId()}`);
    const data = await res.json();
    state.favoriteIds = new Set(data.dishIds);
  }catch(err){
    state.favoriteIds = new Set();
  }
}
async function toggleFavorite(dishId, ev){
  if(ev) ev.stopPropagation();
  const isFav = state.favoriteIds.has(dishId);
  try{
    if(isFav){
      await fetch(`${API_BASE}/api/favorites/${guestId()}/${dishId}`, { method:'DELETE' });
      state.favoriteIds.delete(dishId);
    } else {
      await fetch(`${API_BASE}/api/favorites/${guestId()}`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ dishId })
      });
      state.favoriteIds.add(dishId);
    }
  }catch(err){
    // Repli local si l'API est indisponible : l'expérience reste fluide.
    if(isFav) state.favoriteIds.delete(dishId); else state.favoriteIds.add(dishId);
  }
  renderCategories();
  renderDishes();
}

/* ---------- Rendu catégories & plats ---------- */
function renderCategories(){
  const el = document.getElementById('catScroll');
  const favCount = state.favoriteIds.size;
  let html = state.categories.map(c => `
    <button class="cat-chip ${c.id===state.activeCat?'active':''}" onclick="setCategory('${c.id}')">
      <span class="em">${c.emoji||''}</span> ${c.label}
    </button>
  `).join('');
  if(favCount > 0){
    html += `<button class="cat-chip fav-chip ${state.activeCat==='favoris'?'active':''}" onclick="setCategory('favoris')">
      <span class="em">♥</span> Mes favoris (${favCount})
    </button>`;
  }
  el.innerHTML = html;
}
function setCategory(id){
  state.activeCat = id;
  renderCategories();
  renderDishes();
}
function dishCardHeart(d){
  const isFav = state.favoriteIds.has(d.id);
  return `<button class="heart-btn ${isFav?'active':''}" onclick="toggleFavorite('${d.id}', event)" aria-label="Ajouter aux favoris">
    <svg viewBox="0 0 24 24" width="17" height="17" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 7.8 2 4.5 5.4 4c2.1-.3 4 .8 6.6 3.4C14.6 4.8 16.5 3.7 18.6 4c3.4.5 5 3.8 3.4 7.2-2.5 4.7-10 9.3-10 9.3Z"/></svg>
  </button>`;
}
function renderDishes(){
  const el = document.getElementById('dishGrid');
  let dishes;
  if(state.activeCat === 'favoris'){
    dishes = state.dishes.filter(d => state.favoriteIds.has(d.id) && !d.soon);
  } else {
    dishes = state.dishes.filter(d => d.cat === state.activeCat);
  }

  if(dishes.length === 0){
    el.innerHTML = `<p style="grid-column:1/-1; color:var(--ink-soft); padding:20px 4px; font-size:0.9rem;">Rien à afficher ici pour l'instant.</p>`;
    return;
  }

  el.innerHTML = dishes.map(d => {
    if(d.soon){
      return `
      <div class="dish-card disabled">
        <div class="dish-photo"><img src="${d.photo}" alt="" loading="lazy"><span class="dish-badge soon">Bientôt</span></div>
        <div class="dish-body">
          <h4>${d.name}</h4>
          <p class="desc">${d.desc}</p>
          <div class="dish-foot">
            <span class="dish-price"><small>ajouté prochainement</small></span>
            <span class="add-btn">＋</span>
          </div>
        </div>
      </div>`;
    }
    if(d.simple){
      return `
      <div class="dish-card" onclick="openSimpleDish('${d.id}')">
        <div class="dish-photo drink-photo">
          ${dishCardHeart(d)}
          <span class="drink-ic">🥤</span>
        </div>
        <div class="dish-body">
          <h4>${d.name}</h4>
          <p class="desc">${d.desc || (d.variants ? d.variants.slice(0,3).join(' · ') + (d.variants.length>3 ? '…' : '') : '')}</p>
          <div class="dish-foot">
            <span class="dish-price">${fmt(d.price)}</span>
            <span class="add-btn">＋</span>
          </div>
        </div>
      </div>`;
    }
    return `
    <div class="dish-card" onclick="openDish('${d.id}')">
      <div class="dish-photo">${dishCardHeart(d)}<img src="${d.photo}" alt="${d.name}" loading="lazy"></div>
      <div class="dish-body">
        <h4>${d.name}</h4>
        <p class="desc">${d.desc}</p>
        <div class="dish-foot">
          <span class="dish-price">${fmt(d.xl)} <small>XL</small></span>
          <span class="add-btn">＋</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ---------- Fiche plat détaillée (tailles/options) ---------- */
function openDish(id){
  const d = state.dishes.find(x=>x.id===id);
  state.currentDish = d;
  state.currentOptions = { size:'xl', spicy:false, viande:false, color:'rouge', qty:1 };
  renderDishSheet();
  document.getElementById('dishOverlay').classList.add('open');
}
// Boisson simple : si elle a des variantes (ex: marques de bière), on ouvre
// une petite fiche de sélection ; sinon ajout direct au panier.
function openSimpleDish(id){
  const d = state.dishes.find(x=>x.id===id);
  if(d.variants && d.variants.length){
    state.currentDish = d;
    state.currentOptions = { variant: d.variants[0], qty: 1 };
    renderVariantSheet();
    document.getElementById('dishOverlay').classList.add('open');
    return;
  }
  addToCart({
    key: d.id + '-' + Date.now(),
    dishId: d.id,
    name: d.name,
    size: '',
    price: d.price,
    qty: 1,
    photo: d.photo
  });
  showToast(d.name + ' ajouté au panier');
}
function renderVariantSheet(){
  const d = state.currentDish;
  const o = state.currentOptions;
  document.getElementById('dishSheetBody').innerHTML = `
    <button class="sheet-close" onclick="closeSheet('dishOverlay')">✕</button>
    <h3 class="display">${d.name}</h3>
    <p class="dm-desc">${d.desc || ''}</p>
    <div class="opt-group">
      <span class="opt-label">Choisis</span>
      <div class="opt-row">
        ${d.variants.map(v => `<button class="opt-pill ${o.variant===v?'selected':''}" onclick="setDishOpt('variant', ${JSON.stringify(v)})">${v}</button>`).join('')}
      </div>
    </div>
    <div class="qty-row">
      <button class="qty-btn" onclick="setDishOpt('qty', Math.max(1, ${o.qty}-1))">−</button>
      <span class="qty-val">${o.qty}</span>
      <button class="qty-btn" onclick="setDishOpt('qty', ${o.qty}+1)">+</button>
    </div>
    <button class="dm-add" onclick="confirmAddVariant()">
      <span>Ajouter au panier</span>
      <span>${fmt(d.price * o.qty)}</span>
    </button>
  `;
}
function confirmAddVariant(){
  const d = state.currentDish;
  const o = state.currentOptions;
  addToCart({
    key: d.id + '-' + o.variant + '-' + Date.now(),
    dishId: d.id,
    name: d.name,
    size: o.variant,
    price: d.price,
    qty: o.qty,
    photo: d.photo
  });
  closeSheet('dishOverlay');
  showToast(d.name + ' ajouté au panier');
}
function renderDishSheet(){
  const d = state.currentDish;
  const o = state.currentOptions;
  const price = o.size === 'xl' ? d.xl : d.xxl;
  document.getElementById('dishSheetBody').innerHTML = `
    <button class="sheet-close" onclick="closeSheet('dishOverlay')">✕</button>
    ${d.photo ? `<div class="dm-photo"><img src="${d.photo}" alt="${d.name}"></div>` : ''}
    <h3 class="display">${d.name}</h3>
    <p class="dm-desc">${d.desc}</p>

    <div class="opt-group">
      <span class="opt-label">Taille</span>
      <div class="opt-row">
        <button class="opt-pill ${o.size==='xl'?'selected':''}" onclick="setDishOpt('size','xl')">XL · ${fmt(d.xl)}</button>
        <button class="opt-pill ${o.size==='xxl'?'selected':''}" onclick="setDishOpt('size','xxl')">XXL · ${fmt(d.xxl)}</button>
      </div>
    </div>

    ${d.colorOption ? `
    <div class="opt-group">
      <span class="opt-label">Sauce</span>
      <div class="opt-row">
        <button class="opt-pill ${o.color==='rouge'?'selected':''}" onclick="setDishOpt('color','rouge')">Rouge</button>
        <button class="opt-pill ${o.color==='blanc'?'selected':''}" onclick="setDishOpt('color','blanc')">Blanc</button>
      </div>
    </div>` : ''}

    ${d.spicyToggle ? `
    <div class="opt-group">
      <span class="opt-label">Niveau</span>
      <div class="opt-row">
        <button class="opt-pill ${!o.spicy?'selected':''}" onclick="setDishOpt('spicy',false)">Normal</button>
        <button class="opt-pill spicy ${o.spicy?'selected':''}" onclick="setDishOpt('spicy',true)">Spicy</button>
      </div>
    </div>` : ''}

    ${d.viandeOption ? `
    <div class="opt-group">
      <span class="opt-label">Avec viande</span>
      <div class="opt-row">
        <button class="opt-pill ${!o.viande?'selected':''}" onclick="setDishOpt('viande',false)">Sans</button>
        <button class="opt-pill ${o.viande?'selected':''}" onclick="setDishOpt('viande',true)">Avec viande</button>
      </div>
    </div>` : ''}

    <div class="qty-row">
      <button class="qty-btn" onclick="setDishOpt('qty', Math.max(1, ${o.qty}-1))">−</button>
      <span class="qty-val">${o.qty}</span>
      <button class="qty-btn" onclick="setDishOpt('qty', ${o.qty}+1)">+</button>
    </div>

    <button class="dm-add" onclick="confirmAddDish()">
      <span>Ajouter au panier</span>
      <span>${fmt(price * o.qty)}</span>
    </button>
  `;
}
function setDishOpt(key, val){
  state.currentOptions[key] = val;
  if(state.currentDish.variants) renderVariantSheet(); else renderDishSheet();
}
function confirmAddDish(){
  const d = state.currentDish;
  const o = state.currentOptions;
  const price = o.size === 'xl' ? d.xl : d.xxl;
  let label = o.size.toUpperCase();
  if(d.colorOption) label += ' · ' + (o.color==='rouge'?'Rouge':'Blanc');
  if(d.spicyToggle) label += o.spicy ? ' · Spicy' : ' · Normal';
  if(d.viandeOption && o.viande) label += ' · avec viande';
  addToCart({
    key: d.id + '-' + JSON.stringify(o) + '-' + Date.now(),
    dishId: d.id,
    name: d.name,
    size: label,
    price: price,
    qty: o.qty,
    photo: d.photo
  });
  closeSheet('dishOverlay');
  showToast(d.name + ' ajouté au panier');
}

/* ---------- Panier ---------- */
function addToCart(item){
  state.cart.push(item);
  updateCartUI();
}
function removeFromCart(key){
  state.cart = state.cart.filter(i=>i.key!==key);
  updateCartUI();
  renderCart();
}
function changeQty(key, delta){
  const item = state.cart.find(i=>i.key===key);
  if(!item) return;
  item.qty = Math.max(1, item.qty + delta);
  updateCartUI();
  renderCart();
}
function cartTotal(){
  return state.cart.reduce((s,i)=>s+i.price*i.qty, 0);
}
function cartCount(){
  return state.cart.reduce((s,i)=>s+i.qty, 0);
}
function updateCartUI(){
  document.getElementById('cartCount').textContent = cartCount();
  document.getElementById('cartHeaderTotal').textContent = fmt(cartTotal());
  const bar = document.getElementById('orderBar');
  if(cartCount() > 0){
    bar.style.display = 'flex';
    document.getElementById('orderBarCount').textContent = cartCount() + (cartCount()>1?' articles':' article');
    document.getElementById('orderBarTotal').textContent = fmt(cartTotal());
    document.getElementById('orderBarMode').textContent = modeLabel(state.mode) || 'Mode non choisi';
  } else {
    bar.style.display = 'none';
  }
}
function modeLabel(m){
  return { livraison:'Livraison', emporter:'À emporter', surplace:'Sur place' }[m] || '';
}
function renderCart(){
  const lines = document.getElementById('cartLines');
  const summary = document.getElementById('cartSummary');
  if(state.cart.length===0){
    lines.innerHTML = "<div class=\"cart-empty\">Ton panier est vide pour l'instant.<br>Va faire un tour dans le menu.</div>";
    summary.innerHTML = '';
    return;
  }
  lines.innerHTML = state.cart.map(i => `
    <div class="cart-line">
      ${i.photo ? `<img src="${i.photo}" alt="">` : `<div class="cl-noimg">🥤</div>`}
      <div class="cl-info">
        <strong>${i.name}</strong>
        <span>${i.size || ''}</span>
        <div class="cl-qty-row">
          <button class="qty-btn sm" onclick="changeQty('${i.key}',-1)">−</button>
          <span class="cl-qty">${i.qty}</span>
          <button class="qty-btn sm" onclick="changeQty('${i.key}',1)">+</button>
          <button class="cl-remove" onclick="removeFromCart('${i.key}')">retirer</button>
        </div>
      </div>
      <div class="cl-price">${fmt(i.price*i.qty)}</div>
    </div>
  `).join('');

  const total = cartTotal();
  summary.innerHTML = `
    <div class="cart-summary">
      <div class="sum-row"><span>Sous-total</span><span>${fmt(total)}</span></div>
      <div class="sum-row" style="opacity:0.65;"><span>Frais (livraison / autres)</span><span>calculés à l'étape suivante</span></div>
      <div class="sum-row total"><span>Total</span><span>${fmt(total)}</span></div>
      <button class="btn btn-primary" style="width:100%; margin-top:14px;" onclick="goToCheckout()">Continuer</button>
    </div>
  `;
}
function openCart(){
  renderCart();
  document.getElementById('cartOverlay').classList.add('open');
}
function goToCheckout(){
  if(state.cart.length===0){ showToast('Ajoute au moins un plat'); return; }
  closeSheet('cartOverlay');
  if(!state.mode){
    openModeSheet();
    showToast("Choisis d'abord un mode de commande");
    return;
  }
  renderCheckout();
  document.getElementById('checkoutOverlay').classList.add('open');
}

/* ---------- Sélection du mode + personnel/groupe ---------- */
function openModeSheet(){
  document.getElementById('modeOverlay').classList.add('open');
}
function selectModeAndOpen(mode){
  state.mode = mode;
  updateCartUI();
  closeSheet('modeOverlay');
  renderOrderTypeToggle();
  document.querySelectorAll('#commander .mode-card').forEach(c=>{
    c.classList.toggle('active', c.dataset.mode===mode);
  });
  showToast(modeLabel(mode) + ' sélectionné — choisis tes plats');
  document.getElementById('menu').scrollIntoView({behavior:'smooth'});
}
function renderOrderTypeToggle(){
  const zone = document.getElementById('orderTypeZone');
  if(!state.mode){ zone.innerHTML=''; zone.style.display='none'; return; }
  zone.style.display = 'block';
  zone.innerHTML = `
    <div class="order-type-row">
      <span class="opt-label">Type de commande</span>
      <div class="opt-row">
        <button class="opt-pill ${!state.isGroupOrder?'selected':''}" onclick="setGroupOrder(false)">Commande personnelle</button>
        <button class="opt-pill ${state.isGroupOrder?'selected':''}" onclick="setGroupOrder(true)">Commande de groupe</button>
      </div>
    </div>
    ${state.isGroupOrder ? `
      <div class="group-suggestion">
        <p><strong>Pour un groupe</strong> : pense aux formats à partager — la <em>Girafe bière pression</em> (6000 F) ou des plats en XXL. Le nombre de personnes te sera demandé au récapitulatif.</p>
      </div>` : ''}
  `;
}
function setGroupOrder(val){
  state.isGroupOrder = val;
  renderOrderTypeToggle();
}

/* ---------- Checkout (dynamique selon le mode) ---------- */
function zoneOptionsHtml(){
  if(!state.deliveryZones.length){
    return `<option value="">Zone non disponible — indique ton adresse ci-dessus</option>`;
  }
  return state.deliveryZones.map(z => `
    <option value="${z.id}">${z.label}${z.fee > 0 ? ' — ' + fmt(z.fee) : ' (prix confirmé par le livreur)'}</option>
  `).join('');
}
function renderCheckout(){
  document.getElementById('checkoutTitle').textContent = 'Finaliser : ' + modeLabel(state.mode);
  let html = '';
  const groupPeopleField = state.isGroupOrder ? `
    <div class="field"><label>Nombre de personnes</label>
      <select id="ck-people"><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7+</option></select>
    </div>` : '';

  if(state.mode === 'livraison'){
    html = `
      <div class="field"><label>Nom</label><input type="text" id="ck-name" placeholder="Ton nom"></div>
      <div class="field"><label>Téléphone</label><input type="tel" id="ck-phone" placeholder="+229 ..."></div>
      <div class="field"><label>Adresse de livraison</label><input type="text" id="ck-address" placeholder="Quartier, repère..."></div>
      <div class="field"><label>Zone / quartier</label>
        <select id="ck-zone" onchange="updateCheckoutTotal()">${zoneOptionsHtml()}</select>
      </div>
      <div class="field"><label>Indications (optionnel)</label><textarea id="ck-notes" placeholder="Portail bleu, 2e étage..."></textarea></div>
      ${groupPeopleField}

      <div class="opt-group">
        <span class="opt-label">Quand ?</span>
        <div class="time-choice">
          <button class="selected" data-time="asap" onclick="pickTime(this,'asap')">Dès que possible</button>
          <button data-time="later" onclick="pickTime(this,'later')">Programmer</button>
        </div>
      </div>
      <div class="field" id="scheduleField" style="display:none;">
        <label>Heure souhaitée</label>
        <input type="time" id="ck-time">
        <div class="note-box">On garde ta commande prête jusqu'à environ 15 min après l'heure choisie. Un imprévu, un peu de retard ? Préviens-nous simplement depuis le suivi de commande, on ajuste la préparation.</div>
      </div>

      <div class="field"><label>Paiement</label>
        <select id="ck-pay"><option>Paiement à la livraison</option></select>
      </div>
      <div class="note-box" id="feeNote">Choisis ta zone pour voir les frais de livraison. Si ton quartier n'est pas listé, le livreur te confirme le tarif exact avant de partir.</div>
    `;
  }
  if(state.mode === 'emporter'){
    html = `
      <div class="field"><label>Nom</label><input type="text" id="ck-name" placeholder="Ton nom"></div>
      <div class="field"><label>Téléphone</label><input type="tel" id="ck-phone" placeholder="+229 ..."></div>
      ${groupPeopleField}
      <div class="opt-group">
        <span class="opt-label">Quand veux-tu récupérer ?</span>
        <div class="time-choice">
          <button class="selected" data-time="asap" onclick="pickTime(this,'asap')">Dès que possible</button>
          <button data-time="later" onclick="pickTime(this,'later')">Choisir une heure</button>
        </div>
      </div>
      <div class="field" id="scheduleField" style="display:none;">
        <label>Heure de retrait</label>
        <input type="time" id="ck-time">
        <div class="note-box">Un léger retard n'annule pas ta commande : elle reste préparée pour toi. Utilise "Je suis en retard" dans le suivi si besoin.</div>
      </div>
      <div class="field"><label>Paiement</label><select id="ck-pay"><option>Paiement au retrait</option></select></div>
    `;
  }
  if(state.mode === 'surplace'){
    html = `
      <div class="field"><label>Nom</label><input type="text" id="ck-name" placeholder="Ton nom"></div>
      <div class="field"><label>Téléphone</label><input type="tel" id="ck-phone" placeholder="+229 ..."></div>
      <div class="field"><label>Heure d'arrivée approximative</label><input type="time" id="ck-time"></div>
      <div class="field"><label>Nombre de personnes</label>
        <select id="ck-people"><option>1</option><option>2</option><option>3</option><option>4</option><option>5+</option></select>
      </div>
      <div class="group-note">
        <p>On prépare ce qui peut l'être à l'avance. Une fois arrivé au resto, clique sur "Je suis arrivé" dans le suivi de commande pour prévenir l'équipe.</p>
      </div>
      <div class="note-box" style="margin-top:14px;">Arrivée un peu plus tard que prévu ? Indique-le simplement depuis le suivi, rien n'est annulé.</div>
    `;
  }

  html += `
    <div class="cart-summary" id="checkoutSummary">
      <div class="sum-row"><span>Sous-total</span><span>${fmt(cartTotal())}</span></div>
      <div class="sum-row" id="feeRow"><span>Frais de livraison</span><span>—</span></div>
      <div class="sum-row total"><span>Total</span><span id="checkoutTotal">${fmt(cartTotal())}</span></div>
      <button class="btn btn-primary" style="width:100%; margin-top:14px;" onclick="submitOrder()">Confirmer la commande</button>
    </div>
  `;
  document.getElementById('checkoutBody').innerHTML = html;
  if(state.mode !== 'livraison'){
    const feeRow = document.getElementById('feeRow');
    if(feeRow) feeRow.style.display = 'none';
  }
}
function updateCheckoutTotal(){
  const zoneSel = document.getElementById('ck-zone');
  const zone = state.deliveryZones.find(z => z.id === zoneSel.value);
  const subtotal = cartTotal();
  const feeRow = document.getElementById('feeRow');
  const totalEl = document.getElementById('checkoutTotal');
  const noteEl = document.getElementById('feeNote');
  if(zone && zone.fee > 0){
    feeRow.innerHTML = `<span>Frais de livraison</span><span>${fmt(zone.fee)}</span>`;
    totalEl.textContent = fmt(subtotal + zone.fee);
    noteEl.textContent = "Frais confirmés pour cette zone.";
  } else {
    feeRow.innerHTML = `<span>Frais de livraison</span><span>à confirmer</span>`;
    totalEl.textContent = fmt(subtotal) + ' + livraison';
    noteEl.textContent = "Ta zone n'a pas de tarif fixe : le livreur te confirme le prix exact avant de partir, il s'ajoutera au total.";
  }
}
function pickTime(btn, val){
  document.querySelectorAll('.time-choice button').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('scheduleField').style.display = val==='later' ? 'block' : 'none';
}

/* ---------- Soumission + suivi ---------- */
async function submitOrder(){
  const get = id => document.getElementById(id);
  const name = get('ck-name') ? get('ck-name').value.trim() : '';
  const phone = get('ck-phone') ? get('ck-phone').value.trim() : '';

  if(!name || !phone){
    showToast('Indique ton nom et ton téléphone');
    return;
  }

  const items = state.cart.map(i => ({
    dishId: i.dishId || null, dishName: i.name, variantLabel: i.size || '', unitPrice: i.price, qty: i.qty
  }));

  const body = {
    mode: state.mode,
    customerName: name,
    customerPhone: phone,
    isGroupOrder: state.isGroupOrder,
    items,
  };
  if(state.mode === 'livraison'){
    body.deliveryAddress = get('ck-address') ? get('ck-address').value.trim() : '';
    body.deliveryZoneId = get('ck-zone') ? get('ck-zone').value : null;
    body.deliveryNotes = get('ck-notes') ? get('ck-notes').value.trim() : '';
    body.requestedTime = get('ck-time') ? get('ck-time').value : null;
    if(state.isGroupOrder) body.peopleCount = get('ck-people') ? get('ck-people').value : null;
  }
  if(state.mode === 'emporter'){
    body.requestedTime = get('ck-time') ? get('ck-time').value : null;
    if(state.isGroupOrder) body.peopleCount = get('ck-people') ? get('ck-people').value : null;
  }
  if(state.mode === 'surplace'){
    body.requestedTime = get('ck-time') ? get('ck-time').value : null;
    body.peopleCount = get('ck-people') ? get('ck-people').value : null;
  }

  let order;
  try{
    const res = await fetch(`${API_BASE}/api/orders`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error('order failed');
    order = await res.json();
  }catch(err){
    showToast("La commande n'a pas pu être envoyée. Vérifie ta connexion.");
    return;
  }

  state.activeOrder = order;
  state.cart = [];
  updateCartUI();
  closeSheet('checkoutOverlay');
  renderTracking();
  document.getElementById('trackOverlay').classList.add('open');
  showToast('Commande envoyée !');
  loadLoyalty(phone);
  startPolling(order.id);
}

function startPolling(orderId){
  if(state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try{
      const res = await fetch(`${API_BASE}/api/orders/${orderId}`);
      if(!res.ok) return;
      const order = await res.json();
      state.activeOrder = order;
      renderTracking();
      if(['livree','servie','annulee'].includes(order.status)){
        clearInterval(state.pollTimer);
      }
    }catch(err){ /* silencieux — on réessaiera au prochain tic */ }
  }, 7000);
}

async function loadLoyalty(phone){
  try{
    const res = await fetch(`${API_BASE}/api/loyalty/${phone}`);
    const data = await res.json();
    state.loyalty = data;
    renderTracking();
  }catch(err){ /* pas bloquant */ }
}

function renderTracking(){
  const o = state.activeOrder;
  document.getElementById('trackOrderNum').textContent = '#' + o.id;
  document.getElementById('trackModeLabel').textContent = modeLabel(o.mode) + (o.requested_time ? ' · programmée pour ' + o.requested_time : ' · dès que possible') + (o.is_group_order ? ' · commande de groupe' : '');

  let steps = [];
  if(o.mode === 'livraison'){
    steps = [
      {label:'Commande reçue', key:'recue'},
      {label:'En préparation', key:'en_preparation'},
      {label:'En livraison', key:'en_livraison'},
      {label:'Livrée', key:'livree'},
    ];
  } else if(o.mode === 'emporter'){
    steps = [
      {label:'Commande reçue', key:'recue'},
      {label:'En préparation', key:'en_preparation'},
      {label:'Prête à récupérer', key:'prete'},
    ];
  } else {
    steps = [
      {label:'Commande reçue', key:'recue'},
      {label:'En préparation', key:'en_preparation'},
      {label: o.arrived ? 'Arrivée signalée' : 'En attente de ton arrivée', key:'arrivee'},
      {label:'Servie', key:'servie'},
    ];
  }
  const order_progress = ['recue','en_preparation','prete','en_livraison','arrivee','livree','servie'];
  const currentIdx = order_progress.indexOf(o.status === 'recue' && o.mode==='surplace' && o.arrived ? 'arrivee' : o.status);

  document.getElementById('trackStatusList').innerHTML = steps.map((s, idx) => {
    let cls = '';
    const stepIdx = order_progress.indexOf(s.key);
    if(s.key === 'arrivee'){ cls = o.arrived ? 'done' : (idx===1 ? '' : ''); }
    else if(stepIdx !== -1 && currentIdx !== -1){
      if(stepIdx < currentIdx) cls = 'done';
      else if(stepIdx === currentIdx) cls = 'current';
    }
    if(idx === 0) cls = cls || 'done';
    if(idx === 1 && !cls) cls = 'current';
    return `<li class="${cls}"><div><strong>${s.label}</strong></div></li>`;
  }).join('');

  let actionHtml = '';

  if(o.mode === 'livraison'){
    if(o.delivery_fee_confirmed){
      actionHtml += `<div class="fee-confirmed">Frais de livraison confirmés : <strong>${fmt(o.delivery_fee_final)}</strong> · Total : <strong>${fmt(o.total)}</strong></div>`;
    } else {
      actionHtml += `<div class="fee-pending">Frais de livraison en cours de confirmation par le livreur — le total sera mis à jour ici automatiquement.</div>`;
    }
  }

  if(o.mode === 'surplace' && !o.arrived){
    actionHtml += `<button class="btn btn-dark" style="width:100%; margin-bottom:12px;" onclick="markArrived()">Je suis arrivé</button>`;
  }
  if(o.requested_time){
    actionHtml += `
      <div class="late-box">
        <p>${o.late_flagged ? "Merci, l'équipe est prévenue de ton léger retard." : 'Un imprévu ? Si tu vas arriver plus tard que ' + o.requested_time + ', préviens le resto en un clic — ta commande reste réservée.'}</p>
        ${!o.late_flagged ? `<button class="btn btn-ghost" style="border-color:rgba(250,245,236,0.4);" onclick="flagLate()">Je vais être en retard</button>` : ''}
      </div>`;
  }
  if(state.loyalty && state.loyalty.ordersCount > 0){
    const l = state.loyalty;
    actionHtml += `
      <div class="loyalty-box">
        ${l.rewardEligible
          ? `<strong>Bravo — récompense débloquée !</strong><span>C'est ta ${l.ordersCount}ᵉ commande chez Street Food. Signale-le sur place ou en livraison.</span>`
          : `<strong>C'est ta ${l.ordersCount}${l.ordersCount>1?'ᵉ':'ʳᵉ'} commande</strong><span>Encore ${l.remainingForReward} commande${l.remainingForReward>1?'s':''} avant une récompense (tous les ${l.threshold} commandes).</span>`
        }
      </div>`;
  }
  document.getElementById('trackActionZone').innerHTML = actionHtml;
}
async function markArrived(){
  try{
    const res = await fetch(`${API_BASE}/api/orders/${state.activeOrder.id}/arrived`, { method:'PATCH' });
    state.activeOrder = await res.json();
  }catch(err){ state.activeOrder.arrived = true; }
  renderTracking();
  showToast("L'équipe a été prévenue de ton arrivée");
}
async function flagLate(){
  try{
    const res = await fetch(`${API_BASE}/api/orders/${state.activeOrder.id}/late`, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ note:'Signalé depuis le suivi client' })
    });
    state.activeOrder = await res.json();
  }catch(err){ state.activeOrder.late_flagged = true; }
  renderTracking();
  showToast('Merci, on adapte la préparation');
}

/* ---------- Overlay helpers ---------- */
function closeSheet(id){
  document.getElementById(id).classList.remove('open');
}
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('keydown', e=>{ if(e.key==='Escape') o.classList.remove('open'); });
});

/* ---------- Init ---------- */
async function init(){
  await Promise.all([loadMenu(), loadDeliveryZones(), loadFavorites()]);
  renderCategories();
  renderDishes();
  updateCartUI();
}
init();

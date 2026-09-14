// ============================================================
// AVIS CLIENTS — Chargement, affichage et formulaire
// ============================================================

let currentRating = 0;

// ---------- Chargement des avis ----------
async function loadReviews() {
  const grid = document.getElementById('reviewsGrid');
  const summary = document.getElementById('reviewsSummary');
  if (!grid || !summary) return;

  try {
    const res = await fetch('/api/reviews');
    if (!res.ok) throw new Error('Erreur ' + res.status);
    const data = await res.json();

    // Résumé en haut
    if (data.total === 0) {
      summary.textContent = 'Aucun avis pour le moment. Sois le premier !';
    } else {
      const avg = data.average.toFixed(1).replace('.', ',');
      summary.innerHTML = `
        <span style="color:#f5a623; font-size:1.1em;">${renderStars(data.average)}</span>
        <strong style="font-size:1.1em;">${avg}/5</strong>
        — ${data.total} avis
      `;
    }

    // Liste
    if (data.reviews.length === 0) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = data.reviews.map(r => renderReviewCard(r)).join('');
  } catch (err) {
    console.error('Erreur chargement avis:', err);
    summary.textContent = 'Impossible de charger les avis pour le moment.';
  }
}

// ---------- Rendu d'une carte d'avis ----------
function renderReviewCard(review) {
  const stars = renderStars(review.rating);
  const source = review.source === 'google'
    ? '<span style="font-size:0.72rem; color:#888; margin-left:6px;">via Google</span>'
    : '';
  const comment = review.comment
    ? `<p style="margin:10px 0 0; color:#333; line-height:1.5;">${escapeHtml(review.comment)}</p>`
    : '';
  const date = formatDate(review.created_at);

  return `
    <article class="review-card" style="background:#fff; border-radius:12px; padding:20px; box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
        <div>
          <strong style="font-size:0.95rem;">${escapeHtml(review.name)}</strong>
          ${source}
        </div>
        <span style="font-size:0.72rem; color:#999;">${date}</span>
      </div>
      <div style="color:#f5a623; font-size:1.1em;">${stars}</div>
      ${comment}
    </article>
  `;
}

// ---------- Étoiles ----------
function renderStars(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ---------- Date ----------
function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "aujourd'hui";
    if (diffDays === 1) return 'hier';
    if (diffDays < 7) return `il y a ${diffDays} jours`;
    if (diffDays < 30) return `il y a ${Math.floor(diffDays / 7)} sem.`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

// ---------- Sécurité : échapper le HTML ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Ouverture / fermeture du formulaire ----------
function openReviewForm() {
  document.getElementById('reviewFormOverlay').classList.add('open');
}

function closeReviewForm() {
  document.getElementById('reviewFormOverlay').classList.remove('open');
  document.getElementById('reviewForm').reset();
  document.getElementById('reviewFormStatus').textContent = '';
  currentRating = 0;
  updateStars(0);
}

// ---------- Sélection de la note ----------
function setRating(value) {
  currentRating = value;
  document.getElementById('ratingInput').value = value;
  updateStars(value);
}

function updateStars(value) {
  document.querySelectorAll('#starPicker .star').forEach(star => {
    const v = parseInt(star.dataset.value, 10);
    star.style.color = v <= value ? '#f5a623' : '#ddd';
  });
}

// ---------- Soumission ----------
async function submitReview(event) {
  event.preventDefault();
  const form = event.target;
  const status = document.getElementById('reviewFormStatus');

  if (currentRating === 0) {
    status.textContent = '⚠️ Choisis une note (1 à 5 étoiles).';
    status.style.color = '#d33';
    return;
  }

  const data = {
    name: form.name.value.trim(),
    rating: parseInt(form.rating.value, 10),
    comment: form.comment.value.trim() || null,
    phone: form.phone.value.trim() || null,
  };

  status.textContent = 'Envoi en cours…';
  status.style.color = '#666';

  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Erreur serveur');
    }

    status.textContent = '✅ Merci ! Ton avis sera publié après validation.';
    status.style.color = '#0a7';
    form.reset();
    currentRating = 0;
    updateStars(0);

    setTimeout(() => closeReviewForm(), 2500);
  } catch (err) {
    console.error('Erreur envoi avis:', err);
    status.textContent = '❌ ' + err.message;
    status.style.color = '#d33';
  }
}

// ---------- Init au chargement ----------
document.addEventListener('DOMContentLoaded', () => {
  loadReviews();
});

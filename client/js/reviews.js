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

    if (data.total === 0) {
      summary.textContent = 'Aucun avis pour le moment. Sois le premier !';
    } else {
      const avg = data.average.toFixed(1).replace('.', ',');
      summary.innerHTML = `
        <span style="color:var(--brass); font-size:1.15em; letter-spacing:2px;">${renderStars(data.average)}</span>
        <strong style="font-size:1.15em;">${avg}/5</strong>
        <span style="opacity:0.7;">— ${data.total} avis</span>
      `;
    }

    if (data.reviews.length === 0) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = data.reviews.map(renderReviewCard).join('');
  } catch (err) {
    console.error('Erreur chargement avis:', err);
    summary.textContent = 'Impossible de charger les avis pour le moment.';
  }
}

// ---------- Rendu d'une carte d'avis ----------
function renderReviewCard(review) {
  const stars = renderStars(review.rating);
  const source = review.source === 'google'
    ? '<span class="rc-source">via Google</span>'
    : '';
  const comment = review.comment
    ? `<p class="rc-comment">${escapeHtml(review.comment)}</p>`
    : '';
  const date = formatDate(review.created_at);

  return `
    <article class="review-card">
      <div class="rc-head">
        <div>
          <div class="rc-name">${escapeHtml(review.name)}</div>
          ${source}
        </div>
        <div class="rc-date">${date}</div>
      </div>
      <div class="rc-stars">${stars}</div>
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
  const form = document.getElementById('reviewForm');
  if (form) form.reset();
  const status = document.getElementById('reviewFormStatus');
  if (status) status.textContent = '';
  currentRating = 0;
  updateStars(0);
}

// ---------- Sélection de la note ----------
function setRating(value) {
  currentRating = value;
  const input = document.getElementById('ratingInput');
  if (input) input.value = value;
  updateStars(value);
}

function updateStars(value) {
  document.querySelectorAll('#starPicker .star').forEach(star => {
    const v = parseInt(star.dataset.value, 10);
    star.style.color = v <= value ? 'var(--brass)' : 'var(--line-strong)';
  });
}

// ---------- Soumission ----------
async function submitReview(event) {
  event.preventDefault();
  const form = event.target;
  const status = document.getElementById('reviewFormStatus');

  if (currentRating === 0) {
    status.textContent = '⚠️ Choisis une note (1 à 5 étoiles).';
    status.style.color = 'var(--red)';
    return;
  }

  const data = {
    name: form.name.value.trim(),
    rating: parseInt(form.rating.value, 10),
    comment: form.comment.value.trim() || null,
    phone: form.phone.value.trim() || null,
  };

  status.textContent = 'Envoi en cours…';
  status.style.color = 'var(--ink-soft)';

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
    status.style.color = 'var(--leaf)';
    form.reset();
    currentRating = 0;
    updateStars(0);

    setTimeout(() => closeReviewForm(), 2500);
  } catch (err) {
    console.error('Erreur envoi avis:', err);
    status.textContent = '❌ ' + err.message;
    status.style.color = 'var(--red)';
  }
}

// ---------- Init au chargement ----------
document.addEventListener('DOMContentLoaded', () => {
  loadReviews();
});

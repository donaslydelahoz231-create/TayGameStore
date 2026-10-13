import { api, errorMessage } from '../api.js';
import { $, esc, setHtml, setText } from '../dom.js';
import { state } from '../state.js';
import { toast } from '../ui.js';
import { accessHeaders } from './orders.js';

// Reseñas verificadas: solo de pedidos entregados y publicadas por el dueño. Si todavía no hay
// ninguna publicada, la tienda lo dice tal cual: nunca muestra reseñas de ejemplo.

const stars = (rating) => '★'.repeat(rating) + '☆'.repeat(5 - rating);
const dateLabel = (iso) =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

export async function loadReviews() {
  if (state.previewOnly) {
    renderReviewList(null);
    return;
  }
  try {
    renderReviewList(await api('/api/reviews?game=freefire', { timeoutMs: 8000 }));
  } catch {
    renderReviewList(null);
  }
}

function renderReviewList(data) {
  const count = data?.summary?.count ?? 0;
  if (!data || !count) {
    setText('reviewsAverage', '—');
    setText('reviewsStars', stars(0));
    setText(
      'reviewsCount',
      data ? 'Aún no hay reseñas publicadas' : 'No pudimos cargar las reseñas ahora.',
    );
    setHtml(
      'reviewsList',
      data
        ? '<p class="reviews-empty">Todavía no hay reseñas publicadas. Cuando recibas tu recarga podrás calificarla desde «Seguimiento»; la tuya puede ser la primera.</p>'
        : '',
    );
    return;
  }
  const average = data.summary.average ?? 0;
  setText('reviewsAverage', average.toFixed(1).replace('.', ','));
  setText('reviewsStars', stars(Math.round(average)));
  setText('reviewsCount', `${count} ${count === 1 ? 'reseña verificada' : 'reseñas verificadas'}`);
  setHtml(
    'reviewsList',
    data.reviews
      .map(
        (r) =>
          `<article class="review-card"><div class="review-card-top"><span class="review-card-stars" aria-label="${r.rating} de 5 estrellas">${stars(r.rating)}</span><time datetime="${esc(r.createdAt)}">${esc(dateLabel(r.createdAt))}</time></div>${r.comment ? `<p>${esc(r.comment)}</p>` : ''}<footer><b>${esc(r.author)}</b><small>Compra verificada${r.purchase ? ' · ' + esc(r.purchase) : ''}</small></footer></article>`,
      )
      .join(''),
  );
}

// ── Reseña del pedido actual (sección «Seguimiento») ────────────────────────

let current = { ref: null, status: 'idle', eligible: false, review: null };

/** Muestra el formulario solo en un pedido entregado de este comprador. */
export function renderReviewBox() {
  const box = $('reviewBox');
  if (!box) return;
  const order = state.currentOrder;
  const delivered = order?.status === 'DELIVERED' && !state.previewOnly;
  box.hidden = !delivered;
  if (!delivered) return;
  if (current.ref !== order.reference) {
    current = { ref: order.reference, status: 'loading', eligible: false, review: null };
    void fetchReviewStatus(order.reference);
  }
  paintReviewBox();
}

async function fetchReviewStatus(ref) {
  try {
    const data = await api('/api/orders/' + encodeURIComponent(ref) + '/review', {
      headers: accessHeaders(ref),
    });
    if (current.ref !== ref) return;
    current = { ref, status: 'ready', eligible: data.eligible, review: data.review };
  } catch {
    if (current.ref === ref) current.status = 'error';
  }
  paintReviewBox();
}

function paintReviewBox() {
  const form = $('reviewForm');
  const done = $('reviewDone');
  if (!form || !done) return;
  if (current.status !== 'ready') {
    form.hidden = true;
    done.hidden = true;
    return;
  }
  if (current.review) {
    form.hidden = true;
    done.hidden = false;
    setText('reviewDoneStars', stars(current.review.rating));
    setText(
      'reviewDoneText',
      current.review.status === 'PUBLISHED'
        ? '¡Gracias! Tu reseña ya está publicada.'
        : current.review.status === 'HIDDEN'
          ? 'Gracias por tu reseña.'
          : '¡Gracias! Publicaremos tu reseña cuando la revisemos.',
    );
    return;
  }
  form.hidden = !current.eligible;
  done.hidden = true;
}

export async function submitReview(event) {
  event.preventDefault();
  const ref = current.ref;
  const form = $('reviewForm');
  if (!ref || !form) return;
  const rating = Number(new FormData(form).get('rating'));
  if (!rating) {
    setText('reviewMsg', 'Elige de 1 a 5 estrellas.');
    return;
  }
  const button = $('reviewSubmit');
  button.disabled = true;
  setText('reviewMsg', 'Enviando…');
  try {
    const { review } = await api('/api/orders/' + encodeURIComponent(ref) + '/review', {
      method: 'POST',
      headers: accessHeaders(ref),
      body: { rating, comment: $('reviewComment').value },
    });
    current = { ref, status: 'ready', eligible: false, review };
    setText('reviewMsg', '');
    toast('¡Gracias por tu reseña!', 'good');
  } catch (err) {
    setText('reviewMsg', errorMessage(err, 'No pudimos guardar tu reseña. Inténtalo de nuevo.'));
  } finally {
    button.disabled = false;
    paintReviewBox();
  }
}

/** Plazo de entrega publicado (LEGAL_DELIVERY_TIME) en todos los textos que lo mencionan. */
export function renderDeliveryTime() {
  const delivery = state.serverConfig?.deliveryTime;
  document.querySelectorAll('[data-delivery-time]').forEach((el) => {
    el.textContent = delivery || 'el plazo indicado en los términos';
  });
}

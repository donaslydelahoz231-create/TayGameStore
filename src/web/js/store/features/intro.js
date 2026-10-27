import { $ } from '../dom.js';
import { state } from '../state.js';

/**
 * Presentación de TayGameStore (2026-10-27): al abrir la tienda Tay se arma, aparece el logotipo
 * y la barra avanza con la carga real del catálogo; luego entra la bienvenida. Al pulsar
 * «Entrar», la misma pantalla hace una transición corta antes de la ventana de acceso.
 *
 * Una vez por sesión del navegador. Sin ella con movimiento reducido (y sin JavaScript el
 * elemento sigue `hidden`). Se puede saltar con el botón, Escape, Enter o espacio.
 */
const SEEN_KEY = 'tgs:presentacion';
const MIN_MS = 1900;
const MAX_MS = 3600;
const EXIT_MS = 620;
const TRANSITION_MS = 680;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Quien vuelve de pagar o abre su enlace de seguimiento va directo a su pedido.
const returningToOrder = () => /pedido=/.test(location.search + location.hash);

function seenThisSession() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Sin almacenamiento (modo privado estricto): se verá en cada visita, sin más efecto.
  }
}

function setProgress(intro, value) {
  const bar = intro.querySelector('.intro-bar');
  bar?.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  bar?.querySelector('i')?.style.setProperty('transform', `scaleX(${value.toFixed(3)})`);
}

function setStatus(intro, text) {
  const status = intro.querySelector('.intro-status');
  if (status && status.textContent !== text) status.textContent = text;
}

/** La presentación reacciona al puntero: Tay y la aurora se inclinan hacia él. */
function followPointer(intro) {
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return () => {};
  let raf = 0;
  let x = 0;
  let y = 0;
  const paint = () => {
    raf = 0;
    intro.style.setProperty('--px', x.toFixed(3));
    intro.style.setProperty('--py', y.toFixed(3));
  };
  const onMove = (event) => {
    x = event.clientX / innerWidth - 0.5;
    y = event.clientY / innerHeight - 0.5;
    if (!raf) raf = requestAnimationFrame(paint);
  };
  intro.addEventListener('pointermove', onMove, { passive: true });
  return () => intro.removeEventListener('pointermove', onMove);
}

/** Muestra la bienvenida con su entrada escalonada. */
function showWelcome() {
  $('entryExperience')?.removeAttribute('inert');
  $('entryExperience')?.classList.add('entry-ready');
}

/** Presentación al abrir la tienda. No bloquea la carga: corre en paralelo. */
export function playIntro() {
  const intro = $('tgsIntro');
  if (!intro || reducedMotion() || seenThisSession() || returningToOrder()) {
    showWelcome();
    return;
  }
  markSeen();
  const entry = $('entryExperience');
  entry?.setAttribute('inert', '');
  intro.classList.remove('out', 'is-transition');
  intro.hidden = false;
  const stopFollowing = followPointer(intro);
  const start = performance.now();
  let shown = 0;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    stopFollowing();
    removeEventListener('keydown', onKey);
    setProgress(intro, 1);
    setStatus(intro, '¡Listo!');
    intro.classList.add('out');
    showWelcome();
    setTimeout(() => {
      intro.hidden = true;
      intro.classList.remove('out');
    }, EXIT_MS);
  };
  const onKey = (event) => {
    if (['Escape', 'Enter', ' '].includes(event.key)) finish();
  };
  addEventListener('keydown', onKey);
  intro.querySelector('.intro-skip')?.addEventListener('click', finish, { once: true });

  const tick = (now) => {
    if (done) return;
    const elapsed = now - start;
    const loaded = state.catalogStatus !== 'loading' || state.previewOnly;
    // Hasta que el catálogo responde, la barra se acerca al 85 %; luego completa el recorrido.
    const target = loaded
      ? Math.min(1, Math.max(shown, elapsed / MIN_MS))
      : 0.85 * (1 - Math.exp(-elapsed / 900));
    shown += (target - shown) * 0.18;
    setProgress(intro, shown);
    setStatus(
      intro,
      loaded
        ? state.catalogStatus === 'ready'
          ? 'Precios al día'
          : 'Casi listo…'
        : 'Cargando la tienda…',
    );
    if (state.storeUnlocked || (loaded && elapsed >= MIN_MS && shown > 0.985) || elapsed >= MAX_MS)
      finish();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Transición corta al pulsar «Entrar» y luego `next` (abre la ventana de acceso, que no cambia).
 * Con movimiento reducido, `next` se llama al instante.
 */
export function playEnterTransition(next) {
  const intro = $('tgsIntro');
  if (!intro || reducedMotion()) {
    next();
    return;
  }
  intro.classList.remove('out');
  intro.classList.add('is-transition');
  setProgress(intro, 0);
  setStatus(intro, 'Abriendo TayGameStore…');
  intro.hidden = false;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / TRANSITION_MS);
    setProgress(intro, 1 - (1 - t) ** 3);
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
    next();
    intro.classList.add('out');
    setTimeout(() => {
      intro.hidden = true;
      intro.classList.remove('out', 'is-transition');
    }, EXIT_MS);
  };
  requestAnimationFrame(tick);
}

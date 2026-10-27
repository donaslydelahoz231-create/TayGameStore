import { deferWelcome, enterCue, welcomeCue } from '../../effects/sonido.js';
import { $ } from '../dom.js';
import { state } from '../state.js';

/**
 * Presentación de TayGameStore (2026-10-27): al abrir la tienda Tay se arma, aparece el logotipo
 * y la barra avanza con la carga real del catálogo. Al pulsar «Entrar», un diamante crece desde
 * el botón, cubre la pantalla y se abre sobre la ventana de acceso (que no cambia).
 *
 * Cada paso empieza cuando termina el anterior, sin cruzarse:
 *   presentación → Tay celebra → Tay y el logotipo salen → el diamante se abre → entra la
 *   bienvenida; «Entrar» → la bienvenida sale → el diamante cubre → «Abriendo…» → el diamante se
 *   abre con el acceso ya listo debajo.
 *
 * Una vez por sesión. Sin ella con movimiento reducido (y sin JavaScript el elemento sigue
 * `hidden`). Se puede saltar con el botón, Escape, Enter o espacio.
 */
const SEEN_KEY = 'tgs:presentacion';
const MIN_MS = 2300;
const MAX_MS = 4200;
const CHEER_MS = 260;
const CORE_OUT_MS = 280;
const IRIS_MS = 640;
const LEAVE_MS = 200;
const COVER_MS = 400;
const HOLD_MS = 320;
const REVEAL_MS = 480;
const EASE = 'cubic-bezier(0.7, 0, 0.2, 1)';

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Quien vuelve de pagar o abre su enlace de seguimiento va directo a su pedido.
const returningToOrder = () => /pedido=/.test(location.search + location.hash);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** Distancia (en rombo) desde un punto hasta la esquina más lejana: el diamante la cubre toda. */
function coverRadius(cx, cy) {
  const w = innerWidth;
  const h = innerHeight;
  return Math.max(cx + cy, w - cx + cy, cx + h - cy, w - cx + h - cy) + 8;
}

const diamond = (cx, cy, r) =>
  `polygon(${cx}px ${cy - r}px, ${cx + r}px ${cy}px, ${cx}px ${cy + r}px, ${cx - r}px ${cy}px)`;

/** La pantalla con un agujero en forma de diamante de radio `r` (regla par-impar). */
function hole(cx, cy, r) {
  const w = innerWidth;
  const h = innerHeight;
  return (
    `polygon(evenodd, 0px 0px, ${w}px 0px, ${w}px ${h}px, 0px ${h}px, 0px 0px, ` +
    `${cx}px ${cy - r}px, ${cx + r}px ${cy}px, ${cx}px ${cy + r}px, ${cx - r}px ${cy}px, ` +
    `${cx}px ${cy - r}px)`
  );
}

function centerOf(el) {
  const box = el?.getBoundingClientRect();
  if (!box || !box.width) return { cx: innerWidth / 2, cy: innerHeight / 2, size: 0 };
  return {
    cx: Math.round(box.left + box.width / 2),
    cy: Math.round(box.top + box.height / 2),
    size: Math.round(box.height),
  };
}

/**
 * Anima el diamante: el recorte de la pantalla y su borde de luz, de radio `from` a `to`, y espera
 * a que termine (con un tope por si el navegador no avisa). `shape` es `diamond` (cubre) o `hole`
 * (se abre).
 */
async function iris(intro, shape, cx, cy, from, to, duration) {
  if (typeof intro.animate !== 'function') return;
  const timing = { duration, easing: EASE, fill: 'forwards' };
  const ring = (r) => `translate(${cx}px, ${cy}px) scale(${Math.max(r, 0.02) / 50})`;
  const anims = [
    intro.animate([{ clipPath: shape(cx, cy, from) }, { clipPath: shape(cx, cy, to) }], timing),
  ];
  const rim = intro.querySelector('.intro-rim g');
  if (rim) anims.push(rim.animate([{ transform: ring(from) }, { transform: ring(to) }], timing));
  intro.tgsClips = [...(intro.tgsClips ?? []), ...anims];
  intro.classList.add('is-iris');
  await Promise.race([anims[0].finished.catch(() => {}), wait(duration + 400)]);
  intro.classList.remove('is-iris');
}

/** El diamante se abre desde (cx, cy) y la presentación desaparece. */
async function openIris(intro, cx, cy, duration) {
  await iris(intro, hole, cx, cy, 0, coverRadius(cx, cy), duration);
  hideIntro(intro);
}

function hideIntro(intro) {
  intro.hidden = true;
  intro.classList.remove('is-leaving', 'is-transition', 'is-iris');
  (intro.tgsClips ?? []).forEach((anim) => anim.cancel());
  intro.tgsClips = [];
  intro.style.removeProperty('clip-path');
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

/** Muestra la bienvenida con su entrada escalonada (solo cuando ya no hay nada encima). */
function showWelcome() {
  const entry = $('entryExperience');
  entry?.removeAttribute('inert');
  entry?.classList.remove('entry-hold');
  entry?.classList.add('entry-ready');
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
  // La bienvenida espera, sin verse, a que la presentación termine de salir.
  entry?.classList.add('entry-hold');
  entry?.setAttribute('inert', '');
  intro.classList.remove('is-leaving', 'is-transition');
  intro.hidden = false;
  deferWelcome();
  const stopFollowing = followPointer(intro);
  const start = performance.now();
  let shown = 0;
  let done = false;

  const finish = async () => {
    if (done) return;
    done = true;
    stopFollowing();
    removeEventListener('keydown', onKey);
    setProgress(intro, 1);
    setStatus(intro, '¡Listo!');
    // Tay celebra y sale con el logotipo; después, y no antes, se abre el diamante.
    intro.classList.add('is-leaving');
    await wait(CHEER_MS + CORE_OUT_MS);
    const { cx, cy } = centerOf(intro.querySelector('.intro-tay'));
    welcomeCue();
    await openIris(intro, cx, cy, IRIS_MS);
    showWelcome();
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

/** La barra de «Abriendo TayGameStore…» se llena mientras la pantalla está cubierta. */
function fillBar(intro, duration) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(intro, 1 - (1 - t) ** 3);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Transición al pulsar «Entrar» y luego `next` (abre la ventana de acceso, que no cambia).
 * `origin` es el botón: el diamante nace de él. Con movimiento reducido, `next` va al instante.
 */
export async function playEnterTransition(next, origin) {
  enterCue();
  const intro = $('tgsIntro');
  const entry = $('entryExperience');
  if (!intro || reducedMotion() || typeof intro.animate !== 'function') {
    next();
    return;
  }
  // 1. La bienvenida se va.
  entry?.classList.add('entry-leaving');
  await wait(LEAVE_MS);
  // 2. El diamante nace del tamaño del botón y crece hasta cubrir la pantalla.
  const { cx, cy, size } = centerOf(origin);
  const seed = Math.max(24, Math.round(size * 0.75));
  intro.classList.remove('is-leaving');
  intro.classList.add('is-transition');
  setProgress(intro, 0);
  setStatus(intro, 'Abriendo TayGameStore…');
  intro.style.clipPath = diamond(cx, cy, seed);
  intro.hidden = false;
  await iris(intro, diamond, cx, cy, seed, coverRadius(cx, cy), COVER_MS);
  // 3. Cubierta la pantalla, debajo se abre el acceso; aquí solo avanza la barra.
  next();
  entry?.classList.remove('entry-leaving');
  await fillBar(intro, HOLD_MS);
  // 4. El diamante se abre desde Tay y deja ver el acceso ya en su sitio.
  const center = centerOf(intro.querySelector('.intro-tay'));
  await openIris(intro, center.cx, center.cy, REVEAL_MS);
}

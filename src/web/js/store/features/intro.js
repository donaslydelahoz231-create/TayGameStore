import { deferWelcome, enterCue, welcomeCue } from '../../effects/sonido.js';
import { $ } from '../dom.js';
import { state } from '../state.js';

/**
 * Presentación de TayGameStore (2026-10-27): al abrir la tienda Tay se arma, aparece el logotipo
 * y la barra avanza con la carga real del catálogo. Al pulsar «Entrar», dos compuertas de arena
 * esports (hojas con el corte inclinado y filos de neón) se cierran sobre la línea del botón y se
 * abren sobre la ventana de acceso (que no cambia). Rediseño del 2026-11-17, más corto y sin
 * esperas (medido en Chromium): la presentación dura ~2,1 s en total (antes ~3,6 s) y de «Entrar»
 * al acceso a la vista van ~1,25 s (antes ~1,7 s).
 *
 * Cada paso empieza cuando termina el anterior, sin cruzarse:
 *   presentación → Tay celebra → Tay y el logotipo salen → las compuertas se abren → entra la
 *   bienvenida; «Entrar» → la bienvenida sale → las compuertas se cierran → «Abriendo…» → se
 *   abren con el acceso ya listo debajo.
 *
 * Una vez por sesión (sin JavaScript el elemento sigue `hidden`). Se puede saltar con el botón,
 * Escape, Enter o espacio.
 *
 * Con «reducir movimiento» (en muchos celulares: «Quitar animaciones») hay versión suave: la
 * misma presentación y la misma transición, pero solo con fundidos, sin piezas que vuelan ni
 * compuertas que se mueven.
 */
const SEEN_KEY = 'tgs:presentacion';
const MIN_MS = 1300;
const SOFT_MIN_MS = 1000;
const MAX_MS = 3200;
const FADE_MS = 360;
const SOFT_COVER_MS = 220;
const SOFT_REVEAL_MS = 300;
// Tay guiña y empieza a salir (CSS: 0,16 s + 0,22 s); las compuertas arrancan despacio, así que
// no se ven abrirse hasta que Tay y el logotipo ya se fueron.
const CHEER_MS = 180;
const IRIS_MS = 560;
const LEAVE_MS = 160;
const COVER_MS = 340;
const HOLD_MS = 120;
const REVEAL_MS = 480;
// Aceleración de las compuertas (como cubic-bezier(0.7, 0, 0.2, 1)): arrancan suave, cruzan
// rápido y frenan al final.
const ease = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);
// Compuertas «Arena esports»: el corte de las dos hojas va inclinado 9 grados.
const SLANT_DEG = 9;
const SLANT = Math.tan((SLANT_DEG * Math.PI) / 180);

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

/** Altura del corte en x: la línea inclinada que pasa por (cx, cy). */
const seamY = (cx, cy, x) => cy - (x - cx) * SLANT;

/** Semialto de la franja que deja la pantalla entera a la vista (compuertas abiertas del todo). */
function openGap(cx, cy) {
  const left = seamY(cx, cy, 0);
  const right = seamY(cx, cy, innerWidth);
  const h = innerHeight;
  return Math.max(left, right, h - left, h - right) + 8;
}

/**
 * Compuertas: la pantalla menos una franja inclinada de semialto `g` que pasa por (cx, cy)
 * (regla par-impar). Con g = 0 la pantalla está cubierta; con `openGap` está abierta del todo.
 */
function gates(cx, cy, g) {
  const w = innerWidth;
  const h = innerHeight;
  const left = seamY(cx, cy, 0);
  const right = seamY(cx, cy, w);
  return (
    `polygon(evenodd, 0px 0px, ${w}px 0px, ${w}px ${h}px, 0px ${h}px, 0px 0px, ` +
    `0px ${left - g}px, ${w}px ${right - g}px, ${w}px ${right + g}px, 0px ${left + g}px, ` +
    `0px ${left - g}px)`
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
 * Mueve las compuertas: el recorte de la pantalla y sus filos de luz, de semialto `from` a `to`, y
 * espera a que terminen. Cerrar: de `openGap` a 0; abrir: de 0 a `openGap`.
 *
 * Recorte y filos se pintan juntos en cada cuadro desde aquí: si el recorte se animara en el hilo
 * principal y los filos en la tarjeta de video, con la página ocupada los filos se adelantaban al
 * borde de las hojas (medido en Chromium). Si el navegador deja de pintar (pestaña en segundo
 * plano), termina igual al tope y deja el estado final.
 */
function iris(intro, cx, cy, from, to, duration) {
  const token = (intro.tgsIrisToken ?? 0) + 1;
  intro.tgsIrisToken = token;
  const seams = [...intro.querySelectorAll('.intro-seam')];
  // Filos de neón pegados al borde de cada hoja (cian la de arriba, magenta la de abajo): giran
  // sobre el punto del corte que queda bajo (cx, cy), así siguen la línea inclinada.
  seams.forEach((seam, index) => {
    seam.style.transformOrigin = `${cx + innerWidth * 0.1}px ${index === 0 ? '100%' : '0%'}`;
  });
  const paint = (g) => {
    intro.style.clipPath = gates(cx, cy, g);
    // Los filos se apagan al juntarse las hojas: no cruzan la cara de Tay al cerrar ni al abrir.
    intro.style.setProperty('--seam', Math.min(1, g / 28).toFixed(2));
    seams.forEach((seam, index) => {
      const y = cy + (index === 0 ? -g : g);
      seam.style.transform = `translate(0px, ${y.toFixed(1)}px) rotate(${-SLANT_DEG}deg)`;
    });
  };
  paint(from);
  intro.classList.add('is-iris');
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (intro.tgsIrisToken === token) {
        paint(to);
        intro.classList.remove('is-iris');
      }
      resolve();
    };
    const start = performance.now();
    const step = (now) => {
      if (settled || intro.tgsIrisToken !== token) return settle();
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      paint(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step);
      else settle();
    };
    requestAnimationFrame(step);
    setTimeout(settle, duration + 400);
  });
}

/** Las compuertas se abren por la línea que pasa por (cx, cy) y la presentación desaparece. */
async function openIris(intro, cx, cy, duration) {
  await iris(intro, cx, cy, 0, openGap(cx, cy), duration);
  hideIntro(intro);
}

function hideIntro(intro) {
  intro.hidden = true;
  intro.tgsIrisToken = (intro.tgsIrisToken ?? 0) + 1;
  intro.classList.remove('is-leaving', 'is-transition', 'is-iris', 'is-soft', 'is-revealing');
  (intro.tgsClips ?? []).forEach((anim) => anim.cancel());
  intro.tgsClips = [];
  intro.style.removeProperty('clip-path');
  intro.style.removeProperty('--seam');
}

/** Versión suave: la capa entera aparece o se desvanece (`from` → `to` de opacidad). */
async function fade(intro, from, to, duration) {
  if (typeof intro.animate !== 'function') return;
  const anim = intro.animate([{ opacity: from }, { opacity: to }], {
    duration,
    easing: 'ease',
    fill: 'forwards',
  });
  intro.tgsClips = [...(intro.tgsClips ?? []), anim];
  await Promise.race([anim.finished.catch(() => {}), wait(duration + 400)]);
}

/**
 * La presentación reacciona al puntero: Tay y la aurora se inclinan hacia él. En pantallas
 * táctiles, hacia el dedo mientras toca, y vuelven al centro al soltar.
 */
function followPointer(intro) {
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
  const onRelease = (event) => {
    if (event.pointerType === 'mouse') return;
    x = 0;
    y = 0;
    if (!raf) raf = requestAnimationFrame(paint);
  };
  intro.addEventListener('pointerdown', onMove, { passive: true });
  intro.addEventListener('pointermove', onMove, { passive: true });
  intro.addEventListener('pointerup', onRelease, { passive: true });
  intro.addEventListener('pointercancel', onRelease, { passive: true });
  return () => {
    intro.removeEventListener('pointerdown', onMove);
    intro.removeEventListener('pointermove', onMove);
    intro.removeEventListener('pointerup', onRelease);
    intro.removeEventListener('pointercancel', onRelease);
  };
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
  if (!intro || seenThisSession() || returningToOrder()) {
    showWelcome();
    return;
  }
  markSeen();
  const soft = reducedMotion();
  const minMs = soft ? SOFT_MIN_MS : MIN_MS;
  const entry = $('entryExperience');
  // La bienvenida espera, sin verse, a que la presentación termine de salir.
  entry?.classList.add('entry-hold');
  entry?.setAttribute('inert', '');
  intro.classList.remove('is-leaving', 'is-transition');
  intro.classList.toggle('is-soft', soft);
  intro.hidden = false;
  deferWelcome();
  const stopFollowing = soft ? () => {} : followPointer(intro);
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
    if (soft) {
      // Fundido cruzado: la presentación se desvanece mientras la bienvenida aparece debajo
      // (sigue tapando los toques hasta ocultarse: «Entrar» no puede cruzarse con su salida).
      welcomeCue();
      showWelcome();
      await fade(intro, 1, 0, FADE_MS);
      hideIntro(intro);
      return;
    }
    // Tay celebra y sale con el logotipo; después, y no antes, se abren las compuertas.
    intro.classList.add('is-leaving');
    await wait(CHEER_MS);
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
      ? Math.min(1, Math.max(shown, elapsed / minMs))
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
    if (state.storeUnlocked || (loaded && elapsed >= minMs && shown > 0.985) || elapsed >= MAX_MS)
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
 * «Entrar» con movimiento reducido: la marca aparece con un fundido sobre la bienvenida, debajo se
 * abre el acceso mientras avanza la barra y la marca se desvanece (sin compuertas ni zoom). Mientras
 * se desvanece ya no intercepta toques: el acceso responde enseguida.
 */
async function softEnter(intro, entry, next) {
  entry?.classList.add('entry-leaving');
  intro.classList.remove('is-leaving');
  intro.classList.add('is-transition', 'is-soft');
  setProgress(intro, 0);
  setStatus(intro, 'Abriendo TayGameStore…');
  intro.hidden = false;
  await fade(intro, 0, 1, SOFT_COVER_MS);
  next();
  entry?.classList.remove('entry-leaving');
  await fillBar(intro, HOLD_MS);
  intro.classList.add('is-revealing');
  await fade(intro, 1, 0, SOFT_REVEAL_MS);
  hideIntro(intro);
}

/**
 * Transición al pulsar «Entrar» y luego `next` (abre la ventana de acceso, que no cambia).
 * `origin` es el botón: las compuertas se cierran sobre su línea. Con movimiento reducido, la
 * versión suave.
 */
export async function playEnterTransition(next, origin) {
  enterCue();
  const intro = $('tgsIntro');
  const entry = $('entryExperience');
  if (!intro || typeof intro.animate !== 'function') {
    next();
    return;
  }
  if (reducedMotion()) {
    await softEnter(intro, entry, next);
    return;
  }
  // 1. La bienvenida se va.
  entry?.classList.add('entry-leaving');
  await wait(LEAVE_MS);
  // 2. Las compuertas se cierran sobre la línea del botón hasta cubrir la pantalla.
  const { cx, cy } = centerOf(origin);
  const open = openGap(cx, cy);
  intro.classList.remove('is-leaving');
  intro.classList.add('is-transition');
  setProgress(intro, 0);
  setStatus(intro, 'Abriendo TayGameStore…');
  intro.style.clipPath = gates(cx, cy, open);
  intro.hidden = false;
  await iris(intro, cx, cy, open, 0, COVER_MS);
  // 3. Cubierta la pantalla, debajo se abre el acceso; aquí solo avanza la barra.
  next();
  entry?.classList.remove('entry-leaving');
  await fillBar(intro, HOLD_MS);
  // 4. Las compuertas se abren por Tay y dejan ver el acceso, que llega por partes mientras se abren
  //    (cabecera, cuentas, invitado): la clase se pone aún tapado, así no se ve ningún salto.
  const login = $('loginModal');
  if (login && !login.hidden) {
    login.classList.add('acceso-llega');
    setTimeout(() => login.classList.remove('acceso-llega'), REVEAL_MS + 1200);
  }
  const center = centerOf(intro.querySelector('.intro-tay'));
  await openIris(intro, center.cx, center.cy, REVEAL_MS);
}

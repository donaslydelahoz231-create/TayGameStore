// Bienvenida viva (2026-10-27): reacciona al puntero. La vitrina se inclina, Tay sigue el cursor
// con la mirada, el botón «Entrar» se acerca al puntero y la vitrina suelta destellos de diamante
// (solo sobre ella: nunca cruzan el texto). Se detiene al salir de la entrada o mientras se va.
// En celulares y tabletas (2026-10-28) responde al dedo: al tocar o arrastrar sobre la vitrina,
// Tay mira hacia el dedo, la vitrina se inclina y salen destellos; al soltar vuelven al centro.
// El botón magnético queda solo para ratón (bajo el dedo no debe moverse). Con movimiento
// reducido no hay efectos interactivos (la bienvenida entra con un fundido, ver 45-inicio.css).
const MAX_SPARKS = 14;
const SPARK_GAP_MS = 45;
const TAP_BURST = 5;
const SETTLE_MS = 700;

export function animateWelcome() {
  const entry = document.getElementById('entryExperience');
  if (!entry || !window.matchMedia) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  let raf = 0;
  let px = 0;
  let py = 0;
  // Las variables van solo en lo que se inclina: puestas en la raíz, cada toque recalculaba los
  // estilos de toda la bienvenida.
  const tilted = entry.querySelectorAll('.entry-vitrina, .entry-stage .entry-mascot, .entry-orb');
  const paint = () => {
    raf = 0;
    for (const el of tilted) {
      el.style.setProperty('--px', px.toFixed(3));
      el.style.setProperty('--py', py.toFixed(3));
    }
  };
  const lookAt = (x, y) => {
    px = x;
    py = y;
    if (!raf) raf = requestAnimationFrame(paint);
  };

  let alive = 0;
  let last = 0;
  const spawn = (x, y) => {
    alive++;
    const spark = document.createElement('i');
    spark.className = 'entry-spark';
    spark.setAttribute('aria-hidden', 'true');
    spark.style.left = x + 'px';
    spark.style.top = y + 'px';
    spark.style.setProperty('--drift', (Math.random() * 36 - 18).toFixed(1) + 'px');
    spark.style.setProperty('--size', (6 + Math.random() * 7).toFixed(1) + 'px');
    entry.appendChild(spark);
    spark.addEventListener(
      'animationend',
      () => {
        spark.remove();
        alive--;
      },
      { once: true },
    );
  };
  const sparkle = (event) => {
    const now = performance.now();
    if (now - last < SPARK_GAP_MS || alive >= MAX_SPARKS) return;
    last = now;
    spawn(event.clientX, event.clientY);
  };
  // Un toque suelta un puñado de destellos alrededor del dedo.
  const burst = (event) => {
    for (let i = 0; i < TAP_BURST && alive < MAX_SPARKS; i++) {
      spawn(event.clientX + Math.random() * 28 - 14, event.clientY + Math.random() * 28 - 14);
    }
    last = performance.now();
  };

  const leaving = () =>
    entry.classList.contains('out') || entry.classList.contains('entry-leaving');
  const onStage = (event) => !!event.target.closest?.('.entry-stage');
  const track = (event) =>
    lookAt(event.clientX / innerWidth - 0.5, event.clientY / innerHeight - 0.5);

  let settle = 0;
  entry.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse' || leaving()) return;
      clearTimeout(settle);
      track(event);
      if (onStage(event)) burst(event);
    },
    { passive: true },
  );
  entry.addEventListener(
    'pointermove',
    (event) => {
      if (leaving()) return;
      // Con el dedo o el lápiz, solo mientras toca la pantalla.
      if (event.pointerType !== 'mouse' && event.buttons === 0) return;
      track(event);
      if (onStage(event)) sparkle(event);
    },
    { passive: true },
  );
  // Al soltar el dedo (o si el navegador toma el gesto para desplazar), todo vuelve al centro.
  const release = (event) => {
    if (event.pointerType === 'mouse') return;
    clearTimeout(settle);
    settle = setTimeout(() => lookAt(0, 0), SETTLE_MS);
  };
  entry.addEventListener('pointerup', release, { passive: true });
  entry.addEventListener('pointercancel', release, { passive: true });

  // Botón magnético (solo con ratón o trackpad): se desplaza unos píxeles hacia el puntero.
  const cta = document.getElementById('enterStoreBtn');
  if (!cta || !fine) return;
  cta.addEventListener(
    'pointermove',
    (event) => {
      const box = cta.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / box.width;
      const dy = (event.clientY - (box.top + box.height / 2)) / box.height;
      cta.style.setProperty('--mx', (dx * 10).toFixed(1) + 'px');
      cta.style.setProperty('--my', (dy * 8).toFixed(1) + 'px');
    },
    { passive: true },
  );
  cta.addEventListener('pointerleave', () => {
    cta.style.setProperty('--mx', '0px');
    cta.style.setProperty('--my', '0px');
  });
}

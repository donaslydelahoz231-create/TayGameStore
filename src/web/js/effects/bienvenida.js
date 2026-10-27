// Bienvenida viva (2026-10-27): reacciona al puntero. La vitrina se inclina, Tay sigue el cursor
// con la mirada, el botón «Entrar» se acerca al puntero y la vitrina suelta destellos de diamante
// (solo sobre ella: nunca cruzan el texto). Solo con ratón o trackpad y sin movimiento reducido;
// se detiene al salir de la entrada o mientras se va.
const MAX_SPARKS = 14;
const SPARK_GAP_MS = 45;

export function animateWelcome() {
  const entry = document.getElementById('entryExperience');
  if (!entry || !window.matchMedia) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let raf = 0;
  let px = 0;
  let py = 0;
  const paint = () => {
    raf = 0;
    entry.style.setProperty('--px', px.toFixed(3));
    entry.style.setProperty('--py', py.toFixed(3));
  };

  let alive = 0;
  let last = 0;
  const sparkle = (event) => {
    const now = performance.now();
    if (now - last < SPARK_GAP_MS || alive >= MAX_SPARKS) return;
    last = now;
    alive++;
    const spark = document.createElement('i');
    spark.className = 'entry-spark';
    spark.setAttribute('aria-hidden', 'true');
    spark.style.left = event.clientX + 'px';
    spark.style.top = event.clientY + 'px';
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

  entry.addEventListener(
    'pointermove',
    (event) => {
      if (entry.classList.contains('out') || entry.classList.contains('entry-leaving')) return;
      px = event.clientX / innerWidth - 0.5;
      py = event.clientY / innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(paint);
      if (event.target.closest?.('.entry-stage')) sparkle(event);
    },
    { passive: true },
  );

  // Botón magnético: se desplaza unos píxeles hacia el puntero.
  const cta = document.getElementById('enterStoreBtn');
  if (!cta) return;
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

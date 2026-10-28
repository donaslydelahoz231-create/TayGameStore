// Capa visual "Visual Evolution": barra de progreso, brillo del cursor, partículas,
// revelado de secciones, ripple y rebote del carrito. Se desactiva con movimiento reducido,
// táctil o ahorro de datos. Código original sin cambios de lógica.
export function initVisualEffects() {
  const body = document.body;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia && matchMedia('(hover: none), (pointer: coarse)').matches;
  const lowPower = window.matchMedia && matchMedia('(prefers-reduced-data: reduce)').matches;

  // Scroll progress: one passive listener, one layout read, no per-element handlers.
  const progress = document.createElement('div');
  progress.id = 'tgsScrollProgress';
  body.appendChild(progress);
  let progressRaf = 0;
  function paintProgress() {
    progressRaf = 0;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const value = h > 0 ? window.scrollY / h : 0;
    progress.style.transform = 'scaleX(' + value + ')';
  }
  addEventListener(
    'scroll',
    () => {
      if (!progressRaf) progressRaf = requestAnimationFrame(paintProgress);
    },
    { passive: true },
  );
  // Primera medición tras el primer pintado: leer scrollHeight aquí forzaría el layout completo
  // de la página antes de mostrarla.
  progressRaf = requestAnimationFrame(paintProgress);

  // Desktop-only cursor glow + hero parallax. Disabled on touch / low power / reduced motion.
  const enhanced = !reduce && !touch && !lowPower;
  if (enhanced) {
    const glow = document.createElement('div');
    glow.id = 'tgsCursorGlow';
    body.appendChild(glow);
    const art = document.querySelector('.hero-art');
    let raf = 0,
      mx = innerWidth / 2,
      my = innerHeight / 2;
    addEventListener(
      'pointermove',
      (e) => {
        mx = e.clientX;
        my = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          // Con transform lo mueve la GPU; con left/top se recalculaba la página en cada cuadro.
          glow.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0) translate(-50%,-50%)';
          glow.style.opacity = '1';
          if (art) {
            const x = (mx / innerWidth - 0.5) * 5;
            const y = (my / innerHeight - 0.5) * 3;
            art.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
          }
          raf = 0;
        });
      },
      { passive: true },
    );
    addEventListener(
      'pointerleave',
      () => {
        glow.style.opacity = '0';
      },
      { passive: true },
    );
  }

  // Sin partículas de fondo ni secciones que aparecen al bajar (2026-10-28): el lienzo se
  // redibujaba sin parar y las secciones entraban animadas; las dos cosas retrasaban la respuesta a
  // cada tecla y toque (INP). Las secciones se ven directamente.

  // One delegated ripple handler; no listeners per button.
  if (!reduce) {
    document.addEventListener(
      'pointerdown',
      (e) => {
        const b = e.target.closest('button,.btn,.game-tab,.tariff-toggle button');
        if (!b || b.disabled || b.dataset.noRipple !== undefined) return;
        const r = b.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 0.42;
        const dot = document.createElement('i');
        dot.className = 'tgs-ripple';
        dot.style.width = dot.style.height = size + 'px';
        dot.style.left = e.clientX - r.left - size / 2 + 'px';
        dot.style.top = e.clientY - r.top - size / 2 + 'px';
        if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
        b.style.overflow = 'hidden';
        b.appendChild(dot);
        setTimeout(() => dot.remove(), 550);
      },
      { passive: true },
    );
  }

  // (Sin «rebote» del carrito al cambiar el contador: su clase no tenía estilos y forzaba un
  // cálculo de diseño de toda la página en cada cambio del carrito.)
}

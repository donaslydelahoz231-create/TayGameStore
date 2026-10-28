// Capa "Cinematic Motion V4": brillo, barra de movimiento, inclinación de tarjetas, impactos y
// confeti. (Las partículas de fondo y la aparición animada de las secciones se quitaron el
// 2026-10-28: retrasaban la respuesta a cada tecla y toque.)
// Correcciones: no duplica #tgsCursorGlow si la capa visual ya lo creó, la inclinación usa
// delegación (las tarjetas se re-renderizan),
// la "energía" al agregar apunta a .add-btn y el confeti escucha la entrega real del pedido.
export function initCinematicEffects() {
  const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  let glow = document.getElementById('tgsCursorGlow');
  if (!glow) {
    glow = document.createElement('div');
    glow.id = 'tgsCursorGlow';
    document.body.appendChild(glow);
  }
  const bar = document.createElement('div');
  bar.id = 'tgsMotionBar';
  document.body.appendChild(bar);
  // Brillo del cursor: como mucho una escritura por fotograma. (El panel del inicio ya no se
  // mueve con el puntero: es información, no decoración.)
  let pointerRaf = 0,
    px = 0,
    py = 0;
  const paintPointer = () => {
    pointerRaf = 0;
    // Con transform lo mueve la GPU; con left/top se recalculaba la página en cada cuadro.
    glow.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0) translate(-50%,-50%)';
    glow.style.opacity = '1';
  };
  addEventListener(
    'pointermove',
    (e) => {
      if (reduced) return;
      px = e.clientX;
      py = e.clientY;
      if (!pointerRaf) pointerRaf = requestAnimationFrame(paintPointer);
    },
    { passive: true },
  );
  // Barra de avance: escala en lugar de ancho (no recalcula el layout) y una vez por fotograma.
  let progressRaf = 0;
  const progress = () => {
    progressRaf = 0;
    const m = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (m > 0 ? scrollY / m : 0) + ')';
  };
  addEventListener(
    'scroll',
    () => {
      if (!progressRaf) progressRaf = requestAnimationFrame(progress);
    },
    { passive: true },
  );
  progressRaf = requestAnimationFrame(progress);
  // Sin aparición animada de las secciones (2026-10-28): cada sección entraba desenfocada y
  // desplazada durante 1 s, y mientras tanto cada tecla o toque tardaba más en verse (INP).
  if (!reduced) {
    // Delegación: las tarjetas se vuelven a crear en cada render del catálogo. Una medición y
    // una escritura por fotograma (leer y escribir en cada evento forzaba reflujos en cadena).
    let tiltRaf = 0,
      tiltCard = null,
      tx = 0,
      ty = 0;
    const paintTilt = () => {
      tiltRaf = 0;
      if (!tiltCard?.isConnected) return;
      const r = tiltCard.getBoundingClientRect();
      tiltCard.style.setProperty('--ry', ((tx - r.left) / r.width - 0.5) * 5.5 + 'deg');
      tiltCard.style.setProperty('--rx', -((ty - r.top) / r.height - 0.5) * 5.5 + 'deg');
    };
    document.addEventListener(
      'pointermove',
      (e) => {
        // Con el dedo no hay inclinación: seguía al dedo mientras la página se desplazaba.
        if (e.pointerType === 'touch') return;
        const card = e.target.closest?.('.product');
        if (!card) return;
        tiltCard = card;
        tx = e.clientX;
        ty = e.clientY;
        if (!tiltRaf) tiltRaf = requestAnimationFrame(paintTilt);
      },
      { passive: true },
    );
    document.addEventListener(
      'pointerout',
      (e) => {
        const card = e.target.closest?.('.product');
        if (!card || card.contains(e.relatedTarget)) return;
        if (tiltCard === card) tiltCard = null;
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
      },
      { passive: true },
    );
  }
  document.addEventListener(
    'click',
    (e) => {
      if (reduced) return;
      const b = e.target.closest('.btn,.header-icon,.cart-btn');
      if (!b) return;
      // Sin leer offsetWidth para reiniciarla (forzaba calcular toda la página justo después del
      // clic): si ya estaba en marcha se rebobina; si no, basta con poner la clase.
      if (b.classList.contains('tgs-impact')) b.getAnimations().forEach((a) => (a.currentTime = 0));
      else b.classList.add('tgs-impact');
      clearTimeout(b.tgsImpactTimer);
      b.tgsImpactTimer = setTimeout(() => b.classList.remove('tgs-impact'), 700);
    },
    { passive: true },
  );
  document.addEventListener(
    'click',
    (e) => {
      if (reduced) return;
      const b = e.target.closest('.favorite,.fav-btn,[data-favorite],button[aria-label*="favor"]');
      if (!b) return;
      const r = b.getBoundingClientRect();
      for (let i = 0; i < 12; i++) {
        const p = document.createElement('i');
        p.className = 'tgs-favorite-burst';
        p.style.left = r.left + r.width / 2 + 'px';
        p.style.top = r.top + r.height / 2 + 'px';
        const a = (i * Math.PI * 2) / 12 + Math.random() * 0.25,
          d = 22 + Math.random() * 34;
        p.style.setProperty('--dx', Math.cos(a) * d + 'px');
        p.style.setProperty('--dy', Math.sin(a) * d + 'px');
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 850);
      }
    },
    { passive: true },
  );
  document.addEventListener(
    'click',
    (e) => {
      if (reduced) return;
      const b = e.target.closest('.add-btn');
      if (!b) return;
      const cart = $('.cart-btn');
      if (!cart) return;
      const a = b.getBoundingClientRect(),
        r = cart.getBoundingClientRect(),
        o = document.createElement('i');
      o.className = 'tgs-energy-orb';
      o.style.left = a.left + a.width / 2 - 6 + 'px';
      o.style.top = a.top + a.height / 2 - 6 + 'px';
      document.body.appendChild(o);
      const dx = r.left + r.width / 2 - a.left - a.width / 2,
        dy = r.top + r.height / 2 - a.top - a.height / 2;
      o.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          {
            transform: `translate(${dx * 0.45}px,${dy * 0.28}px) scale(1.7)`,
            offset: 0.4,
          },
          { transform: `translate(${dx}px,${dy}px) scale(.25)`, opacity: 0.05 },
        ],
        { duration: 720, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' },
      ).finished.finally(() => {
        o.remove();
        cart.classList.add('tgs-cart-impact');
        setTimeout(() => cart.classList.remove('tgs-cart-impact'), 720);
      });
    },
    { passive: true },
  );
  const celebrate = () => {
    if (reduced) return;
    for (let i = 0; i < 54; i++) {
      const p = document.createElement('i');
      p.className = 'tgs-confetti';
      p.style.setProperty('--tx', Math.random() * 560 - 280 + 'px');
      p.style.setProperty('--ty', Math.random() * 430 - 250 + 'px');
      p.style.setProperty('--rot', Math.random() * 720 - 360 + 'deg');
      p.style.animationDelay = Math.random() * 0.22 + 's';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  };
  // Confeti cuando el servidor confirma la entrega (evento emitido por orders.js).
  addEventListener('tgs:order-delivered', celebrate);
  const boot = $('.boot-screen');
  if (boot && !reduced) setTimeout(() => boot.classList.add('out'), 900);
  window.TGSCinematic = { celebrate };
}

// Capa "Cinematic Motion V4": partículas, brillo, barra de movimiento, reveals,
// inclinación de tarjetas, impactos y confeti.
// Correcciones: no duplica #tgsParticleCanvas/#tgsCursorGlow si la capa visual ya los creó
// (evita dos bucles de animación), la inclinación usa delegación (las tarjetas se re-renderizan),
// la "energía" al agregar apunta a .add-btn y el confeti escucha la entrega real del pedido.
export function initCinematicEffects() {
  const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // La capa visual (visual.js) ya pinta partículas y brillo en escritorio: se reutilizan sus
  // elementos y no se arranca un segundo bucle de partículas.
  const sharedCanvas = document.getElementById('tgsParticleCanvas');
  const canvas = sharedCanvas ?? document.createElement('canvas');
  if (!sharedCanvas) {
    canvas.id = 'tgsParticleCanvas';
    document.body.prepend(canvas);
  }
  let glow = document.getElementById('tgsCursorGlow');
  if (!glow) {
    glow = document.createElement('div');
    glow.id = 'tgsCursorGlow';
    document.body.appendChild(glow);
  }
  const bar = document.createElement('div');
  bar.id = 'tgsMotionBar';
  document.body.appendChild(bar);
  if (!sharedCanvas) {
    const resize = () => {
      const d = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = innerWidth * d;
      canvas.height = innerHeight * d;
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
    };
    resize();
    addEventListener('resize', resize, { passive: true });
    if (!reduced) {
      const c = canvas.getContext('2d');
      const ps = Array.from({ length: Math.min(54, Math.max(28, (innerWidth / 25) | 0)) }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        r: 0.6 + Math.random() * 1.7,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.08 - Math.random() * 0.16,
        p: Math.random() * 6.28,
      }));
      // 30 FPS: las partículas se mueven despacio y en función del tiempo, así que se ven igual
      // que a 60 FPS con la mitad de trabajo (este bucle es el de móvil y táctil).
      const FRAME_MS = 1000 / 30;
      let raf,
        last = performance.now();
      const draw = (t) => {
        if (t - last < FRAME_MS - 1) {
          if (!document.hidden) raf = requestAnimationFrame(draw);
          return;
        }
        const dt = Math.min(48, t - last);
        last = t;
        const d = Math.min(devicePixelRatio || 1, 1.5);
        c.setTransform(d, 0, 0, d, 0, 0);
        c.clearRect(0, 0, innerWidth, innerHeight);
        for (const p of ps) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.p += dt * 0.001;
          if (p.y < -10) {
            p.y = innerHeight + 10;
            p.x = Math.random() * innerWidth;
          }
          if (p.x < -10) p.x = innerWidth;
          if (p.x > innerWidth + 10) p.x = -10;
          c.beginPath();
          c.fillStyle = `rgba(130,190,255,${0.18 + 0.35 * (0.5 + 0.5 * Math.sin(p.p))})`;
          c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          c.fill();
        }
        if (!document.hidden) raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else {
          last = performance.now();
          raf = requestAnimationFrame(draw);
        }
      });
    } else canvas.remove();
  }
  // Brillo del cursor y paralaje del panel: como mucho una escritura por fotograma. Las
  // variables van en el panel (lo único que las usa); en <html> recalculaban toda la página.
  const heroPanel = $('.hero-panel');
  let pointerRaf = 0,
    px = 0,
    py = 0;
  const paintPointer = () => {
    pointerRaf = 0;
    glow.style.left = px + 'px';
    glow.style.top = py + 'px';
    glow.style.opacity = '1';
    heroPanel?.style.setProperty('--tgs-mx', (px / innerWidth - 0.5).toFixed(3));
    heroPanel?.style.setProperty('--tgs-my', (py / innerHeight - 0.5).toFixed(3));
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
  const targets = $$(
    '.section,.trust,.smart-band,.support-panel,.faq-grid,.footer,.hero-left,.hero-panel,.product,.game-tab,.card,.lab-card,.tracking-card,.invoice',
  );
  targets.forEach((e, i) => {
    e.classList.add('tgs-cinematic');
    e.style.setProperty('--tgs-delay', Math.min((i % 8) * 45, 315) + 'ms');
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((x) => {
          if (x.isIntersecting) {
            x.target.classList.add('tgs-visible');
            io.unobserve(x.target);
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -7%' },
    );
    targets.forEach((e) => io.observe(e));
  } else targets.forEach((e) => e.classList.add('tgs-visible'));
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
      if (b) {
        b.classList.remove('tgs-impact');
        void b.offsetWidth;
        b.classList.add('tgs-impact');
        setTimeout(() => b.classList.remove('tgs-impact'), 700);
      }
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

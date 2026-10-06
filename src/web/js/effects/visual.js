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
          glow.style.left = mx + 'px';
          glow.style.top = my + 'px';
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

    // Only the main hero panel gets tilt. Catalog cards use CSS hover instead of JS.
    const hero = document.querySelector('.hero-panel');
    if (hero) {
      hero.addEventListener(
        'pointermove',
        (e) => {
          const r = hero.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          hero.style.transform =
            'perspective(1000px) rotateX(' +
            -y * 2.2 +
            'deg) rotateY(' +
            x * 2.2 +
            'deg) translate3d(0,-2px,0)';
        },
        { passive: true },
      );
      hero.addEventListener('pointerleave', () => (hero.style.transform = ''), {
        passive: true,
      });
    }
  }

  // Ambient particles: 20–24 FPS instead of a permanent 60 FPS loop.
  // They are decorative only, so visual continuity does not require a frame-perfect cadence.
  if (!reduce && !touch && !lowPower) {
    const canvas = document.createElement('canvas');
    canvas.id = 'tgsParticleCanvas';
    body.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (ctx) {
      let particles = [];
      let width = innerWidth,
        height = innerHeight,
        dpr = 1;
      let last = 0,
        animating = true;
      function resize() {
        width = innerWidth;
        height = innerHeight;
        dpr = Math.min(devicePixelRatio || 1, 1.25);
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const count = Math.min(22, Math.max(12, Math.floor(width / 80)));
        particles = Array.from({ length: count }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.1,
          vy: (Math.random() - 0.5) * 0.09,
          r: Math.random() * 1.05 + 0.35,
          a: Math.random() * 0.22 + 0.08,
        }));
      }
      function frame(ts) {
        if (!animating) return;
        if (ts - last >= 42) {
          last = ts;
          ctx.clearRect(0, 0, width, height);
          ctx.fillStyle = 'rgba(92,152,255,.18)';
          for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < -4) p.x = width + 4;
            if (p.x > width + 4) p.x = -4;
            if (p.y < -4) p.y = height + 4;
            if (p.y > height + 4) p.y = -4;
            ctx.globalAlpha = p.a;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        requestAnimationFrame(frame);
      }
      addEventListener('resize', resize, { passive: true });
      addEventListener('visibilitychange', () => {
        animating = !document.hidden;
        if (animating) {
          last = performance.now();
          requestAnimationFrame(frame);
        }
      });
      resize();
      requestAnimationFrame(frame);
    }
  }

  // Lightweight section reveals. IntersectionObserver avoids scroll polling.
  const reveal = [
    ...document.querySelectorAll(
      '.trust,.section,.smart-band,.tracking-card,.support-section,.faq',
    ),
  ];
  reveal.forEach((el, i) => {
    el.classList.add('tgs-reveal');
    if (i % 4 === 1) el.classList.add('delay-1');
    if (i % 4 === 2) el.classList.add('delay-2');
    if (i % 4 === 3) el.classList.add('delay-3');
  });
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    );
    reveal.forEach((el) => io.observe(el));
  } else reveal.forEach((el) => el.classList.add('in'));

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

  const badge = document.getElementById('cartBadge');
  if (badge && 'MutationObserver' in window) {
    // Cada render reescribe el contador: el rebote (que fuerza un reflujo) solo cuando cambia.
    let lastCount = badge.textContent;
    new MutationObserver(() => {
      if (badge.textContent === lastCount) return;
      lastCount = badge.textContent;
      const cart = document.getElementById('cartBtn');
      if (!cart) return;
      cart.classList.remove('bump');
      void cart.offsetWidth;
      cart.classList.add('bump');
      setTimeout(() => cart.classList.remove('bump'), 420);
    }).observe(badge, { childList: true, characterData: true, subtree: true });
  }
}

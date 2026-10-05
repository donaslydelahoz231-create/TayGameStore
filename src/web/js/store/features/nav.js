import { $ } from '../dom.js';

const SECTION_IDS = ['inicio', 'catalogo', 'verificacion', 'factura', 'seguimiento', 'soporte'];

/** Resalta en la navegación la sección visible. */
export function navObserver() {
  if (!('IntersectionObserver' in window)) return;
  const links = [...document.querySelectorAll('.nav a')],
    sections = SECTION_IDS.map((id) => $(id)).filter(Boolean);
  const io = new IntersectionObserver(
    (es) => {
      const x = es
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (x)
        links.forEach((a) =>
          a.classList.toggle('active', a.getAttribute('href') === '#' + x.target.id),
        );
    },
    { rootMargin: '-24% 0px -58% 0px', threshold: [0, 0.2, 0.5] },
  );
  sections.forEach((s) => io.observe(s));
}

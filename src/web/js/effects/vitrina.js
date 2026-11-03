// Acomoda el fondo de la portada (styles/layers/49-fondo-muro.css) alrededor del contenido.
// Copia en variables CSS del fondo la caja del panel de estado (--pl, --pt, --pw, --ph) y la de
// los botones (--bx: borde derecho del botón más ancho, --by y --bb: arriba y abajo). Usa la
// posición de diseño (offset*), no getBoundingClientRect: así las entradas animadas no la mueven.
function offsetIn(hero, element) {
  let left = 0;
  let top = 0;
  for (let node = element; node && node !== hero; node = node.offsetParent) {
    left += node.offsetLeft;
    top += node.offsetTop;
    if (!(node.offsetParent instanceof HTMLElement)) break;
  }
  return { left, top };
}

export function followHeroPanel() {
  const hero = document.querySelector('.hero');
  const art = hero?.querySelector('.hero-art');
  const panel = hero?.querySelector('.hero-panel');
  const buttons = hero?.querySelector('.hero-buttons');
  if (!(art instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;
  let frame = 0;
  const sync = () => {
    frame = 0;
    const box = offsetIn(hero, panel);
    art.style.setProperty('--pl', `${box.left}px`);
    art.style.setProperty('--pt', `${box.top}px`);
    art.style.setProperty('--pw', `${panel.offsetWidth}px`);
    art.style.setProperty('--ph', `${panel.offsetHeight}px`);
    if (buttons instanceof HTMLElement && buttons.children.length) {
      let right = 0;
      let top = Infinity;
      let bottom = 0;
      for (const child of buttons.children) {
        if (!(child instanceof HTMLElement) || !child.offsetWidth) continue;
        const at = offsetIn(hero, child);
        right = Math.max(right, at.left + child.offsetWidth);
        top = Math.min(top, at.top);
        bottom = Math.max(bottom, at.top + child.offsetHeight);
      }
      if (right) {
        art.style.setProperty('--bx', `${right}px`);
        art.style.setProperty('--by', `${top}px`);
        art.style.setProperty('--bb', `${bottom}px`);
      }
    }
    art.dataset.vitrina = 'lista';
  };
  const later = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };
  sync();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(later);
    observer.observe(panel);
    observer.observe(hero);
    if (buttons) observer.observe(buttons);
  } else {
    addEventListener('resize', later, { passive: true });
  }
}

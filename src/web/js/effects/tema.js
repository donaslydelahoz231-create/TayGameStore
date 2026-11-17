// Modo claro y oscuro (2026-11-17). El oscuro es el diseño original de TayGameStore; el claro es
// su versión de día, con la misma marca. /tema.js aplica el tema guardado antes del primer
// pintado; este módulo maneja los interruptores, guarda la elección y la reparte entre pestañas.

const KEY = 'tgs_tema';
const BAR = { dark: '#050815', light: '#f3f1fa' };
const root = document.documentElement;

/** Tema actual: 'light' o 'dark' (el original). */
export const currentTheme = () => (root.dataset.theme === 'light' ? 'light' : 'dark');

function save(theme) {
  try {
    if (theme === 'light') localStorage.setItem(KEY, 'light');
    else localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento: el tema dura lo que dure la página.
  }
}

function render() {
  const light = currentTheme() === 'light';
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-checked', String(light));
    button.title = light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  });
}

function apply(theme) {
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
  render();
  document.dispatchEvent(new CustomEvent('tgs:tema', { detail: { theme } }));
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Cambia de tema; con animación, el nuevo se abre en círculo desde el interruptor. */
function toggle(event) {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  save(next);
  if (!document.startViewTransition || reducedMotion() || document.hidden) {
    apply(next);
    return;
  }
  const box = event.currentTarget.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.style.setProperty('--tema-x', `${x}px`);
  root.style.setProperty('--tema-y', `${y}px`);
  root.style.setProperty('--tema-r', `${Math.ceil(r)}px`);
  root.classList.add('tema-cambiando');
  const transition = document.startViewTransition(() => apply(next));
  transition.finished.finally(() => root.classList.remove('tema-cambiando'));
}

/** Interruptores de tema y sincronía con otras pestañas. */
export function initTheme() {
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', toggle);
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    let stored;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      return;
    }
    const theme = stored === 'light' ? 'light' : 'dark';
    if (theme !== currentTheme()) apply(theme);
  });
  render();
}

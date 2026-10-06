// Pausa las animaciones de las secciones que no están en pantalla (ver
// styles/layers/33-motion-budget.css). No quita ninguna: al acercarse a la vista continúan.
export function pauseOffscreenAnimations() {
  if (!('IntersectionObserver' in window)) return;
  const sections = document.querySelectorAll('main > section, .footer');
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) =>
        entry.target.classList.toggle('tgs-offscreen', !entry.isIntersecting),
      ),
    // Margen para que ya estén en marcha justo antes de entrar en la pantalla.
    { rootMargin: '200px 0px' },
  );
  sections.forEach((section) => io.observe(section));
}

// Pausa las animaciones de las secciones que no están en pantalla (ver
// styles/layers/33-motion-budget.css). No quita ninguna: al acercarse a la vista continúan.

// Margen para que ya estén en marcha justo antes de entrar en la pantalla.
const MARGIN_PX = 200;

export function pauseOffscreenAnimations() {
  if (!('IntersectionObserver' in window)) return;
  const sections = [...document.querySelectorAll('main > section, .footer')];
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) =>
        entry.target.classList.toggle('tgs-offscreen', !entry.isIntersecting),
      ),
    { rootMargin: `${MARGIN_PX}px 0px` },
  );
  sections.forEach((section) => io.observe(section));

  // Respaldo: en Safari (WebKit) un desplazamiento largo y suave puede terminar sin el aviso
  // final del observador y la portada quedaba en pausa al volver arriba. Al detenerse el
  // desplazamiento se recalcula una vez con la posición real (unas pocas secciones).
  let timer = 0;
  const resync = () => {
    const height = window.innerHeight;
    for (const section of sections) {
      const box = section.getBoundingClientRect();
      const visible = box.bottom > -MARGIN_PX && box.top < height + MARGIN_PX;
      section.classList.toggle('tgs-offscreen', !visible);
    }
  };
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(timer);
      timer = setTimeout(resync, 150);
    },
    { passive: true },
  );
}

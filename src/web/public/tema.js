// Tema de la tienda antes del primer pintado, para que nunca se vea un destello del otro tema.
// El oscuro es el original; el claro solo si el visitante lo eligió con el interruptor (se guarda
// en este navegador). Script clásico y diminuto: va en <head> y la CSP solo permite 'self'.
(() => {
  let theme = 'dark';
  try {
    if (localStorage.getItem('tgs_tema') === 'light') theme = 'light';
  } catch {
    // Sin almacenamiento (modo privado estricto): tema original.
  }
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'light') {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f5f7fc');
  }
})();

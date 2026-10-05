/**
 * Registro de render. Los módulos llaman a `renderAll()` sin depender de los demás;
 * app.js registra los renderizadores en el orden original del HTML.
 */
const renderers = [];

export function registerRenderers(list) {
  renderers.splice(0, renderers.length, ...list);
}

export function renderAll() {
  for (const render of renderers) render();
}

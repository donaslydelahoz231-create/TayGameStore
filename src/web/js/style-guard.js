/**
 * Guardia de estilos. Si la hoja principal no llegó al navegador (red móvil cortada, conexión
 * que se cayó a mitad de carga), la tienda se vería en blanco, con letra por defecto y la
 * mascota gigante. Esta guardia:
 *  1. comprueba, cuando la página terminó de cargar, que la hoja se aplicó (variable --bg);
 *  2. si no, muestra un aviso con la marca (estilos de respaldo en index.html) y pide la hoja
 *     otra vez una sola vez;
 *  3. si el reintento funciona, quita el aviso; si no, el aviso ofrece recargar.
 */
const RESPALDO = 'css-respaldo';

export function styleApplied(doc = document) {
  return getComputedStyle(doc.documentElement).getPropertyValue('--bg').trim() !== '';
}

function notice(doc) {
  let box = doc.getElementById('estilosCaidos');
  if (box) return box;
  box = doc.createElement('div');
  box.id = 'estilosCaidos';
  box.setAttribute('role', 'status');
  const title = doc.createElement('b');
  title.textContent = 'TayGameStore';
  const text = doc.createElement('p');
  text.textContent = 'Cargando el diseño de la tienda…';
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = 'Recargar';
  button.hidden = true;
  button.addEventListener('click', () => location.reload());
  box.append(title, text, button);
  doc.body.append(box);
  return box;
}

function retrySheet(doc) {
  const sheet = doc.querySelector('link[rel="stylesheet"][href*="main"]');
  const box = notice(doc);
  const fail = () => {
    box.querySelector('p').textContent =
      'Tu conexión cortó la carga de la tienda. Toca «Recargar» para intentarlo de nuevo.';
    box.querySelector('button').hidden = false;
  };
  if (!sheet) return fail();
  const retry = /** @type {HTMLLinkElement} */ (sheet.cloneNode());
  const url = new URL(sheet.href, location.href);
  url.searchParams.set('r', String(Date.now()));
  retry.href = url.href;
  retry.addEventListener('load', () => {
    if (!styleApplied(doc)) return fail();
    doc.documentElement.classList.remove(RESPALDO);
    box.remove();
  });
  retry.addEventListener('error', fail);
  sheet.after(retry);
}

export function guardStyles(doc = document) {
  const check = () => {
    if (styleApplied(doc)) return;
    doc.documentElement.classList.add(RESPALDO);
    retrySheet(doc);
  };
  if (doc.readyState === 'complete') check();
  else addEventListener('load', check, { once: true });
}

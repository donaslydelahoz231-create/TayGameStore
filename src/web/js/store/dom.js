export const $ = (id) => document.getElementById(id);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para interpolarlo en HTML. Obligatorio para todo dato variable en innerHTML. */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

export const setText = (id, value) => {
  const el = $(id);
  if (el) el.textContent = String(value ?? '');
};

/** Solo para HTML ya escapado con `esc`. */
export const setHtml = (id, value) => {
  const el = $(id);
  if (el) el.innerHTML = value;
};

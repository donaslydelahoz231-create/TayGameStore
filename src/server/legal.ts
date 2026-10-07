import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config/env.js';

/**
 * Términos y privacidad. El borrador del repositorio lleva marcadores `[COMPLETAR:VARIABLE]`
 * para los datos del vendedor; el servidor los reemplaza al servir la página con la
 * configuración del hosting (variables LEGAL_*, SUPPORT_* y TERMS_VERSION). Así la cédula, el
 * NIT o la dirección del dueño nunca quedan en el historial de Git ni pasan por un chat.
 * Un marcador sin valor sigue visible como pendiente y bloquea las ventas en producción.
 *
 * Privacidad del dueño: el documento se publica solo con sus últimos 4 dígitos (el completo se
 * entrega ante un reclamo formal o a una autoridad, por el correo de soporte) y las páginas
 * piden a los buscadores no indexarlas ni guardar copias (meta robots + X-Robots-Tag).
 */

/** Cabecera para que Google y otros buscadores no muestren ni guarden estas páginas. */
export const LEGAL_ROBOTS = 'noindex, noarchive, nosnippet';

/** «documento terminado en 7890»: el número completo nunca se publica. */
export function maskDocument(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `documento terminado en ${digits.slice(-4)}` : 'documento reservado';
}

export const LEGAL_PAGES = ['terminos.html', 'privacidad.html'] as const;
export const LEGAL_PLACEHOLDER = '[COMPLETAR';

const MARKER = /\[COMPLETAR(?::([A-Z_]+))?[^\]]*\]/g;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** Valor de cada marcador según la configuración (undefined = sigue pendiente). */
function legalValues(config: AppConfig): Record<string, string | undefined> {
  const { legal, support } = config;
  const channels =
    [
      support.email ? `correo ${support.email}` : '',
      support.whatsapp ? `WhatsApp +${support.whatsapp}` : '',
    ]
      .filter(Boolean)
      .join(' y ') || undefined;
  return {
    TERMS_VERSION: config.orders.termsVersion,
    LEGAL_NAME: legal.name,
    LEGAL_ID: legal.id ? maskDocument(legal.id) : undefined,
    LEGAL_ADDRESS: legal.address,
    LEGAL_DELIVERY_TIME: legal.deliveryTime,
    LEGAL_REFUND_TIME: legal.refundTime,
    LEGAL_RESPONSE_TIME: legal.responseTime,
    LEGAL_TAX_NOTE: legal.taxNote,
    LEGAL_RETENTION: legal.retention,
    SUPPORT_CHANNELS: channels,
    SUPPORT_EMAIL: support.email,
  };
}

/** La página con los datos del vendedor puestos (escapados) donde estén configurados. */
export function renderLegalPage(html: string, config: AppConfig): string {
  const values = legalValues(config);
  return html.replace(MARKER, (marker, name: string | undefined) => {
    const value = name ? values[name] : undefined;
    return value ? escapeHtml(value) : marker;
  });
}

/** Lo que falta por página: nombre de la variable o, si el marcador no tiene, el marcador. */
export function pendingLegalFields(config: AppConfig, root: string): Map<string, string[]> {
  const pending = new Map<string, string[]>();
  for (const page of LEGAL_PAGES) {
    const file = path.join(root, page);
    if (!existsSync(file)) {
      pending.set(page, ['la página no existe']);
      continue;
    }
    const rendered = renderLegalPage(readFileSync(file, 'utf8'), config);
    const fields = [...rendered.matchAll(MARKER)].map((m) => m[1] ?? m[0]);
    if (fields.length) pending.set(page, [...new Set(fields)]);
  }
  return pending;
}

export function describePending(pending: Map<string, string[]>): string {
  return [...pending].map(([page, fields]) => `${page}: ${fields.join(', ')}`).join(' · ');
}

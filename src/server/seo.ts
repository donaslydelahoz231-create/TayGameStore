/**
 * robots.txt y sitemap.xml para buscadores. Se generan con PUBLIC_BASE_URL (obligatoria en
 * producción) para que las direcciones sean absolutas y sigan valiendo si cambia el dominio.
 *
 * - Solo se publica la tienda ("/"). Términos y privacidad quedan fuera del sitemap y responden
 *   con noindex (no se bloquean aquí: un buscador debe poder leer ese noindex).
 * - La ruta del panel de administración es secreta: nunca se menciona.
 */

/** Rutas que un buscador no necesita rastrear (API y flujo de inicio de sesión). */
const NO_INDEXABLE = ['/api/', '/auth/'];

export function robotsTxt(siteUrl: string | undefined): string {
  const lines = ['User-agent: *', 'Allow: /', ...NO_INDEXABLE.map((path) => `Disallow: ${path}`)];
  if (siteUrl) lines.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c,
  );

export function sitemapXml(siteUrl: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${escapeXml(`${siteUrl}/`)}</loc></url>`,
    '</urlset>',
    '',
  ].join('\n');
}

import { describe, expect, it } from 'vitest';
import { robotsTxt, sitemapXml } from '../../src/server/seo.js';

describe('robots.txt y sitemap.xml', () => {
  it('robots.txt deja rastrear la tienda, no la API ni el inicio de sesión, y anuncia el sitemap', () => {
    const robots = robotsTxt('https://tienda.example');
    expect(robots).toContain('User-agent: *\nAllow: /\n');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Disallow: /auth/');
    expect(robots).toContain('Sitemap: https://tienda.example/sitemap.xml');
  });

  it('sin URL pública no anuncia sitemap (necesita una dirección absoluta)', () => {
    expect(robotsTxt(undefined)).not.toContain('Sitemap');
  });

  it('nunca menciona el panel ni bloquea las páginas legales (deben poder leer su noindex)', () => {
    const robots = robotsTxt('https://tienda.example');
    expect(robots).not.toMatch(/panel|admin/i);
    expect(robots).not.toMatch(/terminos|privacidad/);
  });

  it('el sitemap solo incluye la tienda, con la URL escapada', () => {
    const xml = sitemapXml('https://tienda.example');
    expect(xml).toContain('<loc>https://tienda.example/</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(sitemapXml('https://a.example/?x=1&y=<2>')).toContain('x=1&amp;y=&lt;2&gt;');
  });
});

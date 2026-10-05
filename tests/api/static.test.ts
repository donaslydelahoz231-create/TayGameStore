import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers.js';

/** Build mínimo como el de Vite: archivos con sus variantes .br/.gz precomprimidas. */
let dir: string;
let app: FastifyInstance;
const HTML = '<!doctype html><title>TayGameStore</title>' + 'x'.repeat(2000);
const JS = 'console.warn("asset");' + '/* relleno */'.repeat(200);

async function withVariants(file: string, content: string) {
  await writeFile(file, content);
  await writeFile(`${file}.br`, brotliCompressSync(content));
  await writeFile(`${file}.gz`, gzipSync(content));
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tgs-web-'));
  await mkdir(join(dir, 'assets'));
  await withVariants(join(dir, 'index.html'), HTML);
  await withVariants(join(dir, 'assets', 'main-AbC123.js'), JS);
  app = await buildTestApp({ env: { SERVE_WEB: 'true', WEB_DIST_DIR: dir } });
});

afterAll(async () => {
  await app?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('archivos estáticos', () => {
  it.each([
    ['br', 'br'],
    ['gzip', 'gzip'],
    ['', undefined],
  ])('"/" responde la tienda con Accept-Encoding "%s"', async (accept, encoding) => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: accept ? { 'accept-encoding': accept } : {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe(encoding);
    expect(res.headers['cache-control']).toBe('no-cache');
    if (!encoding) expect(res.body).toBe(HTML);
  });

  it('los assets con hash se cachean un año y se envían comprimidos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/main-AbC123.js',
      headers: { 'accept-encoding': 'br, gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers.vary).toContain('accept-encoding');
    expect(Number(res.headers['content-length'])).toBeLessThan(JS.length);
  });
});

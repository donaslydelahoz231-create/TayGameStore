import { describe, expect, it } from 'vitest';
import {
  AbuseShield,
  DEFAULT_SHIELD_OPTIONS,
  isProbePath,
  STRIKE_WEIGHTS,
} from '../../src/server/services/shield.js';

const silentLog = { warn: () => undefined, error: () => undefined } as never;

function makeShield(options = {}) {
  const clock = { now: new Date('2026-10-05T12:00:00Z') };
  const shield = new AbuseShield(
    { now: () => clock.now, log: silentLog },
    { ...DEFAULT_SHIELD_OPTIONS, ...options },
  );
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  return { shield, advance, now: () => clock.now };
}

const MIN = 60_000;

describe('detección de sondeos de escáneres', () => {
  it.each([
    '/.env',
    '/.git/config',
    '/wp-login.php',
    '/wp-admin/',
    '/xmlrpc.php',
    '/phpmyadmin/index.php',
    '/backup.sql',
    '/cgi-bin/luci',
    '/actuator/health',
    '/static/../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/index.php?id=1',
  ])('%s es un sondeo', (path) => {
    expect(isProbePath(path)).toBe(true);
  });

  it.each([
    '/',
    '/index.html',
    '/terminos.html',
    '/assets/main-Bsv8IbD0.js',
    '/assets/main-CtGyF-ZC.css.br',
    '/api/orders/TGS-ABCDEFGHJK',
    '/api/catalog?game=freefire',
    '/admin.html',
    '/favicon.ico',
  ])('%s es una ruta legítima', (path) => {
    expect(isProbePath(path)).toBe(false);
  });
});

describe('AbuseShield', () => {
  it('bloquea al superar el umbral y no antes', async () => {
    const { shield } = makeShield();
    const hits = Math.ceil(DEFAULT_SHIELD_OPTIONS.threshold / STRIKE_WEIGHTS.csrf);
    for (let i = 1; i < hits; i += 1) {
      expect((await shield.strike('ip-a', 'csrf')).blockedUntil).toBeUndefined();
    }
    expect(shield.isBlocked('ip-a')).toBe(false);
    const last = await shield.strike('ip-a', 'csrf');
    expect(last.blockedUntil).toBeInstanceOf(Date);
    expect(shield.isBlocked('ip-a')).toBe(true);
    expect(shield.isBlocked('ip-b')).toBe(false);
  });

  it('dos sondeos de escáner bastan; los 404 sueltos no', async () => {
    const { shield } = makeShield();
    await shield.strike('scanner', 'probe');
    await shield.strike('scanner', 'probe');
    expect(shield.isBlocked('scanner')).toBe(true);
    for (let i = 0; i < 10; i += 1) await shield.strike('typo', 'not_found');
    expect(shield.isBlocked('typo')).toBe(false);
  });

  it('las señales viejas salen de la ventana', async () => {
    const { shield, advance } = makeShield();
    await shield.strike('ip', 'probe');
    advance(DEFAULT_SHIELD_OPTIONS.windowMs + 1);
    await shield.strike('ip', 'probe');
    expect(shield.isBlocked('ip')).toBe(false);
  });

  it('escala 15 min → 1 h → 24 h (y se queda en 24 h); cada bloqueo caduca solo', async () => {
    const { shield, advance, now } = makeShield();
    for (const duration of [15 * MIN, 60 * MIN, 24 * 60 * MIN, 24 * 60 * MIN]) {
      await shield.strike('ip', 'probe');
      const { blockedUntil } = await shield.strike('ip', 'probe');
      expect(blockedUntil?.getTime()).toBe(now().getTime() + duration);
      advance(duration - 1);
      expect(shield.isBlocked('ip')).toBe(true);
      advance(1);
      expect(shield.isBlocked('ip')).toBe(false);
    }
  });

  it('durante un bloqueo no acumula ni escribe más señales', async () => {
    const { shield } = makeShield();
    await shield.strike('ip', 'probe');
    await shield.strike('ip', 'probe');
    const during = await shield.strike('ip', 'probe');
    expect(during.score).toBe(0);
  });

  it('la memoria está acotada aunque el atacante rote IPs', async () => {
    const { shield } = makeShield({ maxTracked: 100 });
    for (let i = 0; i < 1_000; i += 1) await shield.strike(`ip-${i}`, 'not_found');
    expect(shield.stats().tracked).toBeLessThanOrEqual(100);
  });
});

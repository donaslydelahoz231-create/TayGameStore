import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceDeps } from '../../src/server/services/context.js';
import { isActivityRequest, startScheduler, type JobName } from '../../src/server/services/jobs.js';

const MINUTE = 60_000;

/** Solo el registro: las tareas reales no se ejecutan (se inyecta `run`). */
const deps = { log: { info: vi.fn(), error: vi.fn() } } as unknown as ServiceDeps;

describe('programador de tareas en modo reposo', () => {
  beforeEach(() => vi.useFakeTimers({ now: 0 }));
  afterEach(() => vi.useRealTimers());

  function start(idleMs: number, result: number | null = 0) {
    const runs: JobName[] = [];
    const run = vi.fn((_deps: ServiceDeps, name: JobName) => {
      runs.push(name);
      return Promise.resolve(result);
    });
    const scheduler = startScheduler(deps, { idleMs, now: () => Date.now(), run });
    const count = (name: JobName) => runs.filter((job) => job === name).length;
    return { scheduler, count };
  }

  it('con actividad reciente, cada tarea corre a su ritmo normal', async () => {
    const { scheduler, count } = start(30 * MINUTE);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    // Cada minuto + la primera pasada (5-15 s tras arrancar).
    expect(count('expireOrders')).toBeGreaterThanOrEqual(10);
    scheduler.stop();
  });

  it('sin actividad, en reposo corre como mucho una vez por intervalo', async () => {
    const { scheduler, count } = start(30 * MINUTE);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    const before = count('expireOrders');
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    // 60 minutos en reposo con intervalo de 30: dos pasadas, no sesenta.
    expect(count('expireOrders') - before).toBeLessThanOrEqual(2);
    expect(count('expireOrders') - before).toBeGreaterThanOrEqual(1);
    scheduler.stop();
  });

  it('una petición de un cliente devuelve el ritmo normal enseguida', async () => {
    const { scheduler, count } = start(30 * MINUTE);
    await vi.advanceTimersByTimeAsync(45 * MINUTE);
    scheduler.markActivity();
    const before = count('expireOrders');
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(count('expireOrders') - before).toBeGreaterThanOrEqual(5);
    scheduler.stop();
  });

  it('si una tarea encuentra trabajo, no entra en reposo', async () => {
    const { scheduler, count } = start(30 * MINUTE, 1);
    await vi.advanceTimersByTimeAsync(90 * MINUTE);
    expect(count('expireOrders')).toBeGreaterThanOrEqual(89);
    scheduler.stop();
  });

  it('con 0 el modo reposo queda desactivado', async () => {
    const { scheduler, count } = start(0);
    await vi.advanceTimersByTimeAsync(90 * MINUTE);
    expect(count('expireOrders')).toBeGreaterThanOrEqual(89);
    scheduler.stop();
  });
});

describe('qué cuenta como actividad', () => {
  it.each([
    ['/api/config', true],
    ['/api/orders/TGS-ABC?token=x', true],
    ['/api/webhooks/mercadopago', true],
    ['/auth/google', true],
    ['/api/health', false],
    ['/api/ready', false],
    ['/api/ready?x=1', false],
    ['/', false],
    ['/assets/app.js', false],
    ['/favicon.ico', false],
    [undefined, false],
  ])('%s → %s', (url, expected) => {
    expect(isActivityRequest(url)).toBe(expected);
  });
});

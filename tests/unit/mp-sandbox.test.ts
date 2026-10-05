import { describe, expect, it } from 'vitest';
import { runSandboxCommand, SandboxUsageError } from '../../src/server/cli/mp-sandbox.js';
import { loadConfig } from '../../src/server/config/env.js';
import { FakePaymentGateway } from '../support/fake-gateway.js';

const BASE = {
  PUBLIC_BASE_URL: 'https://tienda.example.com',
  MP_ACCESS_TOKEN: 'APP_USR-token-de-prueba',
  MP_WEBHOOK_SECRET: 'secreto-de-prueba',
};

function run(args: string[], env: Record<string, string>, gateway = new FakePaymentGateway()) {
  const lines: string[] = [];
  let created = false;
  const promise = runSandboxCommand(
    args,
    loadConfig(env),
    () => {
      created = true;
      return gateway;
    },
    { out: (line) => lines.push(line) },
  );
  return { promise, lines, created: () => created, gateway };
}

describe('npm run mp:sandbox', () => {
  it('se niega con la cuenta de producción y ni siquiera crea el cliente de Mercado Pago', async () => {
    const r = run(['preferencia', '--monto', '3800'], { ...BASE, MP_MODE: 'production' });
    await expect(r.promise).rejects.toThrow(SandboxUsageError);
    expect(r.created()).toBe(false);
  });

  it('se niega sin credenciales o sin MP_MODE declarado', async () => {
    await expect(
      run(['pago', '1'], { PUBLIC_BASE_URL: BASE.PUBLIC_BASE_URL }).promise,
    ).rejects.toThrow(/MP_ACCESS_TOKEN/);
    // Sin PAYMENTS_ENABLED el modo por defecto es sandbox; con la cuenta declarada funciona.
    await expect(run(['pago'], { ...BASE, MP_MODE: 'sandbox' }).promise).rejects.toThrow(/Uso/);
  });

  it('crea una preferencia de prueba con webhook y retorno públicos', async () => {
    const r = run(['preferencia', '--monto', '3800'], { ...BASE, MP_MODE: 'sandbox' });
    await r.promise;
    const [pref] = [...r.gateway.preferences.values()];
    expect(pref?.input.totalCop).toBe(3800);
    expect(pref?.input.notificationUrl).toBe('https://tienda.example.com/api/webhooks/mercadopago');
    expect(pref?.input.orderRef).toMatch(/^SANDBOX-[0-9A-F]{10}$/);
    expect(r.lines.join('\n')).toContain('Checkout:');
    expect(r.lines.join('\n')).not.toContain('APP_USR');
  });

  it('valida el monto', async () => {
    for (const monto of ['0', '-5', '1.5', 'abc', '1000001']) {
      await expect(
        run(['preferencia', '--monto', monto], { ...BASE, MP_MODE: 'sandbox' }).promise,
      ).rejects.toThrow(/monto/);
    }
  });

  it('muestra el estado y advierte si un pago no es de prueba (live_mode)', async () => {
    const gateway = new FakePaymentGateway();
    gateway.setPayment({ id: '11', externalReference: 'SANDBOX-A', amount: 3800 });
    gateway.setPayment({ id: '12', externalReference: 'SANDBOX-B', amount: 3800, liveMode: true });
    const ok = run(['pago', '11'], { ...BASE, MP_MODE: 'sandbox' }, gateway);
    await ok.promise;
    expect(ok.lines.join('\n')).toContain('estado interno: APPROVED');
    expect(ok.lines.join('\n')).toContain('live_mode: false');
    expect(ok.lines.join('\n')).not.toContain('ATENCIÓN');
    const live = run(['pago', '12'], { ...BASE, MP_MODE: 'sandbox' }, gateway);
    await live.promise;
    expect(live.lines.join('\n')).toContain('ATENCIÓN');
  });
});

#!/usr/bin/env node
/**
 * Simulación de clientes y ataques contra la tienda (SOLO entornos propios).
 *
 * Cada cliente virtual tiene su propia IP (X-Forwarded-For; el servidor de pruebas confía en un
 * proxy, como en producción) y su propio navegador (cookies). Fases:
 *   1. Compras completas con subida de carga: catálogo → consulta de ID → pedido → pago (doble
 *      de Mercado Pago) → confirmación del servidor.
 *   2. Ataques mientras los clientes compran: inundación, sondeo de rutas, spam de pedidos,
 *      enumeración de IDs, cuerpos gigantes, JSON roto, sin CSRF, webhooks falsos, doble envío.
 *   3. Comprobaciones: ningún 5xx, clientes legítimos atendidos, defensas activas, memoria.
 *
 * Uso: arrancar el servidor de pruebas (npm run load:server) y luego `npm run load:sim`.
 * Opciones: --base URL, --pid PID (memoria del servidor), --peak N (clientes simultáneos),
 * --nequi P (fracción de clientes que paga por Nequi, p. ej. 0.4), --owner (un dueño virtual
 * confirma transferencias Nequi y marca pedidos ENVIADO desde el panel mientras otros compran).
 * Con el servidor arrancado con E2E_SLOW_INTEGRATIONS_MS / E2E_SHEETS_WRITES_PER_MINUTE, el
 * informe incluye la hoja simulada: filas, límites de Google (429) y la cola de avisos, que la
 * «tarea programada» vacía después durante --drain segundos (60 por defecto).
 * Por seguridad solo acepta localhost; otro destino exige --i-own-this-target (y nunca se debe
 * usar contra sistemas ajenos ni contra producción sin aviso: los límites bloquearán la IP).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = new Map(
  process.argv
    .slice(2)
    .flatMap((arg, i, all) =>
      arg.startsWith('--')
        ? [[arg.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]]
        : [],
    ),
);
const BASE = (args.get('base') ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
const PEAK = Number(args.get('peak') ?? 300);
const NEQUI_SHARE = Number(args.get('nequi') ?? 0);
const OWNER = args.has('owner');
const SERVER_PID = args.get('pid');
const host = new URL(BASE).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !args.has('i-own-this-target')) {
  console.error(`Destino ${host} rechazado: solo localhost (o --i-own-this-target si es tuyo).`);
  process.exit(2);
}

// ---------- métricas ----------
const stats = new Map(); // "GET /api/catalog" -> { n, status: {}, ms: [] }
const failures = [];
function record(label, status, ms) {
  const s = stats.get(label) ?? { n: 0, status: {}, ms: [] };
  s.n++;
  s.status[status] = (s.status[status] ?? 0) + 1;
  s.ms.push(ms);
  stats.set(label, s);
}
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
};
const rss = () => {
  if (!SERVER_PID) return undefined;
  try {
    const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${SERVER_PID}/status`, 'utf8'));
    return m ? Math.round(Number(m[1]) / 1024) : undefined;
  } catch {
    return undefined;
  }
};

// ---------- cliente con su IP y sus cookies ----------
// Prefijo aleatorio por ejecución: repetir la simulación no reutiliza IPs que el escudo
// bloqueó en la anterior (los bloqueos duran 15 min, como deben).
const RUN_PREFIX = 1 + Math.floor(Math.random() * 254);
let ipSeq = 0;
class Client {
  constructor(kind) {
    ipSeq++;
    this.kind = kind;
    this.ip = `10.${RUN_PREFIX}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
    this.cookies = new Map();
  }
  async req(method, path, { body, headers = {}, label, raw, csrf = true } = {}) {
    const h = { 'x-forwarded-for': this.ip, ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined && !raw) h['content-type'] = 'application/json';
    if (raw) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-tgs-csrf'] = '1';
    const started = performance.now();
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: h,
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const name = label ?? `${method} ${path.split('?')[0]}`;
      record(`[${this.kind}] ${name}`, 'NETWORK', performance.now() - started);
      if (this.kind === 'cliente') failures.push(`${name}: ${err.cause?.code ?? err.message}`);
      return { status: 0, json: null };
    }
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
    const text = await res.text();
    const ms = performance.now() - started;
    record(`[${this.kind}] ${label ?? `${method} ${path.split('?')[0]}`}`, res.status, ms);
    let json = null;
    try {
      if (text) json = JSON.parse(text);
    } catch {
      // Respuesta sin JSON (página HTML, 404 de sondeo): se registra solo el estado.
    }
    return { status: res.status, json, headers: res.headers };
  }
}

// ---------- recorrido de un cliente real ----------
let catalogCache;
async function customerJourney() {
  const c = new Client('cliente');
  const expect = (cond, what) => {
    if (!cond) failures.push(what);
    return cond;
  };
  const home = await c.req('GET', '/', { label: 'GET / (página)' });
  if (!expect(home.status === 200, `página ${home.status}`)) return;
  const config = await c.req('GET', '/api/config');
  const catalog = await c.req('GET', '/api/catalog');
  if (!expect(catalog.status === 200, `catálogo ${catalog.status}`)) return;
  catalogCache ??= catalog.json.products;
  const product = catalog.json.products[Math.floor(Math.random() * catalog.json.products.length)];
  const qty = 1 + Math.floor(Math.random() * 2);

  // UID que el proveedor de pruebas encuentra (empieza por 9).
  const uid = '9' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const lookup = await c.req('POST', '/api/player/lookup', { body: { game: 'freefire', uid } });
  if (!expect(lookup.status === 200, `consulta ID ${lookup.status}`)) return;

  const checkout = await c.req('POST', '/api/checkout', {
    body: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: uid,
      customerName: 'Cliente Simulado',
      customerEmail: `cliente-${c.ip.replaceAll('.', '-')}@example.com`,
      acceptTerms: true,
      termsVersion: config.json.termsVersion,
      expectedTotalCop: product.priceCop * qty,
      playerLookup: { ref: lookup.json.lookupRef, nickname: lookup.json.nickname },
      items: [{ sku: product.sku, quantity: qty }],
    },
  });
  if (
    !expect(checkout.status === 201, `pedido ${checkout.status} ${JSON.stringify(checkout.json)}`)
  )
    return;
  const ref = checkout.json.order.reference;
  const token = { 'x-order-token': checkout.json.accessToken };
  if (
    !expect(checkout.json.order.totalCop === product.priceCop * qty, 'total distinto al catálogo')
  )
    return;

  if (NEQUI_SHARE && Math.random() < NEQUI_SHARE) {
    // Nequi: elegir, transferir (fuera de la tienda) y avisar «Ya transferí». Nunca paga solo.
    const chosen = await c.req('POST', `/api/orders/${ref}/nequi`, {
      headers: token,
      label: 'POST /nequi',
    });
    if (!expect(chosen.status === 200, `nequi ${chosen.status}`)) return;
    const report = await c.req('POST', `/api/orders/${ref}/nequi/report`, {
      headers: token,
      body: { senderLast4: '1234' },
      label: 'POST /nequi/report',
    });
    expect(
      report.status === 200 && report.json?.order?.status === 'AWAITING_PAYMENT',
      `aviso nequi ${report.status} ${report.json?.order?.status}`,
    );
    return;
  }
  const pay = await c.req('POST', `/api/orders/${ref}/pay`, { headers: token, label: 'POST /pay' });
  if (!expect(pay.status === 200 && pay.json?.checkoutUrl, `pago ${pay.status}`)) return;
  // Mitad de los clientes paga (el doble de Mercado Pago envía el webhook firmado).
  if (Math.random() < 0.5) {
    const mp = new URL(pay.json.checkoutUrl);
    await c.req('GET', mp.pathname + mp.search, { label: 'GET pasarela (doble MP)' });
    const synced = await c.req('POST', `/api/orders/${ref}/sync`, {
      headers: token,
      label: 'POST /sync',
    });
    // El dueño virtual puede haberlo entregado ya: pagado, en curso o ENVIADO están bien.
    expect(
      ['PAID', 'DELIVERING', 'DELIVERED'].includes(synced.json?.order?.status),
      `tras pagar: ${synced.json?.order?.status}`,
    );
  } else {
    const read = await c.req('GET', `/api/orders/${ref}`, {
      headers: token,
      label: 'GET /orders/:ref',
    });
    expect(
      read.json?.order?.status === 'AWAITING_PAYMENT',
      `sin pagar: ${read.json?.order?.status}`,
    );
  }
}

/** Mantiene `concurrency` recorridos en paralelo durante `ms`. */
async function sustain(concurrency, ms, journey = customerJourney) {
  const until = Date.now() + ms;
  let done = 0;
  const worker = async () => {
    while (Date.now() < until) {
      await journey();
      done++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return done;
}

// ---------- ataques ----------
const defenses = [];
const check = (name, ok, detail) => defenses.push({ name, ok, detail });
const count = (arr, code) => arr.filter((s) => s === code).length;

async function attacks() {
  // 1. Inundación del catálogo desde una IP.
  const flood = new Client('atacante');
  const floodStatus = [];
  for (let i = 0; i < 200; i++) floodStatus.push((await flood.req('GET', '/api/catalog')).status);
  check(
    'Inundación (200 peticiones/IP al catálogo)',
    count(floodStatus, 429) + count(floodStatus, 403) >= 70,
    `200=${count(floodStatus, 200)} 429=${count(floodStatus, 429)} 403=${count(floodStatus, 403)}`,
  );

  // 2. Sondeo de rutas sensibles: el escudo bloquea la IP.
  const probe = new Client('atacante');
  const probeStatus = [];
  for (const path of [
    '/.env',
    '/wp-admin',
    '/.git/config',
    '/phpmyadmin',
    '/admin.php',
    '/.env.bak',
  ])
    probeStatus.push((await probe.req('GET', path, { label: 'GET sondeo' })).status);
  const after = await probe.req('GET', '/api/catalog', { label: 'GET catálogo tras sondeo' });
  check(
    'Sondeo de rutas (.env, wp-admin…)',
    after.status === 403,
    `rutas=${probeStatus.join(',')} luego=${after.status}`,
  );

  // 3. Spam de pedidos y enumeración de IDs ajenos.
  const spam = new Client('atacante');
  const spamStatus = [];
  for (let i = 0; i < 15; i++)
    spamStatus.push(
      (await spam.req('POST', '/api/checkout', { body: { basura: i }, label: 'POST spam pedidos' }))
        .status,
    );
  check(
    'Spam de pedidos (15 seguidos)',
    spamStatus.includes(429),
    `400=${count(spamStatus, 400)} 429=${count(spamStatus, 429)}`,
  );
  const enumr = new Client('atacante');
  const enumStatus = [];
  for (let i = 0; i < 25; i++)
    enumStatus.push(
      (
        await enumr.req('POST', '/api/player/lookup', {
          body: { game: 'freefire', uid: String(900000000 + i) },
          label: 'POST enumeración IDs',
        })
      ).status,
    );
  check(
    'Enumeración de IDs (25 consultas)',
    count(enumStatus, 429) >= 5,
    `200=${count(enumStatus, 200)} 429=${count(enumStatus, 429)}`,
  );

  // 4. Cuerpos maliciosos.
  const bad = new Client('atacante');
  const huge = await bad.req('POST', '/api/checkout', {
    raw: JSON.stringify({ x: 'A'.repeat(200_000) }),
    label: 'POST cuerpo 200 KB',
  });
  check('Cuerpo gigante (200 KB)', huge.status === 413, `estado ${huge.status}`);
  const broken = await bad.req('POST', '/api/checkout', {
    raw: '{"roto": ',
    label: 'POST JSON roto',
  });
  check('JSON roto', broken.status === 400, `estado ${broken.status}`);
  const nocsrf = await new Client('atacante').req('POST', '/api/checkout', {
    body: {},
    csrf: false,
    label: 'POST sin CSRF',
  });
  check('Escritura sin cabecera anti-CSRF', nocsrf.status === 403, `estado ${nocsrf.status}`);

  // 5. Webhooks falsos de "pago aprobado".
  const forger = new Client('atacante');
  const hookStatus = [];
  for (let i = 0; i < 30; i++)
    hookStatus.push(
      (
        await forger.req('POST', `/api/webhooks/mercadopago?data.id=${777000 + i}&type=payment`, {
          body: { type: 'payment', data: { id: String(777000 + i) } },
          headers: { 'x-signature': 'ts=1,v1=falsa', 'x-request-id': randomUUID() },
          csrf: false,
          label: 'POST webhook falso',
        })
      ).status,
    );
  check(
    'Webhooks falsos (30)',
    hookStatus.every((s) => s === 401 || s === 429),
    `401=${count(hookStatus, 401)} 429=${count(hookStatus, 429)}`,
  );
}

/** Doble clic / reintento: 10 envíos simultáneos del mismo pedido crean UN solo pedido. */
async function doubleSubmit() {
  const c = new Client('cliente');
  const config = await c.req('GET', '/api/config');
  const product = catalogCache[0];
  const body = {
    checkoutKey: randomUUID(),
    game: 'freefire',
    // Datos únicos por ejecución: el servidor limita los pedidos sin pagar por cliente.
    playerUid: `7${String(RUN_PREFIX).padStart(3, '0')}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    customerName: 'Doble Clic',
    customerEmail: `doble-${RUN_PREFIX}-${randomUUID().slice(0, 8)}@example.com`,
    acceptTerms: true,
    termsVersion: config.json.termsVersion,
    items: [{ sku: product.sku, quantity: 1 }],
  };
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      c.req('POST', '/api/checkout', { body, label: 'POST doble envío' }),
    ),
  );
  const refs = new Set(results.map((r) => r.json?.order?.reference).filter(Boolean));
  check(
    'Doble envío simultáneo (10× el mismo pedido)',
    refs.size === 1 && results.filter((r) => r.status === 201).length === 1,
    `pedidos distintos=${refs.size} creados=${results.filter((r) => r.status === 201).length} estados=${[...new Set(results.map((r) => r.status))].join(',')}`,
  );
}

// ---------- dueño virtual (panel) ----------
const ownerStats = { nequiConfirmed: 0, delivered: 0, conflicts: 0 };
async function ownerLoop(until) {
  const owner = new Client('dueño');
  const session = await owner.req('POST', '/__e2e__/admin-session', { label: 'sesión dueño' });
  owner.cookies.set('tgs_session', session.json.token);
  const act = async (id, path, body, label) => {
    const r = await owner.req('POST', `/api/admin/orders/${id}/${path}`, { body, label });
    if (r.status === 409) ownerStats.conflicts += 1;
    else if (r.status !== 200) failures.push(`dueño ${label} ${r.status}`);
    return r.status === 200;
  };
  while (Date.now() < until) {
    const pending = await owner.req('GET', '/api/admin/orders?payment=nequi_pending', {
      label: 'GET panel Nequi por verificar',
    });
    for (const o of pending.json?.orders ?? []) {
      const nequiReference = `M${randomUUID().replaceAll('-', '').slice(0, 10)}`;
      if (
        await act(
          o.id,
          'nequi/confirm',
          { nequiReference, amountCop: o.totalCop },
          'POST confirmar Nequi',
        )
      )
        ownerStats.nequiConfirmed += 1;
    }
    const paid = await owner.req('GET', '/api/admin/orders?status=PAID', {
      label: 'GET panel pagados',
    });
    for (const o of (paid.json?.orders ?? []).slice(0, 10)) {
      if (!(await act(o.id, 'fulfillment', { action: 'claim' }, 'POST reclamar'))) continue;
      if (!(await act(o.id, 'fulfillment', { action: 'start' }, 'POST iniciar'))) continue;
      if (
        await act(
          o.id,
          'fulfillment',
          { action: 'deliver', evidence: 'Carga simulada' },
          'POST marcar ENVIADO',
        )
      )
        ownerStats.delivered += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

// ---------- ejecución ----------
const t0 = Date.now();
const mem = { inicio: rss() };
console.log(`Simulación contra ${BASE} · pico ${PEAK} clientes simultáneos\n`);
if (NEQUI_SHARE) {
  const on = await new Client('dueño').req('POST', '/__e2e__/nequi', {
    body: { enabled: true },
    label: 'activar Nequi (pruebas)',
  });
  if (on.status !== 200) throw new Error('el servidor de pruebas no activó Nequi');
}
const ownerDone = OWNER ? ownerLoop(Date.now() + 5_000 + 15_000 + 20_000 + 12_000) : undefined;
const phases = [];
for (const [label, conc, ms] of [
  ['calentamiento', 10, 5_000],
  ['carga media', Math.round(PEAK / 3), 15_000],
  ['carga alta', PEAK, 20_000],
]) {
  const started = Date.now();
  const n = await sustain(conc, ms);
  phases.push({
    fase: label,
    simultaneos: conc,
    compras: n,
    porSegundo: +(n / ((Date.now() - started) / 1000)).toFixed(1),
    rssMB: rss(),
  });
  console.log(`  ${label}: ${conc} simultáneos → ${n} recorridos de compra`);
}
mem.trasCarga = rss();
// Ataques con clientes comprando a la vez (carga media).
const legitDuringAttack = sustain(Math.round(PEAK / 3), 12_000);
await attacks();
await doubleSubmit();
const duringAttack = await legitDuringAttack;
phases.push({
  fase: 'clientes durante ataques',
  simultaneos: Math.round(PEAK / 3),
  compras: duringAttack,
  rssMB: rss(),
});
mem.final = rss();
await ownerDone;
// La hoja simulada: la «tarea programada» vacía la cola (una pasada cada 15 s, máximo --drain s).
const DRAIN_S = Number(args.get('drain') ?? 60);
const drainStarted = Date.now();
let sheet;
for (let i = 0; i < DRAIN_S / 15; i++) {
  if (i)
    await new Client('dueño').req('POST', '/__e2e__/run-notifications', {
      label: 'tarea: cola de avisos',
    });
  sheet = (await new Client('dueño').req('GET', '/__e2e__/sheet-stats', { label: 'estado hoja' }))
    .json;
  const busy = (sheet?.queue ?? []).some(
    (q) => q.status === 'PENDING' && q.channel.startsWith('sheets'),
  );
  if (!sheet?.writes || !busy) break;
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
if (sheet) sheet.drainSeconds = Math.round((Date.now() - drainStarted) / 1000);

// ---------- informe ----------
let server5xx = 0;
const rows = [];
for (const [label, s] of [...stats].sort()) {
  const five = Object.entries(s.status)
    .filter(([k]) => k.startsWith('5') || k === 'NETWORK')
    .reduce((a, [, v]) => a + v, 0);
  server5xx += five;
  rows.push({
    ruta: label,
    peticiones: s.n,
    estados: Object.entries(s.status)
      .map(([k, v]) => `${k}×${v}`)
      .join(' '),
    p50: pct(s.ms, 50),
    p95: pct(s.ms, 95),
    p99: pct(s.ms, 99),
  });
}
console.log('\nFases:');
console.table(phases);
console.log('Rutas (ms):');
console.table(rows);
console.log('Defensas:');
console.table(
  defenses.map((d) => ({ prueba: d.name, resultado: d.ok ? 'OK' : 'FALLA', detalle: d.detail })),
);
const total = [...stats.values()].reduce((a, s) => a + s.n, 0);
console.log(
  `Peticiones: ${total} en ${((Date.now() - t0) / 1000).toFixed(0)} s · errores 5xx/red: ${server5xx} · fallos de clientes: ${failures.length}`,
);
if (mem.inicio)
  console.log(
    `Memoria del servidor (MB): inicio ${mem.inicio} · tras carga ${mem.trasCarga} · final ${mem.final}`,
  );
if (OWNER) console.log('Dueño virtual:', ownerStats);
if (sheet?.writes) {
  console.log('Hoja simulada y cola de avisos:');
  console.log(JSON.stringify(sheet, null, 1));
}
if (failures.length) console.log('Primeros fallos:', [...new Set(failures)].slice(0, 10));
const ok = server5xx === 0 && failures.length === 0 && defenses.every((d) => d.ok);
console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: HAY PROBLEMAS');
process.exit(ok ? 0 : 1);

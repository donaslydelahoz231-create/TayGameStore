/*
 * TayGameStore · ENTORNO DE PRUEBA EN EL NAVEGADOR (solo vista previa).
 *
 * Nunca se sirve en producción: solo lo incluye `npm run build:preview` (dist/preview/).
 * Sustituye al servidor respondiendo en el propio navegador a las mismas rutas /api/* con las
 * mismas formas de respuesta y reglas principales (precios del catálogo, estados del pedido,
 * verificación del jugador, entrega por el operador). Los datos viven en localStorage de este
 * navegador. No hay dinero, cuentas ni proveedores reales:
 *   - el pago es una pasarela de PRUEBA propia (no es Mercado Pago; nada se cobra);
 *   - el acceso con Google/Discord/Facebook crea una sesión de prueba sin salir de la página;
 *   - la consulta de ID usa reglas fijas: 9… se encuentra, 8… no existe, otro → manual.
 */
(function () {
  'use strict';

  var KEY = 'tgs_preview_db_v1';
  var TERMS_VERSION = '2026-10-05';
  var VERIFY_TTL_MS = 12 * 3600 * 1000;
  var PAY_TTL_MS = 3600 * 1000;
  var LOOKUP_TTL_MS = 30 * 60 * 1000;
  var IS_ADMIN_PAGE = /admin\.html$/.test(location.pathname);

  var SEED_PRODUCTS = [
    ['ff-110', '100 + 10 Diamantes', '110 diamantes totales', '+10% Extra', 110, 4000, 3800],
    ['ff-341', '310 + 31 Diamantes', '341 diamantes totales', 'Popular', 341, 11000, 10500],
    ['ff-572', '520 + 52 Diamantes', '572 diamantes totales', 'Top ventas', 572, 18000, 17000],
    [
      'ff-1166',
      '1.060 + 106 Diamantes',
      '1.166 diamantes totales',
      '+10% Extra',
      1166,
      33000,
      31000,
    ],
    ['ff-2398', '2.180 + 218 Diamantes', '2.398 diamantes totales', 'Ahorro', 2398, 65000, 60000],
    ['ff-6160', '5.600 + 560 Diamantes', '6.160 diamantes totales', 'Elite', 6160, 150000, 138000],
  ];

  // ── Utilidades ──
  function now() {
    return new Date().toISOString();
  }
  function uuid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  function randomChars(alphabet, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }
  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // ── Base de datos local ──
  var memory = null;
  function freshDb() {
    return {
      products: SEED_PRODUCTS.map(function (p, i) {
        return {
          id: uuid(),
          sku: p[0],
          game: 'freefire',
          name: p[1],
          description: p[2],
          tag: p[3],
          units: p[4],
          priceCop: p[5],
          promoPriceCop: p[6],
          promoEndsAt: null,
          active: true,
          sortOrder: i + 1,
          createdAt: now(),
          updatedAt: now(),
        };
      }),
      orders: [],
      lookups: {},
      checkoutKeys: {},
      session: null,
      blocks: [],
      audit: [],
      auditSeq: 0,
    };
  }
  // Se relee en cada petición: la tienda y el panel (otra pestaña) comparten los datos.
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      memory = raw ? JSON.parse(raw) : memory || freshDb();
    } catch (e) {
      memory = memory || freshDb();
    }
    return memory;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(memory));
    } catch (e) {
      /* sin almacenamiento: los datos viven solo en esta pestaña */
    }
  }
  function audit(db, entityType, entityId, action, fromStatus, toStatus, actorType, data) {
    db.auditSeq += 1;
    db.audit.unshift({
      id: db.auditSeq,
      entityType: entityType,
      entityId: entityId,
      action: action,
      fromStatus: fromStatus || null,
      toStatus: toStatus || null,
      actorType: actorType,
      actorId: null,
      data: data || {},
      createdAt: now(),
    });
    db.audit = db.audit.slice(0, 300);
  }
  function transition(db, order, to, actor, data) {
    var from = order.status;
    order.status = to;
    audit(db, 'order', order.id, 'order.transition', from, to, actor, data);
  }

  // ── Respuestas ──
  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status: status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  function fail(status, code, message) {
    return json(status, { error: { code: code, message: message, requestId: uuid() } });
  }

  // ── Catálogo ──
  function promoActive(p) {
    return (
      p.promoPriceCop !== null &&
      p.promoPriceCop !== undefined &&
      (!p.promoEndsAt || new Date(p.promoEndsAt).getTime() > Date.now())
    );
  }
  function unitPrice(p) {
    return promoActive(p) ? p.promoPriceCop : p.priceCop;
  }
  function publicProduct(p) {
    return {
      sku: p.sku,
      name: p.name,
      description: p.description,
      tag: p.tag,
      units: p.units,
      listPriceCop: p.priceCop,
      priceCop: unitPrice(p),
      promoEndsAt: promoActive(p) ? p.promoEndsAt : null,
    };
  }
  function activeProducts(db) {
    return db.products
      .filter(function (p) {
        return p.active;
      })
      .sort(function (a, b) {
        return a.sortOrder - b.sortOrder;
      });
  }

  // ── Pedidos ──
  function publicOrder(o) {
    return {
      reference: o.reference,
      status: o.status,
      createdAt: o.createdAt,
      expiresAt: o.expiresAt,
      game: o.game,
      playerUid: o.playerUid,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      items: clone(o.items),
      subtotalCop: o.subtotalCop,
      discountCop: o.discountCop,
      totalCop: o.totalCop,
      currency: 'COP',
      termsVersion: o.termsVersion,
      receiptCode: o.receiptCode,
      verification: {
        status: o.verification.status,
        nickname: o.verification.nickname,
        region: o.verification.region,
      },
      payment: {
        status: o.payment.status,
        canPay: o.status === 'AWAITING_PAYMENT',
        checkoutAvailable: true,
      },
      fulfillment: {
        status: o.fulfillment ? o.fulfillment.status : null,
        deliveredAt: o.fulfillment ? o.fulfillment.deliveredAt : null,
      },
    };
  }
  function expireOld(db) {
    db.orders.forEach(function (o) {
      var open = o.status === 'AWAITING_VERIFICATION' || o.status === 'AWAITING_PAYMENT';
      if (open && new Date(o.expiresAt).getTime() <= Date.now())
        transition(db, o, 'EXPIRED', 'system');
    });
  }
  function findOrder(db, ref) {
    for (var i = 0; i < db.orders.length; i++)
      if (db.orders[i].reference === ref) return db.orders[i];
    return null;
  }
  function blockedBy(db, kind, value) {
    return db.blocks.some(function (b) {
      var active = !b.expiresAt || new Date(b.expiresAt).getTime() > Date.now();
      return active && b.kind === kind && b.value === value;
    });
  }

  function checkout(db, body) {
    if (!body || body.acceptTerms !== true)
      return fail(400, 'VALIDATION_ERROR', 'Debes aceptar los términos.');
    if (!/^\d{6,12}$/.test(String(body.playerUid || '')))
      return fail(400, 'VALIDATION_ERROR', 'El UID debe contener entre 6 y 12 dígitos.');
    var email = String(body.customerEmail || '')
      .trim()
      .toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return fail(400, 'VALIDATION_ERROR', 'Revisa el correo del pedido.');
    var name = String(body.customerName || '').trim();
    if (name.length < 2)
      return fail(400, 'VALIDATION_ERROR', 'Escribe tu nombre (mínimo 2 letras).');
    if (blockedBy(db, 'email', email) || blockedBy(db, 'uid', body.playerUid))
      return fail(403, 'BLOCKED', 'No podemos procesar este pedido. Escríbenos a soporte.');
    if (body.checkoutKey && db.checkoutKeys[body.checkoutKey]) {
      var existing = findOrder(db, db.checkoutKeys[body.checkoutKey]);
      if (existing) return json(200, { order: publicOrder(existing), created: false });
    }
    var items = [];
    var subtotal = 0;
    var total = 0;
    var list = Array.isArray(body.items) ? body.items : [];
    if (!list.length) return fail(400, 'VALIDATION_ERROR', 'El carrito está vacío.');
    for (var i = 0; i < list.length; i++) {
      var p = activeProducts(db).find(function (x) {
        return x.sku === list[i].sku;
      });
      var qty = Number(list[i].quantity);
      if (!p) return fail(409, 'PRODUCT_UNAVAILABLE', 'Un paquete ya no está disponible.');
      if (!(qty >= 1 && qty <= 5))
        return fail(400, 'VALIDATION_ERROR', 'Máximo 5 unidades por paquete.');
      var unit = unitPrice(p);
      items.push({
        sku: p.sku,
        name: p.name,
        quantity: qty,
        listPriceCop: p.priceCop,
        unitPriceCop: unit,
        lineTotalCop: unit * qty,
      });
      subtotal += p.priceCop * qty;
      total += unit * qty;
    }
    if (
      body.expectedTotalCop !== null &&
      body.expectedTotalCop !== undefined &&
      Number(body.expectedTotalCop) !== total
    )
      return fail(
        409,
        'PRICE_CHANGED',
        'Los precios cambiaron. Revisa el total y vuelve a intentarlo.',
      );

    var lookup = body.playerLookup ? db.lookups[body.playerLookup.ref] : null;
    var lookupOk =
      lookup &&
      lookup.uid === body.playerUid &&
      lookup.nickname === body.playerLookup.nickname &&
      new Date(lookup.expiresAt).getTime() > Date.now();
    var created = now();
    var order = {
      id: uuid(),
      reference: 'TGS-' + randomChars('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 10),
      status: lookupOk ? 'AWAITING_PAYMENT' : 'AWAITING_VERIFICATION',
      createdAt: created,
      expiresAt: new Date(Date.now() + (lookupOk ? PAY_TTL_MS : VERIFY_TTL_MS)).toISOString(),
      game: 'freefire',
      playerUid: body.playerUid,
      customerName: name,
      customerEmail: email,
      items: items,
      subtotalCop: subtotal,
      discountCop: subtotal - total,
      totalCop: total,
      termsVersion: TERMS_VERSION,
      receiptCode: randomChars('0123456789', 8),
      verification: lookupOk
        ? {
            status: 'CONFIRMED',
            nickname: lookup.nickname,
            region: lookup.region,
            note: 'proveedor:prueba',
            verifiedAt: created,
            confirmedAt: created,
          }
        : {
            status: 'PENDING',
            nickname: null,
            region: null,
            note: null,
            verifiedAt: null,
            confirmedAt: null,
          },
      payment: { status: null, id: null, approvedAt: null },
      attempts: [],
      fulfillment: null,
      owner: db.session ? db.session.email : 'invitado',
    };
    db.orders.unshift(order);
    if (body.checkoutKey) db.checkoutKeys[body.checkoutKey] = order.reference;
    audit(db, 'order', order.id, 'order.created', null, order.status, 'customer', {
      totalCop: total,
    });
    return json(201, { order: publicOrder(order), accessToken: uuid(), created: true });
  }

  // ── Pasarela de pago de PRUEBA (no es Mercado Pago) ──
  function settlePayment(ref, approved) {
    var db = load();
    var o = findOrder(db, ref);
    if (!o || o.status !== 'AWAITING_PAYMENT') return;
    var attempt = o.attempts[o.attempts.length - 1];
    if (attempt) attempt.status = 'CLOSED';
    if (approved) {
      o.payment = { status: 'APPROVED', id: uuid(), approvedAt: now() };
      audit(db, 'payment', o.payment.id, 'payment.synced', null, 'APPROVED', 'webhook', {
        orderId: o.id,
        liveMode: false,
      });
      transition(db, o, 'PAID', 'webhook');
      o.fulfillment = {
        id: uuid(),
        orderId: o.id,
        mode: 'manual',
        status: 'READY_FOR_FULFILLMENT',
        claimedBy: null,
        claimedAt: null,
        startedAt: null,
        deliveredAt: null,
        deliveredBy: null,
        evidence: null,
        failureReason: null,
        createdAt: now(),
        updatedAt: now(),
      };
      audit(
        db,
        'fulfillment',
        o.fulfillment.id,
        'fulfillment.ready',
        null,
        'READY_FOR_FULFILLMENT',
        'webhook',
      );
    } else {
      o.payment = { status: 'REJECTED', id: uuid(), approvedAt: null };
      audit(db, 'payment', o.payment.id, 'payment.synced', null, 'REJECTED', 'webhook', {
        orderId: o.id,
      });
    }
    save();
  }

  function openTestGateway(order) {
    var old = document.getElementById('tgsPreviewPay');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'tgsPreviewPay';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'tgsPreviewPayTitle');
    box.innerHTML =
      '<div class="tgsp-card">' +
      '<div class="tgsp-eyebrow">PASARELA DE PRUEBA · SIN COBRO</div>' +
      '<h2 id="tgsPreviewPayTitle">Simular el resultado del pago</h2>' +
      '<p>En tu tienda real este paso abre <b>Mercado Pago</b> y es Mercado Pago quien confirma el pago al servidor. ' +
      'Esto <b>no es Mercado Pago</b>: es una prueba local y no se cobra nada.</p>' +
      '<div class="tgsp-sum"><span>Pedido</span><b>' +
      order.reference +
      '</b><span>Total</span><b>$ ' +
      order.totalCop.toLocaleString('es-CO') +
      ' COP</b></div>' +
      '<div class="tgsp-actions"><button type="button" data-r="ok">Aprobar pago de prueba</button>' +
      '<button type="button" data-r="no" class="ghost">Rechazar</button></div></div>';
    document.body.appendChild(box);
    var finish = function (approved) {
      settlePayment(order.reference, approved);
      box.remove();
      history.replaceState(null, '', location.pathname + location.search + '#seguimiento');
      var close = document.querySelector('[data-close="paymentModal"]');
      if (close) close.click();
      var start = document.getElementById('startPayment');
      if (start) {
        start.disabled = false;
        start.textContent = 'Confirmar y pagar';
      }
      var refresh = document.getElementById('refreshOrderBtn');
      if (refresh) refresh.click();
      var tracking = document.getElementById('seguimiento');
      if (tracking) tracking.scrollIntoView({ behavior: 'smooth' });
    };
    box.querySelector('[data-r="ok"]').onclick = function () {
      finish(true);
    };
    box.querySelector('[data-r="no"]').onclick = function () {
      finish(false);
    };
    box.querySelector('[data-r="ok"]').focus();
  }

  // ── Administración ──
  function adminDetail(db, o) {
    return {
      id: o.id,
      order: publicOrder(o),
      verification: clone(o.verification),
      payments: o.payment.id
        ? [
            {
              id: o.payment.id,
              providerPaymentId: 'prueba-' + o.payment.id.slice(0, 8),
              status: o.payment.status,
              providerStatus: o.payment.status === 'APPROVED' ? 'approved' : 'rejected',
              providerStatusDetail:
                o.payment.status === 'APPROVED' ? 'accredited' : 'cc_rejected_other_reason',
              amountCop: o.totalCop,
              currency: 'COP',
              amountMatches: true,
              isOrderPayment: o.payment.status === 'APPROVED',
              approvedAt: o.payment.approvedAt,
              lastSyncedAt: now(),
            },
          ]
        : [],
      attempts: clone(o.attempts),
      fulfillment: o.fulfillment ? clone(o.fulfillment) : null,
      history: db.audit.filter(function (e) {
        return e.entityId === o.id || (e.data && e.data.orderId === o.id);
      }),
    };
  }
  function findById(db, id) {
    return db.orders.find(function (o) {
      return o.id === id;
    });
  }
  function adminVerification(db, o, body) {
    if (o.status !== 'AWAITING_VERIFICATION')
      return fail(409, 'INVALID_STATE', 'El pedido ya no espera verificación.');
    if (body.result === 'VERIFIED') {
      if (!body.nickname || !body.region)
        return fail(400, 'VALIDATION_ERROR', 'Escribe nickname y región.');
      o.verification = {
        status: 'VERIFIED',
        nickname: body.nickname,
        region: body.region,
        note: body.note || null,
        verifiedAt: now(),
        confirmedAt: null,
      };
      audit(db, 'order', o.id, 'verification', 'PENDING', 'VERIFIED', 'admin');
    } else {
      o.verification.status = body.result;
      o.verification.note = body.note || null;
      transition(db, o, 'REJECTED', 'admin', { verification: body.result });
    }
    return null;
  }
  function adminFulfillment(db, o, body) {
    var f = o.fulfillment;
    if (!f) return fail(409, 'INVALID_STATE', 'Este pedido aún no está pagado.');
    var from = f.status;
    var to;
    if (body.action === 'claim' && from === 'READY_FOR_FULFILLMENT') {
      to = 'CLAIMED';
      f.claimedAt = now();
      f.claimedBy = 'operador';
    } else if (body.action === 'release' && from === 'CLAIMED') {
      to = 'READY_FOR_FULFILLMENT';
      f.claimedAt = null;
      f.claimedBy = null;
    } else if (body.action === 'start' && from === 'CLAIMED') {
      to = 'DELIVERING';
      f.startedAt = now();
      if (o.status === 'PAID') transition(db, o, 'DELIVERING', 'admin');
    } else if (body.action === 'deliver' && from === 'DELIVERING') {
      if (!body.evidence || body.evidence.length < 3)
        return fail(400, 'VALIDATION_ERROR', 'Escribe la evidencia de la entrega.');
      to = 'DELIVERED';
      f.deliveredAt = now();
      f.deliveredBy = 'operador';
      f.evidence = body.evidence;
      transition(db, o, 'DELIVERED', 'admin');
    } else if (body.action === 'fail' && from === 'DELIVERING') {
      if (!body.reason || body.reason.length < 3)
        return fail(400, 'VALIDATION_ERROR', 'Escribe el motivo del fallo.');
      to = 'FAILED';
      f.failureReason = body.reason;
      transition(db, o, 'NEEDS_REVIEW', 'admin', { reason: 'fulfillment_failed' });
    } else {
      return fail(409, 'INVALID_STATE', 'Esa acción no corresponde al estado de la entrega.');
    }
    f.status = to;
    f.updatedAt = now();
    audit(db, 'fulfillment', f.id, 'fulfillment.' + body.action, from, to, 'admin');
    return null;
  }

  // ── Enrutador ──
  function route(method, url, body) {
    var db = load();
    expireOld(db);
    var path = url.pathname;
    var m;
    var session = db.session;

    if (path === '/api/config' && method === 'GET')
      return json(200, {
        maintenanceMode: false,
        checkoutEnabled: true,
        paymentsEnabled: true,
        paymentsMode: 'sandbox',
        paymentMethod: 'mercadopago',
        auth: { google: true, discord: true, facebook: true },
        playerLookup: true,
        support: { whatsapp: null, email: 'soporte@example.com' },
        termsVersion: TERMS_VERSION,
        limits: { maxUnitsPerProduct: 5, maxOrderTotalCop: 1000000 },
      });
    if (path === '/api/catalog' && method === 'GET')
      return json(200, { game: 'freefire', products: activeProducts(db).map(publicProduct) });
    if (path === '/api/auth/me' && method === 'GET') {
      if (!session) return json(200, { authenticated: false });
      return json(200, {
        authenticated: true,
        user: { name: session.name, email: session.email },
        linked: session.linked,
        admin: session.admin ? { mfaEnabled: true, mfaVerified: true } : null,
      });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      db.session = null;
      save();
      return json(200, { ok: true });
    }
    if (path === '/api/player/lookup' && method === 'POST') {
      var uid = String((body && body.uid) || '');
      if (!/^\d{6,12}$/.test(uid))
        return fail(400, 'VALIDATION_ERROR', 'El UID debe contener entre 6 y 12 dígitos.');
      if (uid[0] === '8')
        return fail(422, 'PLAYER_NOT_FOUND', 'No encontramos ese ID de jugador. Revísalo.');
      if (uid[0] !== '9')
        return fail(
          503,
          'PLAYER_LOOKUP_UNAVAILABLE',
          'No pudimos consultar el ID ahora. Nuestro equipo lo verificará al crear tu pedido.',
        );
      var ref = uuid();
      db.lookups[ref] = {
        uid: uid,
        nickname: 'Jugador' + uid.slice(-4),
        region: 'Colombia',
        expiresAt: new Date(Date.now() + LOOKUP_TTL_MS).toISOString(),
      };
      save();
      return json(200, {
        lookupRef: ref,
        nickname: db.lookups[ref].nickname,
        region: 'Colombia',
        expiresAt: db.lookups[ref].expiresAt,
      });
    }
    if (path === '/api/checkout' && method === 'POST') {
      var res = checkout(db, body);
      save();
      return res;
    }
    if (path === '/api/orders' && method === 'GET') {
      var owner = session ? session.email : 'invitado';
      return json(200, {
        orders: db.orders
          .filter(function (o) {
            return o.owner === owner || owner === 'invitado';
          })
          .map(publicOrder),
      });
    }
    if ((m = path.match(/^\/api\/orders\/(TGS-[0-9A-Z]{10})(\/[a-z-]+)?$/))) {
      var order = findOrder(db, m[1]);
      if (!order) return fail(404, 'NOT_FOUND', 'No encontramos ese pedido.');
      var action = m[2];
      if (!action && method === 'GET') return json(200, { order: publicOrder(order) });
      if (action === '/sync' && method === 'POST') return json(200, { order: publicOrder(order) });
      if (action === '/confirm-player' && method === 'POST') {
        if (order.status !== 'AWAITING_VERIFICATION' || order.verification.status !== 'VERIFIED')
          return fail(409, 'INVALID_STATE', 'El jugador aún no está verificado.');
        if (body && body.confirm) {
          order.verification.status = 'CONFIRMED';
          order.verification.confirmedAt = now();
          order.expiresAt = new Date(Date.now() + PAY_TTL_MS).toISOString();
          transition(db, order, 'AWAITING_PAYMENT', 'customer');
        } else {
          order.verification.status = 'REJECTED_BY_CUSTOMER';
          transition(db, order, 'REJECTED', 'customer');
        }
        save();
        return json(200, { order: publicOrder(order) });
      }
      if (action === '/pay' && method === 'POST') {
        if (order.status !== 'AWAITING_PAYMENT')
          return fail(409, 'INVALID_STATE', 'Este pedido no está pendiente de pago.');
        order.attempts.push({
          id: uuid(),
          status: 'OPEN',
          preferenceId: 'prueba-' + order.attempts.length,
          createdAt: now(),
          expiresAt: order.expiresAt,
        });
        audit(db, 'payment_attempt', order.id, 'payment_attempt.opened', null, 'OPEN', 'customer');
        save();
        var snapshot = publicOrder(order);
        setTimeout(function () {
          openTestGateway(snapshot);
        }, 0);
        return json(200, {
          checkoutUrl: location.origin + location.pathname + location.search + '#pago-prueba',
        });
      }
    }

    // Panel de administración (sesión de prueba con verificación en dos pasos ya hecha).
    if (path.indexOf('/api/admin/') === 0) {
      if (!session || !session.admin)
        return fail(401, 'UNAUTHORIZED', 'Inicia sesión como administrador.');
      if (path === '/api/admin/alerts') {
        var count = function (fn) {
          return db.orders.filter(fn).length;
        };
        return json(200, {
          needsReview: count(function (o) {
            return o.status === 'NEEDS_REVIEW';
          }),
          needsRefund: 0,
          paidWithoutDelivery: count(function (o) {
            return (
              o.status === 'PAID' &&
              Date.now() - new Date(o.payment.approvedAt).getTime() > 30 * 60000
            );
          }),
          paymentsPendingTooLong: 0,
          awaitingVerification: count(function (o) {
            return o.status === 'AWAITING_VERIFICATION' && o.verification.status === 'PENDING';
          }),
          invalidWebhooks24h: 0,
          autoBlocks24h: 0,
          mfaLocks24h: 0,
          activeIpBlocks: 0,
        });
      }
      if (path === '/api/admin/orders' && method === 'GET') {
        var status = url.searchParams.get('status');
        var q = (url.searchParams.get('q') || '').toLowerCase();
        return json(200, {
          orders: db.orders
            .filter(function (o) {
              return (
                (!status || o.status === status) &&
                (!q ||
                  (o.reference + ' ' + o.playerUid + ' ' + o.customerEmail)
                    .toLowerCase()
                    .indexOf(q) >= 0)
              );
            })
            .map(function (o) {
              return {
                id: o.id,
                reference: o.reference,
                status: o.status,
                verificationStatus: o.verification.status,
                playerUid: o.playerUid,
                customerEmail: o.customerEmail,
                totalCop: o.totalCop,
                createdAt: o.createdAt,
                expiresAt: o.expiresAt,
              };
            }),
        });
      }
      if ((m = path.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})(\/[a-z]+)?$/))) {
        var target = findById(db, m[1]);
        if (!target) return fail(404, 'NOT_FOUND', 'No encontramos ese pedido.');
        var problem = null;
        if (m[2] === '/verification') problem = adminVerification(db, target, body || {});
        else if (m[2] === '/fulfillment') problem = adminFulfillment(db, target, body || {});
        else if (m[2] === '/review') {
          if (target.status !== 'NEEDS_REVIEW')
            problem = fail(409, 'INVALID_STATE', 'La orden no está en revisión.');
          else if (body && body.resolution === 'resume_fulfillment') {
            transition(db, target, 'PAID', 'admin', { note: body.note });
            if (target.fulfillment) target.fulfillment.status = 'READY_FOR_FULFILLMENT';
          } else transition(db, target, 'REJECTED', 'admin', { note: body && body.note });
        }
        if (problem) return problem;
        save();
        return json(200, adminDetail(db, target));
      }
      if (path === '/api/admin/products' && method === 'GET')
        return json(200, { products: clone(db.products) });
      if (
        (path === '/api/admin/products' && method === 'POST') ||
        (m = path.match(/^\/api\/admin\/products\/([0-9a-f-]{36})$/))
      ) {
        var input = body || {};
        if (!input.sku || !input.name || !(input.priceCop > 0))
          return fail(400, 'VALIDATION_ERROR', 'Completa SKU, nombre y precio.');
        var product =
          method === 'POST'
            ? { id: uuid(), createdAt: now() }
            : db.products.find(function (p) {
                return p.id === m[1];
              });
        if (!product) return fail(404, 'NOT_FOUND', 'Producto no encontrado.');
        [
          'sku',
          'game',
          'name',
          'description',
          'tag',
          'units',
          'priceCop',
          'promoPriceCop',
          'promoEndsAt',
          'active',
          'sortOrder',
        ].forEach(function (k) {
          product[k] = input[k];
        });
        product.updatedAt = now();
        if (method === 'POST') db.products.push(product);
        audit(
          db,
          'product',
          product.id,
          method === 'POST' ? 'product.created' : 'product.updated',
          null,
          null,
          'admin',
          { sku: product.sku },
        );
        save();
        return json(method === 'POST' ? 201 : 200, { product: clone(product) });
      }
      if (path === '/api/admin/blocklist' && method === 'GET')
        return json(200, { entries: clone(db.blocks) });
      if (path === '/api/admin/blocklist' && method === 'POST') {
        var entry = {
          id: uuid(),
          kind: body.kind,
          value: body.kind === 'email' ? String(body.value).toLowerCase() : body.value,
          reason: body.reason,
          createdAt: now(),
          expiresAt: null,
        };
        db.blocks.unshift(entry);
        audit(db, 'blocklist', entry.id, 'blocklist.added', null, null, 'admin', {
          kind: entry.kind,
        });
        save();
        return json(201, { entry: entry });
      }
      if ((m = path.match(/^\/api\/admin\/blocklist\/([0-9a-f-]{36})$/)) && method === 'DELETE') {
        db.blocks = db.blocks.filter(function (b) {
          return b.id !== m[1];
        });
        save();
        return json(200, { ok: true });
      }
      if (path === '/api/admin/audit') return json(200, { events: db.audit.slice(0, 100) });
    }
    return fail(404, 'NOT_FOUND', 'Ruta no disponible en el entorno de prueba.');
  }

  // ── Intercepción de fetch (solo rutas de la propia API) ──
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var raw = typeof input === 'string' ? input : input && input.url;
    var url;
    try {
      url = new URL(raw, location.href);
    } catch (e) {
      url = null;
    }
    if (!url || url.origin !== location.origin || url.pathname.indexOf('/api/') !== 0)
      return realFetch ? realFetch(input, init) : Promise.reject(new TypeError('fetch'));
    var method = ((init && init.method) || 'GET').toUpperCase();
    var body;
    try {
      body = init && init.body ? JSON.parse(init.body) : undefined;
    } catch (e) {
      return Promise.resolve(fail(400, 'VALIDATION_ERROR', 'Cuerpo inválido.'));
    }
    // Una pequeña espera para que la interfaz muestre sus estados de carga como en el servidor.
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(route(method, url, body));
      }, 120);
    });
  };

  // ── Acceso con Google / Discord / Facebook: sesión de prueba sin salir de la página ──
  var NAMES = { google: 'Cliente Google', discord: 'Gamer Discord', facebook: 'Gamer Facebook' };
  document.addEventListener(
    'click',
    function (event) {
      var link = event.target instanceof Element ? event.target.closest('a[href^="/auth/"]') : null;
      if (!link) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (link.getAttribute('aria-disabled') === 'true') return;
      var u = new URL(link.getAttribute('href'), location.href);
      var provider = u.pathname.split('/')[2];
      var db = load();
      if (u.searchParams.get('vincular') && db.session) {
        if (db.session.linked.indexOf(provider) < 0) db.session.linked.push(provider);
      } else if (IS_ADMIN_PAGE) {
        db.session = {
          name: 'propietario@example.com',
          email: 'propietario@example.com',
          linked: ['google'],
          admin: true,
        };
      } else {
        db.session = {
          name: NAMES[provider] || 'Cliente',
          email: provider + '.prueba@example.com',
          linked: [provider],
          admin: false,
        };
      }
      save();
      location.reload();
    },
    true,
  );

  // ── Aviso permanente de entorno de prueba ──
  var STYLE =
    '#tgsPreviewBadge{position:fixed;left:12px;bottom:12px;z-index:2147483000;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 96px);padding:8px 10px;border:1px solid #ffb52e;border-radius:12px;background:#140f02ee;color:#ffe2a6;font:700 12px/1.3 system-ui,sans-serif;box-shadow:0 10px 28px #0008}' +
    '#tgsPreviewBadge button,#tgsPreviewBadge a{font:inherit;color:#140f02;background:#ffb52e;border:0;border-radius:8px;padding:5px 8px;cursor:pointer;text-decoration:none;white-space:nowrap}' +
    '#tgsPreviewBadge .tgsp-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#tgsPreviewHelp,#tgsPreviewPay{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;padding:16px;background:#03050fcc}' +
    '.tgsp-card{width:min(520px,100%);max-height:90vh;overflow:auto;padding:20px;border:1px solid #ffb52e;border-radius:16px;background:#0b1233;color:#eef1ff;font:400 14px/1.5 system-ui,sans-serif}' +
    '.tgsp-card h2{margin:6px 0 10px;font:800 20px/1.2 system-ui,sans-serif}.tgsp-card ul{padding-left:18px;margin:8px 0}.tgsp-card li+li{margin-top:5px}' +
    '.tgsp-eyebrow{color:#ffb52e;font:800 11px system-ui,sans-serif;letter-spacing:.12em}' +
    '.tgsp-sum{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:12px 0;padding:10px;border:1px solid #26305f;border-radius:10px}.tgsp-sum b{text-align:right}' +
    '.tgsp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.tgsp-actions button{flex:1;min-width:150px;padding:11px;border:0;border-radius:10px;background:#3fbf8f;color:#03170b;font:800 14px system-ui,sans-serif;cursor:pointer}' +
    '.tgsp-actions button.ghost{background:transparent;color:#ff9fb0;border:1px solid #ff6b81}.tgsp-card code{color:#37d6ff}';
  function help() {
    var box = document.createElement('div');
    box.id = 'tgsPreviewHelp';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML =
      '<div class="tgsp-card"><div class="tgsp-eyebrow">ENTORNO DE PRUEBA</div><h2>Cómo probar tu tienda</h2>' +
      '<p>Es tu tienda real (misma interfaz y mismas reglas de pedido), funcionando dentro de tu navegador. No hay servidor, dinero ni cuentas reales; los datos se guardan solo en este navegador.</p>' +
      '<ul><li>ID de jugador que empieza por <code>9</code>: aparece nickname y región. Por <code>8</code>: "no existe". Otro: verificación manual por el equipo.</li>' +
      '<li>El pago abre una <b>pasarela de prueba</b> (no es Mercado Pago): eliges aprobar o rechazar.</li>' +
      '<li>Google, Discord y Facebook crean una sesión de prueba al instante.</li>' +
      '<li>En el <b>Panel</b> haces de operador: verificas jugadores y marcas entregas. El cliente lo ve con "Actualizar estado".</li></ul>' +
      '<div class="tgsp-actions"><button type="button" data-a="close">Entendido</button><button type="button" data-a="reset" class="ghost">Borrar datos de prueba</button></div></div>';
    document.body.appendChild(box);
    box.querySelector('[data-a="close"]').onclick = function () {
      box.remove();
    };
    box.querySelector('[data-a="reset"]').onclick = function () {
      memory = freshDb();
      save();
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('tgs_') === 0 && k !== KEY) localStorage.removeItem(k);
        });
        sessionStorage.clear();
      } catch (e) {
        /* nada que borrar */
      }
      location.reload();
    };
    box.querySelector('[data-a="close"]').focus();
  }
  function badge() {
    var style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    var el = document.createElement('div');
    el.id = 'tgsPreviewBadge';
    el.setAttribute('role', 'note');
    el.innerHTML =
      '<span class="tgsp-txt">ENTORNO DE PRUEBA · nada se cobra</span>' +
      '<button type="button" id="tgsPreviewHelpBtn">Cómo probar</button>' +
      (IS_ADMIN_PAGE ? '<a href="index.html">Tienda</a>' : '<a href="admin.html">Panel</a>');
    document.body.appendChild(el);
    document.getElementById('tgsPreviewHelpBtn').onclick = help;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', badge);
  else badge();
})();

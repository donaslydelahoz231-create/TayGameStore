import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { actorOf, ensureGuest, requireDeps } from '../../http/context.js';
import { assertCheckoutEnabled } from '../../plugins/maintenance.js';
import { RATE_LIMITS } from '../../plugins/security.js';
import { listCatalog } from '../../services/catalog.js';
import type { ServiceDeps } from '../../services/context.js';
import {
  checkoutSchema,
  confirmPlayer,
  confirmPlayerSchema,
  createOrder,
  listOrdersForOwner,
  loadOrderForAccess,
  pinsForOrder,
  toPublicOrder,
  type OrderAccess,
} from '../../services/orders.js';
import { startPayment, syncOrderFromReturn } from '../../services/payments.js';
import {
  chooseNequiManual,
  reportNequiSchema,
  reportNequiTransfer,
} from '../../services/nequi-manual.js';
import { changePaymentMethod, changePaymentMethodSchema } from '../../services/order-payment.js';
import { AppError } from '../../plugins/errors.js';
import { lookupPlayer, lookupSchema, ownerKeyOf } from '../../services/player.js';
import { publicVerifySchema, verifyReceiptPublic } from '../../services/receipts.js';
import {
  createReview,
  publicReviews,
  reviewForOrder,
  reviewSchema,
} from '../../services/reviews.js';
import {
  ensureProfile,
  renameProfile,
  renameProfileSchema,
  type ProfileOwner,
} from '../../services/profiles.js';
import { isAllowlistedAdmin } from '../../services/auth.js';
import type { PlayerVerifier } from '../../integrations/player/verifier.js';
import { MP_PAY_MEANS } from '../../integrations/payments/gateway.js';

export interface ShopRoutesOptions {
  deps: ServiceDeps | undefined;
  playerVerifier?: PlayerVerifier | undefined;
}

const refParams = z.object({ ref: z.string().regex(/^TGS-[0-9A-Z]{10}$/) });
const payBody = z.object({ payMeans: z.enum(MP_PAY_MEANS).optional() });
const ORDER_TOKEN_HEADER = 'x-order-token';

function accessOf(request: FastifyRequest): OrderAccess {
  const token = request.headers[ORDER_TOKEN_HEADER];
  return {
    userId: request.auth.user?.id,
    guestHash: request.auth.guestHash,
    token: typeof token === 'string' && token.length <= 100 ? token : undefined,
  };
}

/** Dueño del nombre de usuario: la cuenta con sesión o, sin sesión, el navegador invitado. */
function profileOwner(
  deps: ServiceDeps,
  request: FastifyRequest,
  reply: FastifyReply,
): ProfileOwner {
  const user = request.auth.user;
  return {
    userId: user?.id,
    guestHash: user ? undefined : ensureGuest(deps.config, request, reply),
    ipHash: request.auth.ipHash,
    isStoreOwner: user?.role === 'admin' && isAllowlistedAdmin(deps, user.email),
  };
}

/** Catálogo, checkout y órdenes del cliente (invitado o con sesión). */
export const shopRoutes: FastifyPluginAsync<ShopRoutesOptions> = async (app, options) => {
  app.get(
    '/api/catalog',
    { config: { rateLimit: RATE_LIMITS.catalog } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { game } = z
        .object({ game: z.literal('freefire').default('freefire') })
        .parse(request.query);
      reply.header('cache-control', 'no-store');
      return { game, products: await listCatalog(deps, game) };
    },
  );

  /** Reseñas publicadas (solo de pedidos entregados y aprobadas por el dueño). */
  app.get(
    '/api/reviews',
    { config: { rateLimit: RATE_LIMITS.catalog } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { game } = z
        .object({ game: z.literal('freefire').default('freefire') })
        .parse(request.query);
      reply.header('cache-control', 'public, max-age=60');
      return publicReviews(deps, game);
    },
  );

  /**
   * ¿Este comprobante es real? Cualquiera puede comprobarlo con la referencia y el código impresos
   * en él; un comprobante falso o alterado responde «no auténtico» sin revelar nada más.
   */
  app.post(
    '/api/receipts/verify',
    { config: { rateLimit: RATE_LIMITS.receiptVerify } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const input = publicVerifySchema.parse(request.body);
      reply.header('cache-control', 'no-store');
      return verifyReceiptPublic(deps, input);
    },
  );

  // Nombre de usuario del cliente (invitado o con cuenta): si no tiene, se crea uno al azar.
  app.post(
    '/api/profile',
    { config: { rateLimit: RATE_LIMITS.profile } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { profile } = await ensureProfile(deps, profileOwner(deps, request, reply));
      reply.header('cache-control', 'no-store');
      return { profile };
    },
  );

  app.patch(
    '/api/profile',
    { config: { rateLimit: RATE_LIMITS.profileWrite } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const input = renameProfileSchema.parse(request.body);
      const profile = await renameProfile(deps, profileOwner(deps, request, reply), input);
      reply.header('cache-control', 'no-store');
      return { profile };
    },
  );

  // Consulta UID → nickname/región antes de comprar. Solo con un proveedor autorizado
  // configurado; si no hay, responde 503 y el pedido sigue el flujo de verificación manual.
  app.post(
    '/api/player/lookup',
    { config: { rateLimit: RATE_LIMITS.playerLookup } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      assertCheckoutEnabled(deps.config.flags);
      const input = lookupSchema.parse(request.body);
      const guestHash = request.auth.user
        ? request.auth.guestHash
        : ensureGuest(deps.config, request, reply);
      const ownerKey = ownerKeyOf(request.auth.user?.id, guestHash);
      reply.header('cache-control', 'no-store');
      if (!ownerKey) throw new Error('consulta sin dueño');
      return lookupPlayer(deps, options.playerVerifier, input, ownerKey);
    },
  );

  app.post(
    '/api/checkout',
    { config: { rateLimit: RATE_LIMITS.checkout } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      assertCheckoutEnabled(deps.config.flags);
      const input = checkoutSchema.parse(request.body);
      const guestHash = request.auth.user
        ? request.auth.guestHash
        : ensureGuest(deps.config, request, reply);
      const result = await createOrder(deps, input, {
        actor: actorOf(request, 'customer'),
        guestHash,
        googleSub: request.auth.user?.googleSub ?? undefined,
      });
      reply.code(result.created ? 201 : 200).header('cache-control', 'no-store');
      return result;
    },
  );

  app.get(
    '/api/orders',
    { config: { rateLimit: RATE_LIMITS.orderRead } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      reply.header('cache-control', 'no-store');
      return {
        orders: await listOrdersForOwner(deps, {
          userId: request.auth.user?.id,
          guestHash: request.auth.guestHash,
        }),
      };
    },
  );

  app.get(
    '/api/orders/:ref',
    { config: { rateLimit: RATE_LIMITS.orderRead } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      const order = await loadOrderForAccess(deps, deps.db, ref, accessOf(request));
      reply.header('cache-control', 'no-store');
      return { order: await toPublicOrder(deps, deps.db, order) };
    },
  );

  /** PIN entregados del pedido (entrega automática con inventario). */
  app.get(
    '/api/orders/:ref/pins',
    { config: { rateLimit: RATE_LIMITS.orderWrite } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      reply.header('cache-control', 'no-store');
      return {
        pins: await pinsForOrder(deps, ref, accessOf(request), actorOf(request, 'customer')),
      };
    },
  );

  /** ¿Puede el comprador reseñar este pedido? Y su reseña, si ya la dejó. */
  app.get(
    '/api/orders/:ref/review',
    { config: { rateLimit: RATE_LIMITS.orderRead } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      reply.header('cache-control', 'no-store');
      return reviewForOrder(deps, ref, accessOf(request));
    },
  );

  app.post(
    '/api/orders/:ref/review',
    { config: { rateLimit: RATE_LIMITS.orderWrite } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      const input = reviewSchema.parse(request.body);
      const review = await createReview(
        deps,
        ref,
        accessOf(request),
        input,
        actorOf(request, 'customer'),
      );
      reply.code(201).header('cache-control', 'no-store');
      return { review };
    },
  );

  app.post(
    '/api/orders/:ref/confirm-player',
    { config: { rateLimit: RATE_LIMITS.orderWrite } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      const input = confirmPlayerSchema.parse(request.body);
      reply.header('cache-control', 'no-store');
      return {
        order: await confirmPlayer(
          deps,
          ref,
          accessOf(request),
          input,
          actorOf(request, 'customer'),
        ),
      };
    },
  );

  app.post(
    '/api/orders/:ref/pay',
    { config: { rateLimit: RATE_LIMITS.pay } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      // Nequi es otro método de pago: nunca se abre Mercado Pago para un pago Nequi.
      if ((request.body as { payMeans?: unknown } | undefined)?.payMeans === 'nequi') {
        throw new AppError(
          'BAD_REQUEST',
          400,
          'Nequi no se paga con Mercado Pago: elige «Nequi (transferencia)».',
        );
      }
      // Opcional: el medio elegido en la tienda; un valor desconocido se ignora (todos los medios).
      const payMeans = payBody.safeParse(request.body ?? {}).data?.payMeans;
      reply.header('cache-control', 'no-store');
      return startPayment(deps, ref, accessOf(request), actorOf(request, 'customer'), payMeans);
    },
  );

  // ── Nequi por transferencia: rutas propias, nunca pasan por Mercado Pago ──

  /** El cliente elige pagar por transferencia Nequi (el pedido queda con ese método). */
  app.post(
    '/api/orders/:ref/nequi',
    { config: { rateLimit: RATE_LIMITS.pay } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      const access = accessOf(request);
      const order = await chooseNequiManual(deps, ref, access, actorOf(request, 'customer'));
      reply.header('cache-control', 'no-store');
      return { order: await toPublicOrder(deps, deps.db, order) };
    },
  );

  /** «Ya transferí»: aviso para que el dueño verifique (no confirma ningún pago). */
  app.post(
    '/api/orders/:ref/nequi/report',
    { config: { rateLimit: RATE_LIMITS.orderWrite } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      const input = reportNequiSchema.parse(request.body);
      const order = await reportNequiTransfer(
        deps,
        ref,
        accessOf(request),
        actorOf(request, 'customer'),
        input,
      );
      reply.header('cache-control', 'no-store');
      return { order: await toPublicOrder(deps, deps.db, order) };
    },
  );

  /** Cambio explícito de método de pago (sin pagos registrados ni transferencia avisada). */
  app.post(
    '/api/orders/:ref/payment-method',
    { config: { rateLimit: RATE_LIMITS.orderWrite } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      const { to } = changePaymentMethodSchema.parse(request.body);
      const order = await changePaymentMethod(
        deps,
        ref,
        accessOf(request),
        actorOf(request, 'customer'),
        to,
      );
      reply.header('cache-control', 'no-store');
      return { order: await toPublicOrder(deps, deps.db, order) };
    },
  );

  /** Retorno desde Mercado Pago o botón "Consultar estado": consulta a Mercado Pago en servidor. */
  app.post(
    '/api/orders/:ref/sync',
    { config: { rateLimit: RATE_LIMITS.orderWrite } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const { ref } = refParams.parse(request.params);
      const access = accessOf(request);
      await syncOrderFromReturn(deps, ref, access, actorOf(request, 'customer'));
      const order = await loadOrderForAccess(deps, deps.db, ref, access);
      reply.header('cache-control', 'no-store');
      return { order: await toPublicOrder(deps, deps.db, order) };
    },
  );
};

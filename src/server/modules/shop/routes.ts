import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
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
  toPublicOrder,
  type OrderAccess,
} from '../../services/orders.js';
import { startPayment, syncOrderFromReturn } from '../../services/payments.js';
import { lookupPlayer, lookupSchema, ownerKeyOf } from '../../services/player.js';
import type { PlayerVerifier } from '../../integrations/player/verifier.js';

export interface ShopRoutesOptions {
  deps: ServiceDeps | undefined;
  playerVerifier?: PlayerVerifier | undefined;
}

const refParams = z.object({ ref: z.string().regex(/^TGS-[0-9A-Z]{10}$/) });
const ORDER_TOKEN_HEADER = 'x-order-token';

function accessOf(request: FastifyRequest): OrderAccess {
  const token = request.headers[ORDER_TOKEN_HEADER];
  return {
    userId: request.auth.user?.id,
    guestHash: request.auth.guestHash,
    token: typeof token === 'string' && token.length <= 100 ? token : undefined,
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
        googleSub: request.auth.user?.googleSub,
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
      reply.header('cache-control', 'no-store');
      return startPayment(deps, ref, accessOf(request), actorOf(request, 'customer'));
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

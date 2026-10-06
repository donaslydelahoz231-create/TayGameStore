import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { actorOf, requireAdmin, requireDeps } from '../../http/context.js';
import { RATE_LIMITS } from '../../plugins/security.js';
import {
  addBlock,
  alertSummary,
  blockSchema,
  fulfillmentAction,
  fulfillmentActionSchema,
  getOrderForAdmin,
  listAudit,
  listBlocks,
  listOrdersForAdmin,
  orderFilterSchema,
  removeBlock,
  resolveReview,
  resolveReviewSchema,
  verifyPlayer,
  verifySchema,
} from '../../services/admin.js';
import {
  addInventory,
  addInventorySchema,
  inventoryAction,
  inventoryActionSchema,
  inventorySummary,
} from '../../services/inventory.js';
import {
  createProduct,
  listAllProducts,
  productSchema,
  updateProduct,
} from '../../services/catalog.js';
import type { ServiceDeps } from '../../services/context.js';
import type { AbuseShield } from '../../services/shield.js';
import { reconcileOrder } from '../../services/payments.js';
import { AppError } from '../../plugins/errors.js';

export interface AdminRoutesOptions {
  deps: ServiceDeps | undefined;
  /** Se recarga tras cada cambio para que el bloqueo o desbloqueo sea inmediato. */
  shield?: AbuseShield | undefined;
}

const idParams = z.object({ id: z.uuid() });

/** Panel de administración: todas las rutas exigen admin + allowlist + MFA verificada. */
export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (app, options) => {
  const guarded = { config: { rateLimit: RATE_LIMITS.admin } };
  const ctx = (request: Parameters<typeof requireAdmin>[1]) => {
    const deps = requireDeps(options.deps);
    requireAdmin(deps, request);
    return { deps, actor: actorOf(request, 'admin') };
  };

  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/admin/')) reply.header('cache-control', 'no-store');
  });

  app.get('/api/admin/alerts', guarded, async (request) => {
    const { deps } = ctx(request);
    return alertSummary(deps);
  });

  app.get('/api/admin/orders', guarded, async (request) => {
    const { deps } = ctx(request);
    return { orders: await listOrdersForAdmin(deps, orderFilterSchema.parse(request.query)) };
  });

  app.get('/api/admin/orders/:id', guarded, async (request) => {
    const { deps } = ctx(request);
    const { id } = idParams.parse(request.params);
    return getOrderForAdmin(deps, id);
  });

  app.post('/api/admin/orders/:id/verification', guarded, async (request) => {
    const { deps, actor } = ctx(request);
    const { id } = idParams.parse(request.params);
    await verifyPlayer(deps, id, verifySchema.parse(request.body), actor);
    return getOrderForAdmin(deps, id);
  });

  app.post('/api/admin/orders/:id/fulfillment', guarded, async (request) => {
    const { deps, actor } = ctx(request);
    const { id } = idParams.parse(request.params);
    await fulfillmentAction(deps, id, fulfillmentActionSchema.parse(request.body), actor);
    return getOrderForAdmin(deps, id);
  });

  app.post('/api/admin/orders/:id/review', guarded, async (request) => {
    const { deps, actor } = ctx(request);
    const { id } = idParams.parse(request.params);
    await resolveReview(deps, id, resolveReviewSchema.parse(request.body), actor);
    return getOrderForAdmin(deps, id);
  });

  app.post('/api/admin/orders/:id/reconcile', guarded, async (request) => {
    const { deps, actor } = ctx(request);
    const { id } = idParams.parse(request.params);
    const detail = await getOrderForAdmin(deps, id);
    if (!deps.gateway)
      throw new AppError('PAYMENTS_DISABLED', 503, 'Mercado Pago no está configurado.');
    await reconcileOrder(deps, detail.order.reference, actor);
    return getOrderForAdmin(deps, id);
  });

  app.get('/api/admin/products', guarded, async (request) => {
    const { deps } = ctx(request);
    return { products: await listAllProducts(deps) };
  });

  app.post('/api/admin/products', guarded, async (request, reply) => {
    const { deps, actor } = ctx(request);
    const product = await createProduct(deps, productSchema.parse(request.body), actor);
    return reply.code(201).send({ product });
  });

  app.put('/api/admin/products/:id', guarded, async (request) => {
    const { deps, actor } = ctx(request);
    const { id } = idParams.parse(request.params);
    return { product: await updateProduct(deps, id, productSchema.parse(request.body), actor) };
  });

  app.get('/api/admin/inventory', guarded, async (request) => {
    const { deps } = ctx(request);
    return { lines: await inventorySummary(deps) };
  });

  app.post('/api/admin/inventory', guarded, async (request, reply) => {
    const { deps, actor } = ctx(request);
    const result = await addInventory(deps, addInventorySchema.parse(request.body), actor);
    reply.code(201);
    return result;
  });

  app.post('/api/admin/inventory/:id', guarded, async (request) => {
    const { deps, actor } = ctx(request);
    const { id } = idParams.parse(request.params);
    await inventoryAction(deps, id, inventoryActionSchema.parse(request.body), actor);
    return { ok: true };
  });

  app.get('/api/admin/blocklist', guarded, async (request) => {
    const { deps } = ctx(request);
    return { entries: await listBlocks(deps) };
  });

  app.post('/api/admin/blocklist', guarded, async (request, reply) => {
    const { deps, actor } = ctx(request);
    return reply
      .code(201)
      .send({ entry: await addBlock(deps, blockSchema.parse(request.body), actor) });
    await options.shield?.refresh(true);
  });

  app.delete('/api/admin/blocklist/:id', guarded, async (request) => {
    const { deps, actor } = ctx(request);
    const { id } = idParams.parse(request.params);
    await removeBlock(deps, id, actor);
    await options.shield?.refresh(true);
    return { ok: true };
  });

  app.get('/api/admin/audit', guarded, async (request) => {
    const { deps } = ctx(request);
    return { events: await listAudit(deps) };
  });
};

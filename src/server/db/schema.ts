import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Esquema de TayGameStore. Dinero: enteros en pesos colombianos (COP) con moneda explícita.
 * Las reglas de negocio críticas se refuerzan con CHECK, UNIQUE e índices parciales.
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const cop = (name: string) => bigint(name, { mode: 'number' });

export const ORDER_STATUSES = [
  'AWAITING_VERIFICATION',
  'REJECTED',
  'AWAITING_PAYMENT',
  'PAID',
  'DELIVERING',
  'DELIVERED',
  'NEEDS_REVIEW',
  'EXPIRED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const VERIFICATION_STATUSES = [
  'PENDING',
  'VERIFIED',
  'NOT_FOUND',
  'AMBIGUOUS',
  'BLOCKED_ACCOUNT',
  'CONFIRMED',
  'DECLINED_BY_CUSTOMER',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ATTEMPT_STATUSES = ['CREATING', 'OPEN', 'CLOSED', 'EXPIRED', 'FAILED'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'APPROVED',
  'DECLINED',
  'REFUNDED',
  'DISPUTED',
  'NEEDS_REFUND',
  'UNKNOWN',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILLMENT_STATUSES = [
  'READY_FOR_FULFILLMENT',
  'CLAIMED',
  'DELIVERING',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

/** Redes sociales de clientes además de Google (que vive en users.google_sub). */
export const SOCIAL_PROVIDERS = ['discord', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((value) => `'${value}'`).join(', ')})`);

export const users = pgTable(
  'users',
  {
    id: id(),
    /** Nulo en cuentas creadas con Discord o Facebook (sin Google vinculado). */
    googleSub: text('google_sub'),
    /** Solo correos verificados por el proveedor; nulo si no lo hay. */
    email: text('email'),
    emailVerified: boolean('email_verified').notNull(),
    name: text('name'),
    role: text('role').notNull().default('customer'),
    status: text('status').notNull().default('active'),
    /** Secreto TOTP cifrado (AES-256-GCM) con prefijo de versión de clave. */
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_google_sub_key').on(t.googleSub),
    index('users_email_idx').on(t.email),
    check('users_role_check', inList('role', ['customer', 'admin'])),
    check('users_status_check', inList('status', ['active', 'disabled'])),
  ],
);

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('mfa_recovery_codes_user_code_key').on(t.userId, t.codeHash)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isAdmin: boolean('is_admin').notNull().default(false),
    mfaVerifiedAt: timestamp('mfa_verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const oauthStates = pgTable(
  'oauth_states',
  {
    stateHash: text('state_hash').primaryKey(),
    codeVerifier: text('code_verifier').notNull(),
    nonce: text('nonce').notNull(),
    purpose: text('purpose').notNull(),
    provider: text('provider').notNull().default('google'),
    /** Vinculación: usuario con sesión que inició el flujo (la identidad se añade a él). */
    linkUserId: uuid('link_user_id').references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('oauth_states_link_user_idx')
      .on(t.linkUserId)
      .where(sql`${t.linkUserId} is not null`),
    check('oauth_states_purpose_check', inList('purpose', ['customer', 'admin', 'link'])),
    check('oauth_states_provider_check', inList('provider', ['google', ...SOCIAL_PROVIDERS])),
  ],
);

/**
 * Identidades de Discord y Facebook vinculadas a un usuario. Una identidad pertenece a un solo
 * usuario; nunca se vincula por coincidencia de correo (evita el secuestro de cuentas).
 */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<SocialProvider>().notNull(),
    subject: text('subject').notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('user_identities_provider_subject_key').on(t.provider, t.subject),
    uniqueIndex('user_identities_user_provider_key').on(t.userId, t.provider),
    check('user_identities_provider_check', inList('provider', SOCIAL_PROVIDERS)),
  ],
);

/**
 * Consultas automáticas de jugador (UID → nickname/región) con un proveedor legítimo.
 * Solo vale para quien la hizo (`owner_key`) y caduca pronto: el checkout la exige vigente.
 */
export const playerLookups = pgTable(
  'player_lookups',
  {
    id: id(),
    ownerKey: text('owner_key').notNull(),
    game: text('game').notNull(),
    playerUid: text('player_uid').notNull(),
    provider: text('provider').notNull(),
    nickname: text('nickname').notNull(),
    region: text('region').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('player_lookups_owner_idx').on(t.ownerKey, t.createdAt),
    index('player_lookups_expires_idx').on(t.expiresAt),
    check('player_lookups_game_check', inList('game', ['freefire'])),
    check('player_lookups_uid_check', sql`${t.playerUid} ~ '^[0-9]{6,12}$'`),
  ],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    sku: text('sku').notNull(),
    game: text('game').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    tag: text('tag').notNull().default(''),
    units: integer('units').notNull(),
    priceCop: cop('price_cop').notNull(),
    promoPriceCop: cop('promo_price_cop'),
    promoEndsAt: timestamp('promo_ends_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_sku_key').on(t.sku),
    index('products_game_idx').on(t.game, t.active, t.sortOrder),
    check('products_game_check', inList('game', ['freefire'])),
    check('products_units_check', sql`${t.units} > 0`),
    check('products_price_check', sql`${t.priceCop} > 0 and ${t.priceCop} <= 1000000`),
    check(
      'products_promo_check',
      sql`${t.promoPriceCop} is null or (${t.promoPriceCop} > 0 and ${t.promoPriceCop} < ${t.priceCop})`,
    ),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: id(),
    publicRef: text('public_ref').notNull(),
    checkoutKey: text('checkout_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status').$type<OrderStatus>().notNull(),
    game: text('game').notNull(),
    playerUid: text('player_uid').notNull(),
    customerName: text('customer_name').notNull(),
    customerEmail: text('customer_email').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    guestHash: text('guest_hash'),
    accessTokenHash: text('access_token_hash').notNull(),
    accessTokenKeyVersion: integer('access_token_key_version').notNull(),
    subtotalCop: cop('subtotal_cop').notNull(),
    discountCop: cop('discount_cop').notNull(),
    totalCop: cop('total_cop').notNull(),
    currency: text('currency').notNull().default('COP'),
    termsVersion: text('terms_version').notNull(),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
    verificationStatus: text('verification_status').$type<VerificationStatus>().notNull(),
    verifiedNickname: text('verified_nickname'),
    verifiedRegion: text('verified_region'),
    verificationNote: text('verification_note'),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    receiptCode: text('receipt_code').notNull(),
    ipHash: text('ip_hash'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('orders_verified_by_idx')
      .on(t.verifiedBy)
      .where(sql`${t.verifiedBy} is not null`),
    uniqueIndex('orders_public_ref_key').on(t.publicRef),
    uniqueIndex('orders_checkout_key_key').on(t.checkoutKey),
    index('orders_status_expires_idx').on(t.status, t.expiresAt),
    index('orders_user_idx').on(t.userId, t.createdAt),
    index('orders_guest_idx').on(t.guestHash, t.createdAt),
    index('orders_email_idx').on(t.customerEmail, t.status),
    index('orders_uid_idx').on(t.playerUid, t.status),
    check('orders_status_check', inList('status', ORDER_STATUSES)),
    check('orders_verification_status_check', inList('verification_status', VERIFICATION_STATUSES)),
    check('orders_game_check', inList('game', ['freefire'])),
    check('orders_uid_check', sql`${t.playerUid} ~ '^[0-9]{6,12}$'`),
    check('orders_currency_check', sql`${t.currency} = 'COP'`),
    check(
      'orders_totals_check',
      sql`${t.subtotalCop} > 0 and ${t.discountCop} >= 0 and ${t.totalCop} = ${t.subtotalCop} - ${t.discountCop} and ${t.totalCop} > 0 and ${t.totalCop} <= 1000000`,
    ),
    // Solo puede esperar pago una orden cuya identidad de jugador confirmó el cliente.
    check(
      'orders_payment_requires_confirmation_check',
      sql`${t.status} not in ('AWAITING_PAYMENT', 'PAID', 'DELIVERING', 'DELIVERED') or ${t.confirmedAt} is not null`,
    ),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    units: integer('units').notNull(),
    listPriceCop: cop('list_price_cop').notNull(),
    unitPriceCop: cop('unit_price_cop').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalCop: cop('line_total_cop').notNull(),
  },
  (t) => [
    index('order_items_product_idx').on(t.productId),
    uniqueIndex('order_items_order_product_key').on(t.orderId, t.productId),
    check('order_items_quantity_check', sql`${t.quantity} between 1 and 5`),
    check(
      'order_items_price_check',
      sql`${t.unitPriceCop} > 0 and ${t.unitPriceCop} <= ${t.listPriceCop}`,
    ),
    check('order_items_line_check', sql`${t.lineTotalCop} = ${t.unitPriceCop} * ${t.quantity}`),
  ],
);

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    provider: text('provider').notNull().default('mercadopago'),
    status: text('status').$type<AttemptStatus>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    preferenceId: text('preference_id'),
    checkoutUrl: text('checkout_url'),
    amountCop: cop('amount_cop').notNull(),
    currency: text('currency').notNull().default('COP'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payment_attempts_idempotency_key').on(t.idempotencyKey),
    uniqueIndex('payment_attempts_preference_key').on(t.provider, t.preferenceId),
    // Máximo un intento de pago abierto por orden.
    uniqueIndex('payment_attempts_one_open_per_order')
      .on(t.orderId)
      .where(sql`${t.status} in ('CREATING', 'OPEN')`),
    check('payment_attempts_status_check', inList('status', ATTEMPT_STATUSES)),
    check('payment_attempts_amount_check', sql`${t.amountCop} > 0`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    attemptId: uuid('attempt_id').references(() => paymentAttempts.id),
    provider: text('provider').notNull().default('mercadopago'),
    providerPaymentId: text('provider_payment_id').notNull(),
    status: text('status').$type<PaymentStatus>().notNull(),
    providerStatus: text('provider_status').notNull(),
    providerStatusDetail: text('provider_status_detail'),
    amountCop: cop('amount_cop').notNull(),
    currency: text('currency').notNull(),
    amountMatches: boolean('amount_matches').notNull(),
    /** true solo para el pago que pagó la orden (como mucho uno por orden). */
    isOrderPayment: boolean('is_order_payment').notNull().default(false),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payments_attempt_idx')
      .on(t.attemptId)
      .where(sql`${t.attemptId} is not null`),
    uniqueIndex('payments_provider_payment_key').on(t.provider, t.providerPaymentId),
    uniqueIndex('payments_one_order_payment')
      .on(t.orderId)
      .where(sql`${t.isOrderPayment}`),
    index('payments_order_idx').on(t.orderId),
    index('payments_status_idx').on(t.status),
    check('payments_status_check', inList('status', PAYMENT_STATUSES)),
  ],
);

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    provider: text('provider').notNull().default('mercadopago'),
    dedupeKey: text('dedupe_key').notNull(),
    requestId: text('request_id'),
    topic: text('topic').notNull(),
    resourceId: text('resource_id').notNull(),
    status: text('status').notNull().default('RECEIVED'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('payment_events_dedupe_key').on(t.provider, t.dedupeKey),
    index('payment_events_status_idx').on(t.status, t.receivedAt),
    check(
      'payment_events_status_check',
      inList('status', ['RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED']),
    ),
  ],
);

export const fulfillments = pgTable(
  'fulfillments',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    mode: text('mode').notNull().default('manual'),
    status: text('status').$type<FulfillmentStatus>().notNull(),
    claimedBy: uuid('claimed_by').references(() => users.id, { onDelete: 'set null' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    deliveredBy: uuid('delivered_by').references(() => users.id, { onDelete: 'set null' }),
    evidence: text('evidence'),
    failureReason: text('failure_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('fulfillments_claimed_by_idx')
      .on(t.claimedBy)
      .where(sql`${t.claimedBy} is not null`),
    index('fulfillments_delivered_by_idx')
      .on(t.deliveredBy)
      .where(sql`${t.deliveredBy} is not null`),
    uniqueIndex('fulfillments_order_key').on(t.orderId),
    index('fulfillments_status_idx').on(t.status, t.claimedAt),
    check('fulfillments_status_check', inList('status', FULFILLMENT_STATUSES)),
    check('fulfillments_mode_check', inList('mode', ['manual', 'provider'])),
    check(
      'fulfillments_claim_check',
      sql`${t.status} not in ('CLAIMED', 'DELIVERING') or (${t.claimedBy} is not null and ${t.claimedAt} is not null)`,
    ),
    check(
      'fulfillments_delivered_check',
      sql`${t.status} <> 'DELIVERED' or (${t.evidence} is not null and ${t.deliveredAt} is not null)`,
    ),
  ],
);

export const blocklist = pgTable(
  'blocklist',
  {
    id: id(),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('blocklist_created_by_idx')
      .on(t.createdBy)
      .where(sql`${t.createdBy} is not null`),
    uniqueIndex('blocklist_kind_value_key').on(t.kind, t.value),
    check(
      'blocklist_kind_check',
      inList('kind', ['email', 'uid', 'ip_hash', 'google_sub', 'discord_id', 'facebook_id']),
    ),
  ],
);

/** Registro de auditoría append-only. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    data: jsonb('data')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    check(
      'audit_events_actor_type_check',
      sql`${table.actorType} in ('system', 'customer', 'admin', 'webhook')`,
    ),
  ],
);

export const NOTIFICATION_KINDS = [
  'order_paid_owner',
  'order_paid_customer',
  'order_delivered_customer',
  'order_refunded_customer',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const NOTIFICATION_CHANNELS = ['email', 'telegram'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/**
 * Cola de avisos (outbox). Se inserta en la misma transacción que el cambio de estado del
 * pedido: si el pedido quedó pagado, su aviso existe. Se envía enseguida y, si falla, el
 * scheduler lo reintenta con espera creciente. Un aviso por pedido, tipo y canal.
 * El destinatario no se copia aquí: se lee del pedido (cliente) o de ADMIN_EMAILS (dueño).
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NotificationKind>().notNull(),
    channel: text('channel').$type<NotificationChannel>().notNull(),
    status: text('status').$type<NotificationStatus>().notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('notifications_order_kind_channel_key').on(t.orderId, t.kind, t.channel),
    index('notifications_pending_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'PENDING'`),
    check('notifications_kind_check', inList('kind', NOTIFICATION_KINDS)),
    check('notifications_channel_check', inList('channel', NOTIFICATION_CHANNELS)),
    check('notifications_status_check', inList('status', NOTIFICATION_STATUSES)),
    check('notifications_attempts_check', sql`${t.attempts} >= 0`),
  ],
);

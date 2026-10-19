-- Nequi como método de pago independiente de Mercado Pago (pedido del dueño, 2026-10-19).
-- - orders.payment_method: método elegido para el pedido (mercadopago, nequi_manual o nequi_push).
-- - payments.provider: solo proveedores conocidos.
-- - nequi_transfers: transferencias a la cuenta Nequi del dueño, que solo el dueño confirma.
-- - Triggers: el método no cambia en silencio, un pago solo paga un pedido de su mismo método y
--   las transferencias no se borran ni se reescriben después de revisarlas.
-- No cambia montos ni borra datos: los pedidos que ya usaron Mercado Pago quedan con ese método.
CREATE TABLE "nequi_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text NOT NULL,
	"sender_last4" text,
	"customer_reference" text,
	"reported_at" timestamp with time zone,
	"nequi_reference" text,
	"amount_cop" bigint,
	"payment_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nequi_transfers_status_check" CHECK (status in ('REPORTED', 'CONFIRMED', 'REJECTED')),
	CONSTRAINT "nequi_transfers_last4_check" CHECK ("nequi_transfers"."sender_last4" is null or "nequi_transfers"."sender_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "nequi_transfers_references_check" CHECK (("nequi_transfers"."customer_reference" is null or "nequi_transfers"."customer_reference" ~ '^[A-Za-z0-9-]{4,40}$') and ("nequi_transfers"."nequi_reference" is null or "nequi_transfers"."nequi_reference" ~ '^[A-Za-z0-9-]{4,40}$')),
	CONSTRAINT "nequi_transfers_confirmed_check" CHECK ("nequi_transfers"."status" <> 'CONFIRMED' or ("nequi_transfers"."nequi_reference" is not null and "nequi_transfers"."amount_cop" > 0 and "nequi_transfers"."payment_id" is not null and "nequi_transfers"."reviewed_at" is not null)),
	CONSTRAINT "nequi_transfers_rejected_check" CHECK ("nequi_transfers"."status" <> 'REJECTED' or ("nequi_transfers"."rejection_reason" is not null and "nequi_transfers"."reviewed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "nequi_transfers" ADD CONSTRAINT "nequi_transfers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nequi_transfers" ADD CONSTRAINT "nequi_transfers_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nequi_transfers" ADD CONSTRAINT "nequi_transfers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nequi_transfers_order_idx" ON "nequi_transfers" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "nequi_transfers_status_idx" ON "nequi_transfers" USING btree ("status","reported_at");--> statement-breakpoint
CREATE INDEX "nequi_transfers_payment_idx" ON "nequi_transfers" USING btree ("payment_id") WHERE "nequi_transfers"."payment_id" is not null;--> statement-breakpoint
CREATE INDEX "nequi_transfers_reviewed_by_idx" ON "nequi_transfers" USING btree ("reviewed_by") WHERE "nequi_transfers"."reviewed_by" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "nequi_transfers_one_open_per_order" ON "nequi_transfers" USING btree ("order_id") WHERE "nequi_transfers"."status" = 'REPORTED';--> statement-breakpoint
CREATE UNIQUE INDEX "nequi_transfers_reference_key" ON "nequi_transfers" USING btree ("nequi_reference") WHERE "nequi_transfers"."status" = 'CONFIRMED';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK (kind in ('order_paid_owner', 'order_paid_customer', 'order_delivered_customer', 'order_refunded_customer', 'order_paid_event', 'order_delivered_event', 'order_refunded_event', 'order_verification_event', 'topup_problem_owner', 'order_sheet_sync', 'nequi_reported_owner'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_check" CHECK ("orders"."payment_method" is null or payment_method in ('mercadopago', 'nequi_manual', 'nequi_push'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_check" CHECK (provider in ('mercadopago', 'nequi_manual', 'nequi_push'));
--> statement-breakpoint
-- Pedidos que ya usaron Mercado Pago (algún intento o pago) quedan con ese método.
UPDATE "orders" o SET "payment_method" = 'mercadopago'
 WHERE o."payment_method" IS NULL
   AND (EXISTS (SELECT 1 FROM "payment_attempts" a WHERE a."order_id" = o."id")
        OR EXISTS (SELECT 1 FROM "payments" p WHERE p."order_id" = o."id"));
--> statement-breakpoint
-- El método de un pedido no cambia en silencio: nunca vuelve a quedar sin elegir y solo cambia
-- (con el procedimiento explícito de la tienda) mientras espera pago y sin ningún pago registrado.
CREATE OR REPLACE FUNCTION orders_payment_method_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_method IS NOT NULL AND NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
    IF NEW.payment_method IS NULL
       OR OLD.status <> 'AWAITING_PAYMENT'
       OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = OLD.id) THEN
      RAISE EXCEPTION 'TayGameStore: el método de pago de este pedido ya no se puede cambiar';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER orders_payment_method_guard BEFORE UPDATE OF payment_method ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_payment_method_guard();
--> statement-breakpoint
-- Un pago solo es «el pago del pedido» si su proveedor es el método del pedido: una confirmación
-- de Mercado Pago nunca paga un pedido Nequi, ni una de Nequi un pedido de Mercado Pago.
CREATE OR REPLACE FUNCTION payments_provider_matches_order() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE method text;
BEGIN
  IF NEW.is_order_payment THEN
    SELECT o.payment_method INTO method FROM orders o WHERE o.id = NEW.order_id;
    IF method IS DISTINCT FROM NEW.provider THEN
      RAISE EXCEPTION 'TayGameStore: un pago de % no puede pagar un pedido con método %',
        NEW.provider, coalesce(method, 'sin elegir');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payments_provider_matches_order
  BEFORE INSERT OR UPDATE OF is_order_payment, provider, order_id ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_provider_matches_order();
--> statement-breakpoint
-- Las transferencias son registros de dinero: nunca se borran.
CREATE TRIGGER nequi_transfers_no_delete BEFORE DELETE ON nequi_transfers
  FOR EACH ROW EXECUTE FUNCTION tgs_forbid_delete();
--> statement-breakpoint
CREATE TRIGGER nequi_transfers_no_truncate BEFORE TRUNCATE ON nequi_transfers
  FOR EACH STATEMENT EXECUTE FUNCTION tgs_forbid_delete();
--> statement-breakpoint
-- Una transferencia confirmada o rechazada por el dueño ya no cambia.
CREATE OR REPLACE FUNCTION nequi_transfers_protect_reviewed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'REPORTED' THEN
    RAISE EXCEPTION 'TayGameStore: una transferencia Nequi revisada no se puede modificar';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER nequi_transfers_protect_reviewed BEFORE UPDATE ON nequi_transfers
  FOR EACH ROW EXECUTE FUNCTION nequi_transfers_protect_reviewed();

CREATE TABLE "audit_seals" (
	"seq" integer PRIMARY KEY NOT NULL,
	"from_event_id" bigint NOT NULL,
	"upto_event_id" bigint NOT NULL,
	"events" integer NOT NULL,
	"total_events" bigint NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_seals_seq_check" CHECK ("audit_seals"."seq" >= 1),
	CONSTRAINT "audit_seals_range_check" CHECK ("audit_seals"."upto_event_id" >= "audit_seals"."from_event_id"),
	CONSTRAINT "audit_seals_hash_check" CHECK ("audit_seals"."hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_actor_type_check";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receipt_number" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_seals_upto_key" ON "audit_seals" USING btree ("upto_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_receipt_number_key" ON "orders" USING btree ("receipt_number");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" in ('system', 'customer', 'admin', 'webhook', 'database'));--> statement-breakpoint
-- Comprobantes ya emitidos: número consecutivo según el orden en que se aprobó su pago.
UPDATE "orders" o SET "receipt_number" = n.rn
FROM (
  SELECT o2.id, row_number() OVER (ORDER BY coalesce(p.approved_at, p.created_at), o2.created_at) AS rn
  FROM "orders" o2 JOIN "payments" p ON p.order_id = o2.id AND p.is_order_payment
) n
WHERE o.id = n.id;
--> statement-breakpoint
-- Registros de dinero y catálogo: nunca se borran (ni la app ni un SQL directo; solo el dueño de
-- la base, quitando el trigger a propósito, podría hacerlo).
CREATE OR REPLACE FUNCTION tgs_forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TayGameStore: % no permitido en % (registro protegido)', TG_OP, TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'order_items', 'payments', 'payment_attempts', 'payment_events',
                           'fulfillments', 'topups', 'inventory_codes', 'products', 'audit_seals']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION tgs_forbid_delete()', t || '_no_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION tgs_forbid_delete()', t || '_no_truncate', t);
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Los sellos de integridad tampoco se modifican.
CREATE TRIGGER audit_seals_no_update BEFORE UPDATE ON audit_seals
  FOR EACH ROW EXECUTE FUNCTION tgs_forbid_delete();
--> statement-breakpoint
-- Los montos de un pedido, su referencia y su comprobante quedan fijos desde que se crea.
CREATE OR REPLACE FUNCTION orders_protect_amounts() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_ref IS DISTINCT FROM OLD.public_ref
     OR NEW.subtotal_cop IS DISTINCT FROM OLD.subtotal_cop
     OR NEW.discount_cop IS DISTINCT FROM OLD.discount_cop
     OR NEW.total_cop IS DISTINCT FROM OLD.total_cop
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.receipt_code IS DISTINCT FROM OLD.receipt_code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.receipt_number IS NOT NULL AND NEW.receipt_number IS DISTINCT FROM OLD.receipt_number) THEN
    RAISE EXCEPTION 'TayGameStore: los montos, la referencia y el comprobante de un pedido no se pueden cambiar';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER orders_protect_amounts BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_protect_amounts();
--> statement-breakpoint
-- Las líneas de un pedido (paquete, cantidad, precio) no cambian nunca.
CREATE TRIGGER order_items_no_update BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION tgs_forbid_delete();
--> statement-breakpoint
-- Todo cambio de precio, promoción o disponibilidad queda en el historial, aunque se haga con SQL
-- directo y no desde el panel (actor `database`, con el usuario de la base que lo hizo).
CREATE OR REPLACE FUNCTION products_audit_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.price_cop IS DISTINCT FROM OLD.price_cop
     OR NEW.promo_price_cop IS DISTINCT FROM OLD.promo_price_cop
     OR NEW.promo_ends_at IS DISTINCT FROM OLD.promo_ends_at
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.units IS DISTINCT FROM OLD.units
     OR NEW.sku IS DISTINCT FROM OLD.sku THEN
    INSERT INTO audit_events (entity_type, entity_id, action, actor_type, data)
    VALUES ('product', NEW.id::text, 'product.db_change', 'database', jsonb_build_object(
      'op', TG_OP,
      'sku', NEW.sku,
      'priceCop', NEW.price_cop,
      'oldPriceCop', CASE WHEN TG_OP = 'UPDATE' THEN OLD.price_cop END,
      'promoPriceCop', NEW.promo_price_cop,
      'oldPromoPriceCop', CASE WHEN TG_OP = 'UPDATE' THEN OLD.promo_price_cop END,
      'active', NEW.active,
      'units', NEW.units,
      'dbUser', current_user));
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER products_audit_changes AFTER INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_audit_changes();

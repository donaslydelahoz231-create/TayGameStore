-- Tipo nuevo de la cola de avisos: «order_sheet_sync», la fila de cada pedido en la pestaña
-- «Entregas» de la hoja de Google del dueño, que se reescribe con el estado actual del pedido en
-- cada cambio (pedido del dueño, 2026-10-19). Solo amplía la lista permitida: no cambia ni borra
-- filas.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK (kind in ('order_paid_owner', 'order_paid_customer', 'order_delivered_customer', 'order_refunded_customer', 'order_paid_event', 'order_delivered_event', 'order_refunded_event', 'order_verification_event', 'topup_problem_owner', 'order_sheet_sync'));

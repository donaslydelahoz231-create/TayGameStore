-- Canal nuevo de la cola de avisos: «sheets_live», la pestaña «Pedidos en vivo» de la hoja de
-- Google del dueño: una fila por pedido de cualquier método (Nequi o Mercado Pago) desde que el
-- cliente lo crea, sin datos personales, reescrita con cada cambio (pedido del dueño, 2026-11-03).
-- Solo amplía la lista permitida: no cambia ni borra filas.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_channel_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_check" CHECK (channel in ('email', 'webhook', 'sheets', 'sheets_delivery', 'sheets_pending', 'sheets_live'));
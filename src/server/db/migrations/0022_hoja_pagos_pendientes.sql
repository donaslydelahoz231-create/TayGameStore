-- Canal nuevo de la cola de avisos: «sheets_pending», la pestaña «Pagos pendientes» de la hoja de
-- Google del dueño: una fila por pedido Nequi con lo que el cliente debe y lo que avisó al
-- transferir (pedido del dueño, 2026-10-20). Solo amplía la lista permitida: no cambia ni borra
-- filas.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_channel_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_check" CHECK (channel in ('email', 'webhook', 'sheets', 'sheets_delivery', 'sheets_pending'));
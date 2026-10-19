-- Canal nuevo de la cola de avisos: «sheets_delivery», la pestaña «Entregas» de la hoja de Google
-- del dueño, con los datos del jugador para recargar (pedido del dueño, 2026-10-19). Solo amplía la
-- lista permitida: no cambia ni borra filas.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_channel_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_check" CHECK (channel in ('email', 'webhook', 'sheets', 'sheets_delivery'));
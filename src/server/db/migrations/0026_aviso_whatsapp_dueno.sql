-- Canal nuevo de la cola de avisos: «whatsapp», el WhatsApp del dueño por CallMeBot (pedido del
-- dueño, 2026-11-18: que el pedido le llegue solo, sin que el cliente abra WhatsApp). Lleva datos
-- mínimos del pedido, nunca el nombre ni el correo del cliente.
-- Solo amplía la lista permitida: no cambia ni borra filas.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_channel_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_check" CHECK (channel in ('email', 'webhook', 'sheets', 'sheets_delivery', 'sheets_pending', 'sheets_live', 'whatsapp'));
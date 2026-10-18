-- Solo columnas nuevas opcionales y un canal más en la cola de avisos: no cambia datos existentes.
-- pay_means: medio que eligió el cliente por intento (si cambia de medio se crea otra preferencia).
-- payment_method_id / payment_type_id: medio con el que se pagó, según Mercado Pago.
-- sheets: registro auxiliar opcional en Google Sheets (apagado sin credenciales).
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_channel_check";--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "pay_means" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_method_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_type_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_check" CHECK (channel in ('email', 'telegram', 'webhook', 'sheets'));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_pay_means_check" CHECK ("payment_attempts"."pay_means" is null or pay_means in ('tarjeta', 'nequi', 'pse', 'efecty', 'saldo'));
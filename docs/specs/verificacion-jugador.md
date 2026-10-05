# Especificación — Verificación de jugador (UID / nickname / región)

> Estado: **IMPLEMENTADO como verificación manual por el operador** dentro del ciclo de vida
> de la orden. No existe una API oficial pública para consultar nicknames de Free Fire:
> **no se hace scraping, no se usan fuentes no oficiales ni endpoints inventados.**
> La fuente que use el operador debe ser legítima (decisión del propietario, C1).

## Regla crítica

```
UID válido → pedido creado → operador verifica (fuente legítima) → cliente confirma
"Sí, es mi cuenta" → pago → entrega al UID guardado en la orden
```

Nunca: asumir un nickname, aceptar el nickname que envía el navegador o cobrar antes de la
confirmación explícita.

## Flujo implementado

1. El cliente escribe el UID (6–12 dígitos). El servidor lo valida al crear el pedido.
2. Orden en `AWAITING_VERIFICATION` con `verification_status = PENDING`.
3. Operador (panel `/admin.html`, Google + TOTP): registra `VERIFIED` con nickname y región,
   o `NOT_FOUND` / `AMBIGUOUS` / `BLOCKED_ACCOUNT` (la orden pasa a `REJECTED`).
4. El cliente ve **"Vas a recargar a: [nickname] — ID: [UID] — Región: [región]"** y elige
   "Sí, es mi cuenta" (→ `AWAITING_PAYMENT`) o "No es mi cuenta" (→ `REJECTED`).
   Debe reenviar el nickname que vio: si el operador lo cambió, recibe `409` y lo vuelve a ver.
5. Si nadie verifica antes de `VERIFICATION_TTL_MINUTES`, la orden expira.

## Garantías

- La base de datos impide `AWAITING_PAYMENT`/`PAID`/entregas sin `confirmed_at`
  (`orders_payment_requires_confirmation_check`).
- La entrega usa solo el UID guardado en la orden.
- Mensajes genéricos al cliente; rate limiting en todas las rutas de órdenes.
- Auditoría de verificación, confirmación y rechazo (operador, fecha, región).

## Proveedor automático futuro

Si aparece una API oficial: implementar la interfaz `PlayerVerifier` y que el resultado se
registre igual que el del operador. La máquina de estados no cambia.

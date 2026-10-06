# Especificación — Verificación de jugador (UID / nickname / región)

> Estado:
> - **Verificación manual por el operador: IMPLEMENTADA** (flujo activo en producción).
> - **Consulta instantánea estilo LootBar: IMPLEMENTADA detrás del puerto `PlayerVerifier`,
>   sin adaptador real → `BLOCKED`** hasta que el propietario contrate un proveedor autorizado
>   con API oficial documentada. Probada solo con un doble de pruebas (`tests/`).
>
> No existe una API oficial pública de Garena para consultar nicknames de Free Fire:
> **no se hace scraping, no se usan fuentes no oficiales ni endpoints inventados.**

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
3. Operador (panel en su ruta secreta `ADMIN_PATH`, Google + TOTP): registra `VERIFIED` con nickname y región,
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

## Consulta instantánea (estilo LootBar)

Disponible solo si el servidor arranca con un `PlayerVerifier` (`/api/config` →
`playerLookup: true`). Sin él, la tienda usa el flujo manual sin cambios.

```
UID → POST /api/player/lookup → "Vas a recargar a: [nickname] · Región" →
"Sí, es mi cuenta" → POST /api/checkout { playerLookup: { ref, nickname } } →
orden en AWAITING_PAYMENT (verification_status = CONFIRMED) → pago
```

- `POST /api/player/lookup` `{ game: 'freefire', uid }` → `{ lookupRef, nickname, region,
  expiresAt }`. CSRF, `cache-control: no-store`, **20 consultas cada 10 minutos por IP**
  (anti-enumeración), timeout de 8 s al proveedor.
- Respuestas: `422 PLAYER_NOT_FOUND`; `503 PLAYER_LOOKUP_UNAVAILABLE` (sin proveedor, caído o
  timeout) → el frontend pasa **automáticamente** al flujo manual.
- El resultado se guarda en `player_lookups` (UID, nickname, región, proveedor; sin datos del
  cliente) ligado al dueño (sesión `u:<id>` o navegador invitado `g:<hash>`), vigente
  **30 minutos** y de **un solo uso**.
- En el checkout se consume con CAS dentro de la transacción de la orden: mismo dueño, juego,
  UID y nickname confirmado, vigente y sin usar. Si no → `409 PLAYER_LOOKUP_EXPIRED` y el
  cliente vuelve a consultar. El navegador nunca puede imponer un nickname: el servidor usa
  el de su propia consulta.
- La orden queda con `verification_note = proveedor:<nombre>` y auditoría
  `verification: proveedor:<nombre>`. La limpieza horaria borra consultas caducadas > 1 día.

### Para activarla (pendiente del propietario)

1. Contratar un proveedor **autorizado** (p. ej. el distribuidor oficial de recargas) que
   ofrezca validación de ID por API documentada, con contrato y credenciales propias.
2. Implementar su adaptador en `src/server/integrations/player/` con la documentación oficial
   (sin inventar endpoints), y pasarlo como `playerVerifier` en `src/server/index.ts`.
3. Probarlo en su sandbox y revisar límites, privacidad y términos de uso.

No se usan las APIs de terceros que extraen datos del juego ("username fetchers"): no son
oficiales ni están autorizadas.

### Candidatos encontrados (2026-10-05, sin verificar su documentación)

Páginas como mobileverso.com.br muestran nickname y región por ID usando servicios no oficiales.
TayGameStore no los usa. En búsquedas públicas aparecen distribuidores que ofrecen validación del
jugador **a socios con contrato** (la documentación no se pudo leer desde el entorno de
desarrollo, así que no hay adaptador escrito para ninguno):

| Distribuidor | Qué indica su material público | Qué hace falta |
|---|---|---|
| UniPin (socio de recargas de Garena) | API "In Game Top Up" con *Validate User* que devuelve el nombre del jugador | Contrato de socio, credenciales y su documentación |
| Smile.one | API para comercios con consulta de rol (*role query*) | Cuenta de comercio y documentación |

Con el contrato y la documentación oficial (que compartes sin credenciales), el adaptador se escribe
y se prueba contra su sandbox; las credenciales van solo en variables de entorno de Render.
Mientras tanto la tienda usa la verificación manual: el cliente escribe su ID, el equipo
comprueba nickname y región desde el panel y el cliente confirma "Sí, es mi cuenta" antes de
pagar.

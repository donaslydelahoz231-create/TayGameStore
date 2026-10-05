# Especificación — Verificación de jugador (UID / nickname / región)

> Requisito del propietario (2026-10-05). Rige para todo producto ligado a un jugador.
> Estado de implementación: **no implementado**. Proveedor de verificación: **BLOCKED**
> (no existe todavía una API oficial o legítima confirmada).

## Regla crítica

```
UID + región → validación → consulta al proveedor → jugador real → confirmación explícita
→ checkout → recálculo y validación en servidor → pago → fulfillment
```

Nunca: `UID escrito → asumir nickname → cobrar → descubrir después que era incorrecto`.
La identidad del jugador es un **dato crítico de destino**, igual que el importe y el producto.

## Diseño

### Entidad propia: `player_verifications`
La verificación es una entidad separada que **precede** a la orden (no es un estado de la orden).

| Campo | Notas |
|---|---|
| `id` (uuid) | Referencia **opaca** que recibe el navegador (`verificationRef`) |
| `owner_kind`, `owner_hash` | Sesión de usuario o cookie de invitado (`HttpOnly`); la verificación solo la usa quien la creó |
| `game`, `uid`, `region` | Entrada normalizada y validada en servidor |
| `provider`, `provider_ref` | Proveedor y su identificador de consulta (`verificationId`) |
| `status` | `VERIFIED` · `NOT_FOUND` · `AMBIGUOUS` · `BLOCKED_ACCOUNT` · `INCONSISTENT` · `UNAVAILABLE` |
| `nickname`, `region_resolved`, `account_status` | **Solo** lo devuelto por el proveedor |
| `confirmed_at` | Confirmación explícita del cliente |
| `expires_at` | Caducidad corta (configurable); caducada ⇒ se repite la consulta |
| `request_id`, `created_at` | Trazabilidad (sin secretos) |

### Interfaz

```ts
interface PlayerVerificationProvider {
  readonly name: string;
  verify(
    input: { game: GameSlug; uid: string; region?: string; nickname?: string },
    ctx: { requestId: string; signal: AbortSignal },
  ): Promise<
    | { status: 'VERIFIED'; providerRef: string; nickname: string; uid: string; region: string; accountStatus?: string }
    | { status: 'NOT_FOUND' | 'AMBIGUOUS' | 'BLOCKED_ACCOUNT' | 'INCONSISTENT'; providerRef?: string }
    | { status: 'UNAVAILABLE'; reason: 'timeout' | 'upstream_error' | 'not_configured' }
  >;
}
```

Implementación inicial: `UnavailablePlayerVerificationProvider` → siempre `UNAVAILABLE / not_configured`.
**No** se crea ningún proveedor simulado para producción; un doble de pruebas solo existe en los tests.

### Endpoints (propuestos)

| Método y ruta | Comportamiento |
|---|---|
| `POST /api/player-verifications` | `{ game, uid, region?, nickname? }` → valida formato/longitud/caracteres/región por juego → rate limit (IP, sesión/invitado, UID) → consulta con timeout → guarda el resultado. Responde `verificationRef`, `nickname`, `uid`, `region`, `accountStatus?`, `expiresAt` **solo si `VERIFIED`** |
| `POST /api/player-verifications/:ref/confirm` | Confirmación explícita ("Vas a recargar a: [nickname] — ID: [UID] — Región: [región]"). Solo el dueño, solo si `VERIFIED` y vigente |
| `POST /api/checkout` | Recibe `verificationRef` (nunca UID/nickname/región). El servidor exige `VERIFIED` + confirmada + vigente + mismo dueño + juego coherente con los productos, y copia el resultado a la orden |

### Reglas
- Resultado `NOT_FOUND`, `AMBIGUOUS`, `BLOCKED_ACCOUNT` o `INCONSISTENT` ⇒ **no se permite pagar**. Respuesta genérica ("No pudimos verificar ese jugador") para no facilitar la enumeración.
- Proveedor caído o sin respuesta ⇒ `UNAVAILABLE`: no se inventa identidad, no se marca verificado, no se cobra; `503 PLAYER_VERIFICATION_UNAVAILABLE` con reintento permitido.
- Caducada antes del pago ⇒ `409 VERIFICATION_EXPIRED`: se repite la verificación y la confirmación.
- Antes de crear el pago se revalida que la verificación de la orden sigue siendo la del destino; si el proveedor lo permite, se vuelve a consultar.
- El fulfillment usa **solo** el UID/región guardados en la orden.
- Cambiar el DOM, DevTools o las peticiones no altera el destino: el navegador solo maneja `verificationRef`.
- Búsqueda por nickname: solo si el proveedor la ofrece oficialmente; desactivada por defecto (mayor riesgo de enumeración).
- Logs: `requestId`, dueño (hash), juego, UID, región, proveedor, `verificationId`, estado. Nunca credenciales del proveedor.
- Sin API oficial: **ni scraping, ni endpoints inventados, ni validación falsa**.

## Consecuencias
- Mientras no exista proveedor legítimo, `POST /api/player-verifications` responde `UNAVAILABLE` y **no se puede crear ningún checkout**: no hay ventas.
- La orden ya no necesita estados de verificación: se crea solo con una verificación confirmada.
- Requiere una cookie de invitado `HttpOnly` (identificador aleatorio, hash en BD) para atar la verificación al navegador que la hizo.

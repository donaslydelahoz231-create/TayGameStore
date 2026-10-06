# Acceso de clientes

Cómo entran los clientes a TayGameStore y qué necesita cada método. Comprar **no** exige
cuenta: siempre se puede pagar como invitado (el pedido queda en ese navegador y se sigue con
su referencia).

| Método | Qué necesita | Estado |
|---|---|---|
| **Llave de acceso** (huella, rostro o PIN del dispositivo) | Nada externo: funciona con `PUBLIC_BASE_URL` | **Activo** al publicar |
| Invitado | Nada | Activo |
| Google | `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (Google Cloud, cuenta del dueño) | Se enciende al configurarlo |
| Discord / Facebook | Credenciales de sus portales de desarrollador (cuenta del dueño) | Se enciende al configurarlo |

La ventana de acceso solo muestra lo que funciona en el servidor: nunca botones apagados.

## Llaves de acceso (passkeys)

Estándar **WebAuthn** (W3C/FIDO), el mismo que usan Google, Apple y Microsoft. Biblioteca:
[SimpleWebAuthn](https://simplewebauthn.dev) (servidor y navegador).

- **Crear cuenta:** «Crear cuenta» en la ventana de acceso → el dispositivo pide huella, rostro o
  PIN → queda la sesión abierta. El nombre es opcional.
- **Entrar:** «Entrar con mi llave de acceso» → el dispositivo ofrece las llaves guardadas para
  la tienda.
- **Otro dispositivo:** con la sesión abierta, menú de la cuenta → «Añadir llave de este
  dispositivo». Las llaves sincronizadas (iCloud, Google) aparecen solas en los demás equipos.

Seguridad:

- La tienda guarda solo la **clave pública**; no hay contraseña que robar.
- Retos de un solo uso (5 minutos) ligados a una cookie; origen y dominio exactos; contador de
  firmas (una llave clonada se rechaza); CSRF y límite por IP en las cuatro rutas.
- Una llave **nunca** da acceso de administración: el panel sigue exigiendo Google + TOTP.
- Si el cliente pierde todos sus dispositivos, crea una cuenta nueva; sus compras como invitado
  siguen consultables con la referencia del pedido.

Configuración: por defecto se usa el dominio de `PUBLIC_BASE_URL` (en Render,
`taygamestore.onrender.com`). Si cambias de dominio, las llaves creadas en el anterior dejan de
servir (así funciona WebAuthn): los clientes crean una nueva. `PASSKEY_RP_ID` y
`PASSKEY_ORIGIN` solo hacen falta para pruebas locales.

Pruebas: `tests/integration/passkeys.test.ts` (firmas reales con un autenticador de software:
registro, entrada, repetición, reto vencido, otro origen, firma alterada, llave clonada, CSRF)
y `e2e/behavior.spec.ts` (Chromium con autenticador virtual: crear cuenta, salir y volver a entrar).

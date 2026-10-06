# Dinero y acceso: solo el propietario

## A dónde va el dinero

```
Cliente paga en Mercado Pago ──▶ Cuenta de Mercado Pago del dueño de MP_ACCESS_TOKEN
                                  ──▶ (tú decides) Retiro a tu cuenta bancaria en Colombia
```

- El dinero **nunca pasa por TayGameStore**: el cliente paga en Mercado Pago y el cobro queda en
  la cuenta de Mercado Pago cuyas credenciales (`MP_ACCESS_TOKEN`) usa el servidor.
- **No se guarda en la plataforma** ningún dato bancario, Nequi, tarjeta ni cuenta de retiro. No
  existe ninguna pantalla ni ruta para cambiar a dónde va el dinero (lo comprueba
  `tests/integration/owner-only.test.ts`): no hay nada que un atacante pueda desviar desde la web.
- **Retiros:** desde la app o web de Mercado Pago (Actividad → Retirar) a una cuenta bancaria
  colombiana a tu nombre, según la
  [ayuda de Mercado Pago/Mercado Libre](https://vendedores.mercadolibre.com.co/aprender/nota/como-hacer-un-retiro-de-dinero-desde-tu-cuenta-de-mercado-pago).
  Si quieres recibir en **Nequi**, comprueba en tu app de Mercado Pago si Nequi aparece como
  entidad de destino del retiro (no se pudo verificar desde aquí; Nequi se separó de Bancolombia
  en 2026). Ese ajuste se hace **en Mercado Pago**, nunca en TayGameStore.

## Quién administra

| Capa | Qué la protege |
|---|---|
| Lista de administradores | `ADMIN_EMAILS` (variable del servidor). Pon **solo tu correo**. No hay pantalla para añadir administradores; se revisa en cada petición |
| Inicio de sesión | Solo con **Google** (Discord y Facebook nunca dan acceso de administración) |
| Segundo factor | TOTP obligatorio + códigos de recuperación; 5 códigos erróneos bloquean la cuenta 15 min |
| Credenciales de Mercado Pago | Solo en variables de entorno de Render; ninguna respuesta del servidor las muestra |
| Cambios en el panel | Auditoría que no se puede modificar ni borrar |

## Panel oculto y cambio de rol

- El panel vive en una **dirección secreta** (`ADMIN_PATH`). `/admin.html` responde 404 como
  cualquier página inexistente, la tienda no lo enlaza y los buscadores no lo indexan
  (`X-Robots-Tag: noindex`). Sus rutas `/api/admin/*` responden 404 a quien no es administrador,
  así que desde fuera no se puede saber que existe; quien las sondea suma al escudo anti-abuso.
- Un intento de entrar al panel con una cuenta sin permiso recibe el mismo mensaje que cualquier
  fallo de Google (y queda en la Auditoría como `admin.login_denied`).
- **Ver tienda como cliente** (botón del panel): tu sesión pasa a ser de cliente con la misma
  cuenta, sin permisos de panel. Para volver, tu menú de cuenta muestra **Panel de
  administración** (solo a ti); entrar de nuevo pide Google y tu código de 6 dígitos. Cambiar de
  rol nunca sube privilegios sin autenticarse.
- La dirección secreta es una capa extra, no la seguridad principal: aunque alguien la
  conociera, seguiría necesitando tu Google, estar en `ADMIN_EMAILS` y tu código TOTP.

## Manipulación desde el navegador (DevTools)

Nadie puede impedir que alguien abra las herramientas de desarrollador y cambie la página **en
su propio navegador** (textos, precios visibles, botones ocultos). Lo que cambia allí solo lo
ve esa persona: no se guarda en el servidor ni lo ven otros clientes. La tienda no confía en
nada de lo que llega del navegador:

| Intento | Respuesta del servidor |
|---|---|
| Editar el precio en el HTML y comprar | Cobra el precio de su catálogo |
| Añadir `totalCop`, `priceCop`, `status` u otros campos a la petición | 400: el esquema es estricto |
| Enviar un total esperado falso (`expectedTotalCop`) | 409 `PRICE_CHANGED` |
| Webhook de "pago aprobado" con firma inventada | 401; el pedido no cambia |
| Cambiar el estado de un pedido desde el cliente | No existe esa ruta (404) |
| Escritura sin la cabecera anti-CSRF | 403 `CSRF_REJECTED` y señal al escudo anti-abuso |
| Mostrar el panel oculto (`#admApp`) | Sin datos: la API responde 404 a quien no es administrador |
| Cookie de sesión inventada | 404 (el panel no existe para ella) |
| Cliente con sesión (Discord, Facebook o Google sin permiso) | 404 en todo `/api/admin/*` |
| Leer la cookie de sesión desde la consola (`document.cookie`) | No aparece: es HttpOnly (y `__Host-` en producción) |
| Dejar código (`<img onerror=…>`) en el nombre del pedido para que se ejecute en el panel | Se muestra como texto; la CSP tampoco permite scripts en línea |

`e2e/tampering.spec.ts` ejecuta estos ataques en un navegador real en cada CI. El riesgo real no
está en el inspector sino en **tus cuentas**: por eso la lista siguiente.

## Lista de comprobación del dueño

1. `ADMIN_EMAILS=tu-correo@gmail.com` (solo uno).
2. Tu cuenta de Google con verificación en dos pasos activada.
3. Tu cuenta de Mercado Pago con verificación en dos pasos y un correo/teléfono que solo tú
   controles.
4. Panel → configura el TOTP y guarda los códigos de recuperación **fuera** del computador.
5. Nadie más tiene acceso a GitHub, Vercel/Render, Google Cloud, Meta, Discord ni Mercado Pago
   (verificación en dos pasos en todas).
6. Si sospechas de una filtración: rota `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` en Mercado Pago y en
   Render (ver `deployment.md` → Rotación de secretos) y revisa la Auditoría del panel.

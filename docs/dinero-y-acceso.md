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

## Lista de comprobación del dueño

1. `ADMIN_EMAILS=tu-correo@gmail.com` (solo uno).
2. Tu cuenta de Google con verificación en dos pasos activada.
3. Tu cuenta de Mercado Pago con verificación en dos pasos y un correo/teléfono que solo tú
   controles.
4. Panel → configura el TOTP y guarda los códigos de recuperación **fuera** del computador.
5. Nadie más tiene acceso a Render, Google Cloud, Meta, Discord ni Mercado Pago.
6. Si sospechas de una filtración: rota `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` en Mercado Pago y en
   Render (ver `deployment.md` → Rotación de secretos) y revisa la Auditoría del panel.

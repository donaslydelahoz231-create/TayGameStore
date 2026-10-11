# Seguridad de la tienda: que nadie la borre, la altere ni falsifique comprobantes

Resumen para el dueño: **qué está protegido, cómo lo compruebas tú mismo y qué te toca a ti**.

## 1. Lo que puedes verificar por tu cuenta

### Comprobantes verificables (anti-falsificación)

Cada pedido pagado recibe, cuando Mercado Pago aprueba el pago:

- **Comprobante N.º** consecutivo: 000001, 000002, 000003…
- **Código de verificación** `V1-XXXX-XXXX-XXXX-XXXX`, calculado con una llave que solo tiene el
  servidor a partir del número, la referencia, el total y la operación de Mercado Pago.

Los dos aparecen en el correo del cliente y en su factura (pantalla, JPG y PDF).

**Para comprobar un comprobante que te envíen**: Panel → **Integridad** → «Verificar un
comprobante». Escribe la referencia (`TGS-…`) y el código.

| Resultado | Significa |
|---|---|
| **AUTÉNTICO** | Es real. Ves el número, el total y la operación de Mercado Pago. Compáralos con lo que te muestran. |
| **El código NO coincide** | Es falso, o le cambiaron el total o el número. |
| **No existe / sin pago** | Ese pedido no existe o nunca se pagó. |

El panel también muestra el **último comprobante emitido**. Un comprobante con un número mayor que
ese es falso.

### El conteo y la huella (anti-alteración)

Todo lo importante queda en el **historial**: pagos, entregas, cambios de precio e intentos
bloqueados. Cada 10 minutos la tienda **sella** el historial con una cadena de hashes, como un
libro contable donde cada página lleva la firma de la anterior.

En Panel → **Integridad** ves:

- **Historial: Intacto**, con la cantidad de eventos y sellos. Si alguien con acceso total a la
  base borrara, cambiara o insertara un evento antiguo, aquí sale **ALTERADO** y el número del sello
  donde ocurrió.
- **Huella del historial** (p. ej. `4F2A-9C1B-77D0-1E3B`): anótala de vez en cuando.
- **Huella del catálogo**: cambia si cambia cualquier precio, promoción o paquete.

**Testigo fuera de la base**: el «Diagnóstico diario» de GitHub Actions publica cada día, en su
resumen:

- la huella del historial;
- el último comprobante emitido;
- la huella del catálogo, calculada desde la tienda pública.

Esos resúmenes quedan en GitHub, fuera de la base de datos. Si alguien rehiciera toda la base, las
huellas de días anteriores ya no coincidirían. Si la cadena se rompe, el diagnóstico queda en rojo
y GitHub te avisa por correo. Este paso necesita el secreto `CRON_SECRET` en GitHub, el mismo
valor que en Render. Si falta, el resumen dice NO VERIFICADO.

**Activar el testigo** (una vez, tú mismo, sin pegar el valor en ningún chat):

1. Inventa una frase larga al azar, de 40 caracteres o más.
2. Render → tu servicio → Environment → Add → `CRON_SECRET` = esa frase → Save.
3. GitHub → el repositorio → Settings → Secrets and variables → Actions → New repository secret
   → `CRON_SECRET` = la misma frase.
4. Actions → «Diagnóstico diario» → Run workflow. En el resumen debe salir «Historial: INTACTO».

## 2. Lo que la tienda impide sola

| Ataque | Protección |
|---|---|
| **Borrar pedidos, pagos, entregas, productos o el historial** | La base de datos lo rechaza (triggers en `orders`, `order_items`, `payments`, `payment_attempts`, `payment_events`, `fulfillments`, `topups`, `inventory_codes`, `products`, `audit_events`, `audit_seals`), sea desde la app, con un fallo de programación o con SQL directo. |
| **Cambiar el total, la referencia o el número de comprobante de un pedido** | La base de datos lo rechaza. Las líneas de un pedido (paquete, cantidad, precio) no se pueden modificar. |
| **Alterar precios desde el navegador** | El servidor calcula el precio siempre. Lo que envía el navegador se ignora (pruebas `tampering`). |
| **Cambiar precios desde el panel** (sesión robada) | Con `CATALOG_LOCKED=true` el panel no puede cambiar precios ni paquetes. El intento queda en el historial con alerta. |
| **Cambiar precios con SQL directo** | No se puede impedir sin quitarte a ti el acceso, pero **queda registrado**: un trigger de la base escribe en el historial «product.db_change», con el precio anterior, el nuevo y el usuario de la base. La huella del catálogo cambia. |
| **Pago falso** (webhook inventado, comprobante de Mercado Pago editado) | La tienda solo cree a Mercado Pago: valida la firma del aviso y consulta el pago a Mercado Pago. Un pedido nunca se entrega sin pago aprobado, del importe exacto. |
| **Entrar al panel** | Ruta secreta, Google o contraseña, **doble factor obligatorio**, lista de administradores y escudo contra intentos repetidos. |
| **Tumbar la tienda con tráfico** | Límite de peticiones por IP y escudo anti-abuso con bloqueo temporal. Render reinicia el servicio si cae y `vigilancia.yml` avisa. |

## 3. Bloqueo del catálogo

- **Bloqueado** (`CATALOG_LOCKED=true` en Render): nadie cambia precios desde el panel, ni tú.
- **Para cambiar precios**:
  1. Render → Environment → `CATALOG_LOCKED=false` → Save. Render se reinicia.
  2. Cambia los precios en el panel.
  3. Vuelve a poner `CATALOG_LOCKED=true`.

  La huella del catálogo cambia y el historial guarda cada cambio.

## 4. Lo que te toca a ti (nadie puede hacerlo por ti)

La tienda solo es tan segura como tus cuentas. Quien entre a tu GitHub, Render, Neon, Google o
Mercado Pago tiene la llave de todo. Activa la **verificación en dos pasos** en las cinco:

1. **Google** (tu correo y el acceso al panel): myaccount.google.com → Seguridad → Verificación en
   2 pasos.
2. **GitHub** (el código): Settings → Password and authentication → Two-factor authentication.
3. **Render** (el servidor): Account Settings → Two-Factor Authentication.
4. **Neon** (la base de datos): Account settings → Security.
5. **Mercado Pago** (el dinero): Seguridad → Verificación en dos pasos.

Además:

- **No compartas** contraseñas, códigos ni llaves por chat, ni conmigo. Se escriben solo en el
  panel de cada servicio.
- **Rota** (genera nuevo) cualquier secreto que se haya visto en una captura o un chat. Tienes
  pendiente el secreto de cliente de Google y borrar la clave de API de Google que se expuso.
- **Respaldos**: Neon guarda el historial de la base (restauración a un punto en el tiempo) y hay
  una instantánea manual (registro del 2026-10-11). Aunque alguien lograra borrar datos, se
  recuperan.

## 5. Límites honestos

- Quien tenga la **cuenta dueña de la base de datos** (tu Neon) puede quitar los triggers. Por eso:
  - hay testigo externo diario;
  - existen los respaldos de Neon;
  - el punto 4 (dos pasos en Neon) es clave.
- La **huella** detecta cambios, no los deshace. Si sale ALTERADO, se compara con el último
  testigo bueno y se restaura desde el respaldo de Neon.
- Que el cliente vea el comprobante en su correo depende de que el SMTP esté configurado.

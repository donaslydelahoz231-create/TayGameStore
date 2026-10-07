# Puesta en marcha: lo que solo el dueño puede hacer

Lista corta y en orden para la tienda publicada en `https://taygamestore.onrender.com`. Todo lo
demás (código, pruebas, flujos de n8n, textos legales) ya está hecho. Cada paso dice **dónde**
se escribe la credencial: siempre en el panel del servicio, nunca en Git, en un chat ni en un
correo.

> Para crear una llave aleatoria (pasos 3 y 4) usa en tu computador `openssl rand -base64 48`, o
> el botón **Generate** de Render al crear la variable. Cópiala directo al destino; no la guardes
> en notas ni capturas.

## 1. Rotar las claves que se escribieron en un chat (primero)

Se escribieron en una conversación anterior y deben darse por expuestas: el Access Token de
Mercado Pago en uso, el otro Access Token que se compartió, el Client Secret de Mercado Pago y
la API key de Google.

1. Mercado Pago → **Tus integraciones** → tu aplicación → **Credenciales de producción** →
   **Renovar** el Access Token y el Client Secret. Repite en **Credenciales de prueba** si usaste
   las de prueba.
2. Render → servicio **taygamestore** → **Environment** → `MP_ACCESS_TOKEN` → **Edit** → pega el
   token nuevo → **Save, rebuild, and deploy**.
3. Google Cloud Console → **APIs y servicios → Credenciales** → la API key → **Regenerar clave**
   (o bórrala si no la usa nada: la tienda no necesita API keys de Google, solo el cliente OAuth
   del paso 5).

## 2. Mercado Pago: webhook

1. Mercado Pago → **Tus integraciones** → tu aplicación → **Webhooks** → **Configurar
   notificaciones** → **Modo productivo**.
2. URL: `https://taygamestore.onrender.com/api/webhooks/mercadopago`. Evento: **Pagos**.
   **Guardar**.
3. Copia la **clave secreta** que muestra esa pantalla → Render → **Environment** →
   `MP_WEBHOOK_SECRET` → pega → guardar.

**No** pongas `PAYMENTS_ENABLED` ni `CHECKOUT_ENABLED` en `true` todavía: activar el cobro
necesita tu autorización explícita y la primera venta de prueba de
[`salir-a-produccion.md`](salir-a-produccion.md#6-primera-venta-real).

## 3. Correos de la tienda (SMTP)

Usa la cuenta de la tienda (la de `SUPPORT_EMAIL`), no una personal.

1. En esa cuenta de Google: **Seguridad → Verificación en dos pasos** → activar.
2. `myaccount.google.com/apppasswords` → nombre `TayGameStore` → **Crear**. Google muestra una
   clave de 16 letras una sola vez.
3. Render → **Environment**:

   | Variable | Valor |
   |---|---|
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | la dirección de la cuenta de la tienda |
   | `SMTP_PASS` | la clave de 16 letras (sin espacios) |
   | `MAIL_FROM` | la misma dirección (opcional si `SMTP_USER` ya es un correo) |

Las tres primeras van juntas: con una sola, el servidor no arranca y lo dice en el registro.

## 4. n8n: avisos por correo

Los eventos de pedidos ya están conectados: `EVENTS_WEBHOOK_URL` y `EVENTS_WEBHOOK_SECRET` están en
Render y el flujo **Pedidos** está publicado (reconoce la llave por su huella; no necesita
credencial). Falta solo el correo:

1. En `taygamestore.app.n8n.cloud` → **Credentials** → **Add credential** → **Gmail OAuth2** →
   nombre **Gmail · taygamerstore** → **Sign in with Google** con la cuenta de la tienda. Nunca
   escribas la contraseña de Gmail en n8n.
2. Opcional: **TayGameStore · Llave de tareas** (respaldo; la tienda ya ejecuta sus tareas sola)
   con `Bearer ` + el valor de `CRON_SECRET` de Render.

Cuando exista, avísame: activo los nodos de Gmail de **Pedidos**, **Vigilancia** y **Errores**.
Detalle en [`n8n.md`](n8n.md).

## 5. Acceso con Google

1. [Google Cloud Console](https://console.cloud.google.com/) → **Google Auth Platform** (antes
   «Pantalla de consentimiento»): tipo *Externo*, nombre `TayGameStore`, correo de soporte de la
   tienda, dominio `taygamestore.onrender.com`, enlaces a
   `https://taygamestore.onrender.com/privacidad.html` y `/terminos.html`. Ámbitos: `openid`,
   `email`, `profile`. **Publicar la app** (en *Testing* solo entran los usuarios de prueba).
2. **Clientes → Crear cliente → Aplicación web**. URI de redirección autorizada, exacta:
   `https://taygamestore.onrender.com/auth/google/callback`.
3. Render → **Environment**: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (van juntas).
4. Para el panel: `ADMIN_EMAILS` (tu correo de administración) y `ADMIN_PATH` (una dirección
   secreta inventada por ti: `/` y de 12 a 64 letras, números, `-` o `_`). Sin `ADMIN_PATH` el
   servidor no arranca si hay `ADMIN_EMAILS`. No la compartas.

El botón de Google de la tienda se habilita solo cuando las dos variables están puestas.

## 6. Privacidad en GitHub

GitHub → foto de perfil → **Settings → Emails** → marca **Keep my email addresses private** y
**Block command line pushes that expose my email**. Dos commits antiguos del repositorio público
ya muestran un correo personal; esto evita que se repita (reescribir el historial no está
autorizado).

## 7. Neon (para que pueda revisar la base de datos)

claude.ai → **Configuración → Conectores** → **Neon** → **Conectar** y autorizar. Sin esto, la
base de datos solo se comprueba desde la tienda (`/api/ready`).

## 8. Confirmar dos textos legales

- `LEGAL_TAX_NOTE`: el texto puesto es neutro y descriptivo. Confírmalo o cámbialo con tu
  contador según tu régimen tributario.
- `LEGAL_DELIVERY_TIME` dice entrega inmediata. Hoy la entrega es **manual** (la haces tú al ver
  el aviso). Si no vas a poder entregar en minutos a cualquier hora, cambia el texto por un plazo
  que sí cumplas (p. ej. «hasta 2 horas, de 8 a. m. a 10 p. m.»): el Estatuto del Consumidor
  obliga a cumplir lo anunciado.

## Comprobación final

`npm run golive:check -- --url https://taygamestore.onrender.com` (desde tu computador) lista lo
que falte y termina en `LISTO para vender.` cuando todo esté. Solo lee: no paga ni crea pedidos.

# Pagos en Colombia: Mercado Pago, Wompi y Nequi Negocios (evaluación)

**Decisión vigente:** Mercado Pago es la única autoridad de pago (`CLAUDE.md`). Esta evaluación
**no implementa** otra pasarela. Cambiarla es una decisión del dueño.

## Lo que ya funciona con Mercado Pago (comprobado en el código y en producción)

- **Checkout Pro** con el SDK oficial `mercadopago`.
  - Medios en la tienda: Tarjeta, Nequi (vía PSE: el cliente elige el banco Nequi y aprueba en su
    app), PSE, Efecty y saldo de Mercado Pago.
  - En producción se crearon 10 preferencias reales (`payment_attempts`).
  - **Ningún pago aprobado todavía.**
- **Webhook:**
  - firma `x-signature` validada;
  - deduplicación;
  - consulta del pago a la API;
  - comparación de importe, moneda y `live_mode`.
- **Conciliación** periódica e **idempotencia** en cada paso.

## Wompi (Bancolombia)

Según su documentación pública ([eventos](https://docs.wompi.co/en/docs/colombia/eventos/)):

- Wompi notifica cambios de transacción (`transaction.updated`) con un POST a una URL configurada
  en su panel, una para Sandbox y otra para Producción.
- La firma va en la cabecera `X-Event-Checksum` y en `signature.checksum`. Es un SHA-256 que se
  calcula a partir de las propiedades listadas en `signature.properties` y del **secreto de
  eventos** del comercio.

**NO VERIFICADO desde este entorno** (la red bloquea `docs.wompi.co`):

- la concatenación exacta del checksum;
- el uso del `timestamp`;
- la «firma de integridad» del widget;
- los requisitos para abrir una cuenta de comercio (persona natural o empresa, RUT, cuenta
  Bancolombia).

Antes de implementar hay que leerlos en la documentación oficial vigente.

**Qué haría falta para integrarla:**

1. Una cuenta de comercio aprobada y sus llaves:
   - pública;
   - privada;
   - secreto de eventos;
   - secreto de integridad;
   - sandbox y producción.
2. Un adaptador nuevo del puerto `PaymentGateway`, con:
   - creación de la transacción desde el servidor;
   - referencia aleatoria;
   - validación del checksum;
   - consulta de la transacción a la API antes de aplicarla;
   - las mismas comprobaciones de importe, moneda y modo.
3. Una migración aditiva: proveedor por intento y por pago (hoy el campo `provider` existe, con
   `mercadopago` por defecto).
4. Pruebas con datos sintéticos y una prueba en Sandbox.

**Ventaja posible:** Nequi y el botón Bancolombia nativos.

**Costo:** otra integración que mantener. Las tarifas no se verificaron.

## Nequi Negocios

- Según la prensa ([Forbes](https://forbes.co/2025/06/05/negocios/nequi-lanza-app-de-negocios-que-convierte-el-celular-en-un-datafono),
  [Valora Analitik](https://www.valoraanalitik.com/nequi-permitira-a-pequenos-comercios-recibir-pagos-desde-otros-bancos-y-sin-costo/)),
  Nequi Negocios se lanzó en 2025 junto con Wompi para cobrar con QR, enlaces de pago y tarjetas
  desde el celular.
- Para comercios en línea, Nequi se ofrece a través de pasarelas (Wompi y otras).
- **NO VERIFICADO:**
  - que una persona natural pueda obtener credenciales de API propias de Nequi;
  - que un enlace o QR de Nequi Negocios se pueda crear y confirmar automáticamente desde un
    servidor.
- Una cuenta Nequi personal **no** es una integración: un pago recibido allí no lo puede confirmar
  la tienda de forma verificable, así que **no se usa** como confirmación.

## Recomendación

1. **Seguir con Mercado Pago** (ya integrado y probado). Primero hacer la prueba controlada de
   punta a punta con dinero real mínimo y reembolso, y activar los avisos al dueño.
2. Si el dueño quiere Wompi (por Nequi nativo o por tarifas): abrir la cuenta de comercio, decidir
   si reemplaza o acompaña a Mercado Pago, y entonces implementar el adaptador con la
   documentación oficial y las llaves de Sandbox.
3. Nunca aceptar como prueba de pago una captura de pantalla, un parámetro del navegador o una
   página de retorno.
